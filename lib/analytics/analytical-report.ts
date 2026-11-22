import { loadForecastEvaluation, readRecordedOccupancy } from "./evaluation-data";
import { scoreForecasts } from "./evaluation";
import { shiftDate } from "./types";
import { isCalendarDate } from "@/lib/input-validation";
import type { ManagerContext } from "@/lib/manager-route";
import { readAllRows } from "@/lib/read-all-rows";

export type ReportRange = { from: string; through: string };
export type NightAudit = { business_date: string; snapshot: { bookedNights?: number; serviceableCapacity?: number; roomAccrual?: number | null; capacityBasis?: string } };
const money = (value: number) => Math.round(value * 100) / 100;
const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86400000;

export function validateReportRange(from: string, through: string, today: string): ReportRange | null {
  if (!isCalendarDate(from) || !isCalendarDate(through) || from > through || through >= today || daysBetween(from, through) >= 90) return null;
  return { from, through };
}

export function auditPerformance(nights: NightAudit[], expected: number) {
  const complete = nights.length === expected && nights.every(({ snapshot }) => snapshot.capacityBasis === "closing_active_inventory"
    && typeof snapshot.bookedNights === "number" && typeof snapshot.serviceableCapacity === "number");
  const booked = complete ? nights.reduce((sum, row) => sum + row.snapshot.bookedNights!, 0) : null;
  const capacity = complete ? nights.reduce((sum, row) => sum + row.snapshot.serviceableCapacity!, 0) : null;
  const accrual = complete && nights.every(row => typeof row.snapshot.roomAccrual === "number")
    ? money(nights.reduce((sum, row) => sum + row.snapshot.roomAccrual!, 0)) : null;
  return { closedDays: nights.length, expected, booked, capacity, accrual,
    bookedOccupancy: capacity && booked !== null ? booked / capacity * 100 : null,
    adr: booked && accrual !== null ? money(accrual / booked) : null,
    revpar: capacity && accrual !== null ? money(accrual / capacity) : null };
}

type Reservation = { id: string; room_type: string; source: string | null; status: string; check_in: string; check_out: string;
  created_at: string; checked_in_at: string | null; checked_out_at: string | null; nightly_rates: unknown };
type Request = { id: string; created_at: string; completed_at: string | null };
type Event = { id: string; entity_id: string; created_at: string; action: string };
type Task = { id: string; reservation_id: string | null; created_at: string; completed_at: string; inspected_at: string | null; inspection_status: string };
type Repair = { id: string; room_id: string | null; room_number: string; category: string | null; target_label: string | null };
type Payment = { id: string; purpose: string | null; amount: number; verified_at: string | null; created_at: string; operating_date: string | null };

function average(values: number[]) { return values.length ? values.reduce((sum, number) => sum + number, 0) / values.length : null; }
function median(values: number[]) {
  const order = [...values].sort((a, b) => a - b);
  return order.length ? (order[Math.floor((order.length - 1) / 2)] + order[Math.floor(order.length / 2)]) / 2 : null;
}
function elapsed(start: string | null, end: string | null) {
  const minutes = (Date.parse(end ?? "") - Date.parse(start ?? "")) / 60000;
  return Number.isFinite(minutes) && minutes >= 0 ? [minutes] : [];
}

