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

    const { data: existing } = await supabase.from("password_reset_logs")
      .select("id").eq("token_id", live.id).neq("status", "completed")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existing) {
      await supabase.from("password_reset_logs").update({ selfie_url: path }).eq("id", (existing as { id: string }).id);
    } else {
      // Admin-initiated links carry no log row yet — open one so the attempt
      // is audited with the same shape as self-service requests.
      const { data: account } = await supabase.from("user_accounts").select("email").eq("id", live.user_id).maybeSingle();
      await supabase.from("password_reset_logs").insert({
        user_id: live.user_id, token_id: live.id,
        email: (account as { email?: string } | null)?.email ?? "",
        ip_address: clientIp(request),
        user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
        selfie_url: path, status: "requested",
      });
    }
    return NextResponse.json({ path, originalName: sanitizeProofName(file.name) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
