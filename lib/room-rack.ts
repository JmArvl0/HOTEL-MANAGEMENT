/**
 * Pure board helpers for the Room Reservations view.
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
  /** Semantic badge color key from room_types (null = uncolored type). */
  room_type_color?: string | null;
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

export type RackBoardState = "available" | "occupied" | "dirty" | "out_of_service" | "reserved";

/** Minimal maintenance-order shape for the blocked-room derivation. */
export interface BlockingOrder {
  room_id?: unknown;
  room_number?: unknown;
  status?: unknown;
  serviceability_impact?: unknown;
}

const ACTIVE_MAINTENANCE = new Set(["open", "assigned", "in_progress", "waiting_parts", "deferred"]);
const BLOCKING_IMPACTS = new Set(["blocked", "out_of_service"]);

/**
 * Rooms Maintenance has blocked (MGR-002): active orders with a blocking
 * diagnosis. Orders linked by room_id win; orders carrying only a room
 * number fall back to a number match, so an unlinked order can never hide
 * from readiness counts, the board, or assignment gates.
 */
export function maintenanceBlockedRoomIds(
  orders: BlockingOrder[],
  rooms: { id: string; number?: unknown }[]
): Set<string> {
  const byNumber = new Map(
    rooms.map((room) => [String(room.number ?? "").trim().toLowerCase(), room.id])
  );
  const blocked = new Set<string>();
  for (const order of orders) {
    if (!ACTIVE_MAINTENANCE.has(String(order.status))) continue;
    if (!BLOCKING_IMPACTS.has(String(order.serviceability_impact))) continue;
    if (order.room_id) blocked.add(String(order.room_id));
    else if (order.room_number) {
      const id = byNumber.get(String(order.room_number).trim().toLowerCase());
      if (id) blocked.add(id);
    }
  }
  return blocked;
}

/**
 * Rooms held for arrivals (MGR-001): confirmed stays with a room assignment
 * whose checkout is after today, on rooms without an in-house stay — the
 * same derivation the board renders as "reserved", so counts built from
 * this set can never disagree with the board.
 */
export function heldRoomIds(reservations: RackReservation[], today: string): Set<string> {
  const inHouse = new Set(
    reservations
      .filter((r) => r.room_id && r.status === "checked_in")
      .map((r) => String(r.room_id))
  );
  return new Set(
    reservations
      .filter(
        (r) =>
          r.room_id &&
          r.status === "confirmed" &&
          r.check_out.slice(0, 10) > today &&
          !inHouse.has(String(r.room_id))
      )
      .map((r) => String(r.room_id))
  );
}

/**
 * Board state for one room card, derived from the same authoritative fields
 * the tape chart and assign gates use — never from reservation presence
 * alone. Precedence: retired/OOS > dirty > in-house stay > upcoming hold >
 * clean+available. Availability and assignment stay distinct concepts.
 */
export function roomBoardState(
  room: RackRoom,
  reservations: RackReservation[],
  today: string,
  blockedIds?: Set<string> | null
): { state: RackBoardState; stay: RackReservation | null; upcoming: RackReservation | null } {
  if (
    room.administratively_active === false ||
    room.status === "maintenance" ||
    room.housekeeping === "reclean_required"
  )
    return { state: "out_of_service", stay: null, upcoming: null };
  if (room.housekeeping === "dirty" || room.status === "dirty")
    return { state: "dirty", stay: null, upcoming: null };
  const mine = reservations.filter(
    (r) => r.room_id === room.id && (r.status === "confirmed" || r.status === "checked_in")
  );
  const stay = mine.find((r) => r.status === "checked_in" && r.check_in.slice(0, 10) <= today && r.check_out.slice(0, 10) > today)
    ?? mine.find((r) => r.status === "checked_in")
    ?? null;
  if (stay) return { state: "occupied", stay, upcoming: null };
  // MGR-002: a Maintenance-blocked room is never reservable or ready, even
  // when its stored status/housekeeping still read clean+available. An
  // in-house stay keeps precedence above (the guest is physically there).
  if (blockedIds?.has(room.id)) return { state: "out_of_service", stay: null, upcoming: null };
  const upcoming = mine
    .filter((r) => r.status === "confirmed" && r.check_out.slice(0, 10) > today)
    .sort((a, b) => (a.check_in < b.check_in ? -1 : 1))[0] ?? null;
  if (upcoming) return { state: "reserved", stay: null, upcoming };
  if (room.status === "available" && room.housekeeping === "clean")
    return { state: "available", stay: null, upcoming: null };
  return { state: "reserved", stay: null, upcoming };
}

/** Board grouping: live room types in first-seen order (never hardcoded). */
export function groupRoomsByType(rooms: RackRoom[]): { type: string; rooms: RackRoom[] }[] {
  const groups = new Map<string, RackRoom[]>();
  for (const room of rooms) {
    const key = room.type || "Unspecified";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(room);
  }
  return [...groups.entries()].map(([type, list]) => ({
    type,
    rooms: [...list].sort((a, b) => String(a.floor ?? "").localeCompare(String(b.floor ?? ""), undefined, { numeric: true }) || String(a.number).localeCompare(String(b.number), undefined, { numeric: true })),
  }));
}

export interface RackSummary {
  available: number;
  occupied: number;
  dirty: number;
  arrivalsToday: number;
  departuresToday: number;
}

export function rackSummary(
  rooms: RackRoom[],
  reservations: RackReservation[],
  today: string,
  blockedIds?: Set<string> | null
): RackSummary {
  // MGR-001: a room holding an arrival (or Maintenance-blocked) is not
  // available, even when its stored status still reads clean+available.
  const held = heldRoomIds(reservations, today);
  const ready = (room: RackRoom) =>
    room.status === "available" &&
    room.housekeeping === "clean" &&
    !held.has(room.id) &&
    !blockedIds?.has(room.id);
  return {
    available: rooms.filter(ready).length,
    occupied: rooms.filter((r) => r.status === "occupied").length,
    dirty: rooms.filter((r) => r.housekeeping === "dirty" || r.status === "dirty").length,
    arrivalsToday: reservations.filter((r) => r.check_in.slice(0, 10) === today && r.status === "confirmed").length,
    departuresToday: reservations.filter((r) => r.check_out.slice(0, 10) === today && r.status === "checked_in").length,
  };
}
