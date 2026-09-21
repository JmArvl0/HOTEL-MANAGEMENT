// System Administration → Security Configuration. Pure session-policy helpers
// plus source-scan contracts for the migration (own table, checks, admin-only
// RPC, revoke/grant footer) and the enforcement surfaces. OTP is deferred by
// design — no OTP values exist anywhere, so no OTP contracts exist either.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as securityPolicy from "@/lib/security-policy";
import {
  ABSOLUTE_SESSION_OPTIONS,
  DEFAULT_SECURITY_POLICY,
  IDLE_TIMEOUT_OPTIONS,
  SECURITY_IDLE_MINUTES_MAX,
  SECURITY_IDLE_MINUTES_MIN,
  evaluateSessionExpiry,
  getSecurityPolicy,
  resetSecurityPolicyCache,
  resolveSessionEnforcement,
  securityPolicyFromRow,
  validateSecurityPolicyValues,
  type SecurityPolicy,
} from "./security-policy";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
const policy = (overrides: Partial<SecurityPolicy> = {}): SecurityPolicy => ({ ...DEFAULT_SECURITY_POLICY, ...overrides });
const issuedSec = (minutesAgoCount: number) => Math.floor(Date.now() / 1000) - minutesAgoCount * 60;

describe("security policy defaults and validation", () => {
  it("defaults preserve current behavior: no persistence, 30m idle, 8h absolute", () => {
    expect(DEFAULT_SECURITY_POLICY).toMatchObject({
      persistentSessionEnabled: false,
      idleTimeoutMinutes: 30,
      absoluteSessionMinutes: 480,
    });
  });

  const otp = { loginOtpEnabled: false, otpTtlSeconds: 300, otpResendCooldownSeconds: 60, otpMaxAttempts: 5 };

  it("accepts in-range values and rejects dangerous ones", () => {
    expect(validateSecurityPolicyValues({ persistentSessionEnabled: true, idleTimeoutMinutes: 30, absoluteSessionMinutes: 480, ...otp })).toBeNull();
    expect(validateSecurityPolicyValues({ persistentSessionEnabled: false, idleTimeoutMinutes: 10, absoluteSessionMinutes: 60, ...otp })).toBeNull();
    expect(validateSecurityPolicyValues({ persistentSessionEnabled: true, idleTimeoutMinutes: 9, absoluteSessionMinutes: 480, ...otp })).not.toBeNull();
    expect(validateSecurityPolicyValues({ persistentSessionEnabled: true, idleTimeoutMinutes: 481, absoluteSessionMinutes: 480, ...otp })).not.toBeNull();
    expect(validateSecurityPolicyValues({ persistentSessionEnabled: true, idleTimeoutMinutes: 30, absoluteSessionMinutes: 45, ...otp })).not.toBeNull();
    expect(validateSecurityPolicyValues({ persistentSessionEnabled: true, idleTimeoutMinutes: 30, absoluteSessionMinutes: 180, ...otp })).not.toBeNull();
    expect(validateSecurityPolicyValues({ persistentSessionEnabled: true, idleTimeoutMinutes: 30, absoluteSessionMinutes: 1500, ...otp })).not.toBeNull();
    expect(validateSecurityPolicyValues({ persistentSessionEnabled: "yes", idleTimeoutMinutes: 30, absoluteSessionMinutes: 480, ...otp })).not.toBeNull();
  });

  it("absolute lifetime must not be shorter than the inactivity timeout", () => {
    expect(validateSecurityPolicyValues({ persistentSessionEnabled: false, idleTimeoutMinutes: 120, absoluteSessionMinutes: 60, ...otp })).not.toBeNull();
  });

  it("restricts OTP values to the safe option sets", () => {
    const base = { persistentSessionEnabled: false, idleTimeoutMinutes: 30, absoluteSessionMinutes: 480 };
    expect(validateSecurityPolicyValues({ ...base, loginOtpEnabled: true, otpTtlSeconds: 300, otpResendCooldownSeconds: 60, otpMaxAttempts: 5 })).toBeNull();
    expect(validateSecurityPolicyValues({ ...base, loginOtpEnabled: true, otpTtlSeconds: 120, otpResendCooldownSeconds: 60, otpMaxAttempts: 5 })).not.toBeNull();
    expect(validateSecurityPolicyValues({ ...base, loginOtpEnabled: true, otpTtlSeconds: 300, otpResendCooldownSeconds: 45, otpMaxAttempts: 5 })).not.toBeNull();
    expect(validateSecurityPolicyValues({ ...base, loginOtpEnabled: true, otpTtlSeconds: 300, otpResendCooldownSeconds: 60, otpMaxAttempts: 7 })).not.toBeNull();
    expect(validateSecurityPolicyValues({ ...base, loginOtpEnabled: "yes", otpTtlSeconds: 300, otpResendCooldownSeconds: 60, otpMaxAttempts: 5 })).not.toBeNull();
  });

  it("bounds and option sets match the migration checks", () => {
    expect(SECURITY_IDLE_MINUTES_MIN).toBe(10);
    expect(SECURITY_IDLE_MINUTES_MAX).toBe(480);
    expect(ABSOLUTE_SESSION_OPTIONS).toEqual([60, 120, 240, 480, 720, 1440]);
    expect(IDLE_TIMEOUT_OPTIONS[0]).toBeGreaterThanOrEqual(SECURITY_IDLE_MINUTES_MIN);
    expect(IDLE_TIMEOUT_OPTIONS[IDLE_TIMEOUT_OPTIONS.length - 1]).toBeLessThanOrEqual(SECURITY_IDLE_MINUTES_MAX);
  });

  it("derives policy from a database row, falling back safely", () => {
    expect(securityPolicyFromRow(null)).toEqual(DEFAULT_SECURITY_POLICY);
    expect(securityPolicyFromRow(undefined)).toEqual(DEFAULT_SECURITY_POLICY);
    expect(securityPolicyFromRow({
      persistent_session_enabled: true, idle_timeout_minutes: 45,
      absolute_session_minutes: 720, version: 3, updated_by: "u1", updated_at: "2026-10-09T00:00:00Z",
    })).toMatchObject({ persistentSessionEnabled: true, idleTimeoutMinutes: 45, absoluteSessionMinutes: 720, version: 3 });
    expect(securityPolicyFromRow({})).toEqual({ ...DEFAULT_SECURITY_POLICY });
  });

  it("falls back to defaults with no database (demo mode)", async () => {
    resetSecurityPolicyCache();
    await expect(getSecurityPolicy()).resolves.toEqual(DEFAULT_SECURITY_POLICY);
  });
});

