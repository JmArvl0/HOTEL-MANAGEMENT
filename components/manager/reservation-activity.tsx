import { formatHotelDateTime } from "@/lib/format";
import type { RecordItem } from "@/lib/types";

type Event = { key: string; at: string; label: string };

export default function ReservationActivity({ reservation, assignments, payments, closedAt }: {
  reservation: RecordItem; assignments: RecordItem[]; payments: RecordItem[]; closedAt?: string | null;
}) {
  const events: Event[] = [];
  const add = (key: string, at: unknown, label: string) => {
    if (typeof at === "string" && Number.isFinite(Date.parse(at))) events.push({ key, at, label });
  };
  add("created", reservation.created_at, reservation.source ? `Reservation created · ${reservation.source}` : "Reservation created");
  add("identity", reservation.identity_verified_at, "Guest ID verified");
  add("check-in", reservation.checked_in_at, "Guest checked in");
  add("check-out", reservation.checked_out_at, "Guest checked out");
  add("closed", closedAt, reservation.status === "no_show" ? "Marked no-show" : "Reservation cancelled");
  assignments.forEach(assignment => add(`assignment-${assignment.id}`, assignment.assigned_at, assignment.is_upgrade ? "Upgrade room assigned" : "Room assigned"));
  payments.forEach(payment => {
    if (payment.status === "paid") add(`payment-${payment.id}`, payment.verified_at ?? payment.reviewed_at, "Payment confirmed");
    else add(`payment-${payment.id}`, payment.submitted_at, "Payment submitted");
  });
  if (!events.length) return null;
  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return <details className="reservation-activity">
    <summary>Reservation activity <span>{events.length} {events.length === 1 ? "event" : "events"}</span></summary>
    <ol>{events.slice(0, 12).map(event => <li key={event.key}><span>{event.label}</span><time dateTime={event.at}>{formatHotelDateTime(event.at)}</time></li>)}</ol>
    {events.length > 12 && <p>Showing the 12 most recent events.</p>}
  </details>;
}
