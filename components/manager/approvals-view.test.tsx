// @vitest-environment jsdom
// Workflow coverage for the stage strip, docket, dossier, and authorized actions.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { refundBasisBadge } from "./manager-dashboard-client";
import { ManagerApprovalView } from "./approvals-workspace";
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
// The dossier should show the stamped extension calculation and Front Desk action.
const approvedStayExtension = {
  id: "a5", request_type: "stay_extension", severity: "normal", status: "approved",
  execution_status: "awaiting_execution", department: "front_desk", requested_at: ago(40),
  reason: "Guest flight moved; room taken after current checkout", reservation_reference: "HV-1004",
  guest_name: "Garcia", reservation_status: "checked_in", requester_name: "Reception",
  reviewer_name: "Manager", reviewed_at: ago(10), decision_reason: "Approved with room move",
  requested_action: { requestedCheckOut: "2026-09-15", stayExtension: { currentCheckOut: "2026-09-12", requestedCheckOut: "2026-09-15", nights: 3, rate: 11600, additionalAmount: 34800, projectedTotal: 58000, roomConflict: true, roomNumber: "302", roomType: "Executive Suite" } },
} as unknown as RecordItem;

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
    expect(container.querySelector(".haven-status--info")?.getAttribute("title")).toContain("2,500");
    cleanup();
  });
});


const roomException = {
  ...criticalUpgrade,
  request_type: "room_type_exception",
  requested_by: "reception",
  version: 1,
  requested_action: {
    roomType: "Executive Suite",
    financials: { reasonCode: "hotel_room_unserviceable", responsibility: "hotel", originalTotal: 6000, targetTotal: 7500, difference: 1500 },
  },
  normal_policy_result: { roomType: "Deluxe" },
} as unknown as RecordItem;

function renderView(overrides: Partial<Parameters<typeof ManagerApprovalView>[0]> = {}) {
  const props = {
    items: [normalCheckout, highEscalation, roomException, decidedComp],
    search: "",
    setSearch: vi.fn(),
    review: vi.fn().mockResolvedValue(true),
    execute: vi.fn().mockResolvedValue(true),
    executeException: vi.fn().mockResolvedValue(true),
    financialExecute: vi.fn().mockResolvedValue(true),
    escalateOwner: vi.fn().mockResolvedValue(true),
    canReview: true,
    canExecute: false,
    canFinancialExecute: false,
    ...overrides,
  };
  const view = render(<ManagerApprovalView {...props} />);
  return { props, update: (changes: Partial<typeof props>) => view.rerender(<ManagerApprovalView {...props} {...changes} />) };
}

const stage = (name: RegExp) => screen.getByRole("button", { name });
const dossier = () => within(screen.getByRole("article", { name: "Case details" }));
const docket = () => within(screen.getByRole("region", { name: "Case docket" }));

afterEach(cleanup);

