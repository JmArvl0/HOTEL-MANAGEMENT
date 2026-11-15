import { isCalendarDate } from "@/lib/input-validation";
import { supabase } from "@/lib/supabase";
import type { RecordItem } from "@/lib/types";

// The Daily Front Desk Operations Report aggregates only data Front Desk is
// authorized to see (reservations, guest requests, rooms, the payments they
// collect, transportation, and their own approval requests). No refunds
// processing or Accounting reconciliation internals are included.

export type DailyReportSnapshot = {
  reportDate: string;
  generatedAt: string;
  previewVersion?: string;
  hotelTimezone?: string;
  reservations: { created: number; bySource: Record<string, number>; arrivals: number; departures: number; cancelled: number; noShow: number };
  guestRequests: { opened: number; escalated: number; openByDepartment: Record<string, number> };
  collections: { count: number; total: number; byPurpose: Record<string, number>; byMethod?: Record<string, number> };
  // Shift close-out figures were added after the first snapshots shipped, so they
  // stay optional: older submitted snapshots simply predate them.
  cashShifts?: { closed: number; counted: number; expected: number; variance: number };
  // Room-care turnover figures aggregate the authoritative housekeeping_tasks
  // rows only (§ later snapshots only; older submitted reports predate it).
  housekeeping?: { tasksCompleted: number; byType: Record<string, number>; awaitingInspection: number; avgTurnaroundMinutes: number | null };
  rooms: Record<string, number>;
  transportation: Record<string, number>;
  approvals: Record<string, number>;
};

export type DailyReportRows = {
  reservationsCreated: { source?: string | null }[];
  checkedIn: unknown[];
  checkedOut: unknown[];
  reservationAuditEvents: { action?: string | null }[];
  guestRequestsOpened: unknown[];
  guestRequestsEscalated: unknown[];
  openRequests: { department?: string | null }[];
  settledPayments: { purpose?: string | null; method?: string | null; amount?: string | number | null }[];
  cashShiftsClosed: { expected_cash?: string | number | null; actual_cash?: string | number | null; variance?: string | number | null }[];
  housekeepingCompleted: { task_type?: string | null; started_at?: string | null; completed_at?: string | null; inspection_status?: string | null; status?: string | null }[];
  rooms: { status?: string | null }[];
  transportation: { status?: string | null }[];
  approvals: { status?: string | null }[];
};

const countBy = (rows: { [key: string]: unknown }[], key: string): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[String(row[key] ?? "unknown")] = (counts[String(row[key] ?? "unknown")] ?? 0) + 1;
  return counts;
};

// Money totals per group key (e.g. settled collections by payment method), rounded to centavos.
const sumBy = (rows: { [key: string]: unknown }[], key: string, amountKey: string): Record<string, number> => {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const group = String(row[key] ?? "unknown");
    totals[group] = Math.round(((totals[group] ?? 0) + Number(row[amountKey] || 0)) * 100) / 100;
  }
  return totals;
};

