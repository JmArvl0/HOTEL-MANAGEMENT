import { describe, expect, it } from "vitest";
import { getBriefIndicators, type BriefInput } from "./brief";

describe("getBriefIndicators", () => {
  it("projects only authoritative values from the brief input", () => {
    const input: BriefInput = {
      date: "2026-09-14",
      operational: { occupiedRoomsNow: 18, arrivalsToday: 3, departuresToday: 2, openMaintenanceOrders: 4, highRiskSupplies: 1 },
      occupancyTomorrow: { knownPct: 50, predictedPct: 62, dataQuality: "medium", basis: "14 historical observations" },
      arrivalsTomorrow: 7,
      departuresTomorrow: 5,
      housekeepingTomorrow: { checkoutCleans: 5, stayoverServices: 4, totalTasks: 9, workload: "medium", estimatedLaborHours: 6 },
      inventoryRisks: [
        { item: "Bath towels", currentStock: 4, predictedConsumption: 8, projectedShortage: 4, risk: "high" },
        { item: "Soap", currentStock: 12, predictedConsumption: 14, projectedShortage: 2, risk: "medium" }
      ],
      inventoryWithoutHistory: 0,
      maintenanceRisks: [],
      guestRequests: { open: 6, byDepartment: { housekeeping: 4, maintenance: 2 }, escalated: 1 },
      transportation: { pending: 1 }
    };

    expect(getBriefIndicators(input)).toEqual({
      occupiedNow: 18,
      arrivalsTomorrow: 7,
      openGuestRequests: 6,
      highRiskSupplies: 1,
      openMaintenanceItems: 4
    });
  });
});
