// Mandatory OTP contract: password alone never mints a session; pending
// tokens route to /verify. Source-assertion tests (no I/O).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { challengeStatus } from "./otp-flow";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("mandatory OTP", () => {
  it("authorize() has no direct-session bypass", () => {
    const src = read("lib/auth.ts");
    expect(src).not.toMatch(/if\s*\(!policy\.loginOtpEnabled\)/);
    expect(src).toMatch(/otpPending/);
  });
  it("verify/resend routes have no toggle gate", () => {
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
