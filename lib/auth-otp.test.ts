// Email login OTP domain: generation, HMAC verification representation,
// masking, and message content. No I/O, no secrets — the code value appears
// here only as a test fixture, never from storage or logs.
import { describe, expect, it, vi } from "vitest";
import {
  generateOtpCode,
  otpCodeVerifier,
  otpHashSecret,
  otpIssuable,
  otpVerifierMatches,
} from "./auth-otp";
import { OTP_CODE_LENGTH, OTP_CODE_PATTERN, buildOtpEmail, buildTestEmail, maskEmail } from "./otp-email";
import { smtpConfigured, smtpSender } from "./otp-transport";

describe("OTP code generation", () => {
  it("produces zero-padded six-digit codes", () => {
    expect(generateOtpCode(() => 0)).toBe("000000");
    expect(generateOtpCode(() => 42)).toBe("000042");
    expect(generateOtpCode(() => 999999)).toBe("999999");
    expect(OTP_CODE_LENGTH).toBe(6);
  });

  it("uses the injected cryptographic RNG (never Math.random)", () => {
    const source = read("lib/auth-otp.ts");
    expect(source).toMatch(/randomInt/);
    expect(source).not.toMatch(/Math\.random/);
    const random = vi.fn(() => 123456);
    expect(generateOtpCode(random)).toBe("123456");
    expect(random).toHaveBeenCalledWith(0, 1_000_000);
  });

  it("accepts only six digits", () => {
    expect(OTP_CODE_PATTERN.test("123456")).toBe(true);
    expect(OTP_CODE_PATTERN.test("12345")).toBe(false);
    expect(OTP_CODE_PATTERN.test("1234567")).toBe(false);
    expect(OTP_CODE_PATTERN.test("abcdef")).toBe(false);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("OTP verification representation", () => {
  it("is a keyed HMAC over challenge and code — deterministic, code-specific", () => {
    vi.stubEnv("OTP_HASH_SECRET", "test-secret");
    const first = otpCodeVerifier("challenge-1", "123456");
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(otpCodeVerifier("challenge-1", "123456")).toBe(first);
    expect(otpCodeVerifier("challenge-1", "654321")).not.toBe(first);
    expect(otpCodeVerifier("challenge-2", "123456")).not.toBe(first);
    vi.unstubAllEnvs();
  });

  it("fails closed without a secret, a challenge, or a well-formed code", () => {
    vi.stubEnv("OTP_HASH_SECRET", "");
    expect(otpHashSecret()).toBeNull();
    expect(otpCodeVerifier("challenge-1", "123456")).toBeNull();
    expect(otpIssuable().ok).toBe(false);
    vi.stubEnv("OTP_HASH_SECRET", "test-secret");
    expect(otpIssuable()).toEqual({ ok: true });
    expect(otpCodeVerifier("", "123456")).toBeNull();
    expect(otpCodeVerifier("challenge-1", "abc")).toBeNull();
    vi.unstubAllEnvs();
  });

  it("compares verifiers in constant time and rejects shape mismatches", () => {
    expect(otpVerifierMatches("abc", "abc")).toBe(true);
    expect(otpVerifierMatches("abc", "abd")).toBe(false);
    expect(otpVerifierMatches("abc", "abcd")).toBe(false);
    expect(otpVerifierMatches("", "")).toBe(false);
  });
});

describe("email masking and content", () => {
  it("names the mailbox without exposing the address", () => {
    expect(maskEmail("maria@example.com")).toBe("m***@example.com");
    expect(maskEmail("not-an-email")).toBe("***");
    expect(maskEmail(null)).toBe("***");
  });

  it("brands the code email with validity, reason, and ignore-if-unrequested", () => {
    const message = buildOtpEmail({ code: "482916", ttlMinutes: 5 });
    expect(message.subject).toContain("482916");
    expect(message.html).toContain("482916");
    expect(message.html).toContain("5 minutes");
    expect(message.html).toContain("ignore");
    expect(message.text).toContain("482916");
    expect(message.text).toContain("ignore");
  });

  it("the connectivity probe carries no code and authorizes nothing", () => {
    const message = buildTestEmail();
    expect(message.subject).not.toMatch(/\d{6}/);
    expect(message.html).not.toMatch(/\d{6}/);
    expect(message.html).toMatch(/no verification code/i);
  });
});

describe("SMTP transport posture", () => {
  it("reports unconfigured without env vars and never throws", async () => {
    const { verifySmtpConnection } = await import("./otp-transport");
    expect(smtpConfigured()).toBe(false);
    expect(smtpSender()).toContain("HAVEN");
    await expect(verifySmtpConnection()).resolves.toMatchObject({ ok: false, reason: "unconfigured" });
  });

  it("stays server-only: no client bundle imports the transporter", () => {
    for (const path of [
      "components/auth/verify-form.tsx",
      "components/auth/login-form.tsx",
      "components/auth/register-form.tsx",
      "components/admin/admin-dashboard-client.tsx",
    ]) {
      expect(read(path)).not.toMatch(/otp-transport|nodemailer|SMTP_PASSWORD|OTP_HASH_SECRET/);
    }
  });
});
