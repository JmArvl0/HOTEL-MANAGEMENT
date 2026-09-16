// Pre-arrival inventory request options: eligibility rules, Manager-only
// governance, submit-time validation, and exact-match fulfillment.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/fake-supabase";

const fake = vi.hoisted(() => ({ db: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase: make } = await import("@/lib/fake-supabase");
  return { supabase: make(fake.db as FakeDb) };
});

const {
  canConfigurePreArrival,
  findUnavailableSelections,
  getPreArrivalOptions,
  preArrivalServices,
  resolvePreArrivalAmenities,
} = await import("@/lib/inventory-request-options");
const { logGuestRequestConsumption } = await import("@/lib/inventory-movements");

const resetDb = () => {
  for (const key of Object.keys(fake.db)) delete fake.db[key];
};

const catalogRow = (over: Record<string, unknown> = {}) => ({
  value: "extra_towels",
  label: "Extra towels",
  active: true,
  inventory_item_id: "ITM-1",
  pre_arrival_requestable: true,
  ...over,
});
const stockRow = (over: Record<string, unknown> = {}) => ({ id: "ITM-1", quantity: 24, ...over });

describe("resolvePreArrivalAmenities", () => {
  it("offers a Manager-enabled item while stock is available", () => {
    expect(resolvePreArrivalAmenities([catalogRow()], [stockRow()])).toEqual([
      { value: "extra_towels", label: "Extra towels", inventoryItemId: "ITM-1" },
    ]);
  });

  it("hides Manager-disabled items even with stock on hand", () => {
    expect(
      resolvePreArrivalAmenities([catalogRow({ pre_arrival_requestable: false })], [stockRow()])
    ).toEqual([]);
  });

  it("hides zero, negative, and invalid stock even when enabled", () => {
    for (const quantity of [0, -3, null, "n/a"]) {
      expect(
        resolvePreArrivalAmenities([catalogRow()], [stockRow({ quantity })])
      ).toEqual([]);
    }
  });

  it("hides unlinked rows and restores them when stock returns", () => {
    expect(resolvePreArrivalAmenities([catalogRow({ inventory_item_id: null })], [stockRow()])).toEqual([]);
    expect(resolvePreArrivalAmenities([catalogRow()], [])).toEqual([]);
    // Restock: the same row is offered again on the next load.
    expect(resolvePreArrivalAmenities([catalogRow()], [stockRow({ quantity: 10 })])).toHaveLength(1);
  });

  it("ignores stale status display state — quantity alone decides", () => {
    // A row marked display-'out' with real quantity is still offered; an
    // 'healthy' row at zero is not. Status is never read here by design.
    expect(resolvePreArrivalAmenities([catalogRow()], [stockRow({ quantity: 5 })])).toHaveLength(1);
    expect(resolvePreArrivalAmenities([catalogRow()], [stockRow({ quantity: 0 })])).toHaveLength(0);
  });
});

describe("preArrivalServices", () => {
  it("keeps high floor, early check-in, and celebration outside inventory", () => {
    expect(preArrivalServices().map((option) => option.value)).toEqual([
      "high_floor_quiet",
      "early_check_in",
      "celebration",
    ]);
  });
});

describe("findUnavailableSelections", () => {
  const live = {
    amenities: [{ value: "extra_towels", label: "Extra towels", inventoryItemId: "ITM-1" }],
    services: [{ value: "early_check_in", label: "Early check-in request" }],
  };

  it("accepts offered amenities and services, rejects everything else", () => {
    expect(findUnavailableSelections(["extra_towels", "early_check_in"], live)).toEqual([]);
    expect(findUnavailableSelections(["extra_towels", "extra_pillows"], live)).toEqual(["extra_pillows"]);
  });

  it("rejects arbitrary inventory item IDs outright", () => {
    expect(findUnavailableSelections(["ITM-1", "ITM-9'; DROP TABLE"], live)).toEqual([
      "ITM-1",
      "ITM-9'; DROP TABLE",
    ]);
  });
});

describe("canConfigurePreArrival", () => {
  it("allows only the Manager role", () => {
    expect(canConfigurePreArrival("manager")).toBe(true);
    for (const role of ["owner", "admin", "front_desk", "housekeeping", "maintenance", "accounting", "guest", ""]) {
      expect(canConfigurePreArrival(role)).toBe(false);
    }
  });
});

describe("getPreArrivalOptions", () => {
  beforeEach(resetDb);

  it("serves live amenities with labels only — never stock quantities", async () => {
    fake.db.guest_request_catalog = [catalogRow()];
    fake.db.inventory = [stockRow()];
    const live = await getPreArrivalOptions();
    expect(live.amenities).toEqual([
      { value: "extra_towels", label: "Extra towels", inventoryItemId: "ITM-1" },
    ]);
    expect(JSON.stringify(live)).not.toContain("24");
    expect(live.services.map((option) => option.value)).toContain("early_check_in");
  });

  it("renders no dummy amenities when the API data is missing", async () => {
    const live = await getPreArrivalOptions();
    expect(live.amenities).toEqual([]);
    // Services stand on their own source.
    expect(live.services).toHaveLength(3);
  });
});

describe("logGuestRequestConsumption", () => {
  beforeEach(resetDb);

  it("consumes the exact linked item for new requests", async () => {
    fake.db.guest_requests = [{ id: "gr-1", request_type: "extra_towels", inventory_item_id: "ITM-1" }];
    fake.db.inventory = [{ id: "ITM-1", name: "Bath towels", quantity: 24 }];
    await logGuestRequestConsumption("gr-1", "staff-1");
    expect(Number(fake.db.inventory[0].quantity)).toBe(23);
    expect(fake.db.inventory_movements).toHaveLength(1);
    expect(fake.db.inventory_movements[0]).toMatchObject({
      item_id: "ITM-1",
      direction: "consumption",
      source_id: "gr-1",
    });
  });

  it("skips consumption when stock changed since booking — never negative", async () => {
    fake.db.guest_requests = [{ id: "gr-2", request_type: "extra_towels", inventory_item_id: "ITM-1" }];
    fake.db.inventory = [{ id: "ITM-1", name: "Bath towels", quantity: 0 }];
    await logGuestRequestConsumption("gr-2", "staff-1");
    expect(Number(fake.db.inventory[0].quantity)).toBe(0);
    expect(fake.db.inventory_movements ?? []).toHaveLength(0);
  });

  it("keeps the name-matching fallback for legacy rows without the FK", async () => {
    fake.db.guest_requests = [{ id: "gr-3", request_type: "extra_towels", inventory_item_id: null }];
    fake.db.inventory = [{ id: "ITM-1", name: "Bath towels", quantity: 10 }];
    await logGuestRequestConsumption("gr-3", "staff-1");
    expect(Number(fake.db.inventory[0].quantity)).toBe(8);
  });
});
