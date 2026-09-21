// @vitest-environment jsdom
// Role-based Overview composition: every staff role sees the information
// hierarchy its job needs — operational roles get actionable queues instead
// of the occupancy chart, accounting gets financial queues, the manager keeps
// decisions-first analytics. KPI values come from the same DashboardData
// payload; this test pins structure and guards, never the numbers.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Overview } from "./manager-dashboard-client";
import type { DashboardData, Role } from "@/lib/types";

// Same jsdom stubs as module-summary.test.tsx (recharts needs layout).
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
Element.prototype.getBoundingClientRect = function () {
  return { width: 800, height: 300, top: 0, left: 0, bottom: 300, right: 800, x: 0, y: 0 } as DOMRect;
};
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

const data = {
  metrics: {
    occupancy: 62, arrivals: 5, departures: 3, revenue: 100000, openTasks: 4,
    availableRooms: 30, onlineBookings: 2, inHouse: 12, unassignedArrivals: 2,
    dirtyRooms: 3, outOfServiceRooms: 1, openRequests: 6, balancesAttention: 1,
    roomsCleaning: 1, roomsAwaitingInspection: 2, overdueHousekeeping: 1,
    openMaintenance: 3, criticalMaintenance: 1, overdueRequests: 0,
    escalatedIssues: 1, pendingApprovals: 2, collectionsToday: 50000,
    depositsReceived: 20000, refundSummary: 0, outstandingBalances: 15000,
    cashThisShift: 8000, shiftFloat: 5000, shiftOpen: true,
    pendingVerifications: 2, pendingRefundCount: 1, depositSlaHours: 4,
    oldestPendingVerificationMinutes: 90, pendingPastSla: 0,
  },
  occupancyTrend: [{ day: "Mon", occupancy: 50 }, { day: "Tue", occupancy: 62 }],
  roomMix: [
    { name: "Occupied", value: 12, color: "#084b55" },
    { name: "Available", value: 30, color: "#85cbd0" },
  ],
  recentReservations: [],
  notifications: [],
} as unknown as DashboardData;

const show = (role: Role, allowed: string[]) => render(
  <Overview data={data} setSection={() => {}} allowed={allowed as never} role={role} onScan={() => {}} />
);

afterEach(cleanup);

describe("Overview role composition", () => {
  it("manager keeps the occupancy chart and leads with decisions & exceptions", () => {
    const { container } = show("manager", ["overview", "reservations", "rooms", "approvals", "insights"]);
    expect(screen.getByText("Occupancy this week")).toBeTruthy();
    expect(screen.getByText("Decisions & exceptions")).toBeTruthy();
    expect(container.querySelector(".overview-role-manager .panel-needs-attention")).toBeTruthy();
    expect(screen.getByText("Predictive insights")).toBeTruthy();
  });

  it("front desk gets an arrivals queue panel and no occupancy chart", () => {
    const { container } = show("front_desk", ["overview", "reservations", "rooms", "guest_requests", "folios"]);
    expect(screen.getByText("Today's arrivals & departures")).toBeTruthy();
    expect(screen.queryByText("Occupancy this week")).toBeNull();
    expect(container.querySelector(".overview-role-front_desk")).toBeTruthy();
  });

  it("accounting gets financial cards and actions, no occupancy chart", () => {
    show("accounting", ["overview", "payments", "refunds", "reconciliation", "documents", "folios", "approvals"]);
    expect(screen.getByText("Pending verifications")).toBeTruthy();
    expect(screen.getByText("Pending refunds")).toBeTruthy();
    expect(screen.getByText("Pending financial actions")).toBeTruthy();
    expect(screen.queryByText("Occupancy this week")).toBeNull();
  });

  it("housekeeping gets a task-first panel and no occupancy chart", () => {
    show("housekeeping", ["overview", "rooms", "housekeeping_tasks", "guest_requests"]);
    expect(screen.getByText("Priority tasks this shift")).toBeTruthy();
    expect(screen.queryByText("Occupancy this week")).toBeNull();
    expect(screen.queryByText("Recent reservations")).toBeNull();
  });

  it("maintenance gets a work-order panel, no chart, and no room creation", () => {
    const { container } = show("maintenance", ["overview", "rooms", "maintenance_orders", "guest_requests"]);
    expect(screen.getByText("Work orders needing attention")).toBeTruthy();
    expect(screen.queryByText("Occupancy this week")).toBeNull();
    expect(container.textContent).not.toMatch(/add rooms|create room|new room/i);
  });

  it("action items navigate to their existing module sections", () => {
    const setSection = vi.fn();
    render(
      <Overview data={data} setSection={setSection} allowed={["overview", "payments", "refunds", "reconciliation"] as never} role="accounting" onScan={() => {}} />
    );
    fireEvent.click(screen.getByText(/deposits awaiting verification/));
    expect(setSection).toHaveBeenCalledWith("payments");
  });
});
