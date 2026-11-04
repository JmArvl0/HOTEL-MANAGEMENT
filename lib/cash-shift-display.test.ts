import { describe, expect, it } from "vitest";
import { cashDifference, cashDuration, cashMoney, cashNumber, canCloseDrawer, filterCashHistory, selectCashShifts, shiftCashBasis } from "./cash-shift-display";

const shift = { id: "active", status: "open", staff_user_id: "opener", opening_amount: "10000", collected: "24920", expected_cash: null, actual_cash: null, variance: null };
const payments = [
  { cash_shift_id: "active", status: "paid", amount: "28420", purpose: "stay_payment" },
  { cash_shift_id: "active", status: "paid", amount: "3500", purpose: "refund" },
  { cash_shift_id: "active", status: "pending_verification", amount: "700", purpose: "stay_payment" },
  { cash_shift_id: null, status: "paid", amount: "9999", purpose: "stay_payment" },
];
describe("cash drawer financial presentation", () => {
  it("splits refunds without subtracting them twice from net collected", () => {
    expect(shiftCashBasis(shift, payments)).toMatchObject({ expected: 34920, incoming: 28420, outgoing: 3500, agrees: true });
  });
  it("preserves recorded closed truth and flags an inconsistent breakdown", () => {
    expect(shiftCashBasis({ ...shift, status: "reconciled", expected_cash: 32000 }, payments)).toMatchObject({ expected: 32000, agrees: false });
    expect(cashDifference(-70)).toMatchObject({ label: "Short by", amount: 70 });
  });
  it("does not turn a missing physical count or missing expected amount into zero", () => {
    for (const value of [null, undefined, "", " ", NaN, Infinity]) { expect(cashNumber(value)).toBeNull(); expect(cashMoney(value)).toBe("—"); }
    expect(cashDifference(null).label).toBe("Difference unavailable");
    expect(cashMoney(0)).toContain("0.00");
    expect(shiftCashBasis({ ...shift, collected: null }, payments).expected).toBeNull();
  });
  it("uses centavos and excludes unrelated/unsettled transactions", () => {
    expect(shiftCashBasis({ ...shift, opening_amount: 0.1, collected: 0.2 }, [{ cash_shift_id: "active", status: "paid", amount: 0.3, purpose: "stay_payment" }, { cash_shift_id: "active", status: "paid", amount: 0.1, purpose: "refund" }])).toMatchObject({ expected: 0.3, agrees: true });
  });
  it("does not imply a complete breakdown when a payment amount is invalid", () => expect(shiftCashBasis(shift, [{ ...payments[0], amount: null }])).toMatchObject({ incoming: null, outgoing: null, agrees: false }));
  it("keeps active drawer selection separate from filtered history", () => {
    const rows = [{ ...shift, id: "older", status: "closed", opened_at: "2026-11-03T07:00:00+08:00" }, { ...shift, opened_at: "2026-11-04T07:00:00+08:00" }];
    expect(filterCashHistory(rows, "older", "closed")).toHaveLength(1);
    expect(selectCashShifts(rows).active?.id).toBe("active");
  });
  it("limits closure to the opener or Accounting without expanding role authority", () => {
    expect(canCloseDrawer(shift, "opener", "front_desk")).toBe(true);
    expect(canCloseDrawer(shift, "other", "front_desk")).toBe(false);
    expect(canCloseDrawer(shift, "other", "accounting")).toBe(true);
    expect(canCloseDrawer(shift, "opener", "manager")).toBe(false);
    expect(canCloseDrawer({ ...shift, status: "closed" }, "opener", "accounting")).toBe(false);
  });
  it("uses closure time for historical durations and rejects invalid timestamps", () => {
    expect(cashDuration({ opened_at: "2026-11-04T07:00:00+08:00", closed_at: "2026-11-04T10:30:00+08:00", status: "closed" }, 0)).toBe("Duration 3h 30m");
    expect(cashDuration({ ...shift, opened_at: null }, 0)).toBe("Duration unavailable");
  });
});
