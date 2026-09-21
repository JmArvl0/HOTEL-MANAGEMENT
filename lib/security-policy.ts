import { supabase } from "@/lib/supabase";

/**
 * Session security policy — the ONE authoritative server-side source for
 * System Administration → Security Configuration.
 *
 * Lives in its own `security_policies` table (never in
 * hotel_operational_policies, whose columns freeze into every booking's
 * operational_policy_snapshot). Covers session policy plus the genuine email
 * login OTP (see D-022); account recovery links remain a separate flow.
 */
export type SecurityPolicy = {
  persistentSessionEnabled: boolean;
  idleTimeoutMinutes: number;
  absoluteSessionMinutes: number;
  loginOtpEnabled: boolean;
  otpTtlSeconds: number;
  otpResendCooldownSeconds: number;
  otpMaxAttempts: number;
  version: number;
  updatedBy: string | null;
  updatedAt: string | null;
};

export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  persistentSessionEnabled: false,
  idleTimeoutMinutes: 30,
  absoluteSessionMinutes: 480,
  loginOtpEnabled: false,
  otpTtlSeconds: 300,
  otpResendCooldownSeconds: 60,
  otpMaxAttempts: 5,
  version: 1,
  updatedBy: null,
  updatedAt: null,
};

/** OTP validity choices: 3, 5, or 10 minutes (seconds). */
export const OTP_TTL_OPTIONS = [180, 300, 600];

/** Resend cooldown choices: 30, 60, or 120 seconds. */
export const OTP_COOLDOWN_OPTIONS = [30, 60, 120];

/** Verification-attempt choices: 3, 5, or 10. */
export const OTP_ATTEMPTS_OPTIONS = [3, 5, 10];

/** OTP policy guards: never expose the option lists as editable free text. */
export const otpTtlMinutes = (policy: SecurityPolicy) => Math.round(policy.otpTtlSeconds / 60);

/** Inactivity timeout bounds: 10 minutes – 8 hours. */
export const SECURITY_IDLE_MINUTES_MIN = 10;
export const SECURITY_IDLE_MINUTES_MAX = 480;

/** Maximum session lifetime choices: 1h, 2h, 4h, 8h, 12h, 24h. */
export const ABSOLUTE_SESSION_OPTIONS = [60, 120, 240, 480, 720, 1440];

/** Inactivity-timeout choices offered in the admin UI (minutes). */
export const IDLE_TIMEOUT_OPTIONS = [10, 15, 30, 45, 60, 120, 240, 480];

/** last_seen_at writes are throttled to one per active user per minute. */
export const SECURITY_TOUCH_THROTTLE_MS = 60_000;

/** Live policy reads are cached in memory for one minute per server instance. */
export const SECURITY_POLICY_CACHE_MS = 60_000;

export function securityPolicyFromRow(row: unknown): SecurityPolicy {
  if (!row || typeof row !== "object") return DEFAULT_SECURITY_POLICY;
  const value = row as Record<string, unknown>;
  const idle = Number(value.idle_timeout_minutes);
  const absolute = Number(value.absolute_session_minutes);
  const ttl = Number(value.otp_ttl_seconds);
  const cooldown = Number(value.otp_resend_cooldown_seconds);
  const attempts = Number(value.otp_max_attempts);
  return {
    persistentSessionEnabled: value.persistent_session_enabled === true,
    idleTimeoutMinutes: Number.isFinite(idle) ? idle : DEFAULT_SECURITY_POLICY.idleTimeoutMinutes,
    absoluteSessionMinutes: Number.isFinite(absolute) ? absolute : DEFAULT_SECURITY_POLICY.absoluteSessionMinutes,
    loginOtpEnabled: value.login_otp_enabled === true,
    otpTtlSeconds: OTP_TTL_OPTIONS.includes(ttl) ? ttl : DEFAULT_SECURITY_POLICY.otpTtlSeconds,
    otpResendCooldownSeconds: OTP_COOLDOWN_OPTIONS.includes(cooldown) ? cooldown : DEFAULT_SECURITY_POLICY.otpResendCooldownSeconds,
    otpMaxAttempts: OTP_ATTEMPTS_OPTIONS.includes(attempts) ? attempts : DEFAULT_SECURITY_POLICY.otpMaxAttempts,
    version: Number.isFinite(Number(value.version)) ? Number(value.version) : 1,
    updatedBy: typeof value.updated_by === "string" ? value.updated_by : null,
    updatedAt: typeof value.updated_at === "string" ? value.updated_at : null,
  };
}

