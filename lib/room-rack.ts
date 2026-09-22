/**
 * Pure tape-chart helpers for the fused Room Rack & Reservations view.
 * No I/O, no dates beyond ISO day strings — every rule here mirrors the
 * server gates in front_desk_assign_room (type match, available + clean,
 * no overlap); the RPC remains the arbiter and re-validates on assign.
 */

export interface RackRoom {
  id: string;
  number: string;
  floor: number | string | null;
  wing?: string | null;
  type: string;
  status: string;
  housekeeping: string;
  administratively_active?: boolean | null;
}

export interface RackReservation {
  id: string;
  confirmation_number?: string | null;
  guest_name?: string | null;
  room_type: string;
  room_id?: string | null;
  room_number?: string | null;
  check_in: string;
  check_out: string;
  status: string;
  payment_status?: string | null;
  identity_status?: string | null;
  folio_balance?: number | null;
}

export interface RackBar {
  reservation: RackReservation;
  /** Zero-based day offset of the bar start, clamped to the window. */
  start: number;
  /** Day span, clamped to the window (min 1). */
  span: number;
}

const day = (iso: string) => Date.parse(String(iso).slice(0, 10));
export const DAY_MS = 86_400_000;

export function windowDays(from: string, days: number): string[] {
  const base = day(from);
  return Array.from({ length: days }, (_, i) => new Date(base + i * DAY_MS).toISOString().slice(0, 10));
}

/** Reservations needing a room: confirmed and not yet assigned. */
export function unassignedArrivals(reservations: RackReservation[]): RackReservation[] {
  return reservations.filter((r) => r.status === "confirmed" && !r.room_id);
}

/** Bars for one room row: stays overlapping the window, clamped to it. */
export function barsForRoom(
  reservations: RackReservation[],
  roomId: string,
  from: string,
  days: number
): RackBar[] {
  const start = day(from);
  return reservations
    .filter(
      (r) =>
        r.room_id === roomId && (r.status === "confirmed" || r.status === "checked_in") &&
        day(r.check_out) > start && day(r.check_in) < start + days * DAY_MS
    )
    .map((reservation) => {
      const s = Math.max(0, Math.round((day(reservation.check_in) - start) / DAY_MS));
      const e = Math.min(days, Math.round((day(reservation.check_out) - start) / DAY_MS));
      return { reservation, start: s, span: Math.max(1, e - s) };
    })
    .sort((a, b) => a.start - b.start);
}

export type CellBlock = { ok: true } | { ok: false; reason: string };

/** Client-side pre-check for click-to-assign (server re-validates on assign). */
export function assignableCell(
  room: RackRoom,
  reservation: RackReservation,
  bars: RackBar[]
): CellBlock {
  if (room.administratively_active === false) return { ok: false, reason: "Room is retired from inventory." };
  if (room.type !== reservation.room_type) return { ok: false, reason: `Needs a ${reservation.room_type} room.` };
  if (room.status === "maintenance" || room.housekeeping === "reclean_required")
    return { ok: false, reason: "Room is out of service." };
  if (room.housekeeping !== "clean" || room.status !== "available")
    return { ok: false, reason: "Room is not ready — dispatch housekeeping first." };
  const inDay = day(reservation.check_in);
  const outDay = day(reservation.check_out);
  const clash = bars.some((bar) => {
    const r = bar.reservation;
    return r.id !== reservation.id && day(r.check_in) < outDay && day(r.check_out) > inDay;
  });
  if (clash) return { ok: false, reason: "Room is already booked for those dates." };
  return { ok: true };
}

export interface RackSummary {
  available: number;
  occupied: number;
  dirty: number;
  arrivalsToday: number;
  departuresToday: number;
}

export function rackSummary(rooms: RackRoom[], reservations: RackReservation[], today: string): RackSummary {
  return {
    available: rooms.filter((r) => r.status === "available" && r.housekeeping === "clean").length,
    occupied: rooms.filter((r) => r.status === "occupied").length,
    dirty: rooms.filter((r) => r.housekeeping === "dirty" || r.status === "dirty").length,
    arrivalsToday: reservations.filter((r) => r.check_in.slice(0, 10) === today && r.status === "confirmed").length,
    departuresToday: reservations.filter((r) => r.check_out.slice(0, 10) === today && r.status === "checked_in").length,
  };
}
