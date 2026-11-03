import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { PROOF_MAX_BYTES, proofExt, proofMime, sanitizeProofName, sniffProofKind } from "@/lib/payment-proof";

const BUCKET = "recovery-selfies";

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || null;
}

/**
 * Staged identity-selfie upload for the recovery flow. The link token is the
 * only credential — the row must be live and unused. Anything the client
 * sends back later is a storage path this route minted; the confirm route
 * re-checks the object from storage and the RPC enforces the path shape.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!supabase) return NextResponse.json({ error: "Recovery is unavailable." }, { status: 503 });
  const { token } = await params;
  const hash = createHash("sha256").update(token).digest("hex");
  const { data: tok } = await supabase.from("account_recovery_tokens")
    .select("id,user_id").eq("token_hash", hash).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  const live = tok as { id: string; user_id: string } | null;
  if (!live) return NextResponse.json({ error: "This recovery link is invalid or expired." }, { status: 409 });

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a selfie photo to upload." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > PROOF_MAX_BYTES)
      return NextResponse.json({ error: "Selfie photo must be 5 MB or smaller." }, { status: 400 });
    const kind = sniffProofKind(bytes);
    if (!kind) return NextResponse.json({ error: "Only JPEG, PNG, or WebP images are supported." }, { status: 400 });

    const path = `recovery-selfies/${crypto.randomUUID()}.${proofExt(kind)}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET).upload(path, bytes, { contentType: proofMime(kind), upsert: false });
    if (uploadError) return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });

    const { error: stageError } = await supabase.rpc("stage_recovery_selfie", {
      p_token_hash: hash, p_path: path, p_ip_address: clientIp(request),
      p_user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
    });
    if (stageError) {
      await supabase.storage.from(BUCKET).remove([path]);
      return NextResponse.json({ error: "This recovery link changed or expired. Request a new link." }, { status: 409 });
    }
    return NextResponse.json({ path, originalName: sanitizeProofName(file.name) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
