import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { getSecurityPolicy, otpTtlMinutes } from "@/lib/security-policy";
import { generateOtpCode, otpCodeVerifier, otpIssuable } from "@/lib/auth-otp";
import { sendOtpEmail, smtpConfigured } from "@/lib/otp-transport";
import { pendingToken, readChallenge, setPendingSessionCookie } from "@/lib/otp-flow";

/**
 * Rotate the pending challenge after the cooldown. The prior challenge is
 * invalidated server-side and the cookie is re-issued, so only the latest
 * code can ever complete the login. Cooldown is enforced in Postgres; the
 * browser countdown is display-only.
 */
export async function POST(request: NextRequest) {
  const pending = await pendingToken(request);
  if (!pending || !pending.email || !pending.name)
    return NextResponse.json({ error: "Verification session not found. Sign in again." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });

  const policy = await getSecurityPolicy();
  if (otpIssuable().ok !== true || !smtpConfigured())
    return NextResponse.json({ error: "Verification email is unavailable right now." }, { status: 503 });

  const challengeId = randomUUID();
  const code = generateOtpCode();
  const verifier = otpCodeVerifier(challengeId, code);
  if (!verifier) return NextResponse.json({ error: "Verification email is unavailable right now." }, { status: 503 });

  // The pending token carries no user id by design — resolve the owner from
  // the live challenge row it is bound to.
  const current = await readChallenge(pending.challengeId);
  if (!current) return NextResponse.json({ error: "Verification session not found. Sign in again." }, { status: 401 });

  const { data, error } = await supabase.rpc("auth_otp_issue", {
    p_user_id: current.user_id, p_challenge_id: challengeId, p_code_verifier: verifier,
    p_ttl_seconds: policy.otpTtlSeconds, p_cooldown_seconds: policy.otpResendCooldownSeconds,
  });
  if (error || !data) {
    if (error?.message.includes("OTP_RESEND_COOLDOWN")) {
      const retryAfter = Math.max(1, Math.ceil((new Date(current.resend_available_at).getTime() - Date.now()) / 1000));
      return NextResponse.json({ error: "Please wait before requesting a new code.", retryAfter }, { status: 429 });
    }
    if (error?.message.includes("OTP_RATE_LIMITED"))
      return NextResponse.json({ error: "Too many codes requested. Sign in again later." }, { status: 429 });
    return NextResponse.json({ error: "A new code could not be issued. Sign in again." }, { status: 400 });
  }

  const sent = await sendOtpEmail({ to: pending.email, code, ttlMinutes: otpTtlMinutes(policy) });
  if (!sent.ok) return NextResponse.json({ error: "The verification email could not be delivered." }, { status: 503 });

  await setPendingSessionCookie(await cookies(), {
    challengeId, email: pending.email, name: pending.name, persistent: pending.persistent === true,
  });
  const issued = data as { expiresAt?: string; resendAvailableAt?: string };
  return NextResponse.json({ ok: true, expiresAt: issued.expiresAt, resendAvailableAt: issued.resendAvailableAt });
}
