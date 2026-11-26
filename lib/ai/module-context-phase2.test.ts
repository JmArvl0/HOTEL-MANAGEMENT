import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/fake-supabase";

const fake = vi.hoisted(() => ({
  db: {} as FakeDb,
  metrics: {} as Record<string, number>,
  inventory: [] as { id: string; name: string; category: string; quantity: number; reorder_point: number; unit: string }[]
}));

vi.mock("@/lib/data", () => ({ getDashboard: vi.fn(async () => ({ metrics: fake.metrics })) }));
vi.mock("@/lib/analytics/data", () => ({ getAnalyticsInputs: vi.fn(async () => ({ inventoryItems: fake.inventory })) }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase } = await import("@/lib/fake-supabase");
  return { get supabase() { return fakeSupabase(fake.db); } };
});

const { buildPhase2Context } = await import("./module-context-phase2");
const at = new Date("2026-11-21T01:00:00.000Z");
const byId = (facts: { id: string; display: string }[]) => new Map(facts.map((fact) => [fact.id, fact.display]));

beforeEach(() => {
  fake.db = {};
  fake.metrics = {
    openTasks: 4, roomsCleaning: 2, roomsAwaitingInspection: 1, overdueHousekeeping: 1,
    openMaintenance: 3, criticalMaintenance: 1, outOfServiceRooms: 2,
    pendingRefundCount: 1, outstandingBalances: 1250,
    collectionsToday: 500, refundSummary: 100
  };
  fake.inventory = [
    { id: "i1", name: "Towels", category: "linen", quantity: 0, reorder_point: 5, unit: "pcs" },
    { id: "i2", name: "Soap", category: "amenity", quantity: 2, reorder_point: 5, unit: "pcs" },
    { id: "i3", name: "Water", category: "amenity", quantity: 10, reorder_point: 5, unit: "bottles" }
  ];
});

describe("Phase 2 module contexts", () => {
  it("uses the dashboard's Housekeeping and Maintenance workload metrics", async () => {
    const housekeeping = await buildPhase2Context("housekeeping", "housekeeping", at);
    const maintenance = await buildPhase2Context("maintenance", "maintenance", at);
    expect(byId(housekeeping.facts).get("housekeeping.open_tasks")).toBe("4");
    expect(byId(housekeeping.facts).get("housekeeping.awaiting_inspection")).toBe("1");
    expect(byId(maintenance.facts).get("maintenance.open_orders")).toBe("3");
    expect(byId(maintenance.facts).get("maintenance.critical_orders")).toBe("1");
  });

  it("keeps Accounting facts aggregate and Accounting-only", async () => {
    const context = await buildPhase2Context("accounting", "accounting", at);
    expect(byId(context.facts).get("accounting.pending_refunds")).toBe("1");
    expect(byId(context.facts).get("accounting.outstanding_balances")).toContain("1,250");
    expect(JSON.stringify(context)).not.toMatch(/guest|invoice_id|payment_id/i);
  });

  it("counts inventory shortages without sending item names", async () => {
    const context = await buildPhase2Context("inventory", "maintenance", at);
    expect(byId(context.facts).get("inventory.out_of_stock")).toBe("1");
    expect(byId(context.facts).get("inventory.low_stock")).toBe("1");
    expect(JSON.stringify(context)).not.toMatch(/Towels|Soap|Water/);
  });

  it("scopes Housekeeping guest requests to its department", async () => {
    fake.db.guest_requests = [
      { id: "a", department: "housekeeping", status: "open", approval_status: "pending", escalation_status: "escalated", request: "Private guest detail" },
      { id: "b", department: "front_desk", status: "open", escalation_status: null, request: "Other private detail" }
    ];
    const context = await buildPhase2Context("guest_requests", "housekeeping", at);
    expect(byId(context.facts).get("guest_requests.open")).toBe("1");
    expect(byId(context.facts).get("guest_requests.escalated")).toBe("1");
    expect(byId(context.facts).get("guest_requests.pending_approval")).toBe("1");
    expect(JSON.stringify(context)).not.toMatch(/Private guest|Other private/);
  });

  it("summarizes Lost & Found custody without descriptions or claimant details", async () => {
    fake.db.lost_found_items = [
      { id: "d", status: "found", description: "Keys", claimant_note: "Dana" },
      { id: "a", status: "secured", description: "Gold ring", claimant_note: "Alice" },
      { id: "b", status: "claim_pending", description: "Phone", claimant_note: "Bob" },
      { id: "c", status: "release_authorized", description: "Bag", claimant_note: "Carol" }
    ];
    const context = await buildPhase2Context("lost_found", "front_desk", at);
    expect(byId(context.facts).get("lost_found.in_custody")).toBe("2");
    expect(byId(context.facts).get("lost_found.open_claims")).toBe("1");
    expect(byId(context.facts).get("lost_found.ready_for_release")).toBe("1");
    expect(JSON.stringify(context)).not.toMatch(/Keys|Dana|Gold ring|Alice|Phone|Bob|Bag|Carol/);
  });
});
