import { describe, expect, it } from "vitest";
import { buildFinanceCloseExport, renderFinanceCloseExport } from "@/lib/finance-export";
import { reconcileFinanceReview } from "../scripts/finance-handoff-check.mjs";

const date = "2026-11-23";
const snapshot = { date, roomAccrual: 9000, assessedCharges: 80, adjustments: -70, received: 500, refunds: 75, netReceipts: 425, outstanding: 8400 };
const batch = JSON.parse(new TextDecoder().decode(renderFinanceCloseExport(buildFinanceCloseExport({
  business_date: date, closed_at: "2026-11-24T00:00:00Z", snapshot,
}), "json")));
const acknowledgment = {
  schemaVersion: 1, property: "HAVEN", batchId: batch.batchId, currency: "PHP", acknowledgmentId: "FIN-QA-1", reviewedAtUtc: "2026-11-24T00:15:00Z",
  measures: batch.measures.map(({ id, amountMinor }: { id: string; amountMinor: number }, index: number) => ({
    id, amountMinor, status: "accepted", financeReference: `FIN-SAMPLE-${index}`,
  })),
};

describe("Finance review handoff", () => {
  it("reconciles the actual export and treats reordered delivery as an exact replay", () => {
    expect(reconcileFinanceReview(batch, acknowledgment)).toMatchObject({ status: "accepted", acceptedCount: 7, replay: false });
    expect(reconcileFinanceReview(batch, { ...acknowledgment, measures: acknowledgment.measures.toReversed() }, acknowledgment))
      .toMatchObject({ status: "accepted", acceptedCount: 7, replay: true });
  });
  it("reports rejection and refuses amount changes, duplicate IDs, or changed acknowledgments", () => {
    const [first, second, ...rest] = acknowledgment.measures;
    const rejected = { ...acknowledgment, measures: [{ id: first.id, amountMinor: first.amountMinor, status: "rejected", reasonCode: "VERIFY_ACCRUAL" }, second, ...rest] };
    expect(reconcileFinanceReview(batch, rejected)).toMatchObject({ status: "requires_review", acceptedCount: 6, rejected: [{ id: first.id, reasonCode: "VERIFY_ACCRUAL" }] });
    expect(() => reconcileFinanceReview(batch, rejected, acknowledgment)).toThrow(/correction/);
    expect(() => reconcileFinanceReview(batch, { ...acknowledgment, measures: [first, first, ...rest] })).toThrow(/once/);
    expect(() => reconcileFinanceReview(batch, { ...acknowledgment, measures: [{ ...first, amountMinor: first.amountMinor + 1 }, second, ...rest] })).toThrow(/exact amount/);
  });
});