/** Pure bounds check shared by the route and the admin UI. Null = valid. */
export function validateSecurityPolicyValues(values: {
  persistentSessionEnabled: unknown;
  idleTimeoutMinutes: unknown;
  absoluteSessionMinutes: unknown;
  loginOtpEnabled: unknown;
  otpTtlSeconds: unknown;
  otpResendCooldownSeconds: unknown;
  otpMaxAttempts: unknown;
}): string | null {
  if (typeof values.persistentSessionEnabled !== "boolean") return "Persistent login must be on or off.";
  if (!Number.isInteger(values.idleTimeoutMinutes)) return "Inactivity timeout must be a whole number of minutes.";
  const idle = values.idleTimeoutMinutes as number;
  if (idle < SECURITY_IDLE_MINUTES_MIN || idle > SECURITY_IDLE_MINUTES_MAX)
    return `Inactivity timeout must be between ${SECURITY_IDLE_MINUTES_MIN} minutes and 8 hours.`;
  if (!Number.isInteger(values.absoluteSessionMinutes)) return "Maximum session lifetime must be a whole number of minutes.";
  const absolute = values.absoluteSessionMinutes as number;
  if (!ABSOLUTE_SESSION_OPTIONS.includes(absolute)) return "Maximum session lifetime must be one of 1, 2, 4, 8, 12, or 24 hours.";
  if (absolute < idle) return "Maximum session lifetime must not be shorter than the inactivity timeout.";
  if (typeof values.loginOtpEnabled !== "boolean") return "Login OTP must be on or off.";
  if (!OTP_TTL_OPTIONS.includes(values.otpTtlSeconds as number)) return "OTP validity must be 3, 5, or 10 minutes.";
  if (!OTP_COOLDOWN_OPTIONS.includes(values.otpResendCooldownSeconds as number)) return "Resend cooldown must be 30, 60, or 120 seconds.";
  if (!OTP_ATTEMPTS_OPTIONS.includes(values.otpMaxAttempts as number)) return "Maximum attempts must be 3, 5, or 10.";
  return null;
}

export type SessionExpiry = "active" | "idle" | "absolute";

/** Earliest deadline enforced by evaluateSessionExpiry, exposed to the UI. */
export function sessionExpiryDeadline(input: {
  issuedAtSec: number | null | undefined;
  lastSeenAt: string | null | undefined;
  persistent: boolean;
  policy: SecurityPolicy;
  nowMs?: number;
}): string | null {
  if (typeof input.issuedAtSec !== "number" || !Number.isFinite(input.issuedAtSec) || input.lastSeenAt == null) return null;
  const seenMs = new Date(String(input.lastSeenAt)).getTime();
  if (!Number.isFinite(seenMs)) return null;
  const effectivePersistent = input.persistent && input.policy.persistentSessionEnabled;
  const absoluteMinutes = effectivePersistent
    ? input.policy.absoluteSessionMinutes
    : Math.min(input.policy.absoluteSessionMinutes, input.policy.idleTimeoutMinutes);
  const absoluteAt = input.issuedAtSec * 1000 + absoluteMinutes * 60_000;
  const idleAt = seenMs + input.policy.idleTimeoutMinutes * 60_000;
  return new Date(Math.min(absoluteAt, idleAt)).toISOString();
}

/**
 * Pure session verdict. Standard sign-in (no Remember Me) is bound by the
 * inactivity window in absolute terms too; Remember Me extends to the
 * configured maximum lifetime. A null lastSeen means the account predates the
 * policy regime — grandfathered active once; the caller stamps last_seen_at
 * on that request so enforcement starts from there.
 */