describe("ManagerApprovalView", () => {
  it("opens Needs decision in urgency order and separates Owner, execution, and history", () => {
    renderView({ items: [
      normalCheckout, highEscalation, roomException, decidedComp,
      { ...highEscalation, id: "owner", authority_level: "owner", owner_escalated_at: ago(2), owner_escalation_reason: "Safety exposure" },
      { ...normalCheckout, id: "closed", status: "rejected", reviewed_at: ago(1), decision_reason: "Unavailable" },
    ] });
    expect(stage(/Needs decision.*3/).getAttribute("aria-pressed")).toBe("true");
    expect(docket().getAllByRole("button").map(row => row.textContent?.match(/HV-100\d/)?.[0]))
      .toEqual(["HV-1003", "HV-1002", "HV-1001"]);
    expect(docket().getByText("Critical").closest(".haven-status")?.className).toContain("haven-status--danger");
    expect(dossier().getByText("Normal policy")).toBeTruthy();
    expect(dossier().getByText("Room type: Deluxe")).toBeTruthy();
    expect(dossier().getByText("Room type: Executive Suite")).toBeTruthy();
    expect(dossier().getByText("Hotel absorbs the difference")).toBeTruthy();

    fireEvent.click(stage(/With Owner.*1/));
    expect(dossier().getByText("Awaiting Owner decision")).toBeTruthy();
    expect(dossier().getAllByText("Safety exposure")[0]).toBeTruthy();
    expect(dossier().queryByRole("button", { name: /approve/i })).toBeNull();
    fireEvent.click(stage(/Awaiting execution.*1/));
    expect(dossier().getByText("Next step · Accounting")).toBeTruthy();
    expect(dossier().queryByRole("button", { name: "Apply approved credit" })).toBeNull();
    fireEvent.click(stage(/History.*1/));
    expect(dossier().getByText("Decision closed")).toBeTruthy();
    expect(dossier().getAllByText("Unavailable")[0]).toBeTruthy();
  });

  it("keeps the case selected and follows the latest version into execution after approval", async () => {
    const { props, update } = renderView();
    fireEvent.click(dossier().getByRole("button", { name: "Approve exception" }));
    await waitFor(() => expect(props.review).toHaveBeenCalledWith(roomException, "approve"));
    const approved = { ...roomException, status: "approved", execution_status: "awaiting_execution", version: 2 };
    update({ items: [approved, highEscalation, normalCheckout] });
    await waitFor(() => expect(stage(/Awaiting execution.*1/).getAttribute("aria-pressed")).toBe("true"));
    expect(dossier().queryByRole("button", { name: "Continue check-in" })).toBeNull();

    update({ items: [approved, highEscalation, normalCheckout], canReview: false, canExecute: true, actorId: "reception" });
    fireEvent.click(dossier().getByRole("button", { name: "Continue check-in" }));
    await waitFor(() => expect(props.executeException).toHaveBeenCalledWith(approved));
    expect(props.execute).not.toHaveBeenCalled();
  });

  it("keeps context after a cancelled or failed decision and uses the next refreshed version", async () => {
    const review = vi.fn().mockResolvedValue(false);
    const { update } = renderView({ review });
    fireEvent.click(dossier().getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(review).toHaveBeenCalledWith(roomException, "reject"));
    const updated = { ...roomException, version: 2 };
    update({ items: [updated, highEscalation] });
    await waitFor(() => expect((dossier().getByRole("button", { name: "Reject" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(dossier().getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(review).toHaveBeenLastCalledWith(updated, "reject"));
  });

  it("hands high-risk cases to Owner and hides review controls after the handoff", async () => {
    const { props, update } = renderView({ items: [highEscalation] });
    fireEvent.click(dossier().getByRole("button", { name: "Escalate to Owner" }));
    await waitFor(() => expect(props.escalateOwner).toHaveBeenCalledWith(highEscalation));
    update({ items: [{ ...highEscalation, authority_level: "owner", version: 2 }] });
    await waitFor(() => expect(stage(/With Owner.*1/).getAttribute("aria-pressed")).toBe("true"));
    expect(dossier().queryByRole("button", { name: "Reject" })).toBeNull();
  });

  it("keeps the case visible if the action response is lost", async () => {
    renderView({ review: vi.fn().mockRejectedValue(new Error("Connection dropped")) });
    fireEvent.click(dossier().getByRole("button", { name: "Approve exception" }));
    expect((await dossier().findByRole("alert")).textContent).toContain("Reload this page");
    expect(dossier().getByText("Hotel absorbs the difference")).toBeTruthy();
  });

  it("blocks approval of a legacy room change without its financial snapshot", () => {
    renderView({ items: [criticalUpgrade] });
    expect(dossier().getByText(/predates recorded financial responsibility/)).toBeTruthy();
    expect((dossier().getByRole("button", { name: "Approve exception" }) as HTMLButtonElement).disabled).toBe(true);
    expect((dossier().getByRole("button", { name: "Reject" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("limits staff to their filed cases and shows actions only for their department", async () => {
    const accountingCase = { ...decidedComp, requested_by: "accountant" };
    const { props } = renderView({
      items: [accountingCase, roomException, { ...highEscalation, requested_by: "accountant" }],
      canReview: false, canFinancialExecute: true, actorId: "accountant",
    });
    expect(docket().queryByText(/HV-1003/)).toBeNull();
    expect(dossier().queryByRole("button", { name: "Reject" })).toBeNull();
    fireEvent.click(stage(/Awaiting execution.*1/));
    fireEvent.click(dossier().getByRole("button", { name: "Apply approved credit" }));
    await waitFor(() => expect(props.financialExecute).toHaveBeenCalledWith(accountingCase));
  });

  it("retains stamped stay-extension figures and the Front Desk execution path", async () => {
    const { props } = renderView({ items: [approvedStayExtension], canReview: false, canExecute: true });
    fireEvent.click(stage(/Awaiting execution.*1/));
    expect(dossier().getByText(/3 added nights/)).toBeTruthy();
    expect(dossier().getByText(/11,600/)).toBeTruthy();
    expect(dossier().getByText(/34,800/)).toBeTruthy();
    expect(dossier().getByText("Conflict during added nights")).toBeTruthy();
    expect(dossier().getByText(/same-type room/i)).toBeTruthy();
    expect(dossier().queryByText(/roomConflict: /i)).toBeNull();
    fireEvent.click(dossier().getByRole("button", { name: "Execute approved exception" }));
    await waitFor(() => expect(props.execute).toHaveBeenCalledWith(approvedStayExtension));
  });

  it("sends Accounting to Refunds for refund exceptions", () => {
    const openRefunds = vi.fn();
    const { props } = renderView({
      items: [{ ...decidedComp, request_type: "refund_exception" }],
      canReview: false, canFinancialExecute: true, openRefunds,
    });
    fireEvent.click(stage(/Awaiting execution.*1/));
    fireEvent.click(dossier().getByRole("button", { name: "Open Refunds" }));
    expect(openRefunds).toHaveBeenCalledOnce();
    expect(props.financialExecute).not.toHaveBeenCalled();
  });

  it("clears search when the stage has no matching cases", () => {
    const { props } = renderView({ search: "zzz" });
    expect(screen.getByText("No cases match these filters")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(props.setSearch).toHaveBeenCalledWith("");
  });
});
