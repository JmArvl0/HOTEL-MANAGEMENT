import { type DataQuality, type MaintenanceOrderLike, type RiskLevel } from "./types";

/**
 * MAINTENANCE RISK INSIGHTS — recurring-issue detection over real work-order
 * history, grouped by (room, category) over the trailing 90 days. This is a
 * risk classification, NOT a failure probability: we never claim "the AC will
 * fail tomorrow", only that the pattern of repeat incidents justifies
 * preventive attention.
 */

export const MAINTENANCE_MODEL_VERSION = "maintenance-risk-v1";
const WINDOW_DAYS = 90;
const RECENT_WINDOW_DAYS = 30;

export interface MaintenanceRisk {
  roomId: string;
  roomNumber: string;
  category: string;
  incidents90Days: number;
  openIncidents: number;
  daysSinceLast: number | null;
  trend: "increasing" | "steady" | "isolated";
  risk: RiskLevel;
  reason: string;
  suggestedAction: string;
  dataQuality: DataQuality;
}

export interface MaintenanceRiskReport {
  today: string;
  risks: MaintenanceRisk[];
  elevatedCount: number;
  method: string;
  notes: string[];
}

export interface MaintenanceInput {
  orders: MaintenanceOrderLike[];
  today: string;
}

const daysAgo = (today: string, timestamp: string): number => {
  const value = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(timestamp)) / 86_400_000);
  return Number.isFinite(value) ? value : 0;
};

export function assessMaintenanceRisk(input: MaintenanceInput): MaintenanceRiskReport {
  const inWindow = input.orders.filter((order) => order.room_id && daysAgo(input.today, order.created_at) >= -1 && daysAgo(input.today, order.created_at) <= WINDOW_DAYS);

  const groups = new Map<string, MaintenanceOrderLike[]>();
  for (const order of inWindow) {
    const category = (order.category || order.target_label || "general").trim() || "general";
    const key = `${order.room_id}::${category.toLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), order]);
  }

  const risks: MaintenanceRisk[] = [];
  for (const [key, orders] of groups) {
    const [roomId] = key.split("::");
    const category = (orders[0].category || orders[0].target_label || "general").trim() || "general";
    const sorted = [...orders].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const incidents90Days = orders.length;
    if (incidents90Days < 2) continue; // single incidents are normal operations, not a pattern

    const openIncidents = orders.filter((order) => !["resolved", "cancelled"].includes(order.status)).length;
    const last = sorted[sorted.length - 1];
    const daysSinceLast = daysAgo(input.today, last.created_at);
    const recentCount = orders.filter((order) => daysAgo(input.today, order.created_at) <= RECENT_WINDOW_DAYS).length;
    const earlierCount = incidents90Days - recentCount;
    const trend: MaintenanceRisk["trend"] = recentCount > Math.max(1, earlierCount) ? "increasing" : "steady";

    const risk: RiskLevel = incidents90Days >= 4 || (incidents90Days >= 3 && trend === "increasing")
      ? "high"
      : incidents90Days >= 3 || (incidents90Days === 2 && openIncidents > 0)
        ? "medium"
        : "low";

    const roomNumber = last.room_number || roomId;
    const reason = `Room ${roomNumber}: ${incidents90Days} ${category} work orders in ${WINDOW_DAYS} days${trend === "increasing" ? " with increasing frequency" : ""}${openIncidents > 0 ? `, ${openIncidents} still unresolved` : ""}.`;
    risks.push({
      roomId,
      roomNumber,
      category,
      incidents90Days,
      openIncidents,
      daysSinceLast,
      trend,
      risk,
      reason,
      suggestedAction: risk === "high" ? "Preventive inspection recommended." : risk === "medium" ? "Monitor during next scheduled inspection." : "",
      dataQuality: incidents90Days >= 3 ? "medium" : "limited"
    });
  }

  risks.sort((a, b) => b.incidents90Days - a.incidents90Days || b.openIncidents - a.openIncidents);
  return {
    today: input.today,
    risks,
    elevatedCount: risks.filter((item) => item.risk !== "low").length,
    method: `Repeat work orders grouped by room and category over trailing ${WINDOW_DAYS} days; risk from incident count, frequency trend and unresolved status`,
    notes: ["Risk levels describe recurring-issue patterns, not failure probabilities. No asset/equipment registry exists — analysis is room-scoped."]
  };
}
