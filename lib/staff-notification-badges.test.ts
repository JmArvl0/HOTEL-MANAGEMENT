// Contract tests for the staff notification triad (SYSTEM.md §7.9): sidebar
// badges = pending workload per module (role-gated), bell = live derived
// alerts, toast = transient new-event alert. These pin the wiring so a future
// edit cannot silently leak a count to a role that cannot act on it, or make
// the toast diff replay history after refresh.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canAccess } from "@/lib/permissions";

const data = readFileSync("lib/data.ts", "utf8");
const client = readFileSync("components/manager/manager-dashboard-client.tsx", "utf8");
const types = readFileSync("lib/types.ts", "utf8");

describe("staff module badges — count definitions", () => {
  it("computes each badge count from the module's own domain state, not notification counts", () => {
    expect(data).toContain('String(item.approval_status) === "pending" && item.batch_id');
    expect(data).toContain('String(item.department) === role && ["open", "in_progress"]');
    expect(data).toContain('.eq("status", "REQUESTED")');
    expect(data).toContain('item.status === "pending_verification"');
    expect(data).toContain('task.status !== "completed"');
    expect(data).toContain("activeMaintenanceStatuses");
  });
  it("exposes the new badge metrics on the dashboard payload contract", () => {
    for (const metric of ["pendingRequestBatches", "departmentRequests", "transportationRequested", "pendingVerifications", "pendingRefundCount"]) {
      expect(types).toContain(metric);
      expect(data).toContain(metric);
    }
  });
});

describe("staff module badges — role gating", () => {
  it("gates Deposit Verification and Refunds badges to Accounting alone", () => {
    // Front Desk sees the payments queue view but never gains verification
    // authority from a badge; the badge count only exists for accounting.
    expect(client).toContain('user.role === "accounting" && m.pendingVerifications');
    expect(client).toContain('user.role === "accounting" && m.pendingRefundCount');
    expect(canAccess("accounting", "payments")).toBe(true);
  });
  it("gates the Approvals badge to the Manager, the only reviewing role", () => {
    expect(client).toContain('user.role === "manager" && m.pendingApprovals');
  });
  it("keeps the Housekeeping badge's existing meaning (open tasks, all module roles)", () => {
    expect(client).toContain("m.openTasks");
  });
});

describe("transient toast alerts", () => {
  it("seeds the first poll silently so a refresh never replays history as toasts", () => {
    expect(client).toContain("seenAlerts.current === null");
  });
  it("dedupes alerts by notification id", () => {
    expect(client).toContain("if (seenAlerts.current.has(notice.id)) continue;");
  });
  it("routes toast View actions to the alert's module", () => {
    expect(client).toContain("setSection(notice.section)");
  });
  it("keeps the alert/badge refresh on the shared 30s cadence outside Overview", () => {
    expect(client).toContain('section === "overview" || section === "reports"');
    expect(client).toContain("30000");
  });
});
