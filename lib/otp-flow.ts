/**
 * Server-only OTP session plumbing. The pending (stage-1) token carries no
 * role and no user id — only the challenge it may complete. Upgrades and
 * rotations re-issue the SAME NextAuth cookie through NextAuth's own
 * encode/decode, so no second ticket system ever exists.
 */
import { getToken, encode } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { SESSION_MAX_AGE, sessionCookieName, sessionCookieOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";

export type PendingToken = { challengeId: string; email?: string; name?: string; persistent?: boolean };

export async function pendingToken(request: NextRequest): Promise<PendingToken | null> {
  const token = await getToken({ req: request, secret: env.authSecret, cookieName: sessionCookieName() });
  if (!token || token.otpPending !== true || typeof token.challengeId !== "string" || !token.challengeId) return null;
  return {
    challengeId: token.challengeId,
    email: typeof token.email === "string" ? token.email : undefined,
    name: typeof token.name === "string" ? token.name : undefined,
    persistent: token.persistent === true,
  };
}

export type OtpChallengeRow = {
  id: string;
  user_id: string;
  expires_at: string;
  consumed_at: string | null;
  invalidated_at: string | null;
  attempt_count: number;
  resend_available_at: string;
  created_at: string;
};

export async function readChallenge(challengeId: string): Promise<OtpChallengeRow | null> {
  if (!supabase) return null;
  const { data } = await supabase.from("auth_otp_challenges")
    .select("id,user_id,expires_at,consumed_at,invalidated_at,attempt_count,resend_available_at,created_at")
    .eq("id", challengeId).maybeSingle();
  return (data as OtpChallengeRow | null) ?? null;
}

export function challengeStatus(row: OtpChallengeRow | null, nowMs = Date.now()): "valid" | "expired" | "invalid" {
  if (!row || row.consumed_at || row.invalidated_at) return "invalid";
  return new Date(row.expires_at).getTime() <= nowMs ? "expired" : "valid";
}

type CookieStore = { set: (name: string, value: string, options: Record<string, unknown>) => void };

/** Mint the stage-1 cookie: challenge-bound, role-less, id-less, disabled. */
export async function setPendingSessionCookie(
  store: CookieStore,
  input: { challengeId: string; email: string; name: string; persistent: boolean },
) {
  const encoded = await encode({
    token: { otpPending: true, challengeId: input.challengeId, persistent: input.persistent, email: input.email, name: input.name },
    secret: env.authSecret,
    maxAge: SESSION_MAX_AGE,
  });
  store.set(sessionCookieName(), encoded, { ...sessionCookieOptions(), maxAge: SESSION_MAX_AGE });
}

/** Mint the full post-verification cookie. Absolute lifetime restarts here. */
export async function setFullSessionCookie(
  store: CookieStore,
  input: { id: string; email: string; name: string; role: Role; authVersion: number; persistent: boolean },
) {
  const encoded = await encode({
    token: { sub: input.id, email: input.email, name: input.name, role: input.role, authVersion: input.authVersion, persistent: input.persistent, otpPending: false, disabled: false },
    secret: env.authSecret,
    maxAge: SESSION_MAX_AGE,
  });
  store.set(sessionCookieName(), encoded, { ...sessionCookieOptions(), maxAge: SESSION_MAX_AGE });
}
