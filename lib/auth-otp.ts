/**
 * OTP code lifecycle helpers. Pure except for the server-only secret read —
 * and even that never leaves the HMAC. The code itself is never stored,
 * logged, or placed in a token; only the verifier reaches PostgreSQL.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { OTP_CODE_LENGTH, OTP_CODE_PATTERN } from "@/lib/otp-email";

export { OTP_CODE_LENGTH, OTP_CODE_PATTERN };

/** Six-digit code from a cryptographic RNG. randomInt is injectable for tests. */
export function generateOtpCode(random: (min: number, max: number) => number = randomInt): string {
  return String(random(0, 1_000_000)).padStart(OTP_CODE_LENGTH, "0");
}

/** Server-only HMAC secret. Absent secret = OTP cannot be issued (fail closed). */
export function otpHashSecret(): string | null {
  const secret = process.env.OTP_HASH_SECRET?.trim();
  return secret ? secret : null;
}

/** The only representation ever persisted: HMAC(secret, challengeId + ":" + code). */
export function otpCodeVerifier(challengeId: string, code: string): string | null {
  const secret = otpHashSecret();
  if (!secret || !challengeId || !OTP_CODE_PATTERN.test(code)) return null;
  return createHmac("sha256", secret).update(`${challengeId}:${code}`).digest("hex");
}

/** Constant-time verifier comparison for non-RPC call sites. */
export function otpVerifierMatches(expected: string, actual: string): boolean {
  if (!expected || !actual || expected.length !== actual.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

/** Fail-closed send gate: OTP requires SMTP *and* the HMAC secret. */
export function otpIssuable(): { ok: true } | { ok: false; reason: string } {
  if (!otpHashSecret()) return { ok: false, reason: "OTP_HASH_SECRET is not configured on the server." };
  return { ok: true };
}
