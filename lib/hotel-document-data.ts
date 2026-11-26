import { calculateNights, fromCentavos, toCentavos } from "@/lib/booking";
import { HOTEL_TIME_ZONE, formatHotelDateTime } from "@/lib/format";
import { displayTime, operationalPolicyFromSnapshot } from "@/lib/hotel-policy";
import { getCashDrawerShifts } from "@/lib/accounting";
import { supabase } from "@/lib/supabase";
import type { DailyReportSnapshot } from "@/lib/front-desk-reports";
import type { HotelDocument } from "@/lib/hotel-document-pdf";

type RecordData = Record<string, unknown>;
const absent = "Not recorded";
const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: HOTEL_TIME_ZONE });
const decimals = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const display = (value: unknown, fallback = absent) => typeof value === "string" && value.trim() ? value.trim() : fallback;
const wordLabel = (value: unknown, fallback = absent) => display(value, fallback).replaceAll("_", " ").replace(/^./u, char => char.toUpperCase());
const amount = (value: unknown) => (typeof value === "number" || (typeof value === "string" && value.trim())) && Number.isFinite(Number(value)) ? Number(value) : null;
const money = (value: unknown) => amount(value) === null ? absent : decimals.format(amount(value)!);
const withCurrency = (value: unknown, currency = "PHP") => amount(value) === null ? absent : `${currency} ${money(value)}`;
const count = (value: unknown) => amount(value) === null ? absent : String(amount(value));
const record = (value: unknown): RecordData => value !== null && typeof value === "object" && !Array.isArray(value) ? value as RecordData : {};
const records = (value: unknown): RecordData[] => Array.isArray(value) ? value.map(record) : [];
function date(value: unknown) {
  const raw = display(value, "");
  const stamp = new Date(raw);
  return raw && Number.isFinite(stamp.getTime()) ? dateFormat.format(stamp) : absent;
}
const stamp = (value: unknown) => display(value, "") ? formatHotelDateTime(String(value)) : absent;

function exact<T>(result: { data: T; error: unknown }) {
  if (result.error) throw new Error("Unable to read a document source.", { cause: result.error });
  return result.data;
}

export function isBookingConfirmationStatus(status: string) {
  return status === "confirmed" || status === "checked_in";
}

export async function readBookingConfirmation(userId: string, reservationId: string): Promise<HotelDocument | null> {
  if (!supabase) return null;
  const reservation = exact(await supabase.from("reservations")
    .select("id,confirmation_number,guest_name,room_type,check_in,check_out,guests,status,total,payment_method,operational_policy_snapshot")
    .eq("id", reservationId).eq("user_id", userId).maybeSingle());
  if (!reservation || !isBookingConfirmationStatus(reservation.status)) return null;
  const deposits = exact(await supabase.from("payments").select("amount").eq("reservation_id", reservation.id)
    .eq("purpose", "reservation_deposit").eq("status", "paid"));
  const deposit = deposits?.length ? fromCentavos(deposits.reduce((sum, payment) => sum + toCentavos(Number(payment.amount)), 0)) : null;
  const bookedTotal = amount(reservation.total);
  const policy = operationalPolicyFromSnapshot(reservation.operational_policy_snapshot);
  const reference = display(reservation.confirmation_number, reservation.id);
  const nights = calculateNights(reservation.check_in, reservation.check_out);
  return {
    title: "Booking Confirmation", subtitle: "Your reservation is confirmed.", reference, audience: "Guest copy",
    facts: [
      { label: "Check-in", value: date(reservation.check_in), detail: `From ${displayTime(policy.checkInTime)}` },
      { label: "Check-out", value: date(reservation.check_out), detail: `By ${displayTime(policy.checkOutTime)}` },
    ],
    sections: [
      { title: "Reservation details", table: { rows: [["Primary guest", display(reservation.guest_name)], ["Room type", display(reservation.room_type)], ["Party size", count(reservation.guests)], ["Nights", count(nights)]] } },
      { title: "Booking payments", table: { rows: [["Booked stay total", withCurrency(bookedTotal)], ["Settled booking deposits", withCurrency(deposit)]] },
        totals: bookedTotal !== null && deposit !== null ? [{ label: "Booked stay total less deposits", value: withCurrency(fromCentavos(Math.max(0, toCentavos(bookedTotal) - toCentavos(deposit)))) }] : undefined },
      { title: "Before you arrive", note: [
        policy.validIdRequired ? "Bring your booking reference and a valid government-issued photo ID for check-in." : "Have your booking reference ready for check-in.",
        "View My Reservations for current charges, changes and cancellation terms.",
        reservation.payment_method === "gateway_xendit" ? "Xendit sandbox payments shown by Haven are test transactions." : "",
      ].filter(Boolean).join(" ") },
    ],
    footer: `My Reservations  /  ${policy.hotelTimezone || HOTEL_TIME_ZONE}`,
  };
}

