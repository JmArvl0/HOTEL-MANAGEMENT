import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { depositSubmissionSchema } from "@/lib/booking";
import { supabase } from "@/lib/supabase";
import { PROOF_BUCKET, PROOF_MAX_BYTES, proofMime, sanitizeProofName, sniffProofKind, stagedProofPathPattern } from "@/lib/payment-proof";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.role !== "guest") return NextResponse.json({ error: "Guest sign-in is required." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Booking is temporarily unavailable." }, { status: 503 });
  const { token } = await params;
  if (!z.string().uuid().safeParse(token).success) return NextResponse.json({ error: "Invalid booking reference." }, { status: 400 });
  try {
    const parsed = depositSubmissionSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the payment reference and proof." }, { status: 400 });
    const { proofPath, proofOriginalName } = parsed.data;
    // The path must belong to THIS hold — a path staged against another hold is rejected.
    if (!stagedProofPathPattern(token).test(proofPath)) return NextResponse.json({ error: "Upload a payment screenshot." }, { status: 400 });

    // Re-validate the stored object: resolve it via the service role, re-sniff
    // magic bytes, re-measure size. Never trust what the browser sent.
    const { data: object, error: objectError } = await supabase.storage.from(PROOF_BUCKET).download(proofPath);
    if (objectError || !object) return NextResponse.json({ error: "Upload a payment screenshot." }, { status: 400 });
    const bytes = new Uint8Array(await object.arrayBuffer());
    const kind = sniffProofKind(bytes);
    if (!kind || bytes.byteLength === 0 || bytes.byteLength > PROOF_MAX_BYTES) {
      void supabase.storage.from(PROOF_BUCKET).remove([proofPath]);
      return NextResponse.json({ error: "Only a JPEG, PNG, or WebP payment screenshot up to 5 MB is accepted." }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("submit_reservation_deposit", {
      p_token: token, p_user_id: session.user.id,
      p_payment_method: parsed.data.paymentMethod, p_payment_reference: parsed.data.paymentReference,
      p_proof_storage_path: proofPath,
      p_proof_original_name: sanitizeProofName(proofOriginalName ?? ""),
      p_proof_mime_type: proofMime(kind),
      p_proof_size_bytes: bytes.byteLength,
    });
    if (error) {
      // No orphaned uploads: a failed submission (expired hold, rate change,
      // inventory loss, duplicate) releases the staged proof. An idempotent
      // replay returns the existing reservation and keeps the original.
      const idempotentReplay = error.message.includes("duplicate key value") || error.message.includes("payments_idempotency_unique");
      if (!idempotentReplay) void supabase.storage.from(PROOF_BUCKET).remove([proofPath]);
      const messages: Record<string,string> = {
        HOLD_EXPIRED: "Your reservation hold expired before payment was submitted. Please choose from the currently available rooms.",
        ROOM_TYPE_UNAVAILABLE: "This room is no longer available. No reservation was confirmed.",
        RATE_CHANGED: "The room rate changed. Please search again to review the current rate.",
        INVALID_PAYMENT_REFERENCE: "Enter a valid payment reference.",
        PROOF_REQUIRED: "Upload a payment screenshot along with your payment reference.",
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
