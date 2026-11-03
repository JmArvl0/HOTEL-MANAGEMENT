import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { depositSubmissionSchema } from "@/lib/booking";
import { isPaymentDestinationComplete } from "@/lib/payment-destination";
import { supabase } from "@/lib/supabase";
import { PROOF_BUCKET, PROOF_MAX_BYTES, proofExt, proofMime, sanitizeProofName, sniffProofKind, stagedProofPathPattern } from "@/lib/payment-proof";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.role !== "guest") return NextResponse.json({ error: "Guest sign-in is required." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Booking is temporarily unavailable." }, { status: 503 });
  const { token } = await params;
  if (!z.string().uuid().safeParse(token).success) return NextResponse.json({ error: "Invalid booking reference." }, { status: 400 });
  try {
    const raw = await request.json();
    if (raw?.paymentMethod && raw.paymentMethod !== "manual_gcash") return NextResponse.json({ error: "Reservation deposits are accepted through GCash only." }, { status: 400 });
    const parsed = depositSubmissionSchema.safeParse(raw);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the payment reference and proof." }, { status: 400 });
    const { proofPath, proofOriginalName } = parsed.data;
    // The path must belong to THIS hold — a path staged against another hold is rejected.
    if (!stagedProofPathPattern(token).test(proofPath)) return NextResponse.json({ error: "Upload a payment screenshot." }, { status: 400 });

    const { data: hold, error: holdError } = await supabase.from("booking_holds")
      .select("user_id,reservation_id").eq("token", token).eq("user_id", session.user.id).maybeSingle();
    if (holdError) throw holdError;
    if (!hold) return NextResponse.json({ error: "Booking hold not found." }, { status: 404 });
    // A retry must return the existing submission without copying more evidence.
    if (hold.reservation_id) {
      const { data: existing, error } = await supabase.from("reservations")
        .select("id,confirmation_number,status,payment_status").eq("id", hold.reservation_id).eq("user_id", session.user.id).single();
      if (error || !existing) throw error ?? new Error("RESERVATION_NOT_FOUND");
      return NextResponse.json({ reservationId: existing.id, confirmationNumber: existing.confirmation_number, reservationStatus: existing.status, paymentStatus: existing.payment_status });
    }

    // GCash acceptance is Owner-controlled: a disabled or incomplete
    // destination blocks submissions server-side, whatever the page showed.
    const { data: policy } = await supabase.from("hotel_operational_policies")
      .select("gcash_account_name,gcash_mobile_number,gcash_qr_storage_path,gcash_enabled,deposit_method")
      .eq("key", "default").maybeSingle();
    if ((policy as { deposit_method?: unknown } | null)?.deposit_method !== "manual")
      return NextResponse.json({ error: "Manual deposits are not the active deposit method. Please use the method shown on the deposit page." }, { status: 409 });
    const destination = {
      accountName: typeof policy?.gcash_account_name === "string" ? policy.gcash_account_name : null,
      mobileNumber: typeof policy?.gcash_mobile_number === "string" ? policy.gcash_mobile_number : null,
      qrStoragePath: typeof policy?.gcash_qr_storage_path === "string" ? policy.gcash_qr_storage_path : null,
      enabled: Boolean(policy?.gcash_enabled),
    };
    if (!destination.enabled) return NextResponse.json({ error: "Online reservation deposits are temporarily unavailable. Please contact the hotel for assistance." }, { status: 409 });
    if (!isPaymentDestinationComplete(destination)) return NextResponse.json({ error: "Payment details are being updated. Please try again shortly." }, { status: 409 });

    // Re-validate the stored object: resolve it via the service role, re-sniff
    // magic bytes, re-measure size. Never trust what the browser sent.
    const { data: object, error: objectError } = await supabase.storage.from(PROOF_BUCKET).download(proofPath);
    if (objectError || !object) return NextResponse.json({ error: "Upload a payment screenshot." }, { status: 400 });
    const bytes = new Uint8Array(await object.arrayBuffer());
    const kind = sniffProofKind(bytes);
    if (!kind || bytes.byteLength === 0 || bytes.byteLength > PROOF_MAX_BYTES) {
      await supabase.storage.from(PROOF_BUCKET).remove([proofPath]);
      return NextResponse.json({ error: "Only a JPEG, PNG, or WebP payment screenshot up to 5 MB is accepted." }, { status: 400 });
    }

    // Submitted evidence is outside the staging DELETE endpoint's namespace.
    const finalizedPath = `submitted/${token}/${crypto.randomUUID()}.${proofExt(kind)}`;
    const { error: uploadError } = await supabase.storage.from(PROOF_BUCKET)
      .upload(finalizedPath, bytes, { contentType: proofMime(kind), upsert: false });
    if (uploadError) throw uploadError;
    const { data, error } = await supabase.rpc("submit_reservation_deposit", {
      p_token: token, p_user_id: session.user.id,
      p_payment_method: parsed.data.paymentMethod, p_payment_reference: parsed.data.paymentReference,
      p_proof_storage_path: finalizedPath,
      p_proof_original_name: sanitizeProofName(proofOriginalName ?? ""),
      p_proof_mime_type: proofMime(kind),
      p_proof_size_bytes: bytes.byteLength,
    });
    if (error) {
      // A timeout may hide a committed payment. Retain finalized evidence;
      // unreferenced copies can be cleaned only after reference reconciliation.
      const messages: Record<string,string> = {
        HOLD_EXPIRED: "Your reservation hold expired before payment was submitted. Please choose from the currently available rooms.",
        ROOM_TYPE_UNAVAILABLE: "This room is no longer available. No reservation was confirmed.",
        RATE_CHANGED: "The room rate changed. Please search again to review the current rate.",
        INVALID_PAYMENT_REFERENCE: "Enter a valid payment reference.",
        PROOF_REQUIRED: "Upload a payment screenshot along with your payment reference.",
        DEPOSIT_METHOD_UNAVAILABLE: "Manual deposits are not the active deposit method.",
      };
      const key = Object.keys(messages).find((item) => error.message.includes(item));
      return NextResponse.json({ error: key ? messages[key] : "We could not submit the reservation deposit." }, { status: 409 });
    }
    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ reservationId: row.reservation_id, confirmationNumber: row.confirmation_number, reservationStatus: row.reservation_status, paymentStatus: row.payment_status });
  } catch {
    return NextResponse.json({ error: "We could not submit the reservation deposit. Please try again." }, { status: 500 });
  }
}
