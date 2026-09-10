import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { PROOF_BUCKET, PROOF_MAX_BYTES, proofExt, proofMime, sanitizeProofName, sniffProofKind, stagedProofPathPattern } from "@/lib/payment-proof";

/**
 * Staged payment-proof upload for the reservation deposit flow. The guest
 * uploads BEFORE submitting; the confirm route re-validates the object from
 * storage and the RPC only then attaches it to the payment row. Anything the
 * client sends back is a storage path we minted server-side — nothing the
 * browser claims about type or size is trusted.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.role !== "guest") return NextResponse.json({ error: "Guest sign-in is required." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Booking is temporarily unavailable." }, { status: 503 });
  const { token } = await params;
  if (!z.string().uuid().safeParse(token).success) return NextResponse.json({ error: "Invalid booking reference." }, { status: 400 });
  try {
    const { data: hold } = await supabase.from("booking_holds").select("user_id,status,expires_at").eq("token", token).maybeSingle();
    if (!hold || hold.user_id !== session.user.id) return NextResponse.json({ error: "Booking hold not found." }, { status: 404 });
    if (hold.status !== "active" || new Date(hold.expires_at) <= new Date()) return NextResponse.json({ error: "Your reservation hold expired before payment was submitted. Please choose from the currently available rooms." }, { status: 409 });

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a payment screenshot to upload." }, { status: 400 });
    if (file.size > PROOF_MAX_BYTES) return NextResponse.json({ error: "Payment proof must be 5 MB or smaller." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength > PROOF_MAX_BYTES) return NextResponse.json({ error: "Payment proof must be 5 MB or smaller." }, { status: 400 });
    const kind = sniffProofKind(bytes);
    if (!kind) return NextResponse.json({ error: "Only JPEG, PNG, or WebP images are supported — the file could not be verified as an image." }, { status: 400 });

    const path = `pending/${token}/${crypto.randomUUID()}.${proofExt(kind)}`;
    const { error } = await supabase.storage.from(PROOF_BUCKET).upload(path, bytes, { contentType: proofMime(kind), upsert: false });
    if (error) return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
    return NextResponse.json({ path, originalName: sanitizeProofName(file.name), size: bytes.byteLength }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}

/** Remove a staged proof (Replace/Remove in the form, or a failed confirm). Only paths this flow minted, for this hold, are deletable. */
export async function DELETE(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.role !== "guest") return NextResponse.json({ error: "Guest sign-in is required." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Booking is temporarily unavailable." }, { status: 503 });
  const { token } = await params;
  if (!z.string().uuid().safeParse(token).success) return NextResponse.json({ error: "Invalid booking reference." }, { status: 400 });
  try {
    const { data: hold } = await supabase.from("booking_holds").select("user_id").eq("token", token).maybeSingle();
    if (!hold || hold.user_id !== session.user.id) return NextResponse.json({ error: "Booking hold not found." }, { status: 404 });
    const { path } = await request.json();
    if (typeof path !== "string" || !stagedProofPathPattern(token).test(path)) return NextResponse.json({ error: "Not a staged proof for this booking." }, { status: 400 });
    await supabase.storage.from(PROOF_BUCKET).remove([path]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to remove the payment proof." }, { status: 500 });
  }
}
