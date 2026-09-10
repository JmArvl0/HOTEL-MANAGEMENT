import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canAccess, canManageReservation, canVerifyDeposit, canViewGuestContact, canViewReservationFinancials } from "@/lib/permissions";
import { accountingReservationFields, departmentRequestFields, operationalReservationFields } from "@/lib/staff-data";

const resourceRoute = readFileSync("app/api/resources/[resource]/route.ts", "utf8");
const staffRoute = readFileSync("app/api/staff/reservations/[id]/route.ts", "utf8");
const dashboard = readFileSync("components/manager/manager-dashboard-client.tsx", "utf8");
const dashboardData = readFileSync("lib/data.ts", "utf8");
const managerPanel = readFileSync("components/manager/manager-reservations-panel.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260828040000_staff_reservation_operations.sql", "utf8");

describe("staff reservation RBAC", () => {
  it("makes Front Desk the operational owner of guest contact and reservation actions", () => {
    expect(canViewGuestContact("front_desk")).toBe(true);
    expect(canManageReservation("front_desk")).toBe(true);
  });
  it("separates Owner oversight from Front Desk and Accounting execution", () => {
    expect(canManageReservation("owner")).toBe(false);
    expect(canVerifyDeposit("owner")).toBe(false);
    expect(canManageReservation("front_desk")).toBe(true);
    expect(canVerifyDeposit("front_desk")).toBe(false);
    expect(canVerifyDeposit("accounting")).toBe(true);
    expect(canManageReservation("admin")).toBe(false);
    expect(canVerifyDeposit("admin")).toBe(false);
    expect(canManageReservation("manager")).toBe(false);
    expect(canVerifyDeposit("manager")).toBe(false);
  });
  it("limits Accounting to financial reservation context without guest profiles", () => {
    expect(canViewReservationFinancials("accounting")).toBe(true);
    expect(canViewGuestContact("accounting")).toBe(false);
    expect(canAccess("accounting", "guests")).toBe(false);
    expect(accountingReservationFields).not.toContain("guest_email");
    expect(accountingReservationFields).not.toContain("special_requests");
  });
  it("keeps Housekeeping and Maintenance away from reservations and payments", () => {
    for (const role of ["housekeeping", "maintenance"] as const) {
      expect(canAccess(role, "reservations")).toBe(false);
      expect(canAccess(role, "payments")).toBe(false);
      expect(canViewGuestContact(role)).toBe(false);
    }
  });
  it("uses a minimal department request projection", () => {
    expect(departmentRequestFields).not.toContain("guest_id");
    expect(departmentRequestFields).not.toContain("email");
    expect(operationalReservationFields).toContain("guest_email");
  });
  it("carries booking-captured guest data into the operational projection", () => {
    // request_options must reach the staff detail modal — for pending reservations
    // it is the only place staff can see what the guest requested at booking
    // (the derived guest_requests rows only exist after confirmation).
    expect(operationalReservationFields).toContain("request_options");
    // Accounting keeps its slim financial projection: no request chips either.
    expect(accountingReservationFields).not.toContain("request_options");
    expect(accountingReservationFields).not.toContain("nationality");
    expect(accountingReservationFields).not.toContain("address");
  });
});

describe("unified staff reservation workflow", () => {
  it("loads staff resources through role-scoped projections", () => expect(resourceRoute).toContain("listForRole"));
  it("uses protected audited cancellation and no-show actions", () => {
    expect(staffRoute).toContain('z.enum(["cancelled","no_show"])');
    expect(staffRoute).toContain('rpc("cancel_reservation"');
    expect(staffRoute).toContain('rpc("mark_reservation_no_show"');
    expect(staffRoute).toContain("configured no-show cutoff");
  });
  it("adds no-show without replacing existing reservation statuses", () => {
    for (const status of ["pending", "confirmed", "checked_in", "checked_out", "cancelled", "no_show"]) expect(migration).toContain(status);
  });
  it("offers shared queue filters and source visibility", () => {
    expect(dashboard).toContain("Arrivals today");
    expect(dashboard).toContain("Cancelled");
    expect(dashboard).toContain("No-shows");
    expect(dashboard).toContain("All sources");
    expect(dashboard).toContain("Website and staff bookings share this live queue.");
  });
  it("polls the live queue and exposes same-record staff details", () => {
    expect(dashboard).toContain("setInterval(()=>load(true),30000)");
    expect(dashboard).toContain("/api/staff/reservations/");
    expect(dashboardData).toContain("New online reservation confirmed");
  });
});

describe("manager reservation oversight workspace", () => {
  it("renders the manager oversight panel for managers instead of the front-desk queue", () => {
    expect(dashboard).toContain('section==="reservations"&&user.role==="manager"');
    expect(dashboard).toContain("ManagerReservationsPanel");
    expect(managerPanel).toContain("Monitor reservation activity, operational risks, room readiness, and exceptions requiring management attention.");
  });
  it("never exposes Front Desk or Accounting actions in the manager panel or detail modal", () => {
    for (const forbidden of ["Assign & check in", "Collect payment", "Complete checkout", "Verify deposit", "Pre-assign room", "Reassign room", "Change room", "Extend stay", "Post charge", "Cancel reservation"]) {
      expect(managerPanel.includes(forbidden)).toBe(false);
    }
    // Every action button in the shared detail modal stays behind the front-desk/
    // accounting flags the dashboard already passes as false for managers.
    expect(dashboard).toContain("canManage={operational}");
    expect(dashboard).toContain('oversight={user.role==="manager"||user.role==="owner"}');
  });
  it("routes Review Exception through the existing approval workflow, never a direct mutation", () => {
    expect(managerPanel).toContain("Review Exception");
    expect(dashboard).toContain("function reviewReservationException(item:RecordItem){setDetail(null);setSearch(String(item.confirmation_number||item.id));setSection(\"approvals\")}");
    // Advisory only: the derivation module never writes reservation state.
    const derivation = readFileSync("lib/manager-attention.ts", "utf8");
    expect(derivation).not.toContain("supabase");
    expect(derivation).not.toContain("fetch(");
  });
  it("decorates the manager list with batched lookups, not per-row queries", () => {
    const staffData = readFileSync("lib/staff-data.ts", "utf8");
    expect(staffData).toContain("decorateManagerAttention(decorated)");
    expect(staffData).toContain('from("manager_approval_requests")');
    expect(staffData).toContain('from("transportation_requests")');
    expect(staffData).toContain('from("refund_requests")');
    expect(staffData).toContain('from("guest_requests")');
  });
});
