// Roadmap Phase 8 — preventive maintenance foundation.
//
// A registry of REAL assets the hotel registers itself (no seeded/fake
// equipment). The due schedule is derived in the database: next_service_date =
// last_serviced_at + service_interval_days (stored generated column), so it
// can never drift from the recorded services.
//
// Hard rule: a due or overdue service is VISIBILITY ONLY. Nothing in this
// module (or the routes that use it) touches a room's status or
// serviceability — blocking a room stays owned by the work-order diagnosis
// workflow. The predictive model may suggest risk; it never blocks a room.

export interface MaintenanceAsset {
  id: string;
  name: string;
  category: string;
  room_id: string | null;
  room_number: string | null;
  location: string | null;
  last_serviced_at: string | null;
  service_interval_days: number;
  next_service_date: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
}

export type AssetDueWindow = "overdue" | "due_7" | "due_30" | "scheduled" | "unscheduled";

/** Days from `today` to `date` (both YYYY-MM-DD; negative = overdue). */
export function daysUntil(today: string, date: string): number {
  return Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
}

/** Which due-window card group an asset belongs to. Pure, date-driven facts. */
export function assetDueWindow(asset: Pick<MaintenanceAsset, "next_service_date">, today: string): AssetDueWindow {
  if (!asset.next_service_date) return "unscheduled";
  const days = daysUntil(today, asset.next_service_date);
  if (days < 0) return "overdue";
  if (days <= 7) return "due_7";
  if (days <= 30) return "due_30";
  return "scheduled";
}

export const ASSET_DUE_WINDOWS: { key: AssetDueWindow; label: string; hint: string }[] = [
  { key: "overdue", label: "Service overdue", hint: "Past the derived due date" },
  { key: "due_7", label: "Due within 7 days", hint: "Plan this week" },
  { key: "due_30", label: "Due within 30 days", hint: "Plan this month" },
  { key: "scheduled", label: "Scheduled", hint: "Due after 30 days" },
  { key: "unscheduled", label: "No service history yet", hint: "Record the first service to start the schedule" }
];
