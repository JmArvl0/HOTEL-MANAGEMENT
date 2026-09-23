import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";
import { evaluateSessionExpiry, getSecurityPolicy, resolveSessionEnforcement, sessionExpiryDeadline, touchSecuritySeen } from "@/lib/security-policy";
import { generateOtpCode, otpCodeVerifier, otpIssuable } from "@/lib/auth-otp";
import { sendOtpEmail, smtpConfigured } from "@/lib/otp-transport";
import { otpTtlMinutes } from "@/lib/security-policy";

/** Cookie backstop: the configured absolute lifetime (<= 24h) always binds
 * first through the session callback, so the cookie itself can never outlive
 * the security policy. Exported for the OTP upgrade/resend routes, which
 * re-issue this exact cookie through NextAuth's own encode. */
export const SESSION_MAX_AGE = 24 * 60 * 60 + 300;
export const sessionCookieName = () => (env.isProduction ? "__Secure-haven.session-token" : "haven.session-token");
export const sessionCookieOptions = () => ({ httpOnly: true as const, sameSite: "lax" as const, path: "/", secure: env.isProduction });

/** Failed-password lockout: DB-backed, per account, no in-memory counters. */
const LOGIN_FAIL_WINDOW_MINUTES = 15;
const LOGIN_FAIL_LIMIT = 10;

async function loginFailuresRecent(email: string): Promise<number> {
  if (!supabase) return 0;
  const since = new Date(Date.now() - LOGIN_FAIL_WINDOW_MINUTES * 60_000).toISOString();
  const { count } = await supabase.from("audit_logs").select("id", { count: "exact", head: true })
    .eq("action", "auth_login_failed").eq("entity_id", email).gte("created_at", since);
  return count ?? 0;
}

async function recordLoginFailure(email: string) {
  if (!supabase) return;
  // user_id stays null: the account may not exist, and the email alone is
  // what the lockout counts. No password or secret is ever recorded.
  await supabase.from("audit_logs").insert({ user_id: null, action: "auth_login_failed", entity_type: "user_account", entity_id: email });
}