export function evaluateSessionExpiry(input: {
  issuedAtSec: number | null | undefined;
  lastSeenAt: string | null | undefined;
  persistent: boolean;
  policy: SecurityPolicy;
  nowMs?: number;
}): SessionExpiry {
  const now = input.nowMs ?? Date.now();
  // Grandfather first: a never-stamped account predates the policy regime and
  // gets one grace request (the caller stamps last_seen_at on it), no matter
  // how old the token itself is.
  if (input.lastSeenAt == null) return "active";
  const effectivePersistent = input.persistent && input.policy.persistentSessionEnabled;
  const absoluteMinutes = effectivePersistent
    ? input.policy.absoluteSessionMinutes
    : Math.min(input.policy.absoluteSessionMinutes, input.policy.idleTimeoutMinutes);
  if (typeof input.issuedAtSec === "number" && Number.isFinite(input.issuedAtSec)) {
    if (now - input.issuedAtSec * 1000 > absoluteMinutes * 60_000) return "absolute";
  }
  const seenMs = new Date(String(input.lastSeenAt)).getTime();
  if (!Number.isFinite(seenMs)) return "active";
  if (now - seenMs > input.policy.idleTimeoutMinutes * 60_000) return "idle";
  return "active";
}

export type SessionEnforcement = "allow" | "neutralize";

/**
 * Single decision point for the session callback. A query ERROR (missing
 * column/table, unreachable DB) must fail open — it proves nothing about the
 * account — while a cleanly absent row or an expired verdict neutralizes.
 * Collapsing error and absence into one branch once locked every user out
 * when the policy migration was not yet applied.
 */
export function resolveSessionEnforcement(input: {
  queryError: boolean;
  hasRow: boolean;
  verdict: SessionExpiry;
}): SessionEnforcement {
  if (input.queryError) return "allow";
  if (!input.hasRow) return "neutralize";
  return input.verdict === "active" ? "allow" : "neutralize";
}

let cachedPolicy: SecurityPolicy | null = null;
let cachedAt = 0;

export function resetSecurityPolicyCache() {
  cachedPolicy = null;
  cachedAt = 0;
}

export async function getSecurityPolicy(): Promise<SecurityPolicy> {
  if (cachedPolicy && Date.now() - cachedAt < SECURITY_POLICY_CACHE_MS) return cachedPolicy;
  if (!supabase) return DEFAULT_SECURITY_POLICY;
  try {
    const { data, error } = await supabase
      .from("security_policies")
      .select("persistent_session_enabled,idle_timeout_minutes,absolute_session_minutes,login_otp_enabled,otp_ttl_seconds,otp_resend_cooldown_seconds,otp_max_attempts,version,updated_by,updated_at")
      .eq("key", "default")
      .maybeSingle();
    if (error || !data) return cachedPolicy ?? DEFAULT_SECURITY_POLICY;
    cachedPolicy = securityPolicyFromRow(data);
    cachedAt = Date.now();
    return cachedPolicy;
  } catch {
    return cachedPolicy ?? DEFAULT_SECURITY_POLICY;
  }
}

/**
 * Stamp last_seen_at: always when never stamped (grandfathering), otherwise
 * throttled to one write per minute. Never throws — activity bookkeeping
 * must not fail authentication.
 */
export async function touchSecuritySeen(userId: string, lastSeenAt: string | null): Promise<string | null> {
  if (!supabase || !userId) return lastSeenAt;
  try {
    if (lastSeenAt != null) {
      const seenMs = new Date(String(lastSeenAt)).getTime();
      if (Number.isFinite(seenMs) && Date.now() - seenMs < SECURITY_TOUCH_THROTTLE_MS) return lastSeenAt;
    }
    const stamped = new Date().toISOString();
    const { data, error } = await supabase.from("user_accounts").update({ last_seen_at: stamped }).eq("id", userId).select("last_seen_at").maybeSingle();
    return !error && typeof data?.last_seen_at === "string" ? data.last_seen_at : lastSeenAt;
  } catch {
    // Activity bookkeeping is best-effort by design.
    return lastSeenAt;
  }
}
