import { analyticsDay, shiftDate, type DataQuality, type MaintenanceOrderLike, type RiskLevel } from "./types";

/**
 * MAINTENANCE RISK INSIGHTS — recurring-issue detection over real work-order
 * history, grouped by (room, category) over the trailing 90 days. This is a
 * risk classification, NOT a failure probability: we never claim "the AC will
 * fail tomorrow", only that the pattern of repeat incidents justifies
 * preventive attention.
 */

export const MAINTENANCE_MODEL_VERSION = "maintenance-risk-v2";
const WINDOW_DAYS = 90;
const RECENT_WINDOW_DAYS = 30;

export interface MaintenanceRisk {
  roomId: string;
  roomNumber: string;
  category: string;
  assetId?: string;
  assetName?: string;
  incidents90Days: number;
  openIncidents: number;
  daysSinceLast: number | null;
  trend: "increasing" | "steady" | "isolated";
  risk: RiskLevel;
  reason: string;
  suggestedAction: string;
  dataQuality: DataQuality;
}

export const maintenanceRiskKey = (issue: MaintenanceRisk) => issue.assetId ?? `${issue.roomId}:${issue.category}`;

export interface MaintenanceRiskReport {
  today: string;
  risks: MaintenanceRisk[];
  elevatedCount: number;
  method: string;
  notes: string[];
  history?: { date: string; count: number }[];
}

export type MaintenanceAsset = { id: string; room_id: string | null; name: string; category: string; last_serviced_at: string | null };

export interface MaintenanceInput {
  assets?: MaintenanceAsset[];
  orders: MaintenanceOrderLike[];
  today: string;
}

const daysAgo = (today: string, timestamp: string): number => {
  const day = analyticsDay(timestamp);
  return (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000;
};

export function assessMaintenanceRisk(input: MaintenanceInput): MaintenanceRiskReport {
  const inWindow = input.orders.filter(order => {
    const age = daysAgo(input.today, order.created_at);
    return order.room_id && order.status !== "cancelled" && age >= 0 && age < WINDOW_DAYS;
  });
  const dailyIncidents = new Map<string, number>();

  const groups = new Map<string, { asset?: MaintenanceAsset; orders: MaintenanceOrderLike[] }>();
  for (const order of inWindow) {
    const category = (order.category || order.target_label || "general").trim() || "general";
    const matches = order.target_type === "equipment" && order.target_label
      ? (input.assets ?? []).filter(asset => asset.room_id === order.room_id
        && asset.name.trim().toLowerCase() === order.target_label!.trim().toLowerCase()) : [];
    const asset = matches.length === 1 ? matches[0] : undefined;
    const key = JSON.stringify([order.room_id, asset?.id ?? null, asset ? null : category.toLowerCase()]);
    const group = groups.get(key) ?? { asset, orders: [] };
    group.orders.push(order);
    groups.set(key, group);
  }

  const risks: MaintenanceRisk[] = [];
  for (const { asset, orders } of groups.values()) {
    const roomId = orders[0].room_id!;
    const category = (orders[0].category || orders[0].target_label || "general").trim() || "general";
    const sorted = [...orders].sort((a, b) => a.created_at.localeCompare(b.created_at));
    const incidents90Days = orders.length;
    if (incidents90Days < 2) continue; // single incidents are normal operations, not a pattern
    for (const order of orders) {
      const date = analyticsDay(order.created_at);
      dailyIncidents.set(date, (dailyIncidents.get(date) ?? 0) + 1);
    }

    const openIncidents = orders.filter((order) => !["resolved", "cancelled"].includes(order.status)).length;
    const last = sorted[sorted.length - 1];
    const daysSinceLast = daysAgo(input.today, last.created_at);
    const recentCount = orders.filter(order => {
      const age = daysAgo(input.today, order.created_at);
      return age > 0 && age <= RECENT_WINDOW_DAYS;
    }).length;
    const earlierCount = orders.filter(order => {
      const age = daysAgo(input.today, order.created_at);
      return age > RECENT_WINDOW_DAYS && age <= RECENT_WINDOW_DAYS * 2;
    }).length;
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
      assetId: asset?.id,
      assetName: asset?.name,
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
    history: Array.from({ length: 13 }, (_, index) => {
      const date = shiftDate(input.today, (index - 12) * 7);
      let count = 0;
      for (let offset = 0; offset < 7; offset++) count += dailyIncidents.get(shiftDate(date, -offset)) ?? 0;
      return { date, count };
    }),
    method: `Repeat work orders grouped by room and category over trailing ${WINDOW_DAYS} days; risk from incident count, frequency trend and unresolved status`,
    notes: ["Risk levels describe recurring-issue patterns, not failure probabilities. Equipment is named only when a work order matches one registered asset in the same room."]
  };
}
