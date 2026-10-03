import { describe, expect, it } from "vitest";
import {
  assignableCell,
  barsForRoom,
  groupRoomsByType,
  heldRoomIds,
  maintenanceBlockedRoomIds,
  rackSummary,
  roomBoardState,
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

describe("roomBoardState", () => {
  it("derives occupied from the in-house stay, not mere assignment", () => {
    const rows = [stay({ id: "s", room_id: "RM-1", status: "checked_in", check_in: "2026-09-21", check_out: "2026-09-24" })];
    const board = roomBoardState(room(), rows, "2026-09-22");
    expect(board.state).toBe("occupied");
    expect(board.stay?.id).toBe("s");
  });
  it("marks confirmed future holds reserved and keeps dirty/OOS distinct", () => {
    const rows = [stay({ id: "u", room_id: "RM-1", check_in: "2026-09-25", check_out: "2026-09-27" })];
    expect(roomBoardState(room(), rows, "2026-09-22").state).toBe("reserved");
    expect(roomBoardState(room({ housekeeping: "dirty" }), rows, "2026-09-22").state).toBe("dirty");
    expect(roomBoardState(room({ status: "maintenance" }), rows, "2026-09-22").state).toBe("out_of_service");
    expect(roomBoardState(room({ administratively_active: false }), rows, "2026-09-22").state).toBe("out_of_service");
    expect(roomBoardState(room(), [], "2026-09-22").state).toBe("available");
  });
});

describe("groupRoomsByType", () => {
  it("groups live types in first-seen order, sorted by floor then number", () => {
    const rows = [room({ id: "b", number: "102", type: "Suite" }), room({ id: "a", number: "101" }), room({ id: "c", number: "201" })];
    const groups = groupRoomsByType(rows);
    expect(groups.map((g) => g.type)).toEqual(["Suite", "Deluxe King"]);
    expect(groups[1].rooms.map((r) => r.number)).toEqual(["101", "201"]);
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
  it("excludes rooms holding arrivals and blocked rooms from available (MGR-001/MGR-002)", () => {
    const rooms = [
      room({ id: "a", status: "available", housekeeping: "clean" }),
      room({ id: "b", status: "available", housekeeping: "clean" }),
      room({ id: "c", status: "available", housekeeping: "clean" }),
    ];
    const reservations = [
      stay({ id: "hold", room_id: "b", check_in: "2026-09-22", check_out: "2026-09-24", status: "confirmed" }),
    ];
    // Held room b is reserved, not available — the board and the summary agree.
    expect(rackSummary(rooms, reservations, "2026-09-22").available).toBe(2);
    expect(rackSummary(rooms, reservations, "2026-09-22", new Set(["c"])).available).toBe(1);
  });
});

describe("maintenanceBlockedRoomIds", () => {
  const rooms = [room({ id: "RM-1", number: "101" }), room({ id: "RM-2", number: "102" })];
  const order = (overrides: object = {}) => ({
    room_id: null,
    room_number: null,
    status: "open",
    serviceability_impact: "blocked",
    ...overrides,
  });
  it("matches linked orders by room id", () => {
    expect([...maintenanceBlockedRoomIds([order({ room_id: "RM-1" })], rooms)]).toEqual(["RM-1"]);
  });
  it("falls back to room number when the order carries no room link (MGR-002)", () => {
    expect([...maintenanceBlockedRoomIds([order({ room_number: "102" })], rooms)]).toEqual(["RM-2"]);
  });
  it("ignores inactive orders, non-blocking diagnoses, and unknown numbers", () => {
    const orders = [
      order({ room_id: "RM-1", status: "resolved" }),
      order({ room_id: "RM-1", serviceability_impact: "serviceable" }),
      order({ room_number: "999" }),
    ];
    expect(maintenanceBlockedRoomIds(orders, rooms).size).toBe(0);
  });
});

describe("heldRoomIds", () => {
  it("derives arrival holds exactly the way the board renders reserved (MGR-001)", () => {
    const rows = [
      stay({ id: "hold", room_id: "RM-1", check_in: "2026-09-22", check_out: "2026-09-24", status: "confirmed" }),
      stay({ id: "unassigned", check_in: "2026-09-22", check_out: "2026-09-24", status: "confirmed" }),
      stay({ id: "past", room_id: "RM-2", check_in: "2026-09-18", check_out: "2026-09-20", status: "confirmed" }),
      stay({ id: "stay", room_id: "RM-3", check_in: "2026-09-21", check_out: "2026-09-24", status: "checked_in" }),
      stay({ id: "also-held", room_id: "RM-3", check_in: "2026-09-25", check_out: "2026-09-27", status: "confirmed" }),
    ];
    // Hold without a room, departed hold, and a room with an in-house stay never count.
    expect([...heldRoomIds(rows, "2026-09-22")]).toEqual(["RM-1"]);
  });
});

describe("roomBoardState blocked precedence (MGR-002)", () => {
  it("shows out of service for a blocked room that still reads clean+available", () => {
    const rows = [stay({ id: "u", room_id: "RM-1", check_in: "2026-09-25", check_out: "2026-09-27" })];
    expect(roomBoardState(room(), rows, "2026-09-22", new Set(["RM-1"])).state).toBe("out_of_service");
    expect(roomBoardState(room(), [], "2026-09-22", new Set(["RM-1"])).state).toBe("out_of_service");
  });
  it("keeps an in-house stay above the block and stays silent without the set", () => {
    const rows = [stay({ id: "s", room_id: "RM-1", status: "checked_in", check_in: "2026-09-21", check_out: "2026-09-24" })];
    expect(roomBoardState(room(), rows, "2026-09-22", new Set(["RM-1"])).state).toBe("occupied");
    expect(roomBoardState(room(), rows, "2026-09-22").state).toBe("occupied");
  });
});