export async function loadAnalyticalReport(db: ManagerContext["client"], range: ReportRange, zone: string, roomType?: string, bookingSource?: string) {
  const { from, through } = range;
  const expected = daysBetween(from, through) + 1;
  const previous = { from: shiftDate(from, -expected), through: shiftDate(from, -1) };
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: zone });
  const day = (time: string | null) => time ? formatter.format(new Date(time)) : "";
  const includes = (date: string) => date >= from && date <= through;
  // A one-day UTC margin covers all supported offsets. Local-date filtering below determines cohort membership.
  const lower = `${shiftDate(previous.from, -1)}T00:00:00Z`;
  const upper = `${shiftDate(through, 2)}T00:00:00Z`;
  const [audits, actuals, bookings, payments, tasks, requests, events, repairs, forecasts] = await Promise.all([
    readAllRows<NightAudit>(() => db.from("hotel_night_audits").select("business_date,snapshot").gte("business_date", previous.from).lte("business_date", through), "business_date"),
    readRecordedOccupancy(previous.from, through),
    readAllRows<Reservation>(() => db.from("reservations").select("id,room_type,source,status,check_in,check_out,created_at,checked_in_at,checked_out_at,nightly_rates")
      .or(`and(created_at.gte.${lower},created_at.lt.${upper}),and(check_in.lte.${through},check_out.gte.${from}),and(checked_out_at.gte.${lower},checked_out_at.lt.${upper})`)),
    readAllRows<Payment>(() => db.from("payments").select("id,purpose,amount,verified_at,created_at,operating_date").eq("status", "paid")
      .or(`and(operating_date.gte.${previous.from},operating_date.lte.${through}),and(operating_date.is.null,verified_at.gte.${lower},verified_at.lt.${upper}),and(operating_date.is.null,verified_at.is.null,created_at.gte.${lower},created_at.lt.${upper})`)),
    readAllRows<Task>(() => db.from("housekeeping_tasks").select("id,reservation_id,created_at,completed_at,inspected_at,inspection_status").eq("task_type", "checkout_cleaning")
      .or(`and(completed_at.gte.${lower},completed_at.lt.${upper}),and(inspected_at.gte.${lower},inspected_at.lt.${upper})`)),
    readAllRows<Request>(() => db.from("guest_requests").select("id,created_at,completed_at").gte("created_at", lower).lt("created_at", upper)),
    readAllRows<Event>(() => db.from("audit_logs").select("id,entity_id,created_at,action").eq("entity_type", "guest_request").eq("action", "staff_start_guest_request").gte("created_at", lower).lt("created_at", upper)),
    readAllRows<Repair & { created_at: string }>(() => db.from("maintenance_orders").select("id,room_id,room_number,category,target_label,created_at").gte("created_at", lower).lt("created_at", upper)
      .returns<(Repair & { created_at: string })[]>()),
    loadForecastEvaluation("occupancy", from, through)
  ]);

  const byDate = new Map(audits.map(row => [row.business_date, row]));
  const receiptByDate = new Map<string, { collections: number; refunds: number }>();
  for (const payment of payments) {
    const date = payment.operating_date ?? day(payment.verified_at ?? payment.created_at);
    const totals = receiptByDate.get(date) ?? { collections: 0, refunds: 0 };
    totals[payment.purpose === "refund" ? "refunds" : "collections"] += Number(payment.amount);
    receiptByDate.set(date, totals);
  }
  const trend = Array.from({ length: expected * 2 }, (_, index) => {
    const date = shiftDate(previous.from, index);
    const audit = byDate.get(date);
    const receipts = receiptByDate.get(date);
    return { date, actualOccupancy: actuals.get(date)?.percent ?? null, collections: money(receipts?.collections ?? 0), refunds: money(receipts?.refunds ?? 0),
      roomAccrual: audit?.snapshot.roomAccrual ?? null, booked: audit?.snapshot.bookedNights ?? null, supply: audit?.snapshot.serviceableCapacity ?? null };
  });
  const sourceOf = (row: Reservation) => row.source?.trim() || "Unknown";
  const cohort = bookings.filter(row => (!roomType || row.room_type === roomType) && (!bookingSource || sourceOf(row) === bookingSource));
  const created = cohort.filter(row => includes(day(row.created_at)));
  const arrivals = cohort.filter(row => includes(row.check_in) && ["checked_in", "checked_out", "no_show"].includes(row.status));
  const stays = cohort.filter(row => row.status === "checked_out" && row.checked_in_at && includes(day(row.checked_out_at)));
  const sources = Object.entries(created.reduce<Record<string, number>>((counts, row) => {
    const label = sourceOf(row);
    counts[label] = (counts[label] ?? 0) + 1;
    return counts;
  }, Object.create(null))).sort((a, b) => b[1] - a[1]);

  const roomGroups = new Map<string, { bookedNights: number; pricedNights: number; roomAccrual: number }>();
  for (const stay of cohort) {
    if (!["confirmed", "checked_in", "checked_out"].includes(stay.status)) continue;
    const group = roomGroups.get(stay.room_type) ?? { bookedNights: 0, pricedNights: 0, roomAccrual: 0 };
    const rates = new Map<string, number>();
    if (Array.isArray(stay.nightly_rates)) for (const entry of stay.nightly_rates) {
      if (entry && typeof (entry.date ?? entry.night) === "string" && entry.rate != null && Number.isFinite(Number(entry.rate))) rates.set(entry.date ?? entry.night, Number(entry.rate));
    }
    for (let date = stay.check_in > from ? stay.check_in : from; includes(date) && date < stay.check_out; date = shiftDate(date, 1)) {
      if (!byDate.has(date)) continue;
      group.bookedNights++;
      const rate = rates.get(date);
      if (rate !== undefined) { group.pricedNights++; group.roomAccrual += rate; }
    }
    if (group.bookedNights) roomGroups.set(stay.room_type, group);
  }
  const byRoomType = [...roomGroups].sort(([a], [b]) => a.localeCompare(b)).map(([type, item]) => ({ type, ...item,
    roomAccrual: item.pricedNights === item.bookedNights ? money(item.roomAccrual) : null,
    adr: item.pricedNights === item.bookedNights ? money(item.roomAccrual / item.bookedNights) : null }));

  const checkouts = new Map(bookings.filter(row => row.checked_out_at).map(row => [row.id, row.checked_out_at]));
  const ready = new Map<string, number>();
  for (const task of tasks) {
    if (!task.reservation_id || !["passed", "not_required"].includes(task.inspection_status)) continue;
    const readyAt = task.inspection_status === "passed" ? task.inspected_at : task.completed_at;
    if (!includes(day(readyAt))) continue;
    const [value] = elapsed(checkouts.get(task.reservation_id) ?? null, readyAt);
    if (value !== undefined) ready.set(task.reservation_id, Math.min(ready.get(task.reservation_id) ?? Infinity, value));
  }
  const firstResponse = new Map<string, string>();
  for (const event of events) if (day(event.created_at) <= through && (!firstResponse.has(event.entity_id) || event.created_at < firstResponse.get(event.entity_id)!)) firstResponse.set(event.entity_id, event.created_at);
  const opened = requests.filter(request => includes(day(request.created_at)));
  const response = opened.flatMap(row => elapsed(row.created_at, firstResponse.get(row.id) ?? null));
  const completion = opened.flatMap(row => elapsed(row.created_at, row.completed_at && day(row.completed_at) <= through ? row.completed_at : null));
  const repairGroups = new Map<string, { category: string; location: string; count: number }>();
  for (const row of repairs) {
    if (!includes(day(row.created_at))) continue;
    const category = row.category || "General";
    const location = row.target_label || row.room_number || "Unspecified";
    const key = JSON.stringify([category, row.room_id, location]);
    const group = repairGroups.get(key) ?? { category, location, count: 0 };
    group.count++;
    repairGroups.set(key, group);
  }
  const summarize = (list: typeof trend, closes: NightAudit[]) => ({ ...auditPerformance(closes, expected),
    actualDays: list.filter(row => row.actualOccupancy !== null).length,
    actual: list.every(row => row.actualOccupancy !== null) ? average(list.map(row => row.actualOccupancy!)) : null,
    collections: money(list.reduce((sum, row) => sum + row.collections, 0)), refunds: money(list.reduce((sum, row) => sum + row.refunds, 0)) });
  const currentTrend = trend.slice(expected);
  const model = forecasts.rows.at(-1)?.modelVersion ?? null;
  return { range, previous, zone, generatedAt: new Date().toISOString(), trend: currentTrend,
    current: summarize(currentTrend, audits.filter(row => includes(row.business_date))),
    prior: summarize(trend.slice(0, expected), audits.filter(row => row.business_date < from)),
    choices: { types: [...new Set(bookings.map(row => row.room_type))].sort(), sources: [...new Set(bookings.map(sourceOf))].sort() },
    booking: { count: created.length, cancelled: created.filter(row => row.status === "cancelled").length,
      arrivalCount: arrivals.length, noShows: arrivals.filter(row => row.status === "no_show").length,
      leadDays: median(created.map(row => daysBetween(day(row.created_at), row.check_in)).filter(value => value >= 0)),
      stayNights: average(stays.map(row => daysBetween(day(row.checked_in_at), day(row.checked_out_at))).filter(value => value >= 0)), stayCount: stays.length, sources },
    byRoomType, service: { turnaround: average([...ready.values()]), readyCount: ready.size, firstResponse: average(response), responseCount: response.length,
      completion: average(completion), completionCount: completion.length, requestsOpened: opened.length },
    recurring: [...repairGroups.values()].filter(group => group.count >= 2).sort((a, b) => b.count - a.count),
    forecast: { model, ...scoreForecasts(forecasts.rows.filter(row => row.modelVersion === model)) }
  };
}

export type AnalyticalReport = Awaited<ReturnType<typeof loadAnalyticalReport>>;
