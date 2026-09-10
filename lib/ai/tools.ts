import { Type, type FunctionDeclaration } from "@google/genai";
import { demoStore } from "@/lib/demo-store";
import { supabase } from "@/lib/supabase";
import { getAnalyticsInputs } from "@/lib/analytics/data";
import { forecastHousekeeping } from "@/lib/analytics/housekeeping";
import { forecastInventory } from "@/lib/analytics/inventory";
import { assessMaintenanceRisk } from "@/lib/analytics/maintenance";
import { forecastOccupancy } from "@/lib/analytics/occupancy";
import { shiftDate } from "@/lib/analytics/types";

/**
 * EXPLICIT READ-ONLY tools for the Ask HAVEN assistant. Each tool is a plain
 * server function returning pre-aggregated, PII-free payloads (counts,
 * statuses, room numbers — never guest names, contacts or payment data).
 * There is deliberately NO generic SQL tool: Gemini can only ask for these
 * named summaries, and HAVEN executes them with its own authorization.
 */

export interface AiTool {
  declaration: FunctionDeclaration;
  execute: () => Promise<unknown>;
}

const noParams = { type: Type.OBJECT, properties: {} };

async function roomStatusCounts() {
  if (supabase) {
    const { data } = await supabase.from("rooms").select("status,administratively_active");
    return (data ?? []).filter((room) => room.administratively_active !== false).reduce<Record<string, number>>((counts, room) => {
      counts[room.status] = (counts[room.status] ?? 0) + 1;
      return counts;
    }, {});
  }
  return demoStore.rooms.reduce<Record<string, number>>((counts, room) => {
    counts[String(room.status)] = (counts[String(room.status)] ?? 0) + 1;
    return counts;
  }, {});
}

const occupancyForecast = async () => {
  const inputs = await getAnalyticsInputs();
  return forecastOccupancy({ reservations: inputs.reservations, rooms: inputs.rooms, today: inputs.today });
};

const housekeepingForecast = async () => {
  const inputs = await getAnalyticsInputs();
  return forecastHousekeeping({ reservations: inputs.reservations, tasks: inputs.tasks, today: inputs.today, inspectionRequired: inputs.inspectionRequired });
};

const inventoryRisk = async () => {
  const inputs = await getAnalyticsInputs();
  return forecastInventory({ items: inputs.inventoryItems, movements: inputs.movements, today: inputs.today });
};

const maintenanceRisk = async () => {
  const inputs = await getAnalyticsInputs();
  return assessMaintenanceRisk({ orders: inputs.orders, today: inputs.today });
};

async function arrivalsDepartures(kind: "arrivals" | "departures") {
  const inputs = await getAnalyticsInputs();
  const today = inputs.today;
  const tomorrow = shiftDate(today, 1);
  const dateField = kind === "arrivals" ? "check_in" : "check_out";
  const rows = inputs.reservations.filter((reservation) =>
    ["confirmed", "checked_in"].includes(reservation.status)
    && (reservation[dateField] === today || reservation[dateField] === tomorrow)
  );
  const byDate: Record<string, number> = {};
  const byRoomType: Record<string, number> = {};
  for (const row of rows) {
    byDate[row[dateField]] = (byDate[row[dateField]] ?? 0) + 1;
    const type = row.room_type ?? "unspecified";
    byRoomType[type] = (byRoomType[type] ?? 0) + 1;
  }
  return { today, tomorrow, totalTodayAndTomorrow: rows.length, byDate, byRoomType };
}

export async function guestRequestSummary() {
  if (supabase) {
    const { data } = await supabase.from("guest_requests").select("department,status,escalation_status").in("status", ["open", "in_progress", "pending_approval"]);
    const rows = data ?? [];
    return {
      open: rows.length,
      byDepartment: rows.reduce<Record<string, number>>((counts, row) => { counts[row.department] = (counts[row.department] ?? 0) + 1; return counts; }, {}),
      escalated: rows.filter((row) => row.escalation_status === "escalated").length
    };
  }
  return { open: 0, byDepartment: {}, escalated: 0 };
}

