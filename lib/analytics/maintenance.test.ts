import { describe, expect, it } from "vitest";
import { assessMaintenanceRisk } from "@/lib/analytics/maintenance";
import { shiftDate, type MaintenanceOrderLike } from "@/lib/analytics/types";

const TODAY = "2026-09-08";

const order = (over: Partial<MaintenanceOrderLike>): MaintenanceOrderLike => ({
  id: Math.random().toString(36).slice(2),
  room_id: "rm1",
  room_number: "305",
  category: "air_conditioning",
  status: "resolved",
  created_at: `${shiftDate(TODAY, -10)}T09:00:00Z`,
  ...over
});

describe("assessMaintenanceRisk", () => {
  it("ignores single incidents — one work order is normal operations, not a pattern", () => {
    const report = assessMaintenanceRisk({ orders: [order({})], today: TODAY });
    expect(report.risks).toHaveLength(0);
    expect(report.elevatedCount).toBe(0);
  });

  it("rates two resolved repeat incidents low, but medium when one is still open", () => {
    const resolved = assessMaintenanceRisk({
      orders: [order({ created_at: `${shiftDate(TODAY, -40)}T09:00:00Z` }), order({})],
      today: TODAY
    });
    expect(resolved.risks[0].risk).toBe("low");
    expect(resolved.risks[0].incidents90Days).toBe(2);
    expect(resolved.risks[0].trend).toBe("steady");

    const withOpen = assessMaintenanceRisk({
      orders: [order({ created_at: `${shiftDate(TODAY, -40)}T09:00:00Z` }), order({ status: "in_progress" })],
      today: TODAY
    });
    expect(withOpen.risks[0].risk).toBe("medium");
    expect(withOpen.risks[0].openIncidents).toBe(1);
  });

  it("rates high at four incidents, or three with an increasing recent trend", () => {
    const four = assessMaintenanceRisk({
      orders: [30, 50, 70, 85].map((back) => order({ created_at: `${shiftDate(TODAY, -back)}T09:00:00Z` })),
      today: TODAY
    });
    expect(four.risks[0].risk).toBe("high");

    const threeIncreasing = assessMaintenanceRisk({
      orders: [-60, -20, -5].map((back) => order({ created_at: `${shiftDate(TODAY, back)}T09:00:00Z` })),
      today: TODAY
    });
    expect(threeIncreasing.risks[0].trend).toBe("increasing");
    expect(threeIncreasing.risks[0].risk).toBe("high");
    expect(threeIncreasing.risks[0].reason).toContain("increasing frequency");
  });

  it("only considers work orders inside the trailing 90-day window", () => {
    const report = assessMaintenanceRisk({
      orders: [order({ created_at: `${shiftDate(TODAY, -95)}T09:00:00Z` }), order({ created_at: `${shiftDate(TODAY, -92)}T09:00:00Z` })],
      today: TODAY
    });
    expect(report.risks).toHaveLength(0); // both outside the window → no pattern
  });

  it("groups by room and category and falls back to the target label", () => {
    const orders = [
      ...[30, 50].map((back) => order({ created_at: `${shiftDate(TODAY, -back)}T09:00:00Z` })),
      ...[30, 50].map((back) => order({ category: null, target_label: "Water heater", created_at: `${shiftDate(TODAY, -back)}T09:00:00Z` })),
      ...[30, 50].map((back) => order({ room_id: "rm2", room_number: "412", created_at: `${shiftDate(TODAY, -back)}T09:00:00Z` }))
    ];
    const report = assessMaintenanceRisk({ orders, today: TODAY });
    expect(report.risks).toHaveLength(3);
    expect(report.risks.map((risk) => risk.roomId).sort()).toEqual(["rm1", "rm1", "rm2"]);
    expect(report.risks.some((risk) => risk.category === "Water heater")).toBe(true);
  });

  it("describes recurring-issue risk, never a failure probability", () => {
    const report = assessMaintenanceRisk({
      orders: [30, 50, 70, 85].map((back) => order({ created_at: `${shiftDate(TODAY, -back)}T09:00:00Z` })),
      today: TODAY
    });
    expect(report.risks[0].reason).toContain("4 air_conditioning work orders in 90 days");
    expect(report.notes[0]).toContain("not failure probabilities");
  });
});
