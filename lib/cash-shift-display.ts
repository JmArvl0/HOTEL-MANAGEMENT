import type { Role } from "@/lib/types";

// Match booking's centavo arithmetic without importing its server/database dependencies.
const toCentavos = (amount: number) => Math.round(amount * 100);
const fromCentavos = (amount: number) => amount / 100;

export type CashRecord = Record<string, unknown>;
export function cashNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string" || typeof value === "string" && !value.trim()) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}
export function cashExpected(openingValue: unknown, netValue: unknown) {
  const opening = cashNumber(openingValue), net = cashNumber(netValue);
  return opening === null || net === null ? null : fromCentavos(toCentavos(opening) + toCentavos(net));
}
export function cashCountVariance(countValue: unknown, expectedValue: unknown) {
  const count = cashNumber(countValue), expected = cashNumber(expectedValue);
  return count === null || expected === null ? null : fromCentavos(toCentavos(count) - toCentavos(expected));
}
export const cashMoney = (value: unknown) => {
  const amount = cashNumber(value);
  return amount === null ? "—" : new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);
};
export const cashDate = (value: unknown) => {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "Time not supplied";
  return new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
};
export function cashDuration(shift: CashRecord, now: number) {
  const start = Date.parse(String(shift.opened_at ?? ""));
  const end = shift.status === "open" ? now : Date.parse(String(shift.closed_at ?? ""));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "Duration unavailable";
  const minutes = Math.floor((end - start) / 60000);
  return `${shift.status === "open" ? "Running" : "Duration"} ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
export function selectCashShifts(shifts: readonly CashRecord[]) {
  const sorted = [...shifts].sort((a, b) => (Date.parse(String(b.opened_at)) || 0) - (Date.parse(String(a.opened_at)) || 0));
  return { active: sorted.find(row => row.status === "open") ?? null, latestClosed: sorted.find(row => row.status === "closed" || row.status === "reconciled") ?? null };
}
export const canCloseDrawer = (shift: CashRecord, actorId: string, role: Role) =>
  shift.status === "open" && (role === "accounting" || role === "front_desk" && shift.staff_user_id === actorId);
export function shiftCashBasis(shift: CashRecord, transactions: readonly CashRecord[]) {
  const linked = transactions.filter(row => String(row.cash_shift_id ?? "") === String(shift.id));
  const paid = linked.filter(row => row.status === "paid");
  let incoming = 0, outgoing = 0;
  const amountsKnown = paid.every(row => cashNumber(row.amount) !== null);
  for (const row of paid) {
    const amount = toCentavos(cashNumber(row.amount) ?? 0);
    if (row.purpose === "refund") outgoing += amount; else incoming += amount;
  }
  const opening = cashNumber(shift.opening_amount), net = cashNumber(shift.collected);
  const expected = shift.status === "open"
    ? cashExpected(opening, net)
    : cashNumber(shift.expected_cash);
  const agrees = amountsKnown && opening !== null && (shift.status === "open"
    ? net !== null && incoming - outgoing === toCentavos(net)
    : expected !== null && toCentavos(opening) + incoming - outgoing === toCentavos(expected));
  return { linked, expected, incoming: amountsKnown ? fromCentavos(incoming) : null, outgoing: amountsKnown ? fromCentavos(outgoing) : null, agrees };
}
export function cashDifference(value: unknown) {
  const amount = cashNumber(value);
  return { label: amount === null ? "Difference unavailable" : amount === 0 ? "Balanced" : amount < 0 ? "Short by" : "Over by", amount: amount === null ? null : Math.abs(amount), tone: amount === null ? "neutral" : amount === 0 ? "balanced" : "variance" };
}
export function filterCashHistory(shifts: readonly CashRecord[], search: string, status: string) {
  const term = search.trim().toLowerCase();
  return shifts.filter(row => (status === "all" || row.status === status) && (!term || JSON.stringify(row).toLowerCase().includes(term)));
}
