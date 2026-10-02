import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { financialPaymentState } from "@/lib/customer";

const read = (path: string) => readFileSync(path, "utf8");

// FIX-001 — cancelled reservation must never bucket as "Awaiting
// Verification", even when a stale pending_verification deposit row still
// exists (cancelled before the 20261024080000 expiry + the 20261024100000
// backfill). Paid-deposit refund rows still bucket as refunds.
const folio = (overrides: Partial<Parameters<typeof financialPaymentState>[0]>) => ({
  total: 19140, deposit: 0,
  invoice: { amount: 19140, paid: 0, balance: 0, status: "cancelled" },
  status: "cancelled", check_in: "2026-10-02", check_out: "2026-10-04",
  payments: [] as { status: string }[], refunds: [] as unknown[],
  ...overrides,
});

describe("cancelled folio never shows Awaiting Verification", () => {
  it("settles a cancelled stay with a stale pending deposit row (the ₱19,140 case)", () => {
    expect(financialPaymentState(folio({ payments: [{ status: "pending_verification" }] }))).toBe("settled");
  });

  it("keeps a cancelled stay with an eligible refund in the refund bucket", () => {
    expect(financialPaymentState(folio({ payments: [{ status: "pending_verification" }], refunds: [{ id: "rr-1" }] }))).toBe("refund");
  });

  it("still buckets a live pending deposit as awaiting verification (no over-correction)", () => {
    expect(financialPaymentState(folio({
      status: "confirmed", invoice: { amount: 19140, paid: 0, balance: 19140, status: "unpaid" },
      payments: [{ status: "pending_verification" }],
    }))).toBe("pending");
  });

  it("still buckets a live balance due (no over-correction)", () => {
    expect(financialPaymentState(folio({
      status: "confirmed", invoice: { amount: 19140, paid: 0, balance: 19140, status: "unpaid" },
    }))).toBe("due");
  });

  it("backfill migration voids stale pendings and stamps failed only on no-refund cancels", () => {
    const sql = read("supabase/migrations/20261024100000_cancel_backfill_stale_pending.sql");
    expect(sql).toContain("status = 'expired'");
    expect(sql).toContain("status in ('cancelled', 'no_show')");
    expect(sql).toContain("purpose = 'reservation_deposit'");
    expect(sql).toContain("payment_status = 'failed'");
    // Paid rows untouched; eligible refunds left for process_refund.
    expect(sql).not.toMatch(/status\s*=\s*'paid'[^;]*status\s*=\s*'(expired|failed)'/);
    expect(sql).toContain("refund_requests");
  });

  it("profile PATCH no longer uses maybeSingle on guest lookups (duplicate-row 500)", () => {
    const route = read("app/api/account/profile/route.ts");
    expect(route).not.toContain("maybeSingle");
    expect(route).toContain('order("created_at"');
  });
});
