import { getAnalyticsInputs } from "@/lib/analytics/data";
import { forecastHousekeeping } from "@/lib/analytics/housekeeping";
import { forecastInventory } from "@/lib/analytics/inventory";
import { assessMaintenanceRisk } from "@/lib/analytics/maintenance";
import { forecastOccupancy } from "@/lib/analytics/occupancy";
import { shiftDate } from "@/lib/analytics/types";
import { guestRequestSummary, transportationSummary } from "./tools";
import type { InsightsResult } from "@/lib/analytics/runner";

/**
 * Builds the structured, PII-free input for the AI daily operations brief.
 * Every figure here was computed by HAVEN's analytics engine — Gemini's job
 * is to narrate and prioritize, never to produce numbers of its own.
 */

export interface BriefInput {
  date: string;
  operational: {
    occupiedRoomsNow: number;
    arrivalsToday: number;
    departuresToday: number;
    openMaintenanceOrders: number;
  };
  occupancyTomorrow: { knownPct: number; predictedPct: number | null; dataQuality: string; basis: string };
  arrivalsTomorrow: number;
  departuresTomorrow: number;
  housekeepingTomorrow: { checkoutCleans: number; stayoverServices: number; totalTasks: number; workload: string; estimatedLaborHours: number | null };
  inventoryRisks: { item: string; currentStock: number; predictedConsumption: number | null; projectedShortage: number | null; risk: string }[];
  inventoryWithoutHistory: number;
  maintenanceRisks: { room: string; category: string; incidents90Days: number; risk: string; reason: string }[];
  guestRequests: { open: number; byDepartment: Record<string, number>; escalated: number };
  transportation: { pending: number };
}

export async function buildBriefInput(insights?: InsightsResult): Promise<BriefInput> {
  const inputs = await getAnalyticsInputs();
  const today = inputs.today;
  const tomorrow = shiftDate(today, 1);
  const [requests, transportation] = await Promise.all([guestRequestSummary(), transportationSummary()]);

  const countOn = (field: "check_in" | "check_out", date: string) => inputs.reservations.filter(
    (reservation) => ["confirmed", "checked_in"].includes(reservation.status) && reservation[field] === date
  ).length;

  const occupancy = insights?.occupancy ?? forecastOccupancy({ reservations: inputs.reservations, rooms: inputs.rooms, today });
  const housekeeping = insights?.housekeeping ?? forecastHousekeeping({ reservations: inputs.reservations, tasks: inputs.tasks, today, inspectionRequired: inputs.inspectionRequired });
  const inventory = insights?.inventory ?? forecastInventory({ items: inputs.inventoryItems, movements: inputs.movements, today });
  const maintenance = insights?.maintenance ?? assessMaintenanceRisk({ orders: inputs.orders, today });

  const tomorrowOccupancy = occupancy.days.find((day) => day.date === tomorrow) ?? occupancy.days[1] ?? occupancy.days[0];
  const tomorrowHousekeeping = housekeeping.days.find((day) => day.date === tomorrow) ?? housekeeping.days[1] ?? housekeeping.days[0];

  return {
    date: today,
    operational: {
      occupiedRoomsNow: inputs.rooms.filter((room) => room.status === "occupied").length,
      arrivalsToday: countOn("check_in", today),
      departuresToday: countOn("check_out", today),
      openMaintenanceOrders: inputs.orders.filter((order) => !["resolved", "cancelled"].includes(order.status)).length
    },
    occupancyTomorrow: {
      knownPct: tomorrowOccupancy?.knownOccupancyPct ?? 0,
      predictedPct: tomorrowOccupancy?.predictedOccupancyPct ?? null,
      dataQuality: tomorrowOccupancy?.dataQuality ?? "limited",
      basis: `${tomorrowOccupancy?.basisObservations ?? 0} historical observations`
    },
    arrivalsTomorrow: countOn("check_in", tomorrow),
    departuresTomorrow: countOn("check_out", tomorrow),
    housekeepingTomorrow: {
      checkoutCleans: tomorrowHousekeeping?.checkoutCleans ?? 0,
      stayoverServices: tomorrowHousekeeping?.stayoverServices ?? 0,
      totalTasks: tomorrowHousekeeping?.totalTasks ?? 0,
      workload: tomorrowHousekeeping?.workload ?? "low",
      estimatedLaborHours: tomorrowHousekeeping?.estimatedLaborHours ?? null
    },
    inventoryRisks: inventory.items
      .filter((item) => item.risk !== "low")
      .slice(0, 8)
      .map((item) => ({ item: item.name, currentStock: item.currentStock, predictedConsumption: item.predictedConsumption, projectedShortage: item.projectedShortage, risk: item.risk })),
    inventoryWithoutHistory: inventory.items.filter((item) => item.predictedConsumption === null).length,
    maintenanceRisks: maintenance.risks
      .filter((risk) => risk.risk !== "low")
      .slice(0, 6)
      .map((risk) => ({ room: risk.roomNumber, category: risk.category, incidents90Days: risk.incidents90Days, risk: risk.risk, reason: risk.reason })),
    guestRequests: requests as BriefInput["guestRequests"],
    transportation: transportation as BriefInput["transportation"]
  };
}

export const formatBriefInput = (input: BriefInput): string => JSON.stringify(input, null, 2);
