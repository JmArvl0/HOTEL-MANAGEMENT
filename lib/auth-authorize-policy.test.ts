// Authorize-boundary regression test for the OTP-policy lockout.
//
// Real bug: when login_otp_enabled=false, authorize() returned the full
// session object but never refreshed user_accounts.last_seen_at, so the
// session callback neutralized every fresh password-only session as idle.
// The OTP path never hit this because the verify route stamps last_seen_at
// before minting its cookie. Drives the real authorize() with a stubbed
// Supabase client (no network, no source-string assertions).
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userRow: {
    id: "u-1", email: "ada@example.com", name: "Ada", role: "admin",
    password_hash: "$2b$12$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    active: true, auth_version: 3, recovery_required: false,
  } as Record<string, unknown> | null,
  policyRow: {
    persistent_session_enabled: false, idle_timeout_minutes: 30,
    absolute_session_minutes: 480, login_otp_enabled: false,
    otp_ttl_seconds: 300, otp_resend_cooldown_seconds: 60,
    otp_max_attempts: 5, version: 1, updated_by: null,
    updated_at: new Date().toISOString(),
  } as Record<string, unknown> | null,
  policyError: null as { code: string; message: string } | null,
  updates: [] as { table: string; patch: Record<string, unknown> }[],
}));

function table(name: string) {
  // Minimal thenable query-builder stub covering exactly the chains
  // authorize() uses: select/eq/maybeSingle reads, update/eq writes, and
  // the audit count probe.
  const chain: Record<string, unknown> = {
    _table: name,
    _op: null as null | "select" | "update",
    _patch: null as Record<string, unknown> | null,
  };
  chain.select = () => { chain._op = "select"; return chain; };
  chain.eq = () => chain;
  chain.gte = () => chain;
  chain.update = (patch: Record<string, unknown>) => {
    chain._op = "update";
    chain._patch = patch;
    state.updates.push({ table: name, patch });
    return chain;
  };
  chain.maybeSingle = async () => {
    if (name === "user_accounts" && chain._op === "select") return { data: state.userRow, error: null };
    if (name === "security_policies") {
      if (state.policyError) return { data: null, error: state.policyError };
      return { data: state.policyRow, error: null };
    }
    return { data: null, error: null };
  };
  chain.then = (resolve: (value: unknown) => unknown) => {
    // loginFailuresRecent awaits the chain directly and reads { count }.
    if (name === "audit_logs") return Promise.resolve({ data: null, error: null, count: 0 }).then(resolve);
    return Promise.resolve({ data: null, error: null }).then(resolve);
  };
  return chain;
}

vi.mock("@/lib/supabase", () => ({
  supabase: { from: (name: string) => table(name), rpc: vi.fn(async () => ({ data: null, error: null })) },
}));
vi.mock("bcryptjs", () => ({ default: { compare: async () => true } }));

const { authOptions } = await import("./auth");

type Credentials = { email: string; password: string; remember?: string };
// NOTE: next-auth's Credentials() factory nests our config under `options`
// and only merges it onto the provider at runtime (parseProviders). The raw
// `providers[0].authorize` is the factory's `() => null` stub, so tests must
// drive `options.authorize` — the exact function the callback route invokes
// after the merge.
const authorize = (
  authOptions.providers[0] as unknown as {
    options: { authorize: (c: Credentials) => Promise<unknown> };
  }
).options.authorize;
const creds = { email: "ada@example.com", password: "correct horse" };

beforeEach(() => {
  state.updates.length = 0;
  state.policyError = null;
  state.policyRow = {
    persistent_session_enabled: false, idle_timeout_minutes: 30,
    absolute_session_minutes: 480, login_otp_enabled: false,
    otp_ttl_seconds: 300, otp_resend_cooldown_seconds: 60,
    otp_max_attempts: 5, version: 1, updated_by: null,
    updated_at: new Date().toISOString(),
  };
});

describe("authorize() with OTP disabled", () => {
  it("returns the full-session contract and refreshes last_seen_at", async () => {
    const result = (await authorize(creds)) as Record<string, unknown>;
    expect(result).toMatchObject({ id: "u-1", email: "ada@example.com", name: "Ada", role: "admin", authVersion: 3 });
    expect(result.otpPending).not.toBe(true);
    const stamp = state.updates.find((u) => u.table === "user_accounts");
    expect(stamp).toBeTruthy();
    expect(typeof stamp?.patch.last_seen_at).toBe("string");
  });
});

describe("authorize() with OTP enabled", () => {
  it("mints no full session before verification and leaves stamping to verify", async () => {
    state.policyRow = { ...state.policyRow, login_otp_enabled: true } as Record<string, unknown>;
    const result = (await authorize(creds)) as Record<string, unknown> | null;
    // Test env has no SMTP/HMAC configured, so issuance fails closed here;
    // either way no fully authenticated session may exist pre-verification.
    if (result !== null) expect(result.otpPending).toBe(true);
    expect(result === null || (result as Record<string, unknown>).id === "").toBe(true);
    expect(state.updates.filter((u) => u.table === "user_accounts")).toHaveLength(0);
  });
});

describe("authorize() when the policy cannot be read", () => {
  it("fails closed on a missing row", async () => {
    state.policyRow = null;
    await expect(authorize(creds)).resolves.toBeNull();
  });
  it("fails closed on a query error", async () => {
    state.policyError = { code: "42P01", message: "relation does not exist" };
    await expect(authorize(creds)).resolves.toBeNull();
  });
});