// Pure aggregation so vitest can verify report generation from fixtures.
// The rooms section is a live snapshot at generation time - rooms carry no
// per-day history, so the renderer labels it "at generation".
export function summarizeDailyActivity(rows: DailyReportRows, reportDate: string): Omit<DailyReportSnapshot, "generatedAt"> {
  const cancelled = rows.reservationAuditEvents.filter((event) => event.action === "cancel_reservation").length;
  const noShow = rows.reservationAuditEvents.filter((event) => event.action === "reservation_no_show").length;
  const collections = rows.settledPayments.filter((payment) => payment.purpose !== "refund");
  const total = collections.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const shiftTotal = (key: "expected_cash" | "actual_cash" | "variance") =>
    Math.round(rows.cashShiftsClosed.reduce((sum, shift) => sum + Number(shift[key] || 0), 0) * 100) / 100;
  // Turnaround averages minutes from start to completion, rounded to whole
  // minutes, for tasks completed with a recorded start; null when none.
  const turnarounds = rows.housekeepingCompleted
    .filter((task) => task.started_at && task.completed_at)
    .map((task) => (new Date(String(task.completed_at)).getTime() - new Date(String(task.started_at)).getTime()) / 60000)
    .filter((minutes) => Number.isFinite(minutes) && minutes >= 0);
  const housekeeping = {
    tasksCompleted: rows.housekeepingCompleted.length,
    byType: countBy(rows.housekeepingCompleted, "task_type"),
    awaitingInspection: rows.housekeepingCompleted.filter((task) => task.status === "completed" && task.inspection_status === "pending").length,
    avgTurnaroundMinutes: turnarounds.length ? Math.round(turnarounds.reduce((sum, minutes) => sum + minutes, 0) / turnarounds.length) : null
  };
  return {
    reportDate,
    reservations: { created: rows.reservationsCreated.length, bySource: countBy(rows.reservationsCreated, "source"), arrivals: rows.checkedIn.length, departures: rows.checkedOut.length, cancelled, noShow },
    guestRequests: { opened: rows.guestRequestsOpened.length, escalated: rows.guestRequestsEscalated.length, openByDepartment: countBy(rows.openRequests, "department") },
    collections: { count: collections.length, total: Math.round(total * 100) / 100, byPurpose: countBy(collections, "purpose"), byMethod: sumBy(collections, "method", "amount") },
    cashShifts: { closed: rows.cashShiftsClosed.length, counted: shiftTotal("actual_cash"), expected: shiftTotal("expected_cash"), variance: shiftTotal("variance") },
    housekeeping,
    rooms: countBy(rows.rooms, "status"),
    transportation: countBy(rows.transportation, "status"),
    approvals: countBy(rows.approvals, "status")
  };
}

// A hotel day (Asia/Manila, UTC+8, no DST) expressed as a UTC window so
// PostgREST range filters match the local calendar exactly.
export const hotelDayWindow = (date: string) => {
  if (!isReportDate(date)) throw new RangeError("Invalid report date");
  const start = new Date(`${date}T00:00:00+08:00`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86400000).toISOString() };
};

export const isReportDate = isCalendarDate;

export async function buildDailyReport(date: string): Promise<DailyReportSnapshot> {
  if (!supabase || !isReportDate(date)) throw new Error("Invalid report request.");
  const { data, error } = await supabase.rpc("preview_front_desk_daily_report", { p_date: date });
  if (error || !data) throw new Error("Unable to generate the report.");
  return data as DailyReportSnapshot;
}

export const REPORT_PAGE_SIZE = 10;

export type FrontDeskReportRecord = RecordItem & {
  submitted_by_name?: string | null;
  reviewed_by_name?: string | null;
};

export async function listFrontDeskReports(page: number): Promise<{ rows: FrontDeskReportRecord[]; page: number; pageCount: number; total: number }> {
  if (!supabase) throw new Error("This service is temporarily unavailable. Please try again shortly.");
  const safePage = Math.max(0, page);
  const { data, error, count } = await supabase
    .from("front_desk_reports")
    .select("id,report_date,snapshot,submitted_by,submitted_at,status,reviewed_by,reviewed_at,review_note,supersedes,version", { count: "exact" })
    .order("submitted_at", { ascending: false })
    .range(safePage * REPORT_PAGE_SIZE, safePage * REPORT_PAGE_SIZE + REPORT_PAGE_SIZE - 1);
  if (error) throw error;
  const rows = (data ?? []) as FrontDeskReportRecord[];
  const userIds = [...new Set(rows.flatMap((row) => [String(row.submitted_by || ""), String(row.reviewed_by || "")]).filter(Boolean))];
  const { data: users } = userIds.length
    ? await supabase.from("user_accounts").select("id,name").in("id", userIds)
    : { data: [] as { id: string; name: string | null }[] };
  for (const row of rows) {
    row.submitted_by_name = users?.find((user) => user.id === row.submitted_by)?.name ?? null;
    row.reviewed_by_name = users?.find((user) => user.id === row.reviewed_by)?.name ?? null;
  }
  return { rows, page: safePage, pageCount: Math.max(1, Math.ceil((count ?? 0) / REPORT_PAGE_SIZE)), total: count ?? 0 };
}
