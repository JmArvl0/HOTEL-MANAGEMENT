import { getAnalyticsInputs } from "@/lib/analytics/data";
import { forecastHousekeeping } from "@/lib/analytics/housekeeping";
import { forecastInventory } from "@/lib/analytics/inventory";
import { assessMaintenanceRisk } from "@/lib/analytics/maintenance";
import { forecastOccupancy } from "@/lib/analytics/occupancy";

/**
 * "Explain with AI" context builder. The server rebuilds the forecast itself —
 * the client only names WHICH prediction to explain, never supplies numbers —
 * so Gemini receives HAVEN's own output and can only narrate it.
 */

export const EXPLAIN_TYPES = ["occupancy", "housekeeping", "inventory", "maintenance"] as const;
export type ExplainType = (typeof EXPLAIN_TYPES)[number];

export const isExplainType = (value: unknown): value is ExplainType =>
  typeof value === "string" && (EXPLAIN_TYPES as readonly string[]).includes(value);

export const EXPLAIN_LABELS: Record<ExplainType, string> = {
  occupancy: "7-day occupancy forecast",
  housekeeping: "housekeeping workload forecast",
  inventory: "inventory shortage forecast",
  maintenance: "recurring maintenance risk report"
};

export async function buildExplainContext(type: ExplainType): Promise<{ label: string; method: string; context: unknown }> {
  const inputs = await getAnalyticsInputs();
  const { today } = inputs;
  switch (type) {
    case "occupancy": {
      const forecast = forecastOccupancy({ reservations: inputs.reservations, rooms: inputs.rooms, today });
      return {
        label: EXPLAIN_LABELS.occupancy,
        method: forecast.method,
        context: forecast.days.map((day) => ({
          date: day.date, totalRooms: day.totalRooms, knownOccupied: day.knownOccupied, knownOccupancyPct: day.knownOccupancyPct,
          predictedOccupancyPct: day.predictedOccupancyPct ?? null, dataQuality: day.dataQuality, basisObservations: day.basisObservations
        }))
      };
    }
    case "housekeeping": {
      const forecast = forecastHousekeeping({ reservations: inputs.reservations, tasks: inputs.tasks, today, inspectionRequired: inputs.inspectionRequired });
      return {
        label: EXPLAIN_LABELS.housekeeping,
        method: forecast.method,
        context: forecast.days.map((day) => ({
          date: day.date, checkoutCleans: day.checkoutCleans, stayoverServices: day.stayoverServices, guestRequestTasks: day.guestRequestTasks,
          inspections: day.inspections, totalTasks: day.totalTasks, workload: day.workload,
          estimatedLaborHours: day.estimatedLaborHours ?? null, dataQuality: day.dataQuality, basisNote: day.basisNote
        }))
      };
    }
    case "inventory": {
      const forecast = forecastInventory({ items: inputs.inventoryItems, movements: inputs.movements, today });
      return {
        label: EXPLAIN_LABELS.inventory,
        method: forecast.method,
        context: forecast.items.map((item) => ({
          item: item.name, unit: item.unit, currentStock: item.currentStock, reorderPoint: item.reorderPoint,
          predictedConsumption: item.predictedConsumption, projectedShortage: item.projectedShortage,
          recommendedReorder: item.recommendedReorder, risk: item.risk, riskBasis: item.riskBasis,
          dataQuality: item.dataQuality, movementDays: item.movementDays
        }))
      };
    }
    case "maintenance": {
      const report = assessMaintenanceRisk({ orders: inputs.orders, today });
      return {
        label: EXPLAIN_LABELS.maintenance,
        method: report.method,
        context: report.risks.map((risk) => ({
          room: risk.roomNumber, category: risk.category, incidents90Days: risk.incidents90Days,
          openIncidents: risk.openIncidents, daysSinceLast: risk.daysSinceLast, trend: risk.trend,
          risk: risk.risk, reason: risk.reason, suggestedAction: risk.suggestedAction
        }))
      };
    }
  }
}
