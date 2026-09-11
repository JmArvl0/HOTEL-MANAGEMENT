/**
 * Guest communication automation (roadmap Phase 4): pre-arrival (~24h before
 * check-in) and pre-departure (~24h before checkout) reminders, run by the
 * daily /api/guest-reminders cron.
 *
 * Idempotency is the core constraint: the INSERT into guest_reminder_deliveries
 * claims the send — its unique (reservation_id, kind) index means a cron retry,
 * redeploy, or manual re-run hits a duplicate-key error and skips. Email is
 * secondary (never-throw): a provider outage marks the delivery failed and
 * nothing else happens. Hotel operations never depend on this module.
 */
import { supabase } from "@/lib/supabase";
import { sendEmail, guestEmailHtml } from "@/lib/email";
import { recordNotification, type NotificationType } from "@/lib/notifications";
import { hotelDateWithin } from "@/lib/booking";

export type ReminderKind = "pre_arrival" | "pre_departure";

export interface ReminderReservation {
  id: string;
  user_id: string | null;
  guest_email: string | null;
  guest_name: string | null;
  confirmation_number: string | null;
  room_type: string;
  room_number: string | null;
  check_in: string;
  check_out: string;
  status: string;
  guests: number;
  early_check_in_approved_until: string | null;
  operational_policy_snapshot: Record<string, unknown> | null;
}

/** Confirmed and arriving tomorrow (not yet checked in — that date has passed). */
export const isPreArrivalTarget = (r: ReminderReservation, tomorrow: string) =>
  r.status === "confirmed" && r.check_in === tomorrow;
/** In-house and leaving tomorrow. */
export const isPreDepartureTarget = (r: ReminderReservation, tomorrow: string) =>
  r.status === "checked_in" && r.check_out === tomorrow;

type Outcome = "sent" | "skipped" | "error";

const duplicate = (error: { code?: string; message?: string } | null | undefined) =>
  error?.code === "23505" || String(error?.message ?? "").includes("duplicate key");

const policyTime = (snapshot: Record<string, unknown> | null, key: "checkInTime" | "checkOutTime") =>
  typeof snapshot?.[key] === "string" ? (snapshot[key] as string).slice(0, 5) : null;

const peso = (value: number) => `PHP ${value.toLocaleString("en-PH")}`;

async function claimDelivery(reservationId: string, kind: ReminderKind): Promise<"claimed" | "duplicate" | "error"> {
  const { error } = await supabase!.from("guest_reminder_deliveries").insert({ reservation_id: reservationId, kind });
  if (!error) return "claimed";
  if (duplicate(error)) return "duplicate";
  console.error("guest reminder claim failed", kind, reservationId, error.message);
  return "error";
}

async function markFailed(reservationId: string, kind: ReminderKind, message: string) {
  await supabase!.from("guest_reminder_deliveries").update({ status: "failed", error: message }).eq("reservation_id", reservationId).eq("kind", kind);
}

/**
 * Runs one reminder pass for `tomorrow` (hotel-local YYYY-MM-DD). Pure
 * selection + one claim per send; returns the summary the cron route reports.
 */
export async function runGuestReminders(tomorrow = hotelDateWithin(1)): Promise<{
  tomorrow: string;
  preArrival: Record<Outcome, number>;
  preDeparture: Record<Outcome, number>;
}> {
  const summary = { preArrival: { sent: 0, skipped: 0, error: 0 }, preDeparture: { sent: 0, skipped: 0, error: 0 } };
  if (!supabase) return { tomorrow, ...summary };

  const columns = "id,user_id,guest_email,guest_name,confirmation_number,room_type,room_number,check_in,check_out,guests,status,early_check_in_approved_until,operational_policy_snapshot";
  const [arrivals, departures, policy] = await Promise.all([
    supabase.from("reservations").select(columns).eq("status", "confirmed").eq("check_in", tomorrow),
    supabase.from("reservations").select(columns).eq("status", "checked_in").eq("check_out", tomorrow),
    supabase.rpc("current_operational_policy_snapshot"),
  ]);
  const arrivalRows = (arrivals.data ?? []) as ReminderReservation[];
  const departureRows = (departures.data ?? []) as ReminderReservation[];
  const currentPolicy = ((policy.data ?? {}) as Record<string, unknown>);

  // Scheduled transportation for any target reservation (one active request per
  // reservation is DB-enforced), keyed by reservation id.
  const targetIds = [...arrivalRows, ...departureRows].map((row) => row.id);
  const rides = new Map<string, { service_type: string; pickup_time: string | null }>();
  if (targetIds.length > 0) {
    const { data } = await supabase.from("transportation_requests")
      .select("reservation_id,service_type,pickup_time")
      .in("reservation_id", targetIds)
      .in("status", ["SCHEDULED", "ASSIGNED"]);
    for (const ride of (data ?? []) as { reservation_id: string; service_type: string; pickup_time: string | null }[]) {
      rides.set(ride.reservation_id, ride);
    }
  }

  // Outstanding folio balance for departing guests (only shown when > 0).
  const balances = new Map<string, number>();
  if (departureRows.length > 0) {
    const { data } = await supabase.from("invoices")
      .select("reservation_id,balance")
      .in("reservation_id", departureRows.map((row) => row.id));
    for (const invoice of (data ?? []) as { reservation_id: string; balance: number | string }[]) {
      balances.set(invoice.reservation_id, Number(invoice.balance ?? 0));
    }
  }

  for (const row of arrivalRows) {
    if (!isPreArrivalTarget(row, tomorrow)) continue; // re-check the predicate the query filtered on
    const outcome = await sendReminder(row, "pre_arrival", {
      subject: "Arriving tomorrow — your Haven stay",
      heading: "We're looking forward to your arrival",
      bodyHtml: arrivalBody(row, currentPolicy, rides.get(row.id)),
      notification: { type: "pre_arrival_reminder", title: "Arriving tomorrow", detail: `${row.room_type} — ${row.confirmation_number}` },
    });
    summary.preArrival[outcome]++;
  }
  for (const row of departureRows) {
    if (!isPreDepartureTarget(row, tomorrow)) continue;
    const outcome = await sendReminder(row, "pre_departure", {
      subject: "Your Haven checkout is tomorrow",
      heading: "Your checkout is tomorrow",
      bodyHtml: departureBody(row, currentPolicy, rides.get(row.id), balances.get(row.id) ?? 0),
      notification: { type: "pre_departure_reminder", title: "Checkout tomorrow", detail: `${row.room_type} — ${row.confirmation_number}` },
    });
    summary.preDeparture[outcome]++;
  }
  return { tomorrow, ...summary };
}

