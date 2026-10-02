import type { RecordItem } from "@/lib/types";

// Room-care queue grouping — the single rule behind the Housekeeping summary
// cards, the visible queue groups, and the dashboard workload metrics. One
// group per task (first match wins, so a card never appears twice);
// cancelled and stale history group to null and are never counted as open
// work. Hoisted from the queue panel so server metrics and the client queue
// cannot disagree.

export type QueueGroup =
  | "blocked"
  | "needs_attention"
  | "my_tasks"
  | "in_progress"
  | "waiting_inspection"
  | "completed_today"
  | "other_open";

const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

const openTaskStatuses = ["pending", "assigned", "deferred"];

const toDay = (value: unknown): string | null => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(date);
};

export function groupQueueTask(item: RecordItem, userId: string, today: string): QueueGroup | null {
  const status = String(item.status);
  if (status === "cancelled") return null;
  const maintenanceBlocked = item.maintenance_blocked === true;
  if (status === "completed") {
    if (String(item.inspection_status) === "pending") return "waiting_inspection";
    if (toDay(item.completed_at) === today) return "completed_today";
    return null; // older history — the room detail modal owns it
  }
  if (maintenanceBlocked && openTaskStatuses.concat("in_progress").includes(status)) return "blocked";
  if (openTaskStatuses.includes(status) && (!item.assigned_user_id || (priorityRank[String(item.priority)] ?? 3) <= 1)) return "needs_attention";
  if (userId && item.assigned_user_id === userId && [...openTaskStatuses, "in_progress"].includes(status)) return "my_tasks";
  if (status === "in_progress") return "in_progress";
  return "other_open";
}

/** Open room-care work: every group except finished-today history and the
 * ungrouped rows above. Mirrors exactly what the queue renders as actionable
 * plus its collapsed history. */
const OPEN_GROUPS: ReadonlySet<QueueGroup> = new Set([
  "blocked",
  "needs_attention",
  "my_tasks",
  "in_progress",
  "waiting_inspection",
  "other_open",
]);

export function isOpenQueueTask(item: RecordItem, userId: string, today: string): boolean {
  const group = groupQueueTask(item, userId, today);
  return group !== null && OPEN_GROUPS.has(group);
}
