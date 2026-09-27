// Policy-gated OTP contract: login OTP is mandatory only when the persisted
// security policy (security_policies.login_otp_enabled) enables it. When
// disabled, password verification mints the normal fully authenticated
// session server-side; the client never decides. Source-assertion tests
// (no I/O).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { challengeStatus } from "./otp-flow";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("policy-gated OTP", () => {
  it("authorize() branches on the authoritative server policy", () => {
    const src = read("lib/auth.ts");
    expect(src).toMatch(/loadSecurityPolicyFresh/);
    expect(src).toMatch(/policy\.loginOtpEnabled/);
  });
  it("authorize() fails closed when the policy is unreadable", () => {
    const src = read("lib/auth.ts");
    expect(src).toMatch(/if\s*\(!policy\)\s*return null/);
    // No fallback that treats a read failure as "OTP disabled".
    expect(src).not.toMatch(/DEFAULT_SECURITY_POLICY/);
  });
  it("disabled path returns the normal fully authenticated user object", () => {
    const src = read("lib/auth.ts");
    // Every field the jwt callback mints a standard session from.
    expect(src).toMatch(/authVersion:\s*data\.auth_version/);
    expect(src).toMatch(/role:\s*data\.role/);
    // The branch runs before any challenge is issued.
    expect(src.indexOf("if (!policy.loginOtpEnabled)") < src.indexOf("auth_otp_issue")).toBe(true);
  });
  it("enabled path still mandates OTP", () => {
    const src = read("lib/auth.ts");
    expect(src).toMatch(/otpPending/);
    expect(src).toMatch(/auth_otp_issue/);
    expect(src).toMatch(/sendOtpEmail/);
  });
  it("verify/resend routes stay policy-free (in-flight challenges consumable)", () => {
    expect(read("app/api/auth/otp/verify/route.ts")).not.toMatch(/loginOtpEnabled/);
    expect(read("app/api/auth/otp/resend/route.ts")).not.toMatch(/loginOtpEnabled/);
  });
  it("customer guard sends pending sessions to /verify", () => {
    const src = read("lib/customer-auth.ts");
    expect(src).toMatch(/otpPending/);
    expect(src).toMatch(/\/verify/);
  });
});

describe("challenge status guards", () => {
  const base = { id: "c", user_id: "u", expires_at: new Date(Date.now() + 60_000).toISOString(), consumed_at: null, invalidated_at: null, attempt_count: 0, resend_available_at: new Date().toISOString(), created_at: new Date().toISOString() };
  it("rejects consumed/invalidated/expired challenges", () => {
    expect(challengeStatus({ ...base, consumed_at: new Date().toISOString() })).toBe("invalid");
    expect(challengeStatus({ ...base, invalidated_at: new Date().toISOString() })).toBe("invalid");
    expect(challengeStatus({ ...base, expires_at: new Date(Date.now() - 1000).toISOString() })).toBe("expired");
    expect(challengeStatus(base)).toBe("valid");
    expect(challengeStatus(null)).toBe("invalid");
  });
});