async function sendReminder(
  row: ReminderReservation,
  kind: ReminderKind,
  message: { subject: string; heading: string; bodyHtml: string; notification: { type: NotificationType; title: string; detail: string } }
): Promise<Outcome> {
  const claim = await claimDelivery(row.id, kind);
  if (claim !== "claimed") return claim === "duplicate" ? "skipped" : "error";
  // In-app notification always lands (never-throw); the email is a best-effort copy.
  if (row.user_id) {
    await recordNotification({ userId: row.user_id, type: message.notification.type, title: message.notification.title, detail: message.notification.detail, href: `/my-reservations/${row.id}` });
  }
  if (row.guest_email) {
    const result = await sendEmail({ to: row.guest_email, subject: message.subject, html: guestEmailHtml(message.heading, message.bodyHtml) });
    if (!result.ok && result.reason === "failed") {
      console.error("guest reminder email failed", kind, row.id, result.message);
      await markFailed(row.id, kind, result.message);
    }
  }
  return "sent";
}

const rideLine = (ride?: { service_type: string; pickup_time: string | null }) =>
  ride ? `<tr><td style="color:#8a8a8a">Transportation</td><td>${ride.service_type === "DROPOFF" ? "Hotel transfer" : "Airport pickup"}${ride.pickup_time ? ` scheduled at <strong>${ride.pickup_time}</strong>` : " scheduled"}</td></tr>` : "";

function arrivalBody(row: ReminderReservation, currentPolicy: Record<string, unknown>, ride?: { service_type: string; pickup_time: string | null }) {
  const checkInTime = policyTime(row.operational_policy_snapshot, "checkInTime") ?? policyTime(currentPolicy, "checkInTime") ?? "14:00";
  const early = row.early_check_in_approved_until
    ? `<tr><td style="color:#8a8a8a">Early check-in</td><td>Approved — from <strong>${new Date(row.early_check_in_approved_until).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}</strong></td></tr>`
    : "";
  return `<p>See you tomorrow. Here is everything you need for a smooth arrival.</p>
<table style="font-size:14px;line-height:1.8">
<tr><td style="color:#8a8a8a">Confirmation</td><td><strong>${row.confirmation_number}</strong></td></tr>
<tr><td style="color:#8a8a8a">Room</td><td>${row.room_type}</td></tr>
<tr><td style="color:#8a8a8a">Stay</td><td>${row.check_in} to ${row.check_out} · ${row.guests} guest${row.guests !== 1 ? "s" : ""}</td></tr>
<tr><td style="color:#8a8a8a">Check-in from</td><td><strong>${checkInTime}</strong></td></tr>
${early}${rideLine(ride)}
</table>`;
}

function departureBody(row: ReminderReservation, currentPolicy: Record<string, unknown>, ride?: { service_type: string; pickup_time: string | null }, balance = 0) {
  const checkOutTime = policyTime(row.operational_policy_snapshot, "checkOutTime") ?? policyTime(currentPolicy, "checkOutTime") ?? "12:00";
  const balanceLine = balance > 0
    ? `<tr><td style="color:#8a8a8a">Outstanding balance</td><td><strong>${peso(balance)}</strong> — payable at checkout</td></tr>`
    : "";
  return `<p>Thank you for staying with us. A quick note before you head out tomorrow.</p>
<table style="font-size:14px;line-height:1.8">
<tr><td style="color:#8a8a8a">Confirmation</td><td><strong>${row.confirmation_number}</strong></td></tr>
<tr><td style="color:#8a8a8a">Room</td><td>${row.room_type}${row.room_number ? ` · Room ${row.room_number}` : ""}</td></tr>
<tr><td style="color:#8a8a8a">Checkout by</td><td><strong>${checkOutTime}</strong> on ${row.check_out}</td></tr>
${balanceLine}${rideLine(ride)}
</table>`;
}
