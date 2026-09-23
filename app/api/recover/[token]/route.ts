import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { sniffProofKind } from "@/lib/payment-proof";

const SELFIE_PATH = /^recovery-selfies\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
const schema = z.object({
  password: z.string().min(12).max(128),
  confirmPassword: z.string().min(12).max(128),
  selfiePath: z.string().trim().regex(SELFIE_PATH, "An identity selfie is required."),
}).refine((v) => v.password === v.confirmPassword, { message: "Passwords do not match.", path: ["confirmPassword"] });

/**
 * Recovery completion with a blocking identity-selfie proof. The staged
 * selfie object is re-read from storage and re-sniffed before the RPC, and
 * the RPC itself refuses a missing or foreign path (SELFIE_REQUIRED) — an
 * upload alone never completes a reset.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!supabase) return NextResponse.json({ error: "Recovery is unavailable." }, { status: 503 });
  const p = schema.safeParse(await request.json());
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? "Invalid password." }, { status: 400 });
  const token = (await params).token;
  const hash = createHash("sha256").update(token).digest("hex");

  const { data: object, error: objectError } = await supabase.storage.from("recovery-selfies").download(p.data.selfiePath);
  if (objectError || !object) return NextResponse.json({ error: "The identity selfie could not be verified. Upload it again." }, { status: 409 });
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (!sniffProofKind(bytes)) return NextResponse.json({ error: "The identity selfie could not be verified. Upload it again." }, { status: 409 });

  const passwordHash = await bcrypt.hash(p.data.password, 12);
  const { error } = await supabase.rpc("complete_account_recovery", {
    p_token_hash: hash, p_password_hash: passwordHash, p_selfie_path: p.data.selfiePath,
  });
  if (error) {
    if (error.message.includes("SELFIE_REQUIRED"))
      return NextResponse.json({ error: "An identity selfie is required before the new password is accepted." }, { status: 409 });
    const { data: tok } = await supabase.from("account_recovery_tokens").select("id").eq("token_hash", hash).maybeSingle();
    const tokenId = (tok as { id: string } | null)?.id;
    if (tokenId) await supabase.from("password_reset_logs").update({ status: "failed" }).eq("token_id", tokenId).neq("status", "completed");
    return NextResponse.json({ error: "This recovery link is invalid or expired." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
