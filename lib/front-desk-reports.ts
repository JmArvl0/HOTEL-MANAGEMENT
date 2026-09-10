import { supabase } from "@/lib/supabase";
import type { RecordItem } from "@/lib/types";

// The Daily Front Desk Operations Report aggregates only data Front Desk is
// authorized to see (reservations, guest requests, rooms, the payments they
// collect, transportation, and their own approval requests). No refunds
// processing or Accounting reconciliation internals are included.

export type DailyReportSnapshot = {
  reportDate: string;
  generatedAt: string;
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
  const total = rows.settledPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
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
    collections: { count: rows.settledPayments.length, total: Math.round(total * 100) / 100, byPurpose: countBy(rows.settledPayments, "purpose"), byMethod: sumBy(rows.settledPayments, "method", "amount") },
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
  const start = new Date(`${date}T00:00:00+08:00`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86400000).toISOString() };
};

export const isReportDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));

export async function buildDailyReport(date: string): Promise<DailyReportSnapshot> {
  if (!supabase) throw new Error("Database unavailable.");
  const { start, end } = hotelDayWindow(date);
  const [reservationsCreated, checkedIn, checkedOut, reservationAuditEvents, guestRequestsOpened, guestRequestsEscalated, openRequests, settledPayments, cashShiftsClosed, housekeepingCompleted, rooms, transportation, approvals] = await Promise.all([
    supabase.from("reservations").select("source").gte("created_at", start).lt("created_at", end),
    supabase.from("reservations").select("id").not("checked_in_at", "is", null).gte("checked_in_at", start).lt("checked_in_at", end),
    supabase.from("reservations").select("id").not("checked_out_at", "is", null).gte("checked_out_at", start).lt("checked_out_at", end),
    supabase.from("audit_logs").select("action").eq("entity_type", "reservation").in("action", ["cancel_reservation", "reservation_no_show"]).gte("created_at", start).lt("created_at", end),
    supabase.from("guest_requests").select("id").gte("created_at", start).lt("created_at", end),
    supabase.from("guest_requests").select("id").not("escalated_at", "is", null).gte("escalated_at", start).lt("escalated_at", end),
    supabase.from("guest_requests").select("department").neq("status", "completed"),
    // Settled payments count on their verification time, falling back to the
    // record time for payments settled without a separate verification step.
    supabase.from("payments").select("purpose,method,amount").eq("status", "paid").or(`and(verified_at.gte.${start},verified_at.lt.${end}),and(verified_at.is.null,created_at.gte.${start},created_at.lt.${end})`),
    // Shift close-outs for the day: counted vs expected cash and the recorded variance.
    supabase.from("cash_shifts").select("expected_cash,actual_cash,variance").not("closed_at", "is", null).gte("closed_at", start).lt("closed_at", end),
    // Room-care turnover from the authoritative task rows: everything completed
    // in the window (by completed_at), plus the current inspection backlog.
    supabase.from("housekeeping_tasks").select("task_type,started_at,completed_at,inspection_status,status").eq("status", "completed").gte("completed_at", start).lt("completed_at", end),
    supabase.from("rooms").select("status").eq("administratively_active", true),
    supabase.from("transportation_requests").select("status").gte("created_at", start).lt("created_at", end),
    supabase.from("manager_approval_requests").select("status").gte("requested_at", start).lt("requested_at", end)
  ] as const);
  for (const result of [reservationsCreated, checkedIn, checkedOut, reservationAuditEvents, guestRequestsOpened, guestRequestsEscalated, openRequests, settledPayments, cashShiftsClosed, housekeepingCompleted, rooms, transportation, approvals] as const) {
    if (result.error) throw result.error;
  }
  return { ...summarizeDailyActivity({
    reservationsCreated: reservationsCreated.data ?? [],
    checkedIn: checkedIn.data ?? [],
    checkedOut: checkedOut.data ?? [],
    reservationAuditEvents: reservationAuditEvents.data ?? [],
    guestRequestsOpened: guestRequestsOpened.data ?? [],
    guestRequestsEscalated: guestRequestsEscalated.data ?? [],
    openRequests: openRequests.data ?? [],
    settledPayments: settledPayments.data ?? [],
    cashShiftsClosed: cashShiftsClosed.data ?? [],
    housekeepingCompleted: housekeepingCompleted.data ?? [],
    rooms: rooms.data ?? [],
    transportation: transportation.data ?? [],
    approvals: approvals.data ?? []
  }, date), generatedAt: new Date().toISOString() };
}

export const REPORT_PAGE_SIZE = 10;

export type FrontDeskReportRecord = RecordItem & {
  submitted_by_name?: string | null;
  reviewed_by_name?: string | null;
};

export async function listFrontDeskReports(page: number): Promise<{ rows: FrontDeskReportRecord[]; page: number; pageCount: number }> {
  if (!supabase) throw new Error("Database unavailable.");
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
  return { rows, page: safePage, pageCount: Math.max(1, Math.ceil((count ?? 0) / REPORT_PAGE_SIZE)) };
}