export const authOptions: NextAuthOptions = {
  secret: env.authSecret,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE },
  cookies: { sessionToken: { name: sessionCookieName(), options: sessionCookieOptions() } },
  pages: { signIn: "/login" },
  providers: [CredentialsProvider({
    name: "Credentials",
    credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" }, remember: { label: "Remember me", type: "text" } },
    async authorize(credentials) {
      if (!credentials?.email || !credentials.password || !supabase) return null;
      const email = credentials.email.trim().toLowerCase();
      if (await loginFailuresRecent(email) >= LOGIN_FAIL_LIMIT) return null;
      const { data } = await supabase.from("user_accounts").select("id,email,name,role,password_hash,active,auth_version,recovery_required").eq("email", email).maybeSingle();
      if (!data?.active || data.recovery_required || !(await bcrypt.compare(credentials.password, data.password_hash))) {
        await recordLoginFailure(email);
        return null;
      }
      const policy = await getSecurityPolicy();
      const persistent = credentials.remember === "1" && policy.persistentSessionEnabled;
      // Mandatory login OTP for all roles: password alone never mints a session.
      // Stage 1 of login OTP: password verified, but no authenticated session
      // yet. Fail closed when the delivery prerequisites are missing.
      if (otpIssuable().ok !== true || !smtpConfigured()) return null;
      const challengeId = randomUUID();
      const code = generateOtpCode();
      const verifier = otpCodeVerifier(challengeId, code);
      if (!verifier) return null;
      const { error: issueError } = await supabase.rpc("auth_otp_issue", {
        p_user_id: data.id, p_challenge_id: challengeId, p_code_verifier: verifier,
        p_ttl_seconds: policy.otpTtlSeconds, p_cooldown_seconds: policy.otpResendCooldownSeconds,
      });
      if (issueError) {
        if (!issueError.message.includes("OTP_RESEND_COOLDOWN")) return null;
        // A fresh code is cooling down: fall through to the still-valid
        // challenge already in flight instead of failing the login.
        const { data: active } = await supabase.from("auth_otp_challenges")
          .select("id,expires_at,resend_available_at").eq("user_id", data.id)
          .is("consumed_at", null).is("invalidated_at", null).gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false }).limit(1).maybeSingle();
        if (!active) return null;
        return { id: "", email: data.email, name: data.name, role: "guest" as Role, otpPending: true, challengeId: active.id, persistent };
      }
      const sent = await sendOtpEmail({ to: data.email, code, ttlMinutes: otpTtlMinutes(policy) });
      if (!sent.ok) return null;
      return { id: "", email: data.email, name: data.name, role: "guest" as Role, otpPending: true, challengeId, persistent };
    }
  })],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        const signedIn=user as typeof user&{role:Role;authVersion:number;persistent?:boolean;otpPending?:boolean;challengeId?:string};
        if (signedIn.otpPending === true && signedIn.challengeId) {
          // Stage-1 login OTP token: deliberately carries NO role and NO user
          // id. It stays disabled (every guard and page rejects it) until the
          // verify route upgrades it after a correct code. sub is "" (falsy),
          // so the revalidation branch below never touches it.
          token.otpPending=true;token.challengeId=signedIn.challengeId;token.persistent=signedIn.persistent===true;token.disabled=true;token.role="guest";
        } else { token.role=signedIn.role;token.authVersion=signedIn.authVersion;token.persistent=signedIn.persistent===true;token.otpPending=false;token.disabled=false; }
      }
      else if (token.sub && supabase) {
        const { data } = await supabase.from("user_accounts").select("role,active,auth_version,recovery_required").eq("id", token.sub).maybeSingle();
        const databaseVersion = data?.auth_version ?? 1;
        if (!data?.active || data.recovery_required || token.authVersion !== databaseVersion) { token.disabled=true;token.role="guest"; }
        else { token.disabled=false;token.role=data.role as Role; }
      }
      if (trigger === "update" && typeof session?.name === "string") token.name = session.name;
      return token;
    },
    async session({ session, token }) {
      if (session.user) { session.user.id=token.sub??"";session.user.role=(token.role as Role)??"guest";session.user.disabled=Boolean(token.disabled);session.user.otpPending=token.otpPending===true; }
      // Authoritative idle/absolute enforcement. getToken only decodes, so
      // callbacks.jwt does NOT run per request — this callback does, on every
      // getServerSession. An expired session is neutralized here (disabled +
      // guest + blank id) so every guard, page, and inline session check sees
      // the same verdict without touching any route.
      if (session.user && !session.user.disabled && session.user.id && supabase) {
        try {
          const [policy, seen] = await Promise.all([
            getSecurityPolicy(),
            supabase.from("user_accounts").select("last_seen_at").eq("id", session.user.id).maybeSingle().then((row) => ({ data: row.data, queryError: row.error != null })),
          ]);
          const lastSeen = seen.data && typeof seen.data.last_seen_at === "string" ? seen.data.last_seen_at : null;
          const decision = resolveSessionEnforcement({
            queryError: seen.queryError,
            hasRow: seen.data != null,
            verdict: evaluateSessionExpiry({
              issuedAtSec: typeof token.iat === "number" ? token.iat : null,
              lastSeenAt: lastSeen,
              persistent: token.persistent === true,
              policy,
            }),
          });
          if (decision === "allow") {
            // Session reads and dashboard polling are not user activity. Only
            // grandfather a pre-policy account here; subsequent extensions
            // come from the explicit meaningful-activity endpoint.
            const effectiveLastSeen = !seen.queryError && lastSeen == null
              ? await touchSecuritySeen(session.user.id, null)
              : lastSeen;
            if (!seen.queryError) session.sessionExpiresAt = sessionExpiryDeadline({
              issuedAtSec: typeof token.iat === "number" ? token.iat : null,
              lastSeenAt: effectiveLastSeen,
              persistent: token.persistent === true,
              policy,
            });
          }
          else { session.user.disabled=true;session.user.role="guest";session.user.id=""; }
        } catch {
          // Fail-open: a probe failure must never lock every user out at once.
        }
      }
      return session;
    }
  }
};