export async function findCheckoutFolio(reservationId: string, checkedOutAt: string | null, includeSnapshot = false) {
  if (!supabase) return null;
  let query = supabase.from("financial_documents")
    .select(includeSnapshot ? "document_number,created_at,snapshot" : "document_number,created_at")
    .eq("reservation_id", reservationId).eq("document_type", "folio");
  if (checkedOutAt) query = query.gte("created_at", checkedOutAt);
  return exact(await query.order("created_at", { ascending: false }).order("id").limit(1).maybeSingle()) as
    { document_number: string; created_at: string; snapshot?: unknown } | null;
}

export async function readCheckoutFolio(reservationId: string, guestUserId?: string): Promise<HotelDocument | null> {
  if (!supabase) return null;
  let query = supabase.from("reservations").select("id,checked_out_at").eq("id", reservationId).eq("status", "checked_out");
  if (guestUserId) query = query.eq("user_id", guestUserId);
  const stay = exact(await query.maybeSingle());
  if (!stay) return null;
  const issued = await findCheckoutFolio(stay.id, stay.checked_out_at, true);
  if (!issued) return null;
  const snapshot = record(issued.snapshot);
  if (!Object.keys(snapshot).length) throw new Error("The issued folio is missing its snapshot.");
  const currency = display(snapshot.currency, "PHP");
  const charges = records(snapshot.charges).filter(row => row.status === "posted")
    .map(row => [display(row.description, wordLabel(row.category, "Charge")), date(row.postedAt), money(row.amount)]);
  const adjustments = records(snapshot.adjustments).map(row => {
    const value = amount(row.amount);
    return [wordLabel(row.transactionType, "Folio adjustment"), date(row.createdAt), money(value === null ? null : row.direction === "credit" ? -value : value)];
  });
  const payments = records(snapshot.payments).map(row => {
    const value = amount(row.amount);
    return [wordLabel(row.purpose, "Payment"), date(row.receivedAt), money(value === null ? null : row.purpose === "refund" ? -value : value)];
  });
  const columns = [0.52, 0.26, 0.22];
  const tax = record(snapshot.taxBreakdown);
  return {
    title: stay.checked_out_at ? "Checkout Folio Statement" : "Folio Statement", subtitle: "Issued guest statement with the recorded charges, credits and payments.",
    reference: issued.document_number, audience: "Guest copy",
    facts: [
      { label: "Guest", value: display(snapshot.guestName), detail: display(snapshot.roomType) },
      { label: "Reservation", value: display(snapshot.confirmationNumber, stay.id), detail: `${date(snapshot.checkIn)} to ${date(snapshot.checkOut)}` },
    ],
    sections: [
      { title: "Posted charges and adjustments", table: (charges.length || adjustments.length) ? { headings: ["Description", "Recorded", currency], columns, rows: [...charges, ...adjustments] } : undefined,
        note: charges.length || adjustments.length ? undefined : "No separate charge or adjustment lines were recorded in this issued statement." },
      ...(payments.length ? [{ title: "Settled payments and refunds", table: { headings: ["Type", "Received", currency], columns, rows: payments } }] : []),
      { title: "Folio totals", totals: [{ label: "Folio amount", value: withCurrency(snapshot.folioAmount, currency) }, { label: "Payments applied", value: withCurrency(snapshot.paid, currency) }, { label: "Balance at issue", value: withCurrency(snapshot.balance, currency) }],
        note: [amount(snapshot.creditBalance) ? `Credit balance ${withCurrency(snapshot.creditBalance, currency)}.` : "",
          Object.keys(tax).length ? `Included tax breakdown: net subtotal ${withCurrency(tax.netSubtotal, currency)}, service charge ${withCurrency(tax.serviceCharge, currency)}, VAT ${withCurrency(tax.vatAmount, currency)}.` : ""].filter(Boolean).join(" ") || undefined },
    ],
    footer: `Issued ${stamp(issued.created_at)}  /  ${HOTEL_TIME_ZONE}`,
  };
}

