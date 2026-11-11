import type { RackReservation, RackRoom } from "@/lib/room-rack";

export type ReservationQueue = "all" | "arrivals" | "unassigned" | "upcoming" | "in_house" | "departures" | "closed";
export const reservationQueues: { value: ReservationQueue; label: string }[] = [
  { value: "all", label: "All" }, { value: "arrivals", label: "Arrivals today" }, { value: "unassigned", label: "Unassigned today" },
  { value: "upcoming", label: "Upcoming" }, { value: "in_house", label: "In-house" },
  { value: "departures", label: "Departures today" }, { value: "closed", label: "Closed" },
];
/** Reservation nights are [check-in, check-out): checkout day is not occupied. */
export function reservationOverlapsWindow(r: RackReservation, from: string, through: string) {
  return r.check_in.slice(0, 10) <= through && r.check_out.slice(0, 10) > from;
}

export function inReservationQueue(r: RackReservation, queue: ReservationQueue, today: string) {
  const arrival = r.status === "pending" || r.status === "confirmed";
  if (queue === "arrivals") return arrival && r.check_in.slice(0, 10) === today;
  if (queue === "unassigned") return arrival && !r.room_id && r.check_in.slice(0, 10) === today;
  if (queue === "upcoming") return arrival && r.check_in.slice(0, 10) > today;
  if (queue === "in_house") return r.status === "checked_in";
  if (queue === "departures") return r.status === "checked_in" && r.check_out.slice(0, 10) === today;
  if (queue === "closed") return ["checked_out", "cancelled", "no_show"].includes(r.status);
  return true;
}

/** Advisory preview only; protected workflows assess final readiness on the server. */
export function reservationPreview(r: RackReservation, rooms: RackRoom[], blocked: Set<string>, today: string): string[] {
  if (!["pending", "confirmed", "checked_in"].includes(r.status)) return [];
  const issues: string[] = [];
  if (r.status === "checked_in") {
    if (r.check_out.slice(0, 10) < today) issues.push("Overdue checkout");
    if (r.folio_balance != null && Number(r.folio_balance) > 0) issues.push("Balance due");
    return issues;
  }
  if (r.check_in.slice(0, 10) < today) issues.push("Arrival unresolved");
  if (!r.room_id) issues.push("Room unassigned");
  else {
    const room = rooms.find(room => room.id === r.room_id);
    if (blocked.has(r.room_id)) issues.push("Maintenance block");
    else if (room && (room.administratively_active === false || room.housekeeping !== "clean" || ["dirty", "maintenance", "out_of_service", "occupied"].includes(room.status))) issues.push("Room not ready");
  }
  if (r.identity_status !== "verified") issues.push("Identity review required");
  if (["pending", "pending_verification", "unpaid"].includes(r.payment_status ?? "") || r.status === "pending") issues.push("Payment review required");
  return issues;
}

export function reservationNextAction(r: RackReservation, canOperate: boolean, today: string) {
  if (!canOperate) return "View";
  if (r.status === "checked_in") return r.check_out.slice(0, 10) <= today ? "Review checkout" : "View folio";
  if (r.status === "confirmed" && r.check_in.slice(0, 10) <= today) return r.room_id ? "Start check-in" : "Assign room";
  return "View reservation";
}
