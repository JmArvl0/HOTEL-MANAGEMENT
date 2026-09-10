// @vitest-environment jsdom
// Render-layer tests for the Approvals & Escalations queue: the summary strip,
// severity-first ordering, the single-review flow into the decision modal, and
// the role-gated footer actions. All handlers are stubbed — no server calls.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ManagerApprovalView, refundBasisBadge } from "./manager-dashboard-client";
import type { RecordItem } from "@/lib/types";

// The dashboard file pulls in recharts via its panel imports; jsdom has no
// ResizeObserver or layout. (Same stubs as predictive-insights-panel.test.tsx.)
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.getBoundingClientRect = function () {
  return { width: 800, height: 300, top: 0, left: 0, bottom: 300, right: 800, x: 0, y: 0 } as DOMRect;
};
// jsdom ships no matchMedia; Modal reads prefers-reduced-motion on every render.
if (!window.matchMedia) {
  Object.assign(window, {
    matchMedia: (query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

const HOUR = 3600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

// requested_action / normal_policy_result arrive as JSONB objects via the row
// spread in lib/manager.ts — RecordItem only types the scalar fields, so cast.
const criticalUpgrade = {
  id: "a1", request_type: "room_upgrade", severity: "critical", status: "pending",
  department: "front_desk", requested_at: ago(1), reason: "Repeat guest, flooded suite",
  reservation_reference: "HV-1003", guest_name: "Cruz", stay_dates: "Sep 8 – Sep 10",
  reservation_status: "confirmed", requester_name: "Reception", authority_level: "manager",
  requested_action: { requestedRoomType: "Executive Suite", priceDifference: 1500, waived: true },
  normal_policy_result: { autoApprove: false },
} as unknown as RecordItem;
const highEscalation = {
  id: "a2", request_type: "guest_escalation", severity: "high", status: "pending",
  department: "housekeeping", requested_at: ago(26), reason: "Noise complaint unresolved",
  reservation_reference: "HV-1002", guest_name: "Lim", reservation_status: "checked_in",
  requester_name: "Housekeeping", requested_action: { requestedResolution: "Manager coordination" },
} as unknown as RecordItem;
const normalCheckout = {
  id: "a3", request_type: "late_checkout", severity: "normal", status: "pending",
  department: "front_desk", requested_at: ago(30), reason: "Late flight",
  reservation_reference: "HV-1001", guest_name: "Tan", requester_name: "Reception",
  requested_action: { requestedUntil: "14:00" },
} as unknown as RecordItem;
const decidedComp = {
  id: "a4", request_type: "guest_compensation", severity: "normal", status: "approved",
  execution_status: "awaiting_execution", department: "accounting", requested_at: ago(48),
  reason: "Spa overcharge", reservation_reference: "HV-1000", guest_name: "Reyes",
  reviewer_name: "Manager", reviewed_at: ago(20), decision_reason: "Verified against ledger",
  requested_action: { amount: 1200 },
} as unknown as RecordItem;

const items = [normalCheckout, highEscalation, criticalUpgrade, decidedComp];

// D-006: the refund queue must render the same basis distinction the server
// enforces — policy-computed (no approval linkage) vs Manager-approved exception.
describe("refundBasisBadge", () => {
  const badgeText = (item: RecordItem) => {
    const { container } = render(refundBasisBadge(item));
    const text = container.textContent ?? "";
    cleanup();
    return text;
  };
  it("marks a policy-computed refund as within policy (no Manager step)", () => {
    expect(badgeText({ id: "r1", exception_approval_id: null } as unknown as RecordItem)).toBe("Within policy");
  });
  it("flags an exception whose approval is still pending", () => {
    expect(badgeText({ id: "r2", exception_approval_id: "ap-1", approval_status: "pending" } as unknown as RecordItem)).toBe("Manager approval required");
  });
  it("badges a Manager-approved exception and shows the policy baseline it exceeded", () => {
    const { container } = render(refundBasisBadge({ id: "r3", exception_approval_id: "ap-2", approval_status: "approved", normal_policy_amount: 2500 } as unknown as RecordItem));
    expect(container.textContent).toBe("Approved exception");
    expect(container.querySelector(".badge.approved-exception")?.getAttribute("title")).toContain("2,500");
    cleanup();
  });
});

function renderView(overrides: Partial<Parameters<typeof ManagerApprovalView>[0]> = {}) {
  const props = {
    items,
    search: "",
    setSearch: vi.fn(),
    review: vi.fn().mockResolvedValue(true),
    execute: vi.fn().mockResolvedValue(true),
    executeException: vi.fn().mockResolvedValue(true),
    financialExecute: vi.fn().mockResolvedValue(true),
    escalateOwner: vi.fn().mockResolvedValue(true),
    canReview: true,
    canExecute: true,
    canFinancialExecute: true,
    ...overrides,
  };
  render(<ManagerApprovalView {...props} />);
  return props;
}

const tableRows = () => Array.from(document.querySelectorAll<HTMLTableRowElement>("table tbody tr"));

afterEach(cleanup);

describe("ManagerApprovalView", () => {
  it("shows the queue summary: pending, high priority, oldest waiting, escalations, awaiting Accounting", () => {
    renderView();
    const summary = screen.getByRole("status").textContent ?? "";
    expect(summary).toContain("3 pending");
    expect(summary).toContain("2 high priority"); // high + critical
    expect(summary).toContain("1 escalation");
    expect(summary).toContain("1 awaiting Accounting"); // decidedComp: approved, not yet executed by Accounting
    expect(summary).toMatch(/oldest waiting/i);
  });

  it("orders the pending queue severity-first, then longest-waiting, and keeps decided rows off it", () => {
    renderView();
    const refs = tableRows().map((row) => within(row).getAllByText(/HV-100\d/)[0].textContent);
    expect(refs).toEqual(["HV-1003", "HV-1002", "HV-1001"]); // critical, high, normal
    expect(refs).not.toContain("HV-1000"); // approved row is on another tab
  });

  it("labels escalation vs approval and never relies on color alone for severity", () => {
    renderView();
    const escalationRow = tableRows().find((row) => within(row).queryByText("HV-1002"))!;
    expect(within(escalationRow).getByText("Escalation")).toBeTruthy();
    expect(within(escalationRow).queryByText("Approval")).toBeNull();
    const criticalRow = tableRows()[0];
    expect(within(criticalRow).getByText("critical")).toBeTruthy();
    expect(within(criticalRow).getByText("room upgrade")).toBeTruthy();
  });

  it("Review opens the decision modal; Approve routes through review() and closes on success", async () => {
    const props = renderView();
    fireEvent.click(within(tableRows()[0]).getByText("Review"));
    const modal = await screen.findByRole("dialog");
    expect(within(modal).getByText("Requested action")).toBeTruthy();
    expect(within(modal).getByText(/Requested room type: Executive Suite · Price difference: 1,500 · Price difference waived: yes/)).toBeTruthy();
    expect(within(modal).getByText(/Approving authorizes the responsible department/)).toBeTruthy();
    fireEvent.click(within(modal).getByText("Approve"));
    await waitFor(() => expect(props.review).toHaveBeenCalledWith(criticalUpgrade, "approve"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("keeps the modal open when the decision does not complete (prompt cancelled or server error)", async () => {
    const props = renderView({ review: vi.fn().mockResolvedValue(false) });
    fireEvent.click(within(tableRows()[0]).getByText("Review"));
    fireEvent.click(await screen.findByText("Reject"));
    await waitFor(() => expect(props.review).toHaveBeenCalledWith(criticalUpgrade, "reject"));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("hides decision buttons from view-only roles and offers the execute path on approved rows", async () => {
    renderView({ canReview: false });
    fireEvent.click(within(tableRows()[0]).getByText("Review"));
    const modal = await screen.findByRole("dialog");
    expect(within(modal).queryByText("Approve")).toBeNull();
    expect(within(modal).queryByText("Reject")).toBeNull();
    fireEvent.click(within(modal).getByText("Close"));
    expect(screen.queryByRole("dialog")).toBeNull();

    // Approved + awaiting execution → the accounting apply path, gated by role.
    fireEvent.click(screen.getByRole("button", { name: "approved" })); // status pill
    const decidedRow = tableRows().find((row) => within(row).queryByText("HV-1000"))!;
    fireEvent.click(within(decidedRow).getByText("Review"));
    const applyModal = await screen.findByRole("dialog");
    fireEvent.click(within(applyModal).getByText("Apply as Accounting"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the caught-up empty state when the pending queue is clear, and the clear-filters state when filtered out", () => {
    renderView({ items: [decidedComp] });
    expect(screen.getByText("No approvals need attention")).toBeTruthy();
    expect(screen.getByText(/all caught up/i)).toBeTruthy();
    cleanup();

    const filtered = renderView({ search: "zzz" });
    expect(screen.getByText("No requests match these filters")).toBeTruthy();
    fireEvent.click(screen.getByText("Clear filters"));
    expect(filtered.setSearch).toHaveBeenCalledWith("");
  });
});