export async function readCashShift(shiftId: string, frontDeskActor?: string): Promise<HotelDocument | null> {
  if (!supabase) return null;
  const shift = frontDeskActor
    ? (await getCashDrawerShifts(frontDeskActor)).find(row => row.id === shiftId)
    : exact(await supabase.from("cash_shifts")
      .select("id,staff_user_id,location,status,opened_at,closed_at,opening_amount,expected_cash,actual_cash,variance,reconciled_at")
      .eq("id", shiftId).in("status", ["closed", "reconciled"]).maybeSingle());
  if (!shift || !shift.closed_at || (shift.status !== "closed" && shift.status !== "reconciled")) return null;
  const actor = exact(await supabase.from("user_accounts").select("name").eq("id", shift.staff_user_id).maybeSingle());
  const opening = amount(shift.opening_amount);
  const expected = amount(shift.expected_cash);
  const movement = opening === null || expected === null ? null : fromCentavos(toCentavos(expected) - toCentavos(opening));
  return {
    title: "Cash Shift Close Summary", subtitle: "Recorded cash count and reconciliation for a single closed drawer.",
    reference: shiftId, audience: "Internal use",
    facts: [{ label: "Drawer", value: display(shift.location) }, { label: "Cashier", value: display(actor?.name), detail: shift.status === "reconciled" ? "Reconciled" : "Awaiting reconciliation" }],
    sections: [
      { title: "Shift record", table: { rows: [["Opened", stamp(shift.opened_at)], ["Closed", stamp(shift.closed_at)]] } },
      { title: "Cash at close", table: { rows: [["Opening float", withCurrency(opening)], ["Net drawer movements", withCurrency(movement)]] },
        totals: [{ label: "Expected cash", value: withCurrency(expected) }, { label: "Actual count", value: withCurrency(shift.actual_cash) }, { label: "Variance", value: withCurrency(shift.variance) }] },
      { title: "Reconciliation", note: shift.status === "reconciled" ? `Recorded variance retained. Reconciled ${stamp(shift.reconciled_at)}.` : "The recorded drawer count is awaiting reconciliation." },
    ],
    footer: `Cash & Shifts  /  ${HOTEL_TIME_ZONE}`,
  };
}

export async function readSavedOperationsReport(reportId: string): Promise<HotelDocument | null> {
  if (!supabase) return null;
  const report = exact(await supabase.from("front_desk_reports").select("report_date,snapshot,submitted_at,status")
    .eq("id", reportId).in("status", ["submitted", "acknowledged", "returned"]).maybeSingle());
  if (!report || !report.submitted_at) return null;
  const snapshot = report.snapshot as DailyReportSnapshot;
  if (!snapshot?.reservations || !snapshot.guestRequests || !snapshot.collections) throw new Error("The saved report is incomplete.");
  const { reservations, housekeeping, guestRequests, cashShifts, collections } = snapshot;
  return {
    title: "Daily Operations Report", subtitle: "Saved Front Desk activity summary for Manager review.",
    reference: reportId, audience: "Internal use",
    facts: [{ label: "Report date", value: date(report.report_date) }, { label: "Review status", value: wordLabel(report.status), detail: `Submitted ${stamp(report.submitted_at)}` }],
    sections: [
      { title: "Daily overview", totals: [{ label: "Arrivals", value: count(reservations.arrivals) }, { label: "Departures", value: count(reservations.departures) }, { label: "Settled collections", value: withCurrency(collections.total) }] },
      { title: "Hotel activity", table: { columns: [0.34, 0.16, 0.34, 0.16], values: [1, 3], rows: [
        ["New reservations", count(reservations.created), "Housekeeping tasks completed", count(housekeeping?.tasksCompleted)],
        ["Cancellations", count(reservations.cancelled), "Rooms awaiting inspection", count(housekeeping?.awaitingInspection)],
        ["No-shows", count(reservations.noShow), "Guest requests opened", count(guestRequests.opened)],
        ["Closed shifts", count(cashShifts?.closed), "Guest requests escalated", count(guestRequests.escalated)],
      ] } },
      { title: "Cash shift totals", table: cashShifts ? { rows: [["Expected cash", withCurrency(cashShifts.expected)], ["Counted cash", withCurrency(cashShifts.counted)], ["Recorded variance", withCurrency(cashShifts.variance)]] } : undefined,
        note: cashShifts ? undefined : "This saved snapshot does not include a cash shift breakdown." },
    ],
    footer: `Front Desk Reports  /  ${snapshot.hotelTimezone || HOTEL_TIME_ZONE}`,
  };
}
