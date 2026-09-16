import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Department fulfillment for guest requests: approval authorizes and routes,
// the owning department starts/completes its own approved items through one
// audited RPC. The linked task/order auto-completion keeps working untouched.
const migration = readFileSync("supabase/migrations/20261003010000_guest_request_progress.sql", "utf8");
const route = readFileSync("app/api/guest-requests/[id]/progress/route.ts", "utf8");
const panel = readFileSync("components/manager/guest-requests-panel.tsx", "utf8");
const resourcesRoute = readFileSync("app/api/resources/[resource]/route.ts", "utf8");
const dashboard = readFileSync("components/manager/manager-dashboard-client.tsx", "utf8");
const metrics = readFileSync("lib/data.ts", "utf8");
const completeRoute = readFileSync("app/api/housekeeping/tasks/[id]/complete/route.ts", "utf8");

describe("guest request progress migration", () => {
  it("records completion actor and time without inventing other state", () => {
    expect(migration).toContain("completed_by uuid references public.user_accounts(id)");
    expect(migration).toContain("completed_at timestamptz");
    // Derived fulfillment only — the only schema additions are the two
    // completion columns (checked past the header comment).
    const body = migration.slice(migration.indexOf("alter table"));
    expect(body.match(/add column/g)?.length ?? 0).toBe(2);
    expect(body).not.toContain("fulfillment_status");
  });
  it("lets exactly the owning department start/complete its approved items", () => {
    expect(migration).toContain("create or replace function public.staff_progress_guest_request(");
    expect(migration).toContain("actor not in('housekeeping','maintenance','front_desk')");
    expect(migration).toContain("g.department<>actor");
    expect(migration).toContain("REQUEST_DEPARTMENT_FORBIDDEN");
    expect(migration).toContain("approval_status<>'approved'");
    expect(migration).toContain("REQUEST_NOT_APPROVED");
    expect(migration).toContain("REQUEST_ALREADY_CLOSED");
    expect(migration).toContain("REQUEST_NOT_STARTABLE");
  });
  it("audits every transition and stays out of the task/order workflows", () => {
    expect(migration).toContain("insert into audit_logs");
    expect(migration).toContain("staff_start_guest_request");
    expect(migration).toContain("staff_complete_guest_request");
    expect(migration).not.toContain("housekeeping_tasks");
    expect(migration).not.toContain("maintenance_orders");
    expect(migration).not.toContain("inventory");
  });
  it("revokes and grants per signature so anon keeps no EXECUTE", () => {
    expect(migration).toMatch(/revoke all on function public\.staff_progress_guest_request\(/);
    expect(migration).toMatch(/grant execute on function public\.staff_progress_guest_request\(/);
    expect(migration).toContain("from public, anon, authenticated");
  });
});

describe("guest request progress route", () => {
  it("serves the three department roles and nobody else", () => {
    expect(route).toContain('"housekeeping","maintenance","front_desk"');
    expect(route).toContain("staff_progress_guest_request");
    expect(route).not.toContain("manager");
  });
  it("validates the action and maps every RPC failure to guidance", () => {
    expect(route).toContain('z.enum(["start","complete"])');
    for (const code of ["REQUEST_DEPARTMENT_FORBIDDEN", "GUEST_REQUEST_NOT_FOUND", "REQUEST_NOT_APPROVED", "REQUEST_ALREADY_CLOSED", "REQUEST_NOT_STARTABLE"])
      expect(route).toContain(code);
  });
  it("leaves the generic CRUD guards exactly as they were", () => {
    // Housekeeping still cannot PATCH guest_requests directly; Front Desk
    // still cannot complete specialist-department items that way.
    expect(resourcesRoute).toContain('role==="housekeeping"&&["rooms","guest_requests","housekeeping_tasks"].includes(resource)');
    expect(resourcesRoute).toContain("The assigned specialist department must complete this request.");
  });
});

describe("guest request fulfillment presentation", () => {
  it("executes through the panel's progress action, never through approval", () => {
    expect(panel).toContain("/api/guest-requests/${item.id}/progress");
    expect(panel).toContain("item.department === role");
    // Fulfillment is derived per batch from child statuses — nothing stored.
    expect(panel).toContain("Fulfillment");
    expect(panel).toContain("Fulfilled");
    expect(panel).not.toContain("fulfillment_status");
  });
  it("wires Start/Complete into the maintenance table without a second surface", () => {
    expect(dashboard).toContain("progressGuestRequest");
    expect(dashboard).toContain("canProgressGuestRequest");
    expect(dashboard).toContain('progressGuestRequest(item,"start")');
    expect(dashboard).toContain('progressGuestRequest(item,"complete")');
  });
  it("drops completed items from the workload badge by construction", () => {
    const badge = metrics.slice(metrics.indexOf("const departmentRequests"), metrics.indexOf("const transportationRequested"));
    expect(badge).toContain('"approved"');
    expect(badge).toContain('"open", "in_progress"');
    expect(badge).not.toContain('"completed"');
  });
  it("keeps inventory consumption on task completion only", () => {
    expect(completeRoute).toContain("logGuestRequestConsumption");
    expect(migration).not.toContain("inventory_movements");
  });
});
