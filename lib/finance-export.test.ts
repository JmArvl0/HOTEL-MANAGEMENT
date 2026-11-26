import { describe, expect, it } from "vitest";
import { buildFinanceCloseExport, renderFinanceCloseExport, type FinanceExportFormat } from "@/lib/finance-export";

const savedClose = {
  business_date: "2026-11-03",
  closed_at: "2026-11-04T06:00:00+08:00",
  snapshot: {
    date: "2026-11-03", roomAccrual: 2500.50, assessedCharges: 108.25,
    adjustments: -4.75, received: 95.10, refunds: 100.20, netReceipts: -5.10, outstanding: 2412.80,
    unreconciledInvoices: ["private-reference"], guestName: "Private fixture",
  },
};

describe("Finance closed-day download", () => {
  it("uses stable identity and integer centavos from the saved snapshot", () => {
    const batch = buildFinanceCloseExport(savedClose);
    expect(batch.id).toBe("HAVEN-CLOSE-2026-11-03-V1");
    expect(batch.closedAt).toBe("2026-11-03T22:00:00.000Z");
    expect(batch.lines.map(line => line.minor)).toEqual([250050, 10825, -475, 9510, 10020, -510, 241280]);
    expect(JSON.stringify(batch)).not.toMatch(/private-reference|Private fixture/);
  });

  it("refuses missing or inconsistent snapshots rather than issuing a report with invented totals", () => {
    expect(() => buildFinanceCloseExport({ ...savedClose, business_date: "2026-11-04" })).toThrow();
    expect(() => buildFinanceCloseExport({ ...savedClose, snapshot: { ...savedClose.snapshot, netReceipts: 0 } })).toThrow();
    expect(() => buildFinanceCloseExport({ ...savedClose, snapshot: { ...savedClose.snapshot, roomAccrual: null } })).toThrow();
  });

  it("serializes a repeatable review batch without guest data", () => {
    const batch = buildFinanceCloseExport(savedClose);
    const content = new TextDecoder().decode(renderFinanceCloseExport(batch, "json"));
    expect(renderFinanceCloseExport(buildFinanceCloseExport(savedClose), "json")).toEqual(renderFinanceCloseExport(batch, "json"));
    expect(JSON.parse(content)).toMatchObject({
      schemaVersion: 1, batchId: batch.id, businessDate: savedClose.business_date, currency: "PHP", status: "review_pending",
      measures: expect.arrayContaining([{ id: `${batch.id}:net_collections`, code: "net_collections", amountMinor: -510 }]),
    });
    expect(content).not.toMatch(/private-reference|Private fixture/);
  });

  it.each<FinanceExportFormat>(["csv", "xlsx", "pdf"])("retains the same batch and bytes on repeat %s downloads", format => {
    const batch = buildFinanceCloseExport(savedClose);
    const first = renderFinanceCloseExport(batch, format);
    expect(renderFinanceCloseExport(buildFinanceCloseExport(savedClose), format)).toEqual(first);
    const contents = new TextDecoder().decode(first);
    expect(contents).toContain(batch.id);
    expect(contents).toContain("For Finance review");
    if (format === "csv") {
      expect(contents).toContain("gross_collections,PHP,9510");
      expect(contents).toContain("refunds_paid,PHP,10020");
      expect(contents).toContain("net_collections,PHP,-510");
    } else if (format === "xlsx") {
      expect(contents).toMatch(/^PK/);
      expect(contents).toContain("<v>-5.1</v>");
    } else {
      expect(contents).toMatch(/^%PDF-1.4/);
      expect(contents).toContain("(-5.10)");
    }
  });
});
