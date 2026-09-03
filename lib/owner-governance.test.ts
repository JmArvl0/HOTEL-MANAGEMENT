import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canAccess, canAdjustFolio, canCollectPayment, canCoordinateOperations, canExecuteManagerApproval,
  canExecuteManagerFinancialApproval, canIssueFinancialDocument, canManageReservation,
  canOperateCashShift, canPerformHousekeeping, canPostFolioCharge, canProcessRefund,
  canRequestManagerApproval, canReviewManagerApprovals, canVerifyDeposit, canViewAccountingLedger
} from "@/lib/permissions";
import type { Resource } from "@/lib/types";

const read = (path: string) => readFileSync(path, "utf8");
const ownerMigration = read("supabase/migrations/20260902010000_owner_executive_governance.sql");
const adminMigration = read("supabase/migrations/20260901010000_admin_governance.sql");
const ownerData = read("app/api/owner/data/route.ts");
const ownerReview = read("app/api/owner/exceptions/[id]/review/route.ts");
const managerEscalate = read("app/api/manager/approvals/[id]/escalate-owner/route.ts");
const ownerDashboard = read("components/owner/owner-dashboard-client.tsx");
const resourceRoute = read("app/api/resources/[resource]/route.ts");
const page = read("app/(manager)/manager_dashboard/page.tsx");
const auditMigration = read("supabase/migrations/20260829010000_accounting_financial_operations.sql");

function filesBelow(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesBelow(path) : path.endsWith(".ts") ? [path] : [];
  });
}

describe("Owner authority hierarchy", () => {
  it("provides broad executive reads without departmental execution", () => {
    const resources: Resource[] = ["reservations", "rooms", "guests", "guest_requests", "housekeeping_tasks", "maintenance_orders", "invoices", "payments", "refunds", "inventory", "staff"];
    for (const resource of resources) expect(canAccess("owner", resource), resource).toBe(true);
    expect(canViewAccountingLedger("owner")).toBe(true);
    for (const capability of [canManageReservation, canVerifyDeposit, canCollectPayment, canPostFolioCharge, canProcessRefund, canAdjustFolio, canOperateCashShift, canIssueFinancialDocument, canReviewManagerApprovals, canRequestManagerApproval, canExecuteManagerApproval, canExecuteManagerFinancialApproval, canCoordinateOperations, canPerformHousekeeping]) expect(capability("owner")).toBe(false);
  });

  it("removes Owner from every direct Front Desk and Maintenance route guard", () => {
    for (const path of [...filesBelow("app/api/front-desk"), ...filesBelow("app/api/maintenance")]) expect(read(path), path).not.toContain('"owner"');
    expect(resourceRoute).toContain('auth.session!.user.role==="owner"');
    expect(resourceRoute).toContain("This record must be created through its protected workflow.");
  });

  it("routes Owner to a dedicated executive surface", () => {
    expect(page).toContain('session.user.role === "owner"');
    expect(page).toContain("OwnerDashboardClient");
    expect(ownerDashboard).toContain("Executive Overview");
    expect(ownerDashboard).toContain("Financial Overview");
    expect(ownerDashboard).toContain("Admin Governance");
    expect(ownerDashboard).not.toContain("Mark repaired");
  });
});

describe("protected Owner governance", () => {
  it("revalidates every Owner request against the active database account", () => {
    const guard = read("lib/owner-route.ts");
    expect(guard).toContain("guardOwner");
    expect(guard).toContain("recovery_required");
    expect(guard).toContain('data.role !== "owner"');
    for (const route of [ownerData, ownerReview]) expect(route).toContain("guardOwner");
  });

  it("lets Owner govern Admin without granting Admin control over Owner", () => {
    expect(adminMigration).toContain("actor='admin'and t.role in('owner','admin')");
    expect(adminMigration).toContain("PROTECTED_ACCOUNT_FORBIDDEN");
    expect(adminMigration).toContain("LAST_ACTIVE_OWNER_PROTECTED");
    expect(adminMigration).toContain("SELF_LIFECYCLE_CHANGE_FORBIDDEN");
    expect(adminMigration).toContain("p_role in('owner','admin','manager','front_desk','housekeeping','maintenance','accounting')");
    expect(ownerDashboard).toContain('role: "admin"');
    expect(ownerDashboard).toContain("/api/admin/users");
  });

  it("keeps multiple-Owner support safe without creating a second root role", () => {
    expect(adminMigration).toContain("active_owners");
    expect(adminMigration).toContain("LAST_ACTIVE_OWNER_PROTECTED");
    expect(ownerMigration).not.toMatch(/create table.*owner/i);
    expect(ownerMigration).not.toContain("super_admin");
  });

  it("never exposes credentials, hashes, tokens, or infrastructure secrets", () => {
    for (const forbidden of ["password_hash", "token_hash", "NEXTAUTH_SECRET", "SUPABASE_SERVICE_ROLE_KEY", "DATABASE_URL"]) {
      expect(ownerData).not.toContain(forbidden);
      expect(ownerDashboard).not.toContain(forbidden);
    }
  });
});

describe("Owner exception authorization", () => {
  it("reuses Manager approvals and permits only high-risk Manager escalation", () => {
    expect(ownerMigration).toContain("alter table public.manager_approval_requests");
    expect(ownerMigration).toContain("actor<>'manager'");
    expect(ownerMigration).toContain("a.severity not in('high','critical')");
    expect(managerEscalate).toContain("escalate_manager_approval_to_owner");
    expect(ownerDashboard).toContain("Owner-level exceptions");
  });

  it("requires Owner review and keeps authorization separate from execution", () => {
    expect(ownerMigration).toContain("OWNER_REVIEW_REQUIRED");
    expect(ownerMigration).toContain("actor<>'owner'");
    expect(ownerMigration).toContain("result:=review_manager_approval");
    expect(ownerReview).toContain("review_owner_exception");
    expect(ownerReview).not.toContain("front_desk_execute_manager_approval");
    expect(ownerReview).not.toContain("accounting_execute_manager_financial_approval");
    expect(ownerDashboard).toContain("responsible department must execute");
  });

  it("audits escalation and Owner decisions without weakening immutable history", () => {
    expect(ownerMigration).toContain("manager_escalate_to_owner");
    expect(ownerMigration).toContain("'owner_'||p_decision||'_exception'");
    expect(auditMigration).toContain("AUDIT_HISTORY_IMMUTABLE");
    expect(auditMigration).toContain("before update or delete on public.audit_logs");
  });
});

describe("real executive reporting", () => {
  it("derives metrics from authoritative operational and financial tables", () => {
    for (const table of ["reservations", "rooms", "housekeeping_tasks", "maintenance_orders", "guest_requests", "invoices", "payments", "user_accounts", "manager_approval_requests", "audit_logs"]) expect(ownerData).toContain(`from(\"${table}\")`);
    expect(ownerData).toContain("hotel_timezone");
    expect(ownerData).toContain("getAccountingLedger(\"owner\")");
    expect(ownerData).not.toContain("demoStore");
  });

  it("shows real security records and states its telemetry limitation", () => {
    expect(ownerData).toContain("audit_logs");
    expect(ownerDashboard).toContain("no fabricated threat telemetry");
  });
});