describe("session expiry verdicts", () => {
  it("exposes the earliest server-enforced idle or absolute deadline", () => {
    const deadline = (securityPolicy as unknown as { sessionExpiryDeadline?: (input: { issuedAtSec: number; lastSeenAt: string; persistent: boolean; policy: SecurityPolicy; nowMs: number }) => string | null }).sessionExpiryDeadline;
    expect(typeof deadline).toBe("function");
    if (!deadline) return;
    const nowMs = Date.parse("2026-09-21T04:00:00.000Z");
    const enabled = policy({ persistentSessionEnabled: true, idleTimeoutMinutes: 30, absoluteSessionMinutes: 480 });
    expect(deadline({ issuedAtSec: (nowMs - 60 * 60_000) / 1000, lastSeenAt: new Date(nowMs - 10 * 60_000).toISOString(), persistent: true, policy: enabled, nowMs }))
      .toBe("2026-09-21T04:20:00.000Z");
    expect(deadline({ issuedAtSec: (nowMs - 20 * 60_000) / 1000, lastSeenAt: new Date(nowMs).toISOString(), persistent: false, policy: enabled, nowMs }))
      .toBe("2026-09-21T04:10:00.000Z");
  });

  it("fresh activity within both windows stays active", () => {
    expect(evaluateSessionExpiry({ issuedAtSec: issuedSec(10), lastSeenAt: minutesAgo(5), persistent: false, policy: policy() })).toBe("active");
    expect(evaluateSessionExpiry({ issuedAtSec: issuedSec(100), lastSeenAt: minutesAgo(5), persistent: true, policy: policy({ persistentSessionEnabled: true }) })).toBe("active");
  });

  it("inactivity past the idle timeout ends the session", () => {
    expect(evaluateSessionExpiry({ issuedAtSec: issuedSec(10), lastSeenAt: minutesAgo(31), persistent: false, policy: policy() })).toBe("idle");
    expect(evaluateSessionExpiry({ issuedAtSec: issuedSec(10), lastSeenAt: minutesAgo(31), persistent: true, policy: policy() })).toBe("idle");
  });

  it("standard sign-in is bound by the inactivity window even while active", () => {
    expect(evaluateSessionExpiry({ issuedAtSec: issuedSec(31), lastSeenAt: minutesAgo(1), persistent: false, policy: policy() })).toBe("absolute");
  });

  it("Remember Me extends an active session to the configured maximum lifetime", () => {
    const enabled = policy({ persistentSessionEnabled: true });
    expect(evaluateSessionExpiry({ issuedAtSec: issuedSec(100), lastSeenAt: minutesAgo(1), persistent: true, policy: enabled })).toBe("active");
    expect(evaluateSessionExpiry({ issuedAtSec: issuedSec(481), lastSeenAt: minutesAgo(1), persistent: true, policy: enabled })).toBe("absolute");
  });

  it("a disabled persistence toggle demotes Remember Me tokens to the standard tier", () => {
    const off = policy({ persistentSessionEnabled: false });
    expect(evaluateSessionExpiry({ issuedAtSec: issuedSec(100), lastSeenAt: minutesAgo(1), persistent: true, policy: off })).toBe("absolute");
  });

  it("a never-stamped account is grandfathered active once (the caller stamps it)", () => {
    expect(evaluateSessionExpiry({ issuedAtSec: issuedSec(10000), lastSeenAt: null, persistent: false, policy: policy() })).toBe("active");
  });
});

