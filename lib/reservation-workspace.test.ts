import { describe, expect, it } from "vitest";
import { inReservationQueue, reservationNextAction, reservationOverlapsWindow, reservationPreview } from "./reservation-workspace";
import type { RackReservation, RackRoom } from "./room-rack";

const today = "2026-11-04";
const stay: RackReservation = { id: "r", room_type: "Deluxe", check_in: today, check_out: "2026-11-06", status: "confirmed", room_id: "room", identity_status: "verified", payment_status: "paid" };
const room: RackRoom = { id: "room", number: "101", type: "Deluxe", floor: 1, status: "available", housekeeping: "clean" };

describe("reservation workspace", () => {
  it("treats checkout as exclusive when applying a selected date window", () => {
    expect(reservationOverlapsWindow({ ...stay, check_in: "2026-11-01", check_out: today }, today, today)).toBe(false);
    expect(reservationOverlapsWindow({ ...stay, check_in: today, check_out: "2026-11-05" }, today, today)).toBe(true);
  });
  it("keeps active arrival/departure counts separate from closed stays", () => {
    expect(inReservationQueue(stay, "arrivals", today)).toBe(true);
    for (const status of ["checked_out", "cancelled", "no_show"]) {
      const closed = { ...stay, status, check_out: today };
      expect(inReservationQueue(closed, "closed", today)).toBe(true);
      expect(inReservationQueue(closed, "arrivals", today)).toBe(false);
      expect(inReservationQueue(closed, "departures", today)).toBe(false);
      expect(reservationPreview(closed, [room], new Set(), today)).toEqual([]);
    }
    expect(inReservationQueue({ ...stay, status: "checked_in", check_out: today }, "departures", today)).toBe(true);
  });
  it("surfaces inspection, administrative and maintenance blocks without claiming final readiness", () => {
    expect(reservationPreview(stay, [{ ...room, housekeeping: "inspection" }], new Set(), today)).toContain("Room not ready");
    expect(reservationPreview(stay, [{ ...room, administratively_active: false }], new Set(), today)).toContain("Room not ready");
    expect(reservationPreview(stay, [room], new Set(["room"]), today)).toContain("Maintenance block");
    expect(reservationPreview(stay, [room], new Set(), today)).toEqual([]);
  });
  it("keeps future arrivals and oversight out of direct check-in actions", () => {
    expect(reservationNextAction(stay, false, today)).toBe("View");
    expect(reservationNextAction({ ...stay, check_in: "2026-11-05" }, true, today)).toBe("View reservation");
    expect(reservationNextAction({ ...stay, room_id: null }, true, today)).toBe("Assign room");
    expect(reservationNextAction(stay, true, today)).toBe("Start check-in");
  });
  it("flags overdue departures and positive balances but does not invent a missing balance", () => {
    expect(reservationPreview({ ...stay, status: "checked_in", check_out: "2026-11-03", folio_balance: 100 }, [room], new Set(), today)).toEqual(["Overdue checkout", "Balance due"]);
    expect(reservationPreview({ ...stay, status: "checked_in", folio_balance: null }, [room], new Set(), today)).toEqual([]);
  });
});
