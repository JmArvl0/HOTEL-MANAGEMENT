// GCash payment destination: Owner controls WHERE money goes, System
// Administration keeps read-only visibility + technical health, Accounting
// verifies. Pure-helper tests plus source-scan contracts for the RBAC,
// audit-masking, and no-secret rules.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GCASH_MOBILE_RE,
  isPaymentDestinationComplete,
  maskGcashNumber,
  normalizeGcashNumber,
  paymentDestinationSchema,
} from "./payment-destination";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("GCash number handling", () => {
  it("accepts canonical 09XXXXXXXXX numbers", () => {
    expect(GCASH_MOBILE_RE.test("09171234567")).toBe(true);
  });
  it("rejects short, long, and non-09 numbers", () => {
    expect(GCASH_MOBILE_RE.test("0917123456")).toBe(false);
    expect(GCASH_MOBILE_RE.test("091712345678")).toBe(false);
    expect(GCASH_MOBILE_RE.test("08171234567")).toBe(false);
  });
  it("normalizes spaced, dashed, and +63 numbers to canonical form", () => {
    expect(normalizeGcashNumber("0917 123 4567")).toBe("09171234567");
    expect(normalizeGcashNumber("0917-123-4567")).toBe("09171234567");
    expect(normalizeGcashNumber("+639171234567")).toBe("09171234567");
  });
  it("masks numbers for audit and admin display", () => {
    expect(maskGcashNumber("09171234567")).toBe("09******4567");
  });
  it("labels missing numbers as not configured, never blank", () => {
    expect(maskGcashNumber(null)).toBe("Not configured");
    expect(maskGcashNumber("123")).toBe("Not configured");
  });
});

describe("destination completeness", () => {
  const full = { accountName: "HAVEN Hotel & Residences", mobileNumber: "09171234567", qrStoragePath: "gcash/11111111-1111-4111-8111-111111111111.png", enabled: true };
  it("is complete when enabled with name, valid number, and QR", () => {
    expect(isPaymentDestinationComplete(full)).toBe(true);
  });
  it("is never complete while disabled", () => {
    expect(isPaymentDestinationComplete({ ...full, enabled: false })).toBe(false);
  });
  it("is incomplete when any field is missing or the number is invalid", () => {
    expect(isPaymentDestinationComplete({ ...full, accountName: "" })).toBe(false);
    expect(isPaymentDestinationComplete({ ...full, mobileNumber: "123" })).toBe(false);
    expect(isPaymentDestinationComplete({ ...full, qrStoragePath: null })).toBe(false);
  });
});

describe("Owner destination schema", () => {
  const valid = { accountName: "HAVEN Hotel & Residences", mobileNumber: "0917 123 4567", qrStoragePath: "gcash/11111111-1111-4111-8111-111111111111.png", enabled: true, reason: "New official GCash account.", version: 3 };
  it("accepts a complete enabled destination", () => {
    expect(paymentDestinationSchema.safeParse(valid).success).toBe(true);
  });
  it("requires name, number, and QR while enabled", () => {
    expect(paymentDestinationSchema.safeParse({ ...valid, accountName: "" }).success).toBe(false);
    expect(paymentDestinationSchema.safeParse({ ...valid, mobileNumber: "123" }).success).toBe(false);
    expect(paymentDestinationSchema.safeParse({ ...valid, qrStoragePath: null }).success).toBe(false);
  });
  it("rejects a QR path outside the managed gcash namespace", () => {
    expect(paymentDestinationSchema.safeParse({ ...valid, qrStoragePath: "pending/evil.png" }).success).toBe(false);
  });
  it("allows disabling without destination fields but never without a reason", () => {
    expect(paymentDestinationSchema.safeParse({ accountName: "", mobileNumber: "", qrStoragePath: null, enabled: false, reason: "Paused.", version: 3 }).success).toBe(true);
    expect(paymentDestinationSchema.safeParse({ ...valid, reason: "x" }).success).toBe(false);
  });
});

