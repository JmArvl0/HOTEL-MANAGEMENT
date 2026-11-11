import { beforeEach, describe, expect, it, vi } from "vitest";

const schema = vi.hoisted(() => ({
  mode: "legacy",
  failure: null as { table: string; code: string; message: string } | null,
}));

vi.mock("@/lib/supabase", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("http://127.0.0.1:54321", "fictional-test-key", {
    auth: { persistSession: false },
    global: { fetch: async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const table = url.pathname.split("/").at(-1)!;
      const selected = url.searchParams.get("select") ?? "*";
      const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
        status, headers: { "Content-Type": "application/json" },
      });
      if (schema.failure?.table === table) return respond(schema.failure, 500);
      if (schema.mode === "legacy" && table === "housekeeping_tasks" && selected.includes("service_outcome")) {
        return respond({ code: "42703", message: "column housekeeping_tasks.service_outcome does not exist" }, 400);
      }
      if (schema.mode !== "modern" && table === "reservation_service_conditions") {
        return respond({ code: "PGRST205", message: "Could not find the table 'public.reservation_service_conditions' in the schema cache" }, 404);
      }
      if (table === "housekeeping_tasks") return respond([{
        id: "HKT-1", room_id: "RM-1", room_number: "101", task: "Stayover clean",
        task_type: "stayover_cleaning", status: "pending", priority: "normal", reservation_id: "RSV-1",
        ...(schema.mode !== "legacy" && { service_outcome: null, service_due_at: null }),
      }]);
      if (table === "rooms") return respond([{ id: "RM-1", type: "Deluxe", status: "occupied", housekeeping: "clean" }]);
      if (table === "reservations") return respond(url.searchParams.get("status") === "eq.checked_in" ? [{ id: "RSV-1", room_id: "RM-1" }] : []);
      if (table === "reservation_service_conditions") return respond([{ reservation_id: "RSV-1" }]);
      return respond([]);
    } },
  }) };
});

import { listForRole } from "@/lib/staff-data";

beforeEach(() => { schema.mode = "legacy"; schema.failure = null; });

describe("Housekeeping reads across deployed schemas", () => {
  it("loads the existing task queue before the service-instruction migration", async () => {
    const rows = await listForRole("housekeeping_tasks", "housekeeping");
    expect(rows).toMatchObject([{
      id: "HKT-1", status: "pending", room_type: "Deluxe",
      active_reservation_id: "RSV-1", service_instructions_available: false,
    }]);
  });

  it("keeps active DND information on an upgraded database", async () => {
    schema.mode = "modern";
    const rows = await listForRole("housekeeping_tasks", "housekeeping");
    expect(rows[0]).toMatchObject({ service_instructions_available: true, dnd_active: true, active_reservation_id: "RSV-1" });
  });

  it("keeps the queue available if the service-condition relation is absent", async () => {
    schema.mode = "missing_relation";
    const rows = await listForRole("housekeeping_tasks", "housekeeping");
    expect(rows[0]).toMatchObject({ id: "HKT-1", service_instructions_available: false });
  });

  it("surfaces unrelated task and service-condition errors", async () => {
    schema.failure = { table: "housekeeping_tasks", code: "42501", message: "Permission denied" };
    await expect(listForRole("housekeeping_tasks", "housekeeping")).rejects.toMatchObject({ code: "42501" });
    schema.mode = "modern";
    schema.failure = { table: "reservation_service_conditions", code: "42501", message: "Permission denied" };
    await expect(listForRole("housekeeping_tasks", "housekeeping")).rejects.toMatchObject({ code: "42501" });
  });
});
