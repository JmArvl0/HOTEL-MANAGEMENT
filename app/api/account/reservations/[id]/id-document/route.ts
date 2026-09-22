import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { PROOF_MAX_BYTES, proofExt, proofMime, sanitizeProofName, sniffProofKind } from "@/lib/payment-proof";

const BUCKET = "guest-ids";

/**
 * Pre-arrival ID upload. Guest stages an ID photo to the private guest-ids
 * bucket and opens a pending_review queue row. An upload alone never
 * verifies identity — Front Desk reviews via POST .../verify-id, which runs
 * the existing verify_guest_identity RPC.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.role !== "guest")
    return NextResponse.json({ error: "Guest sign-in is required." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Upload is temporarily unavailable." }, { status: 503 });

  const { id } = await params;
  const { data: reservation } = await supabase
    .from("reservations")
    .select("id,status,user_id")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .maybeSingle();
  const r = reservation as { id: string; status: string } | null;
  if (!r || (r.status !== "confirmed" && r.status !== "pending"))
    return NextResponse.json({ error: "ID upload is available for your confirmed reservation." }, { status: 409 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an ID photo to upload." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > PROOF_MAX_BYTES)
      return NextResponse.json({ error: "ID photo must be 5 MB or smaller." }, { status: 400 });
    const kind = sniffProofKind(bytes);
    if (!kind) return NextResponse.json({ error: "Only JPEG, PNG, or WebP images are supported." }, { status: 400 });

    const path = `ids/${r.id}/${crypto.randomUUID()}.${proofExt(kind)}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: proofMime(kind), upsert: false });
    if (uploadError) return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });

    const { error: rowError } = await supabase.from("guest_id_documents").insert({
      reservation_id: r.id,
      user_id: session.user.id,
      storage_path: path,
    });
    if (rowError) {
      await supabase.storage.from(BUCKET).remove([path]);
      return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
    }
    return NextResponse.json(
      { data: { originalName: sanitizeProofName(file.name), status: "pending_review" } },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