describe("migration contracts (20261006010000)", () => {
  const sql = read("supabase/migrations/20261006010000_gcash_payment_destination.sql");
  it("adds only nullable destination columns plus a default-off flag", () => {
    expect(sql).toContain("gcash_account_name text");
    expect(sql).toContain("gcash_mobile_number text");
    expect(sql).toContain("gcash_qr_storage_path text");
    expect(sql).toContain("gcash_enabled boolean not null default false");
  });
  it("creates a private QR bucket with the proof-bucket limits", () => {
    expect(sql).toContain("'payment-qr'");
    expect(sql).toContain("false");
    expect(sql).toContain("5242880");
    expect(sql).not.toMatch(/create policy/i);
  });
  it("gates the destination RPC to the Owner role with a null-safe guard", () => {
    expect(sql).toContain("actor is null or actor <> 'owner'");
    expect(sql).toContain("PAYMENT_DESTINATION_OWNER_ONLY");
  });
  it("audits destination changes with a masked number and no image contents", () => {
    expect(sql).toContain("owner_update_payment_destination");
    expect(sql).toContain("09******");
    expect(sql).not.toMatch(/qr_contents|qr_bytes|api_key|secret/i);
  });
  it("keeps the grant surface service-role only", () => {
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
  });
});

describe("RBAC contracts", () => {
  it("reserves destination writes for the Owner guard", () => {
    expect(read("app/api/owner/payment-destination/route.ts")).toContain("guardOwner()");
    expect(read("app/api/owner/payment-qr/route.ts")).toContain("guardOwner()");
    expect(read("app/api/owner/payment-destination/route.ts")).not.toContain("guardAdmin()");
    expect(read("app/api/owner/payment-qr/route.ts")).not.toContain("guardAdmin()");
  });
  it("keeps System Administration read-only with no destination mutation", () => {
    const view = read("components/admin/admin-dashboard-client.tsx");
    expect(view).toContain("PaymentHealthPanel");
    expect(view).not.toMatch(/payment-destination|payment-qr/);
    expect(read("app/api/admin/data/route.ts")).not.toContain("owner_update_payment_destination");
  });
  it("maps destination RPC failures to safe statuses", () => {
    const route = read("app/api/owner/payment-destination/route.ts");
    expect(route).toContain("403");
    expect(route).toContain("POLICY_STALE");
  });
});

describe("customer GCash-only contracts", () => {
  it("shows no bank-transfer option anywhere in the new deposit flow", () => {
    expect(read("components/booking/confirm-booking-form.tsx")).not.toMatch(/bank transfer|manual_bank_transfer|Landmark/i);
    expect(read("app/(booking)/booking/payment/[token]/page.tsx")).not.toMatch(/bank transfer|manual_bank_transfer/i);
  });
  it("reads the destination from Owner configuration, never hardcoded values", () => {
    const page = read("app/(booking)/booking/payment/[token]/page.tsx");
    expect(page).toContain("hotel_operational_policies");
    expect(page).toContain("gcash_account_name");
    expect(page).not.toMatch(/09\d{2}\s?\d{3}\s?\d{4}/);
  });
  it("blocks submissions server-side when GCash is disabled or incomplete", () => {
    const route = read("app/api/booking/holds/[token]/confirm/route.ts");
    expect(route).toContain("isPaymentDestinationComplete");
    expect(route).toContain("temporarily unavailable");
  });
  it("keeps historical and portal bank-transfer records readable", () => {
    expect(read("lib/customer.ts")).toContain('manual_bank_transfer:"Bank transfer"');
    expect(read("components/customer/payment-submission-form.tsx")).toContain("manual_bank_transfer");
    expect(read("app/api/account/reservations/[id]/payments/route.ts")).toContain("manual_bank_transfer");
  });
});

describe("no-secret contracts", () => {
  it("never renders provider secrets, keys, or tokens in any payment UI", () => {
    for (const path of [
      "components/owner/payment-settings-panel.tsx",
      "components/admin/admin-dashboard-client.tsx",
      "components/booking/confirm-booking-form.tsx",
      "app/api/admin/data/route.ts",
      "app/api/owner/data/route.ts",
    ]) {
      const source = read(path).replace(/RESEND_API_KEY/g, "");
      expect(source, path).not.toMatch(/api[_-]?key|webhook[_-]?secret|merchant[_-]?secret|private[_-]?token|NEXT_PUBLIC_.*(KEY|SECRET)/i);
    }
  });
});
