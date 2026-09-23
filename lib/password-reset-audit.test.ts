import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { sniffProofKind } from "@/lib/payment-proof";
import { buildPasswordResetOtpEmail, buildRecoveryLinkEmail, maskEmail } from "@/lib/otp-email";

const migration = readFileSync("supabase/migrations/20261022010000_password_reset_audit.sql", "utf8");
const recoverRoute = readFileSync("app/api/recover/[token]/route.ts", "utf8");
const selfieRoute = readFileSync("app/api/recover/[token]/selfie/route.ts", "utf8");
const requestRoute = readFileSync("app/api/password-reset/request/route.ts", "utf8");
const verifyRoute = readFileSync("app/api/password-reset/verify/route.ts", "utf8");
const adminSelfieRoute = readFileSync("app/api/admin/password-resets/[id]/selfie/route.ts", "utf8");
const adminDataRoute = readFileSync("app/api/admin/data/route.ts", "utf8");

describe("password reset audit migration", () => {
  it("creates the reset-attempt ledger with the required columns", () => {
    for (const column of ["user_id", "token_id", "challenge_id", "email", "ip_address", "user_agent", "otp_verified", "selfie_url", "status", "completed_at"])
      expect(migration).toContain(column);
    expect(migration).toContain("create table if not exists public.password_reset_logs");
  });
  it("constrains status to the lifecycle values", () =>
    expect(migration).toContain("check (status in ('requested', 'otp_verified', 'completed', 'failed'))"));
  it("creates a private recovery-selfies bucket with image limits", () => {
    expect(migration).toContain("'recovery-selfies'");
    expect(migration).toContain("5242880");
    expect(migration).toContain("image/webp");
  });
  it("locks the ledger to the service role behind RLS", () => {
    expect(migration).toContain("alter table public.password_reset_logs enable row level security");
    expect(migration).toContain("grant all on table public.password_reset_logs to service_role");
  });
  it("replaces complete_account_recovery with the selfie-gated overload", () => {
    expect(migration).toContain("complete_account_recovery(\n  p_token_hash text,\n  p_password_hash text,\n  p_selfie_path text)");
    expect(migration).toContain("SELFIE_REQUIRED");
    expect(migration).toContain("drop function if exists public.complete_account_recovery(text, text)");
  });
  it("validates the staged selfie path shape inside the database", () =>
    expect(migration).toContain("recovery-selfies/"));
  it("marks the reset log completed from the recovery transaction", () =>
    expect(migration).toContain("update public.password_reset_logs set status = 'completed'"));
  it("shares the OTP challenge table under a reset purpose", () =>
    expect(migration).toContain("'password_reset'"));
});

describe("selfie-gated recovery routes", () => {
  it("refuses completion without a staged selfie path", () => {
    expect(recoverRoute).toContain("selfiePath");
    expect(recoverRoute).toContain("SELFIE_REQUIRED");
    expect(recoverRoute).toContain("p_selfie_path");
  });
  it("re-reads and re-sniffs the staged selfie before the RPC", () => {
    expect(recoverRoute).toContain('storage.from("recovery-selfies").download');
    expect(recoverRoute).toContain("sniffProofKind(bytes)");
  });
  it("marks the attempt failed when the link is invalid", () =>
    expect(recoverRoute).toContain('update({ status: "failed" })'));
  it("stages selfies only for a live unused token", () => {
    expect(selfieRoute).toContain('is("used_at", null)');
    expect(selfieRoute).toContain("sniffProofKind(bytes)");
    expect(selfieRoute).toContain('const BUCKET = "recovery-selfies"');
    expect(selfieRoute).toContain(".from(BUCKET)");
  });
  it("audits admin-initiated links with the same log shape", () =>
    expect(selfieRoute).toContain('from("password_reset_logs").insert'));
});

describe("self-service reset request and verification", () => {
  it("never reveals whether an address holds an account", () => {
    expect(requestRoute).toContain("return NextResponse.json({ ok: true, masked: maskEmail(email) })");
    expect(requestRoute).not.toMatch(/account (not found|does not exist)/i);
  });
  it("rate-limits requests per email per hour", () => {
    expect(requestRoute).toContain("RESET_REQUEST_LIMIT");
    expect(requestRoute).toContain("password_reset_logs");
  });
  it("issues the code through the audited OTP challenge RPC", () => {
    expect(requestRoute).toContain('rpc("auth_otp_issue"');
    expect(requestRoute).toContain("purpose: \"password_reset\"");
    expect(requestRoute).toContain("buildPasswordResetOtpEmail");
  });
  it("rotates the pre-verification token and emails only the fresh link", () => {
    expect(verifyRoute).toContain('rpc("auth_otp_verify"');
    expect(verifyRoute).toContain("delete().eq(\"id\", row.token_id)");
    expect(verifyRoute).toContain("buildRecoveryLinkEmail");
    expect(verifyRoute).toContain("otp_verified: true");
  });
});

describe("admin reset audit surface", () => {
  it("serves reset attempts without storage paths", () => {
    expect(adminDataRoute).toContain('section==="password_resets"');
    expect(adminDataRoute).toContain("has_selfie");
    expect(adminDataRoute).toContain("password_reset_logs");
  });
  it("returns an empty list when the ledger table is not yet deployed", () => {
    expect(adminDataRoute).toContain('error.code==="42P01"');
    expect(adminDataRoute).toContain("return NextResponse.json({data:[]})");
  });
  it("inspects selfies through short-lived signed URLs only", () => {
    expect(adminSelfieRoute).toContain("guardAdmin");
    expect(adminSelfieRoute).toContain("createSignedUrl(path, 60)");
    expect(adminSelfieRoute).not.toMatch(/getPublicUrl/);
  });
});

describe("reset email content", () => {
  it("masks the mailbox", () => expect(maskEmail("ada@example.com")).toBe("a***@example.com"));
  it("builds a reset code email distinct from the login code", () => {
    const message = buildPasswordResetOtpEmail({ code: "123456", ttlMinutes: 5 });
    expect(message.subject).toContain("password-reset");
    expect(message.text).toContain("123456");
  });
  it("builds a one-time link email stating the selfie requirement", () => {
    const message = buildRecoveryLinkEmail({ link: "https://x/recover/abc" });
    expect(message.text).toContain("https://x/recover/abc");
    expect(message.text).toContain("selfie");
  });
  it("sniffs selfie bytes instead of trusting upload metadata", () => {
    expect(sniffProofKind(new Uint8Array([0xff, 0xd8, 0xff, 0x00]))).toBe("jpeg");
    expect(sniffProofKind(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });
});
