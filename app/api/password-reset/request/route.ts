import { createHash, randomBytes, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { getSecurityPolicy, otpTtlMinutes } from "@/lib/security-policy";
import { generateOtpCode, otpCodeVerifier, otpIssuable } from "@/lib/auth-otp";
import { buildPasswordResetOtpEmail, maskEmail } from "@/lib/otp-email";
import { sendAccountEmail, smtpConfigured } from "@/lib/otp-transport";

const schema = z.object({ email: z.string().trim().toLowerCase().email("Enter a valid email address.") });

const RESET_REQUEST_LIMIT = 5;

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || null;
}

/**
 * Self-service password-reset request. Always returns a generic OK so the
 * response never reveals whether an address holds an account. When the
 * account exists, a one-hour recovery token is staged and an OTP code is
 * emailed; the link itself is only sent after the code is verified.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!supabase) return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 503 });
  const email = parsed.data.email;
  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: recent } = await supabase.from("password_reset_logs")
    .select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", since);
  if ((recent ?? 0) >= RESET_REQUEST_LIMIT) return NextResponse.json({ ok: true, masked: maskEmail(email) });

  const { data: account } = await supabase.from("user_accounts").select("id,email,active").eq("email", email).maybeSingle();
  if (!account) {
    await supabase.from("password_reset_logs").insert({ user_id: null, email, ip_address: ip, user_agent: userAgent, status: "requested" });
    return NextResponse.json({ ok: true, masked: maskEmail(email) });
  }

  if (otpIssuable().ok !== true || !smtpConfigured()) {
    await supabase.from("password_reset_logs").insert({ user_id: account.id, email, ip_address: ip, user_agent: userAgent, status: "failed" });
    return NextResponse.json({ error: "Verification email is unavailable right now. Please try again later." }, { status: 503 });
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const { data: tokenRow, error: tokenError } = await supabase.from("account_recovery_tokens")
    .insert({ user_id: account.id, token_hash: tokenHash, created_by: null, expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() })
    .select("id").maybeSingle();
  if (tokenError || !tokenRow) return NextResponse.json({ error: "Password reset is temporarily unavailable." }, { status: 500 });

  const policy = await getSecurityPolicy();
  const challengeId = randomUUID();
  const code = generateOtpCode();
  const verifier = otpCodeVerifier(challengeId, code);
  if (!verifier) {
    await supabase.from("account_recovery_tokens").delete().eq("id", tokenRow.id);
    return NextResponse.json({ error: "Verification email is unavailable right now." }, { status: 503 });
  }
  const { error: issueError } = await supabase.rpc("auth_otp_issue", {
    p_user_id: account.id, p_challenge_id: challengeId, p_code_verifier: verifier,
    p_ttl_seconds: policy.otpTtlSeconds, p_cooldown_seconds: policy.otpResendCooldownSeconds,
  });
  if (issueError) {
    await supabase.from("account_recovery_tokens").delete().eq("id", tokenRow.id);
    return NextResponse.json({ error: "A code could not be issued. Please try again later." }, { status: 429 });
  }
  await supabase.from("auth_otp_challenges").update({ purpose: "password_reset" }).eq("id", challengeId);

  const sent = await sendAccountEmail({ to: email, message: buildPasswordResetOtpEmail({ code, ttlMinutes: otpTtlMinutes(policy) }) });
  if (!sent.ok) {
    await supabase.from("account_recovery_tokens").delete().eq("id", tokenRow.id);
    await supabase.from("auth_otp_challenges").update({ invalidated_at: new Date().toISOString() }).eq("id", challengeId);
    await supabase.from("password_reset_logs").insert({ user_id: account.id, email, ip_address: ip, user_agent: userAgent, status: "failed" });
    return NextResponse.json({ error: sent.message }, { status: 503 });
  }

  await supabase.from("password_reset_logs").insert({
    user_id: account.id, token_id: tokenRow.id, challenge_id: challengeId,
    email, ip_address: ip, user_agent: userAgent, status: "requested",
  });
  return NextResponse.json({ ok: true, masked: maskEmail(email), challengeId });
}
