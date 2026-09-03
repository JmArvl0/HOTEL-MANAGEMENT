import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260831010000_maintenance_operational_workflow.sql");
const genericRoute = read("app/api/resources/[resource]/route.ts");
const actionRoute = read("app/api/maintenance/orders/[id]/[action]/route.ts");
const createRoute = read("app/api/maintenance/orders/route.ts");
const eligibleRooms = read("app/api/front-desk/reservations/[id]/eligible-rooms/route.ts");
const dashboard = read("components/manager/manager-dashboard-client.tsx");

describe("Maintenance ownership and least privilege", () => {
  it("blocks generic work-order mutation and uses protected RPC routes", () => {
    expect(genericRoute).toContain('resource==="maintenance_orders"');
    expect(genericRoute).not.toContain('rpc("resolve_maintenance_order"');
    expect(createRoute).toContain('rpc("maintenance_create_work_order"');
    for (const rpc of ["maintenance_assign_work_order", "maintenance_start_work_order", "maintenance_record_diagnosis", "maintenance_defer_work_order", "maintenance_add_progress", "maintenance_resolve_work_order", "maintenance_close_work_order", "maintenance_cancel_work_order"]) expect(actionRoute).toContain(rpc);
  });

  it("keeps Manager coordination separate from technical execution", () => {
    expect(migration).toContain("actor not in('owner','admin','maintenance')");
    expect(dashboard).toContain("Maintenance remains responsible for repair completion");
    expect(dashboard).toContain('canMaintain={user.role==="maintenance"}');
  });
});

describe("Maintenance lifecycle and cross-department invariants", () => {
  it("models assignment, diagnosis, serviceability, parts, resolution, closure, and history", () => {
    for (const value of ["assigned", "in_progress", "waiting_parts", "deferred", "resolved", "completed", "cancelled", "serviceable", "blocked", "out_of_service"]) expect(migration).toContain(value);
    expect(migration).toContain("maintenance_order_events");
    expect(migration).toContain("maintenance_order_assignments");
    expect(migration).toContain("maintenance_one_active_assignment");
  });

  it("does not let issue reporters decide room serviceability", () => {
    expect(migration).toContain("only Maintenance diagnosis can block the room");
    expect(migration).toContain("'open','serviceable','Reported during Housekeeping task '");
    expect(migration).not.toContain("if room.status<>'occupied'then update rooms set status='maintenance'");
  });

  it("preserves occupancy and hands cleanup back to Housekeeping only when requested", () => {
    expect(migration).toContain("case when room.status='occupied'then'stayover_cleaning'else'maintenance_cleanup'end");
    expect(migration).toContain("case when status='occupied'then'occupied'when status='reserved'then'reserved'else'dirty'end");
    expect(migration).toContain("elsif m.room_id is not null then perform maintenance_restore_room_state");
  });

  it("deduplicates source reports and links Maintenance guest requests", () => {
    expect(migration).toContain("maintenance_guest_request_unique");
    expect(migration).toContain("guest_request_create_maintenance");
    expect(migration).toContain("idempotency_key=p_idempotency_key");
  });

  it("excludes only diagnosed blocking work from the browser-side eligible-room list", () => {
    expect(eligibleRooms).toContain('["open","assigned","in_progress","waiting_parts","deferred"]');
    expect(eligibleRooms).toContain('["blocked","out_of_service"]');
  });

  it("keeps workflow tables and RPCs server-only", () => {
    expect(migration).toContain("revoke all on table public.maintenance_order_events,public.maintenance_order_assignments from public,anon,authenticated");
    expect(migration).toContain("grant execute on function public.maintenance_room_is_blocked");
    expect(migration).toContain("to service_role");
  });
});
