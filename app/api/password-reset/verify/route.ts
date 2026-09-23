import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { getSecurityPolicy } from "@/lib/security-policy";
import { otpCodeVerifier } from "@/lib/auth-otp";
import { OTP_CODE_PATTERN, buildRecoveryLinkEmail } from "@/lib/otp-email";
import { sendAccountEmail } from "@/lib/otp-transport";

const schema = z.object({
  challengeId: z.string().trim().uuid("Verification session not found."),
  code: z.string().trim().regex(OTP_CODE_PATTERN, "Enter the 6-digit code."),
});

const rpcMessage = (message: string) => {
  if (message.includes("OTP_INCORRECT")) return { status: 401, error: "The verification code is incorrect." };
  if (message.includes("OTP_EXPIRED")) return { status: 401, error: "This verification code has expired. Request a new code." };
  if (message.includes("OTP_TOO_MANY_ATTEMPTS") || message.includes("OTP_INVALIDATED") || message.includes("OTP_ALREADY_USED"))
    return { status: 403, error: "This code is no longer valid. Request a new code." };
  return { status: 400, error: "Verification session not found. Request a new code." };
};

/**
 * Step 2 of self-service reset. A verified code rotates the staged recovery
 * token (the pre-verification token is discarded) and emails the one-time
 * reset link. The link alone still cannot complete without the selfie proof.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
  if (!supabase) return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503 });

  const policy = await getSecurityPolicy();
  const verifier = otpCodeVerifier(parsed.data.challengeId, parsed.data.code);
  if (!verifier) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });

  const { data, error } = await supabase.rpc("auth_otp_verify", {
    p_challenge_id: parsed.data.challengeId, p_code_verifier: verifier, p_max_attempts: policy.otpMaxAttempts,
  });
  if (error || !data) {
    const mapped = rpcMessage(error?.message ?? "");
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }

  const { data: attempt } = await supabase.from("password_reset_logs")
    .select("id,user_id,token_id,email,status").eq("challenge_id", parsed.data.challengeId)
    .eq("status", "requested").order("created_at", { ascending: false }).limit(1).maybeSingle();
  const row = attempt as { id: string; user_id: string | null; token_id: string | null; email: string } | null;
  if (!row?.user_id) return NextResponse.json({ error: "Reset request not found. Request a new code." }, { status: 404 });

  // The pre-verification token never leaves the server: rotate it and email
  // only the fresh link.
  if (row.token_id) await supabase.from("account_recovery_tokens").delete().eq("id", row.token_id);
  const rawToken = randomBytes(32).toString("hex");
  const { data: tokenRow, error: tokenError } = await supabase.from("account_recovery_tokens")
    .insert({ user_id: row.user_id, token_hash: createHash("sha256").update(rawToken).digest("hex"), created_by: null, expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
    .select("id").maybeSingle();
  if (tokenError || !tokenRow) return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 500 });

  const link = `${new URL(request.url).origin}/recover/${rawToken}`;
  const sent = await sendAccountEmail({ to: row.email, message: buildRecoveryLinkEmail({ link }) });
  if (!sent.ok) {
    await supabase.from("account_recovery_tokens").delete().eq("id", tokenRow.id);
    await supabase.from("password_reset_logs").update({ status: "failed" }).eq("id", row.id);
    return NextResponse.json({ error: sent.message }, { status: 503 });
  }

  await supabase.from("password_reset_logs").update({ token_id: tokenRow.id, otp_verified: true, status: "otp_verified" }).eq("id", row.id);
  return NextResponse.json({ ok: true });
}
