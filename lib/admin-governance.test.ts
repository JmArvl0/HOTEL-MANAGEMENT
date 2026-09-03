import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canAccess, canAdjustFolio, canCollectPayment, canCoordinateOperations,
  canManageReservation, canPerformHousekeeping, canProcessRefund,
  canReviewManagerApprovals, canVerifyDeposit
} from "@/lib/permissions";
import { ADMIN_ASSIGNABLE_ROLES, ROLE_CAPABILITIES, canAdministerSystem } from "@/lib/admin";
import type { Resource } from "@/lib/types";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260901010000_admin_governance.sql");
const auth = read("lib/auth.ts");
const adminGuard = read("lib/admin-route.ts");
const adminData = read("app/api/admin/data/route.ts");
const adminUsers = read("app/api/admin/users/route.ts");
const adminActions = read("app/api/admin/users/[id]/action/route.ts");
const recovery = read("app/api/recover/[token]/route.ts");
const page = read("app/(manager)/manager_dashboard/page.tsx");
const dashboard = read("components/admin/admin-dashboard-client.tsx");

function filesBelow(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesBelow(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe("Admin governance boundary", () => {
  it("keeps Admin out of operational resources and actions", () => {
    const resources: Resource[] = ["reservations", "rooms", "guests", "guest_requests", "housekeeping_tasks", "maintenance_orders", "invoices", "payments", "refunds", "inventory", "staff"];
    for (const resource of resources) expect(canAccess("admin", resource), resource).toBe(false);
    for (const allowed of [canManageReservation, canVerifyDeposit, canCollectPayment, canProcessRefund, canAdjustFolio, canReviewManagerApprovals, canCoordinateOperations, canPerformHousekeeping]) expect(allowed("admin")).toBe(false);
    for (const path of [...filesBelow("app/api/front-desk"), ...filesBelow("app/api/maintenance")]) expect(read(path), path).not.toContain('"admin"');
  });

  it("uses the existing single-role catalogue without creating parallel RBAC", () => {
    expect(canAdministerSystem("owner")).toBe(true);
    expect(canAdministerSystem("admin")).toBe(true);
    expect(ADMIN_ASSIGNABLE_ROLES).toEqual(["manager", "front_desk", "housekeeping", "maintenance", "accounting"]);
    expect(ROLE_CAPABILITIES.admin).toContain("User governance");
    expect(migration).not.toMatch(/create table if not exists public\.(roles|permissions|role_permissions)/);
  });

  it("protects every Admin route with a revalidated active account", () => {
    expect(adminGuard).toContain("guardAdmin");
    expect(adminGuard).toContain("recovery_required");
    expect(adminGuard).toContain("data?.active");
    for (const route of [adminData, adminUsers, adminActions]) expect(route).toContain("guardAdmin");
    expect(page).toContain('session.user.role === "admin"');
    expect(page).toContain("AdminDashboardClient");
  });
});

describe("Admin lifecycle and configuration invariants", () => {
  it("invalidates stale JWT authority after status, role, or recovery changes", () => {
    expect(auth).toContain("auth_version");
    expect(auth).toContain("recovery_required");
    expect(auth).toContain("token.authVersion !== databaseVersion");
    expect(auth).not.toContain("token.authVersion=data.auth_version");
    expect(auth).toContain("token.disabled=true");
    expect(migration).toContain("auth_version=auth_version+1");
  });

  it("protects Owner, Admin, self, and the last active Owner", () => {
    for (const invariant of ["PROTECTED_ACCOUNT_FORBIDDEN", "SELF_LIFECYCLE_CHANGE_FORBIDDEN", "SELF_ROLE_CHANGE_FORBIDDEN", "LAST_ACTIVE_OWNER_PROTECTED"]) expect(migration).toContain(invariant);
    expect(migration).toContain("actor='admin'and t.role in('owner','admin')");
  });

  it("uses one-time hashed recovery tokens and never returns password hashes", () => {
    expect(adminActions).toContain('createHash("sha256")');
    expect(adminActions).toContain("randomBytes(32)");
    expect(recovery).toContain("bcrypt.hash");
    expect(migration).toContain("used_at is null and expires_at>now()");
    expect(adminData).not.toContain("password_hash");
    expect(adminActions).not.toContain("p_password_hash");
  });

  it("uses optimistic versions and blocks unsafe room deactivation", () => {
    for (const marker of ["ACCOUNT_STALE", "ROOM_CONFIGURATION_STALE", "ROOM_TYPE_STALE", "POLICY_STALE", "ROOM_HAS_ACTIVE_ASSIGNMENT"]) expect(migration).toContain(marker);
    expect(migration).toContain("reservation_room_assignments");
    expect(migration).toContain("configuration_version=configuration_version+1");
  });

  it("preserves existing reservation snapshots when future policy changes", () => {
    expect(migration).toContain("admin_update_operational_policy");
    expect(migration).not.toMatch(/update\s+(public\.)?reservations\s+set\s+(cancellation|policy|rate)/i);
    expect(dashboard).toContain("Existing reservation snapshots remain unchanged");
  });

  it("audits sensitive changes without tokens or passwords", () => {
    for (const action of ["admin_create_staff", "admin_change_account_status", "admin_change_user_role", "admin_update_room_metadata", "admin_update_room_type", "admin_update_operational_policy"]) expect(migration).toContain(`'${action}'`);
    expect(migration).not.toMatch(/jsonb_build_object\([^)]*(token_hash|password_hash)/);
  });

  it("provides live governance modules rather than demo records", () => {
    for (const section of ["Users & Staff", "Roles & Permissions", "Room Configuration", "Room Types", "Hotel Policies", "Audit Logs", "Security", "Admin Reports"]) expect(dashboard).toContain(section);
    expect(dashboard).toContain("/api/admin/data?section=");
    expect(dashboard).not.toContain("Demo data");
  });
});