describe("session enforcement decisions (admin login-lockout regression)", () => {
  it("a query error fails open — it proves nothing about the account", () => {
    // The 2026-10-09 lockout: last_seen_at did not exist yet, every select
    // errored, and the callback neutralized every session. Errors allow.
    expect(resolveSessionEnforcement({ queryError: true, hasRow: false, verdict: "active" })).toBe("allow");
    expect(resolveSessionEnforcement({ queryError: true, hasRow: true, verdict: "idle" })).toBe("allow");
  });

  it("a cleanly absent row neutralizes (deleted account, forged id)", () => {
    expect(resolveSessionEnforcement({ queryError: false, hasRow: false, verdict: "active" })).toBe("neutralize");
  });

  it("expired verdicts neutralize, active verdicts allow", () => {
    expect(resolveSessionEnforcement({ queryError: false, hasRow: true, verdict: "active" })).toBe("allow");
    expect(resolveSessionEnforcement({ queryError: false, hasRow: true, verdict: "idle" })).toBe("neutralize");
    expect(resolveSessionEnforcement({ queryError: false, hasRow: true, verdict: "absolute" })).toBe("neutralize");
  });
});

describe("migration contract (20261009010000_security_policy.sql)", () => {
  const sql = read("supabase/migrations/20261009010000_security_policy.sql");

  it("creates its own table with safe bounds, never touching operational policy", () => {
    expect(sql).toContain("create table if not exists public.security_policies");
    expect(sql).toMatch(/check \(idle_timeout_minutes between 10 and 480\)/);
    expect(sql).toMatch(/check \(absolute_session_minutes between 60 and 1440\)/);
    expect(sql).toMatch(/check \(absolute_session_minutes >= idle_timeout_minutes\)/);
    expect(sql).not.toMatch(/hotel_operational_policies/);
    expect(sql).not.toMatch(/otp/i);
  });

  it("stamps last_seen_at on user_accounts for idle enforcement", () => {
    expect(sql).toMatch(/alter table public\.user_accounts\s+add column if not exists last_seen_at timestamptz/);
  });

  it("the update RPC is System Administrator only, version-checked, reasoned, and audited", () => {
    expect(sql).toMatch(/actor is null or actor<>'admin'then raise exception'SECURITY_ADMIN_ONLY'/);
    expect(sql).toMatch(/raise exception'POLICY_STALE'/);
    expect(sql).toMatch(/raise exception'INVALID_SECURITY_POLICY'/);
    expect(sql).toMatch(/'security_policy_updated','security_policy','default'/);
    expect(sql).not.toMatch(/token|secret|password|cookie/i);
  });

  it("revokes from public/anon/authenticated and grants only service_role", () => {
    const signature = "admin_update_security_policy(boolean,integer,integer,text,integer,uuid)";
    expect(sql).toContain(`revoke all on function public.${signature}from public,anon,authenticated`);
    expect(sql).toContain(`revoke execute on function public.${signature}from anon,authenticated`);
    expect(sql).toContain(`grant execute on function public.${signature}to service_role`);
    expect(sql).toContain("revoke all on table public.security_policies from public,anon,authenticated");
  });
});

