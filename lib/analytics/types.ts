/**
 * Shared shapes for the predictive analytics engine. Inputs are plain
 * row-shaped objects so the pure forecast functions work identically against
 * Supabase results and the in-memory demo store, and are trivially testable.
 */

export type RiskLevel = "low" | "medium" | "high";
export type DataQuality = "high" | "medium" | "limited";
export type WorkloadLevel = "low" | "medium" | "high";

/** Reservations that materially cover a night: cancelled/no-show never count. */
export const NIGHT_COVERING_STATUSES = ["confirmed", "checked_in"] as const;
export const NIGHT_COVERING_PAST_STATUSES = [...NIGHT_COVERING_STATUSES, "checked_out"] as const;

export interface ReservationLike {
  id: string;
  status: string;
  check_in: string;
  check_out: string;
  created_at: string;
  room_type?: string;
  guests?: number;
}

export interface RoomLike {
  id: string;
  number: string;
  status: string;
  administratively_active?: boolean;
}

export interface TaskLike {
  id: string;
  room_id?: string | null;
  task_type?: string;
  status: string;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface MaintenanceOrderLike {
  id: string;
  room_id?: string | null;
  room_number: string;
  category?: string | null;
  target_type?: string | null;
  target_label?: string | null;
  status: string;
  priority?: string | null;
  created_at: string;
}

export interface InventoryItemLike {
  id: string;
  name: string;
  category: string;
  quantity: number | string;
  reorder_point: number | string;
  unit: string;
}

export interface InventoryMovementLike {
  id: string;
  item_id: string;
  quantity: number | string;
  direction: string;
  created_at: string;
}

/** Shift a yyyy-mm-dd string by N days (UTC arithmetic on date-only strings). */
export function shiftDate(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export const toNumber = (value: number | string | null | undefined): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const occupancyRisk = (pct: number): RiskLevel => (pct >= 85 ? "high" : pct >= 60 ? "medium" : "low");
