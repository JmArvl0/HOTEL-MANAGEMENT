import { describe, expect, it } from "vitest";
import {
  assignableCell,
  barsForRoom,
  rackSummary,
  unassignedArrivals,
  windowDays,
  type RackReservation,
  type RackRoom,
} from "@/lib/room-rack";

const room = (overrides: Partial<RackRoom> = {}): RackRoom => ({
  id: "RM-1",
  number: "101",
  floor: 1,
  wing: null,
  type: "Deluxe King",
  status: "available",
  housekeeping: "clean",
  ...overrides,
});

const stay = (overrides: Partial<RackReservation> = {}): RackReservation => ({
  id: "RSV-1",
  guest_name: "Guest",
  room_type: "Deluxe King",
  room_id: null,
  check_in: "2026-09-22",
  check_out: "2026-09-24",
  status: "confirmed",
  ...overrides,
});

describe("windowDays", () => {
  it("builds a rolling ISO day list", () => {
    expect(windowDays("2026-09-22", 3)).toEqual(["2026-09-22", "2026-09-23", "2026-09-24"]);
  });
});

describe("unassignedArrivals", () => {
  it("keeps confirmed stays without a room only", () => {
    const rows = [
      stay({ id: "a" }),
      stay({ id: "b", room_id: "RM-1" }),
      stay({ id: "c", status: "checked_in", room_id: "RM-2" }),
      stay({ id: "d", status: "pending" }),
    ];
    expect(unassignedArrivals(rows).map((r) => r.id)).toEqual(["a"]);
  });
});

describe("barsForRoom", () => {
  it("clamps bars to the window and drops other rooms", () => {
    const rows = [
      stay({ id: "in", room_id: "RM-1", check_in: "2026-09-21", check_out: "2026-09-23" }),
      stay({ id: "full", room_id: "RM-1", check_in: "2026-09-23", check_out: "2026-09-25" }),
      stay({ id: "other", room_id: "RM-2", check_in: "2026-09-22", check_out: "2026-09-23" }),
      stay({ id: "cancelled", room_id: "RM-1", check_in: "2026-09-22", check_out: "2026-09-23", status: "cancelled" }),
    ];
    const bars = barsForRoom(rows, "RM-1", "2026-09-22", 7);
    expect(bars.map((b) => [b.reservation.id, b.start, b.span])).toEqual([
      ["in", 0, 1],
      ["full", 1, 2],
    ]);
  });
});

describe("assignableCell", () => {
  it("accepts a clean available same-type room with no clash", () => {
    expect(assignableCell(room(), stay(), [])).toEqual({ ok: true });
  });
  it("refuses dirty, maintenance, retired, and wrong-type rooms", () => {
    expect(assignableCell(room({ housekeeping: "dirty" }), stay(), []).ok).toBe(false);
    expect(assignableCell(room({ status: "maintenance" }), stay(), []).ok).toBe(false);
    expect(assignableCell(room({ administratively_active: false }), stay(), []).ok).toBe(false);
    const wrong = assignableCell(room({ type: "Suite" }), stay(), []);
    expect(wrong.ok).toBe(false);
    expect(String((wrong as { reason: string }).reason)).toContain("Deluxe King");
  });
  it("refuses overlapping stays on the same room", () => {
    const bars = barsForRoom(
      [stay({ id: "live", room_id: "RM-1", check_in: "2026-09-23", check_out: "2026-09-26", status: "checked_in" })],
      "RM-1",
      "2026-09-22",
      7
    );
    const blocked = assignableCell(room(), stay({ id: "new" }), bars);
    expect(blocked.ok).toBe(false);
    const clear = assignableCell(room(), stay({ id: "new", check_in: "2026-09-26", check_out: "2026-09-28" }), bars);
    expect(clear).toEqual({ ok: true });
  });
});

describe("rackSummary", () => {
  it("counts readiness and today's movements", () => {
    const rooms = [
      room({ id: "a", status: "available", housekeeping: "clean" }),
      room({ id: "b", status: "occupied", housekeeping: "clean" }),
      room({ id: "c", status: "dirty", housekeeping: "dirty" }),
    ];
    const reservations = [
      stay({ id: "arr", check_in: "2026-09-22", status: "confirmed" }),
      stay({ id: "dep", check_in: "2026-09-20", check_out: "2026-09-22", status: "checked_in", room_id: "b" }),
    ];
    expect(rackSummary(rooms, reservations, "2026-09-22")).toEqual({
      available: 1,
      occupied: 1,
      dirty: 1,
      arrivalsToday: 1,
      departuresToday: 1,
    });
  });
});
