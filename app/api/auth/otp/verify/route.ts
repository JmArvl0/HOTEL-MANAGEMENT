import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";
import { getSecurityPolicy } from "@/lib/security-policy";
import { otpCodeVerifier } from "@/lib/auth-otp";
import { OTP_CODE_PATTERN } from "@/lib/otp-email";
import { pendingToken, setFullSessionCookie } from "@/lib/otp-flow";
import { cookies } from "next/headers";

const schema = z.object({ code: z.string().trim().regex(OTP_CODE_PATTERN, "Enter the 6-digit code.") });

const rpcMessage = (message: string) => {
  if (message.includes("OTP_INCORRECT")) return { status: 401, error: "The verification code is incorrect." };
  if (message.includes("OTP_EXPIRED")) return { status: 401, error: "This verification code has expired. Request a new code.", expired: true };
  if (message.includes("OTP_TOO_MANY_ATTEMPTS") || message.includes("OTP_INVALIDATED") || message.includes("OTP_ALREADY_USED"))
    return { status: 403, error: "This code is no longer valid. Sign in again." };
  return { status: 400, error: "Verification session not found. Sign in again." };
};

/**
 * Stage 2 of login OTP. Requires possession of the pending cookie; the code
 * is verified atomically by auth_otp_verify (single-use under a row lock).
 * Only then is the full session cookie minted — a correct password alone
 * never reaches a protected page while OTP is required.
 */
export async function POST(request: NextRequest) {
  const pending = await pendingToken(request);
  if (!pending) return NextResponse.json({ error: "Verification session not found. Sign in again." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });

  const policy = await getSecurityPolicy();

  const verifier = otpCodeVerifier(pending.challengeId, parsed.data.code);
  if (!verifier) return NextResponse.json({ error: "Enter the 6-digit code." }, { status: 400 });

  const { data, error } = await supabase.rpc("auth_otp_verify", {
    p_challenge_id: pending.challengeId, p_code_verifier: verifier, p_max_attempts: policy.otpMaxAttempts,
  });
  if (error || !data) {
    const mapped = rpcMessage(error?.message ?? "");
    return NextResponse.json({ error: mapped.error, expired: "expired" in mapped ? true : undefined }, { status: mapped.status });
  }

  // Challenge consumed — bind the session to the verified account, re-checked
  // exactly like a fresh login. A disabled account cannot complete OTP.
  const userId = (data as { userId?: string })?.userId;
  const { data: account } = await supabase.from("user_accounts")
    .select("id,email,name,role,active,auth_version,recovery_required").eq("id", userId ?? "").maybeSingle();
  if (!account?.active || account.recovery_required) {
    // No session is minted: the code is spent, so a fresh sign-in is required.
    return NextResponse.json({ error: "This account is unavailable. Sign in again." }, { status: 401 });
  }

  await supabase.from("user_accounts").update({ last_seen_at: new Date().toISOString() }).eq("id", account.id);
  await setFullSessionCookie(await cookies(), {
    id: account.id, email: account.email, name: account.name,
    role: account.role as Role, authVersion: account.auth_version ?? 1, persistent: pending.persistent === true,
  });
  return NextResponse.json({ ok: true });
}
