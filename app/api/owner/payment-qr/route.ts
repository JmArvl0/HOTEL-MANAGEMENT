import { NextResponse } from "next/server";
import { guardOwner, ownerGuardFailed } from "@/lib/owner-route";
import { PROOF_MAX_BYTES, proofExt, sniffProofKind } from "@/lib/payment-proof";

export const QR_BUCKET = "payment-qr";
const STAGED_QR = /^gcash\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

/**
 * Stage the official GCash QR. Staging alone changes nothing customer-facing —
 * the QR goes live only when the Owner saves Payment Settings with this path,
 * which is the confirmation safeguard for redirecting customer money.
 */
export async function POST(request: Request) {
  const context = await guardOwner();
  if (ownerGuardFailed(context)) return context;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a QR image to upload." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffProofKind(bytes);
    if (!kind) return NextResponse.json({ error: "Upload the QR as a JPEG, PNG, or WebP image." }, { status: 400 });
    if (bytes.byteLength === 0 || bytes.byteLength > PROOF_MAX_BYTES) return NextResponse.json({ error: "QR image must be 5 MB or smaller." }, { status: 400 });
    const path = `gcash/${crypto.randomUUID()}.${proofExt(kind)}`;
    const { error } = await context.client.storage.from(QR_BUCKET).upload(path, bytes, { contentType: `image/${kind === "jpeg" ? "jpeg" : kind}`, upsert: false });
    if (error) return NextResponse.json({ error: "QR upload failed. Please try again." }, { status: 500 });
    return NextResponse.json({ path }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "QR upload failed. Please try again." }, { status: 500 });
  }
}

/** Discard a staged QR that was never saved. Only managed gcash/<uuid> objects. */
export async function DELETE(request: Request) {
  const context = await guardOwner();
  if (ownerGuardFailed(context)) return context;
  try {
    const { path } = await request.json();
    if (typeof path !== "string" || !STAGED_QR.test(path)) return NextResponse.json({ error: "Not a staged payment QR." }, { status: 400 });
    await context.client.storage.from(QR_BUCKET).remove([path]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to remove the staged QR." }, { status: 500 });
  }
}
