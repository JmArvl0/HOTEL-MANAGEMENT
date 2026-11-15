import { authRequestBudget } from "@/lib/auth-request-budget";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { createHash, randomUUID } from "node:crypto";
import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";
import { evaluateSessionExpiry, loadSecurityPolicyFresh, sessionExpiryDeadline } from "@/lib/security-policy";
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
    async authorize(credentials, request) {
      if (!credentials?.email || !credentials.password || !supabase) return null;
      const email = credentials.email.trim().toLowerCase();
      if (email.length > 200 || await authRequestBudget("login", email, request?.headers) !== "allowed") return null;
      const { data } = await supabase.from("user_accounts").select("id,email,name,role,password_hash,active,auth_version,recovery_required").eq("email", email).maybeSingle();
      if (!data?.active || data.recovery_required || !(await bcrypt.compare(credentials.password, data.password_hash))) {
        await recordLoginFailure(email);
        return null;
      }
      const policy = await loadSecurityPolicyFresh();
      // Fail closed: an unreadable policy must never silently downgrade an
      // OTP-required deployment to password-only authentication.
      if (!policy) return null;
      const persistent = credentials.remember === "1" && policy.cookieEnabled;
      // Password-only path: the authoritative policy does not require login
      // OTP, so no challenge is created. Stamps last_seen_at exactly like the
      // OTP verify route does before minting its cookie — without a fresh
      // stamp the session callback would neutralize this new session as idle
      // for any account whose previous stamp predates the inactivity window.
      // Best-effort (result ignored); enforcement stays with the session
      // callback. Returns the normal fully authenticated user object — the
      // jwt callback mints the standard session (role, authVersion,
      // persistent) exactly as the OTP verify route's upgrade does for the
      // enabled path.
      if (!policy.loginOtpEnabled) {
        await supabase.from("user_accounts").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
        return { id: data.id, email: data.email, name: data.name, role: data.role as Role, authVersion: data.auth_version, persistent };
      }
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
          .select("id,expires_at,resend_available_at").eq("user_id", data.id).eq("purpose", "login")
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
      // NextAuth rewrites iat when its session endpoint renews the cookie.
      // Pin legacy tokens once and never accept a client-supplied replacement.
      if (typeof token.loginIssuedAt !== "number") token.loginIssuedAt = typeof token.iat === "number" ? token.iat : Math.floor(Date.now() / 1000);
      if (user) {
        token.loginIssuedAt = Math.floor(Date.now() / 1000);
        token.activityId = randomUUID();
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
      if (!token.activityId && token.sub) token.activityId = createHash("sha256").update(`${token.sub}:${token.jti ?? token.loginIssuedAt}`).digest("hex");
      if (trigger === "update" && typeof session?.name === "string") token.name = session.name;
      if (typeof token.loginIssuedAt === "number" && Date.now() / 1000 - token.loginIssuedAt > SESSION_MAX_AGE) {
        token.disabled = true;
        token.role = "guest";
      }
      return token;
    },
    async session({ session, token }) {
      const issuedAtSec = typeof token.loginIssuedAt === "number" ? token.loginIssuedAt : typeof token.iat === "number" ? token.iat : null;
      if (session.user) { session.user.id=token.sub??"";session.user.role=(token.role as Role)??"guest";session.user.disabled=Boolean(token.disabled);session.user.otpPending=token.otpPending===true; }
      // Authoritative idle/absolute enforcement on every getServerSession.
      // An expired session is neutralized here (disabled +
      // guest + blank id) so every guard, page, and inline session check sees
      // the same verdict without touching any route.
      if (session.user && !session.user.disabled && session.user.id && supabase) {
        try {
          if (!token.activityId || issuedAtSec == null) throw new Error("Session activity unavailable");
          const [policy, seen] = await Promise.all([
            loadSecurityPolicyFresh(),
            supabase.from("auth_session_activity").select("last_seen_at")
              .eq("session_id", token.activityId).eq("user_id", session.user.id).maybeSingle(),
          ]);
          if (seen.error || !policy) throw new Error("Session activity unavailable");
          const lastSeenAt = seen.data?.last_seen_at ?? new Date(issuedAtSec * 1000).toISOString();
          const basis = { issuedAtSec, lastSeenAt, persistent: token.persistent === true, policy };
          if (evaluateSessionExpiry(basis) !== "active") throw new Error("Session expired");
          session.activityId = token.activityId;
          session.sessionExpiresAt = sessionExpiryDeadline(basis);
        } catch {
          session.user.disabled = true; session.user.role = "guest"; session.user.id = "";
        }
      }
      return session;
    }
  }
};
