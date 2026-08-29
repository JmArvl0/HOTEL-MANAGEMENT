// Behavioural cover for the inventory arithmetic behind §86 room-type availability.
// countAvailableUnits is the function getAvailability actually decides with, so these
// exercise the production rule, not a parallel reimplementation of it.
import { describe, expect, it } from "vitest";
import { countAvailableUnits, type ActiveHoldRow, type AvailabilityWindow, type BlockingReservationRow, type InventoryRoomRow } from "@/lib/booking";

const TYPE = "Deluxe King";
const NOW = "2026-09-10T08:00:00.000Z";
const TODAY = "2026-09-10";
// A stay starting tomorrow, so housekeeping has a day to turn the room over.
const future: AvailabilityWindow = { checkIn: "2026-09-15", checkOut: "2026-09-18", now: NOW, today: TODAY };
const tonight: AvailabilityWindow = { checkIn: TODAY, checkOut: "2026-09-12", now: NOW, today: TODAY };

const room = (over: Partial<InventoryRoomRow> = {}): InventoryRoomRow => ({ type: TYPE, status: "available", housekeeping: "clean", ...over });
const rooms = (count: number, over: Partial<InventoryRoomRow> = {}) => Array.from({ length: count }, () => room(over));
const reservation = (over: Partial<BlockingReservationRow> = {}): BlockingReservationRow =>
  ({ room_type: TYPE, check_in: "2026-09-15", check_out: "2026-09-18", status: "confirmed", source: "front_desk", payment_due_at: null, ...over });
const hold = (over: Partial<ActiveHoldRow> = {}): ActiveHoldRow =>
  ({ room_type: TYPE, check_in: "2026-09-15", check_out: "2026-09-18", status: "active", expires_at: "2026-09-10T08:15:00.000Z", reservation_id: null, ...over });

const count = (
  window: AvailabilityWindow,
  rows: { rooms?: InventoryRoomRow[]; reservations?: BlockingReservationRow[]; holds?: ActiveHoldRow[] },
) => countAvailableUnits(TYPE, window, { rooms: rows.rooms ?? [], reservations: rows.reservations ?? [], holds: rows.holds ?? [] });

describe("room-type availability arithmetic", () => {
  it("sells every serviceable room when nothing is booked", () =>
    expect(count(future, { rooms: rooms(4) })).toBe(4));

  it("counts only the requested room type", () =>
    expect(count(future, { rooms: [...rooms(2), room({ type: "Garden Suite" })], reservations: [reservation({ room_type: "Garden Suite" })] })).toBe(2));

  it("subtracts a reservation that overlaps the requested stay", () =>
    expect(count(future, { rooms: rooms(3), reservations: [reservation({ check_in: "2026-09-16", check_out: "2026-09-17" })] })).toBe(2));

  it("does not subtract a stay that ends on the requested check-in day", () =>
    expect(count(future, { rooms: rooms(2), reservations: [reservation({ check_in: "2026-09-12", check_out: "2026-09-15" })] })).toBe(2));

  it("does not subtract a stay that starts on the requested check-out day", () =>
    expect(count(future, { rooms: rooms(2), reservations: [reservation({ check_in: "2026-09-18", check_out: "2026-09-20" })] })).toBe(2));

  it("subtracts a stay that merely straddles one night of the window", () =>
    expect(count(future, { rooms: rooms(2), reservations: [reservation({ check_in: "2026-09-17", check_out: "2026-09-25" })] })).toBe(1));

  it("subtracts confirmed, pending and checked-in stays but not cancelled or completed ones", () => {
    const blocking = ["pending", "confirmed", "checked_in"].map((status) => reservation({ status }));
    const closed = ["cancelled", "no_show", "checked_out", "completed"].map((status) => reservation({ status }));
    expect(count(future, { rooms: rooms(4), reservations: blocking })).toBe(1);
    expect(count(future, { rooms: rooms(4), reservations: closed })).toBe(4);
  });

  it("reports the last available unit rather than rounding down to sold out", () =>
    expect(count(future, { rooms: rooms(3), reservations: [reservation(), reservation()] })).toBe(1));

  it("reports sold out when every unit is taken, and never a negative count", () => {
    expect(count(future, { rooms: rooms(2), reservations: [reservation(), reservation()] })).toBe(0);
    expect(count(future, { rooms: rooms(1), reservations: [reservation(), reservation(), reservation()] })).toBe(0);
  });

  it("excludes rooms out of service for maintenance", () =>
    expect(count(future, { rooms: [...rooms(2), room({ status: "maintenance" }), room({ status: "maintenance", housekeeping: "clean" })] })).toBe(2));

  it("sells a dirty room for a future arrival but not for tonight", () => {
    const stock = [room({ housekeeping: "clean" }), room({ housekeeping: "dirty" })];
    expect(count(future, { rooms: stock })).toBe(2);
    expect(count(tonight, { rooms: stock })).toBe(1);
  });

  it("subtracts a live hold that no reservation has consumed yet", () =>
    expect(count(future, { rooms: rooms(2), holds: [hold()] })).toBe(1));

  it("ignores an expired hold", () =>
    expect(count(future, { rooms: rooms(2), holds: [hold({ expires_at: "2026-09-10T07:59:00.000Z" })] })).toBe(2));

  it("ignores a released or abandoned hold", () =>
    expect(count(future, { rooms: rooms(2), holds: [hold({ status: "expired" }), hold({ status: "released" })] })).toBe(2));

  it("counts a hold under payment review, since that inventory is still promised", () =>
    expect(count(future, { rooms: rooms(2), holds: [hold({ status: "payment_submitted" })] })).toBe(1));

  it("does not double-count a hold already converted into its reservation", () =>
    expect(count(future, { rooms: rooms(2), reservations: [reservation({ status: "pending", source: "website", payment_due_at: "2026-09-10T08:15:00.000Z" })], holds: [hold({ reservation_id: "11111111-1111-1111-1111-111111111111" })] })).toBe(1));

  it("releases inventory from an unpaid website reservation past its payment deadline", () => {
    const expired = reservation({ status: "pending", source: "website", payment_due_at: "2026-09-10T07:45:00.000Z" });
    const live = reservation({ status: "pending", source: "website", payment_due_at: "2026-09-10T08:15:00.000Z" });
    expect(count(future, { rooms: rooms(1), reservations: [expired] })).toBe(1);
    expect(count(future, { rooms: rooms(1), reservations: [live] })).toBe(0);
  });

  it("keeps a walk-in pending reservation blocking even with no payment deadline", () =>
    expect(count(future, { rooms: rooms(1), reservations: [reservation({ status: "pending", source: "front_desk", payment_due_at: null })] })).toBe(0));

  it("subtracts reservations and holds together", () =>
    expect(count(future, { rooms: rooms(5), reservations: [reservation(), reservation()], holds: [hold()] })).toBe(2));

  it("reports sold out when the hotel has no rooms of that type at all", () =>
    expect(count(future, { rooms: [room({ type: "Garden Suite" })] })).toBe(0));
});
