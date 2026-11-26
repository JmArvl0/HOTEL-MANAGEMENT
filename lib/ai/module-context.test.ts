import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsInputs } from "@/lib/analytics/data";

const mocks = vi.hoisted(() => ({
  inputs: {} as AnalyticsInputs,
  requests: { open: 0, byDepartment: {}, escalated: 0 },
  transport: { pending: 0, byServiceType: {} }
}));

vi.mock("@/lib/analytics/data", () => ({ getAnalyticsInputs: vi.fn(async () => mocks.inputs) }));
vi.mock("@/lib/ai/tools", () => ({
  guestRequestSummary: vi.fn(async () => mocks.requests),
  transportationSummary: vi.fn(async () => mocks.transport)
}));

const { buildFrontDeskContext } = await import("./module-context");

const TODAY = "2026-11-18";

beforeEach(() => {
  mocks.inputs = {
    today: TODAY,
    reservations: [
      { id: "r1", status: "confirmed", check_in: TODAY, check_out: "2026-11-20", created_at: "2026-11-10T00:00:00Z" },
      { id: "r2", status: "checked_in", check_in: "2026-11-17", check_out: TODAY, created_at: "2026-11-09T00:00:00Z" },
      { id: "r3", status: "confirmed", check_in: "2026-11-19", check_out: "2026-11-21", created_at: "2026-11-11T00:00:00Z" },
      { id: "r4", status: "cancelled", check_in: TODAY, check_out: "2026-11-20", created_at: "2026-11-01T00:00:00Z" }
    ],
    rooms: [
      { id: "1", number: "101", status: "occupied" },
      { id: "2", number: "102", status: "available", housekeeping: "clean" },
      { id: "3", number: "103", status: "dirty" },
      { id: "4", number: "104", status: "maintenance" },
      { id: "5", number: "105", status: "available", administratively_active: false }
    ],
    tasks: [],
    orders: [
      { id: "o1", room_number: "104", status: "in_progress", created_at: "2026-11-17T00:00:00Z" },
      { id: "o2", room_number: "101", status: "resolved", created_at: "2026-11-16T00:00:00Z" }
    ],
    inventoryItems: [],
    movements: [],
    inspectionRequired: true,
    databaseMode: "demo"
  };
  mocks.requests = { open: 4, byDepartment: { front_desk: 2, housekeeping: 2 }, escalated: 1 };
  mocks.transport = { pending: 2, byServiceType: { airport: 2 } };
});

describe("buildFrontDeskContext", () => {
  it("emits stable fact IDs with authoritative values", async () => {
    const context = await buildFrontDeskContext(new Date("2026-11-18T01:02:03.000Z"));
    const byId = new Map(context.facts.map((fact) => [fact.id, fact]));

    expect(context.moduleId).toBe("front_desk");
    expect(context.generatedAt).toBe("2026-11-18T01:02:03.000Z");
    expect([...byId.keys()]).toEqual([
      "front_desk.date",
      "front_desk.arrivals_today",
      "front_desk.departures_today",
      "front_desk.arrivals_tomorrow",
      "front_desk.departures_tomorrow",
      "front_desk.in_house",
      "front_desk.rooms_ready",
      "front_desk.rooms_dirty",
      "front_desk.rooms_maintenance",
      "front_desk.occupancy_tonight",
      "front_desk.occupancy_tomorrow",
      "front_desk.guest_requests_open",
      "front_desk.guest_requests_escalated",
      "front_desk.transportation_pending",
      "front_desk.maintenance_open"
    ]);
    expect(byId.get("front_desk.date")?.display).toBe(TODAY);
    expect(byId.get("front_desk.arrivals_today")?.display).toBe("1");
    expect(byId.get("front_desk.departures_today")?.display).toBe("1");
    expect(byId.get("front_desk.arrivals_tomorrow")?.display).toBe("1");
    expect(byId.get("front_desk.departures_tomorrow")?.display).toBe("0");
    expect(byId.get("front_desk.in_house")?.display).toBe("1");
    expect(byId.get("front_desk.rooms_ready")?.display).toBe("1");
    expect(byId.get("front_desk.rooms_dirty")?.display).toBe("1");
    expect(byId.get("front_desk.rooms_maintenance")?.display).toBe("1");
    expect(byId.get("front_desk.guest_requests_open")?.display).toBe("4");
    expect(byId.get("front_desk.guest_requests_escalated")?.display).toBe("1");
    expect(byId.get("front_desk.transportation_pending")?.display).toBe("2");
    expect(byId.get("front_desk.maintenance_open")?.display).toBe("1");
  });

  it("labels HAVEN's occupancy output FACT or PREDICTION without inventing a forecast", async () => {
    const context = await buildFrontDeskContext(new Date("2026-11-18T01:02:03.000Z"));
    const byId = new Map(context.facts.map((fact) => [fact.id, fact]));

    expect(byId.get("front_desk.occupancy_tonight")?.basis).toBe("FACT");
    expect(byId.get("front_desk.occupancy_tonight")?.display).toContain("% booked");
    expect(byId.get("front_desk.occupancy_tomorrow")?.basis).toBe("PREDICTION");
    expect(byId.get("front_desk.occupancy_tomorrow")?.note).toMatch(/data quality|history/i);
  });

  it("does not count an available room held for a confirmed arrival as ready", async () => {
    Object.assign(mocks.inputs.rooms[1], { housekeeping: "clean", type: "Deluxe", floor: 1 });
    Object.assign(mocks.inputs.reservations[0], { room_id: "2", room_type: "Deluxe" });

    const context = await buildFrontDeskContext(new Date("2026-11-18T01:02:03.000Z"));
    expect(context.facts.find((fact) => fact.id === "front_desk.rooms_ready")?.display).toBe("0");
  });

  it("contains only aggregate operational facts, never guest or free-text fields", async () => {
    const context = await buildFrontDeskContext(new Date("2026-11-18T01:02:03.000Z"));
    for (const fact of context.facts) {
      expect(Object.keys(fact).sort()).toEqual(
        expect.arrayContaining(["asOf", "basis", "display", "id", "label", "source"])
      );
    }
    const serialized = JSON.stringify(context);
    expect(serialized).not.toMatch(/guest_name|email|phone|identity|payment|claimant|description|special_requests/i);
  });
});
