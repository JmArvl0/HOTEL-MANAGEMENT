import { HOTEL_TIME_ZONE } from "@/lib/format";
import type { RecordItem } from "@/lib/types";

// Shared scope for the room-care queue and workload metrics. Cancelled and
// older completed tasks are outside the shift queue.

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

const hotelDayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: HOTEL_TIME_ZONE });
export const housekeepingDay = (value: unknown): string | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime())
    ? null
    : hotelDayFormat.format(date);
};

export function groupQueueTask(item: RecordItem, userId: string, today: string): QueueGroup | null {
  const status = String(item.status);
  if (status === "cancelled") return null;
  const maintenanceBlocked = item.maintenance_blocked === true;
  if (status === "completed") {
    if (String(item.inspection_status) === "pending") return "waiting_inspection";
    if (housekeepingDay(item.inspected_at ?? item.completed_at) === today) return "completed_today";
    return null; // older history — the room detail modal owns it
  }
  if (maintenanceBlocked && openTaskStatuses.concat("in_progress").includes(status)) return "blocked";
  if (openTaskStatuses.includes(status) && (!item.assigned_user_id || (priorityRank[String(item.priority)] ?? 3) <= 1)) return "needs_attention";
  if (userId && item.assigned_user_id === userId && [...openTaskStatuses, "in_progress"].includes(status)) return "my_tasks";
  if (status === "in_progress") return "in_progress";
  return "other_open";
}

/** Open room-care work across all visible stages except completed history. */
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