describe("enforcement surface contracts", () => {
  it("the session callback — the per-request authority — neutralizes expired sessions", () => {
    const auth = read("lib/auth.ts");
    expect(auth).toMatch(/evaluateSessionExpiry/);
    expect(auth).toMatch(/session\.user\.disabled\s*=\s*true/);
    // callbacks.jwt does NOT run per request (getToken only decodes), so the
    // session callback must own enforcement; the jwt callback keeps its
    // account re-validation role.
    expect(auth).toMatch(/callbacks\.jwt|async jwt/);
  });

  it("mandatory cookie protections stay hardcoded with no disable path", () => {
    const auth = read("lib/auth.ts");
    expect(auth).toMatch(/httpOnly: true/);
    expect(auth).toMatch(/sameSite: "lax"/);
    expect(auth).toMatch(/secure: env\.isProduction/);
    expect(auth).not.toMatch(/httpOnly: (false|.*enabled)/);
  });

  it("the admin mutate route is admin-only with server validation and stale handling", () => {
    const route = read("app/api/admin/security-policy/route.ts");
    expect(route).toMatch(/c\.role\s*!==\s*"admin"/);
    expect(route).toMatch(/admin_update_security_policy/);
    expect(route).toMatch(/POLICY_STALE/);
    expect(route).toMatch(/SECURITY_ADMIN_ONLY/);
  });

  it("the public endpoint exposes only the persistence flag — no values, no secrets", () => {
    const route = read("app/api/security-policy/public/route.ts");
    expect(route).toMatch(/persistentSessionEnabled/);
    expect(route).not.toMatch(/idleTimeoutMinutes|absoluteSessionMinutes|version/);
  });

  it("the original session table never gains OTP columns (separation preserved)", () => {
    expect(read("supabase/migrations/20261009010000_security_policy.sql")).not.toMatch(/otp/i);
  });

  it("stage-1 login mints a role-less, id-less pending token — never a session", () => {
    const auth = read("lib/auth.ts");
    expect(auth).toMatch(/otpPending/);
    expect(auth).toMatch(/id: ""/);
    // The full session cookie is minted only in the verify route, after the
    // atomic RPC consumes the challenge.
    expect(auth).not.toMatch(/setFullSessionCookie/);
    const verify = read("app/api/auth/otp/verify/route.ts");
    expect(verify).toMatch(/auth_otp_verify/);
    expect(verify).toMatch(/setFullSessionCookie/);
  });

  it("no client-trusted verification flag exists anywhere in the OTP flow", () => {
    for (const path of ["lib/auth.ts", "app/api/auth/otp/verify/route.ts", "app/api/auth/otp/resend/route.ts", "components/auth/verify-form.tsx", "components/auth/login-form.tsx"]) {
      expect(read(path)).not.toMatch(/otpVerified\s*:\s*true/i);
    }
  });

  it("OTP values never reach storage, tokens, cookies, audit, logs, or URLs", () => {
    const sql = read("supabase/migrations/20261010010000_login_otp.sql");
    // The only code-shaped column is the HMAC verifier; no plaintext column exists.
    expect(sql).toContain("code_verifier text not null");
    expect(sql).not.toMatch(/code text|plain_code|otp_code|plaintext/i);
    for (const path of ["lib/otp-flow.ts", "lib/auth.ts", "app/api/auth/otp/verify/route.ts", "app/api/auth/otp/resend/route.ts"]) {
      const source = read(path);
      expect(source).not.toMatch(/console\.(log|debug|info|warn|error)/);
    }
    const auditInsert = sql.match(/insert into audit_logs[\s\S]*?;/g) ?? [];
    expect(auditInsert.length).toBeGreaterThan(0);
    for (const row of auditInsert) expect(row).not.toMatch(/code|verifier|password|secret/i);
  });

  it("recovery links are untouched by the OTP migration", () => {
    const sql = read("supabase/migrations/20261010010000_login_otp.sql");
    expect(sql).not.toMatch(/account_recovery_tokens|complete_account_recovery|admin_initiate_account_recovery/);
  });

  it("the admin OTP route validates option sets and keeps admin-only mutation", () => {
    const route = read("app/api/admin/security-policy/route.ts");
    expect(route).toMatch(/OTP_TTL_OPTIONS/);
    expect(route).toMatch(/OTP_COOLDOWN_OPTIONS/);
    expect(route).toMatch(/OTP_ATTEMPTS_OPTIONS/);
    expect(route).toMatch(/p_login_otp_enabled:v\.loginOtpEnabled/);
  });

  it("the public OTP surface exposes no secrets and SMTP stays server-only", () => {
    expect(read("app/api/security-policy/public/route.ts")).not.toMatch(/otp/i);
    const transport = read("lib/otp-transport.ts");
    expect(transport).toMatch(/process\.env\.SMTP_PASSWORD/);
    for (const path of ["components/auth/verify-form.tsx", "components/auth/login-form.tsx", "components/admin/admin-dashboard-client.tsx"]) {
      expect(read(path)).not.toMatch(/otp-transport|SMTP_PASSWORD|nodemailer/i);
    }
  });

  it("the callback routes through the error-aware decision (never blank id on error)", () => {
    const auth = read("lib/auth.ts");
    expect(auth).toMatch(/resolveSessionEnforcement/);
    expect(auth).toMatch(/queryError/);
    expect(auth).not.toMatch(/if \(!seen\)/);
  });

  it("the post-login router bounces neutralized sessions straight to login", () => {
    const cont = read("app/(auth)/auth/continue/page.tsx");
    expect(cont).toMatch(/session\.user\.disabled/);
    expect(cont).toMatch(/!session\.user\.id/);
    expect(cont).toMatch(/redirect\("\/login"\)/);
  });

  it("the customer layout can only reach queries with a verified user id", () => {
    const layout = read("app/(booking)/(customer)/layout.tsx");
    expect(layout).toMatch(/requireCustomerSession/);
    expect(layout).not.toMatch(/getServerSession/);
    const guard = read("lib/customer-auth.ts");
    expect(guard).toMatch(/!session\.user\.id/);
  });

  it("authentication logs no secrets, tokens, or cookie values", () => {
    for (const path of ["lib/auth.ts", "lib/security-policy.ts", "lib/customer-auth.ts"]) {
      expect(read(path)).not.toMatch(/console\.(log|debug|info|warn|error)/);
    }
  });
});
