// The Ask HAVEN tool registry: a fixed list of named read-only tools returning
// aggregated, PII-free payloads. No generic SQL tool exists or can be smuggled in.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeDb } from "@/lib/fake-supabase";
import { hotelToday } from "@/lib/booking";
import { shiftDate } from "@/lib/analytics/types";

const fake = vi.hoisted(() => ({ db: {} as FakeDb }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase: make } = await import("@/lib/fake-supabase");
  return { supabase: make(fake.db) };
});

const { AI_TOOLS, aiToolDeclarations, executeAiTool } = await import("@/lib/ai/tools");

const TODAY = hotelToday();
// A guest PII marker planted in the fixture rows: if any tool output ever
// contains it, the aggregation is leaking guest data to Gemini.
const PII_MARKER = "Juan Delacruz";
const PII_EMAIL = "juan.delacruz@example.com";

function seed(): FakeDb {
  return {
    reservations: [
      { id: "res-1", status: "confirmed", check_in: TODAY, check_out: shiftDate(TODAY, 2), created_at: `${TODAY}T01:00:00Z`, room_type: "Deluxe King", guests: 2, guest_name: PII_MARKER, email: PII_EMAIL },
      { id: "res-2", status: "checked_in", check_in: shiftDate(TODAY, -1), check_out: shiftDate(TODAY, 1), created_at: `${shiftDate(TODAY, -1)}T01:00:00Z`, room_type: "Twin", guests: 1, guest_name: PII_MARKER },
      { id: "res-3", status: "cancelled", check_in: TODAY, check_out: shiftDate(TODAY, 1), created_at: `${TODAY}T02:00:00Z`, room_type: "Twin", guests: 1, guest_name: PII_MARKER }
    ],
    rooms: [
      { id: "room-1", number: "101", status: "occupied", administratively_active: true },
      { id: "room-2", number: "102", status: "available", administratively_active: true },
      { id: "room-3", number: "103", status: "available", administratively_active: false } // retired — never counted
    ],
    housekeeping_tasks: [],
    maintenance_orders: [],
    inventory: [],
    inventory_movements: [],
    hotel_operational_policies: [{ key: "default", housekeeping_inspection_required: true }],
    guest_requests: [
      { department: "housekeeping", status: "open", escalation_status: "normal" },
      { department: "housekeeping", status: "in_progress", escalation_status: "escalated" },
      { department: "maintenance", status: "open", escalation_status: "normal" },
      { department: "front_desk", status: "resolved", escalation_status: "normal" } // not open — excluded
    ],
    transportation_requests: [
      { service_type: "airport_pickup", status: "REQUESTED" },
      { service_type: "airport_pickup", status: "REQUESTED" },
      { service_type: "city_tour", status: "COMPLETED" } // not pending — excluded
    ]
  };
}

beforeEach(() => {
  for (const key of Object.keys(fake.db)) delete (fake.db as Record<string, unknown>)[key];
  Object.assign(fake.db, seed());
});

describe("the registry itself", () => {
  it("is a fixed list of named read-only summary tools", () => {
    expect(Object.keys(AI_TOOLS).sort()).toEqual([
      "getArrivalsSummary", "getDeparturesSummary", "getGuestRequestSummary", "getHousekeepingForecast",
      "getInventoryRiskSummary", "getMaintenanceRiskSummary", "getOccupancyForecast", "getOperationalSummary", "getTransportationSummary"
    ]);
  });

  it("exposes no generic SQL or arbitrary query capability", () => {
    const serialized = JSON.stringify(aiToolDeclarations());
    expect(serialized).not.toMatch(/sql|select \*|arbitrary|freeform/i);
    for (const declaration of aiToolDeclarations()) {
      expect(declaration.parameters).toEqual({ type: "OBJECT", properties: {} }); // every tool takes zero parameters — nothing injectable
    }
  });

  it("refuses unknown tool names", async () => {
    await expect(executeAiTool("dropReservations")).rejects.toThrow(/Unknown AI tool/);
  });
});

describe("tool payloads — aggregated, PII-free", () => {
  it("getArrivalsSummary counts by date and room type, never by guest", async () => {
    const output = await executeAiTool("getArrivalsSummary");
    expect(output).toMatchObject({ totalTodayAndTomorrow: 1 }); // cancelled row excluded
    expect(JSON.stringify(output)).not.toContain(PII_MARKER);
    expect(JSON.stringify(output)).not.toContain(PII_EMAIL);
  });

  it("getOperationalSummary reports room counts with retired rooms excluded", async () => {
    const output = await executeAiTool("getOperationalSummary");
    expect(output).toMatchObject({ occupiedNow: 1, arrivalsToday: 1, openMaintenance: 0 });
    expect(JSON.stringify(output)).not.toContain(PII_MARKER);
  });

  it("getGuestRequestSummary aggregates open requests by department and escalation", async () => {
    const output = await executeAiTool("getGuestRequestSummary");
    expect(output).toMatchObject({ open: 3, escalated: 1 });
    expect(JSON.stringify(output)).not.toContain(PII_MARKER);
  });

  it("getTransportationSummary aggregates pending requests by service type", async () => {
    const output = await executeAiTool("getTransportationSummary");
    expect(output).toMatchObject({ pending: 2 });
  });

  it("getOccupancyForecast returns HAVEN's own forecast structure with honest quality labels", async () => {
    const output = (await executeAiTool("getOccupancyForecast")) as { days: { date: string; knownOccupied: number; dataQuality: string }[]; method: string };
    expect(output.days).toHaveLength(7);
    expect(output.days[0].knownOccupied).toBe(2); // confirmed + checked_in cover tonight
    expect(output.method).toContain("Known booked occupancy");
    expect(JSON.stringify(output)).not.toContain(PII_MARKER);
  });
});