export async function transportationSummary() {
  if (supabase) {
    const { data } = await supabase.from("transportation_requests").select("service_type,status").eq("status", "REQUESTED");
    const rows = data ?? [];
    return {
      pending: rows.length,
      byServiceType: rows.reduce<Record<string, number>>((counts, row) => { counts[row.service_type] = (counts[row.service_type] ?? 0) + 1; return counts; }, {})
    };
  }
  return { pending: 0, byServiceType: {} };
}

async function operationalSummary() {
  const [inputs, roomCounts] = await Promise.all([getAnalyticsInputs(), roomStatusCounts()]);
  const today = inputs.today;
  const arrivalsToday = inputs.reservations.filter((r) => r.check_in === today && ["confirmed", "checked_in"].includes(r.status)).length;
  const departuresToday = inputs.reservations.filter((r) => r.check_out === today && ["confirmed", "checked_in"].includes(r.status)).length;
  const occupiedNow = roomCounts.occupied ?? 0;
  const openMaintenance = inputs.orders.filter((order) => !["resolved", "cancelled"].includes(order.status)).length;
  return { today, roomCounts, occupiedNow, arrivalsToday, departuresToday, openMaintenance };
}

export const AI_TOOLS: Record<string, AiTool> = {
  getOperationalSummary: {
    declaration: { name: "getOperationalSummary", description: "Current hotel operational snapshot: room status counts, arrivals and departures today, open maintenance orders.", parameters: noParams },
    execute: operationalSummary
  },
  getOccupancyForecast: {
    declaration: { name: "getOccupancyForecast", description: "HAVEN's 7-day occupancy forecast: known booked occupancy per night and, where history supports it, predicted final occupancy with data quality.", parameters: noParams },
    execute: occupancyForecast
  },
  getArrivalsSummary: {
    declaration: { name: "getArrivalsSummary", description: "Expected arrivals for today and tomorrow, aggregated by date and room type. No guest names.", parameters: noParams },
    execute: () => arrivalsDepartures("arrivals")
  },
  getDeparturesSummary: {
    declaration: { name: "getDeparturesSummary", description: "Expected departures for today and tomorrow, aggregated by date and room type. No guest names.", parameters: noParams },
    execute: () => arrivalsDepartures("departures")
  },
  getHousekeepingForecast: {
    declaration: { name: "getHousekeepingForecast", description: "HAVEN's housekeeping workload forecast: expected checkout cleans, stayover services, inspections and workload level per day.", parameters: noParams },
    execute: housekeepingForecast
  },
  getInventoryRiskSummary: {
    declaration: { name: "getInventoryRiskSummary", description: "Inventory shortage forecast per item: current stock, predicted 3-day consumption, projected shortage and risk. Items without consumption history are marked as such.", parameters: noParams },
    execute: inventoryRisk
  },
  getMaintenanceRiskSummary: {
    declaration: { name: "getMaintenanceRiskSummary", description: "Recurring maintenance risk insights: rooms with repeated work orders grouped by category, with incident counts and risk levels.", parameters: noParams },
    execute: maintenanceRisk
  },
  getGuestRequestSummary: {
    declaration: { name: "getGuestRequestSummary", description: "Open guest requests aggregated by department and escalation status. No guest names.", parameters: noParams },
    execute: guestRequestSummary
  },
  getTransportationSummary: {
    declaration: { name: "getTransportationSummary", description: "Pending transportation requests aggregated by service type.", parameters: noParams },
    execute: transportationSummary
  }
};

export const aiToolDeclarations = (): FunctionDeclaration[] => Object.values(AI_TOOLS).map((tool) => tool.declaration);

export async function executeAiTool(name: string): Promise<unknown> {
  const tool = AI_TOOLS[name];
  if (!tool) throw new Error(`Unknown AI tool: ${name}`);
  return tool.execute();
}
