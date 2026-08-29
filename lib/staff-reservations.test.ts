import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canAccess, canManageReservation, canVerifyDeposit, canViewGuestContact, canViewReservationFinancials } from "@/lib/permissions";
import { accountingReservationFields, departmentRequestFields, operationalReservationFields } from "@/lib/staff-data";

const resourceRoute = readFileSync("app/api/resources/[resource]/route.ts", "utf8");
const staffRoute = readFileSync("app/api/staff/reservations/[id]/route.ts", "utf8");
const dashboard = readFileSync("components/manager/manager-dashboard-client.tsx", "utf8");
const dashboardData = readFileSync("lib/data.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260828040000_staff_reservation_operations.sql", "utf8");

describe("staff reservation RBAC", () => {
  it("makes Front Desk the operational owner of guest contact and reservation actions", () => {
    expect(canViewGuestContact("front_desk")).toBe(true);
    expect(canManageReservation("front_desk")).toBe(true);
  });
  it("allows management oversight and protected financial verification", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(canManageReservation(role)).toBe(true);
      expect(canVerifyDeposit(role)).toBe(true);
    }
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
