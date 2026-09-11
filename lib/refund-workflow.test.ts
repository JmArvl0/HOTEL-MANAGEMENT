import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canExecuteManagerFinancialApproval, canProcessRefund, canReviewManagerApprovals, canVerifyDeposit } from "@/lib/permissions";

const read = (path: string) => readFileSync(path, "utf8");
// The 2026-09-12 migration holds the newest authoritative request/review bodies
// (the 20260829 definitions were superseded with the room_type_exception splice).
const approvalMigration = read("supabase/migrations/20260912020000_room_type_exception_checkin.sql");
const managerOperations = read("supabase/migrations/20260829030000_manager_operations.sql");
const connectedWorkflows = read("supabase/migrations/20260828050000_connected_hotel_workflows.sql");
const processRefundMigration = read("supabase/migrations/20260829031000_manager_sql_lint_and_rbac.sql");
const settledImmutable = read("supabase/migrations/20260905020000_settled_payment_status_immutable.sql");
const staffData = read("lib/staff-data.ts");
const accountingLib = read("lib/accounting.ts");
const dashboard = read("components/manager/manager-dashboard-client.tsx");

// D-006 — Accounting handles routine financial operations: a policy-computed
// refund is authorized by the frozen cancellation policy itself and flows straight
// to Accounting settlement. Only exceptions (amounts the policy does not grant)
// route through the Manager approval engine, and the responsible department —
// never the Manager — executes the approved action.
describe("D-006 refund authority split", () => {
  it("gives routine financial operations to Accounting alone", () => {
    expect(canProcessRefund("accounting")).toBe(true);
    for (const role of ["manager", "front_desk", "housekeeping", "maintenance", "guest"] as const) expect(canProcessRefund(role)).toBe(false);
    expect(canVerifyDeposit("accounting")).toBe(true);
    expect(canVerifyDeposit("manager")).toBe(false);
  });
  it("keeps exception review with the Manager and exception execution with Accounting", () => {
    expect(canReviewManagerApprovals("manager")).toBe(true);
    expect(canReviewManagerApprovals("accounting")).toBe(false);
    expect(canExecuteManagerFinancialApproval("accounting")).toBe(true);
    expect(canExecuteManagerFinancialApproval("manager")).toBe(false);
  });
  it("computes the normal refund from the frozen policy snapshot with no Manager step", () => {
    // cancel_reservation inserts the refund request with the policy-derived
    // eligible amount; no approval linkage is created on this path.
    const insert = connectedWorkflows.match(/insert into refund_requests\([^)]*\)(?:[^;]|\n)*;/)![0];
    expect(connectedWorkflows).toContain("operational_policy_snapshot");
    expect(connectedWorkflows).toContain("basis");
    expect(insert).not.toContain("exception_approval_id");
  });
  it("creates refund exceptions only for closed reservations and records the policy baseline", () => {
    expect(approvalMigration).toContain("REFUND_EXCEPTION_REQUIRES_CLOSURE");
    expect(approvalMigration).toContain("'normalPolicyRefund',normal_refund");
    expect(approvalMigration).toContain("'settledDeposit',deposit_paid");
  });
  it("caps an approved exception refund at the settled deposit minus already refunded", () => {
    expect(approvalMigration).toContain("REFUND_EXCEPTION_EXCEEDS_SETTLED_PAYMENT");
    expect(approvalMigration).toContain("requested_amount>deposit_paid-already_refunded");
    // The approval, not Accounting, fixes the executable amount on the exception path.
    expect(approvalMigration).toContain("eligible_amount,status,exception_approval_id,normal_policy_amount");
    expect(approvalMigration).toContain("round(requested_amount,2),'pending',a.id");
  });
  it("settles exactly the approved amount — never a cent more", () => {
    expect(processRefundMigration).toContain("REFUND_EXCEEDS_RECEIVED");
    expect(processRefundMigration).toContain("idempotency_key=rr.id");
    // Accounting cannot raise the amount: the RPC writes rr.eligible_amount only.
    const refundBody = processRefundMigration.split("create or replace function public.process_refund")[1];
    expect(refundBody).not.toMatch(/update refund_requests set[^;]*eligible_amount\s*=/);
  });
  it("closes the approval loop on execution with no re-approval path", () => {
    // refund completes → trigger stamps the approval executed; a processed
    // refund request is not actionable again (isRefundActionable gate).
    expect(managerOperations).toContain("sync_manager_financial_execution");
    expect(managerOperations).toMatch(/update manager_approval_requests set(?:[^;]|\n)*'executed'/);
  });
  it("guards every financial RPC actor null-safely", () => {
    // Inactive or unknown actors must be rejected before any mutation (memory:
    // plpgsql-null-role-guard-bypass — `actor not in` never fires for NULL).
    // The 2026-09-12 authoritative bodies carry the guard inline; the older
    // definitions get it from the runtime patch in 20260830040000.
    expect(approvalMigration).toContain("actor is null or actor not in");
    expect(read("supabase/migrations/20260830040000_null_safe_actor_role_guards.sql")).toContain("NULL_UNSAFE_ACTOR_GUARD_REMAINS");
    for (const body of [processRefundMigration, managerOperations]) expect(body).toMatch(/if actor not in\('owner','admin','accounting'\)/);
  });
  it("executes guest compensation once, as an Accounting credit", () => {
    const execute = managerOperations.split("create or replace function public.accounting_execute_manager_financial_approval")[1];
    expect(execute).toContain("actor not in('owner','admin','accounting')then raise exception'ACCOUNTING_EXECUTION_FORBIDDEN'");
    expect(execute).toContain("accounting_record_adjustment");
    expect(managerOperations).toContain("financial_adjustments_manager_approval_unique");
  });
  it("preserves settled-payment immutability and compensating-entry corrections", () => {
    expect(settledImmutable).toContain("SETTLED_PAYMENT_IMMUTABLE");
    expect(settledImmutable).toContain("purpose='refund'");
  });
});

describe("D-006 refund queue surfacing", () => {
  it("loads the basis fields and the linked approval state", () => {
    expect(staffData).toContain("normal_policy_amount,exception_approval_id");
    expect(staffData).toContain("approval_status");
    expect(staffData).toMatch(/from\("manager_approval_requests"\)\.select\("id,status,execution_status"\)/);
  });
  it("carries the same fields into the accounting ledger payload", () => {
    expect(accountingLib).toContain("normal_policy_amount,exception_approval_id");
  });
  it("badges the queue: within policy, manager approval required, approved exception", () => {
    expect(dashboard).toContain("refundBasisBadge");
    expect(dashboard).toContain("Within policy");
    expect(dashboard).toContain("Manager approval required");
    expect(dashboard).toContain("Approved exception");
  });
  it("shows the Manager how many approved financial exceptions await Accounting", () => {
    // 2026-09-23: the chip strip became a ModuleSummaryCards card — the label
    // title-cased, the derivation (and the type list below) is unchanged.
    expect(dashboard).toContain("Awaiting Accounting");
    expect(dashboard).toContain('["guest_compensation","refund_exception"]');
  });
  it("keeps Manager off every financial mutation surface", () => {
    const access = dashboard.match(/const access: Record<Role, Section\[\]> = \{([^}]*)\}/)![1];
    const managerSections = access.match(/manager:\[([^\]]*)\]/)![1];
    for (const section of ["refunds", "cash_shifts", "reconciliation", "documents", "transactions", "folios"]) expect(managerSections, section).not.toContain(`"${section}"`);
  });
});
