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
  occupancyTrend: [{ date: "2026-11-10", day: "Tue", occupancy: 50 }, { date: "2026-11-11", day: "Wed", occupancy: 62 }],
  managerOverview: {
    roomReadiness: { occupied: 12, available: 30, reserved: 2, dirty: 3, out_of_service: 1 },
    previousOccupancyTrend: [{ date: "2026-11-03", day: "Tue", occupancy: 40 }, { date: "2026-11-04", day: "Wed", occupancy: 38 }],
    checkedInArrivals: 2,
    checkedOutDepartures: 1,
    finances: { collectionsToday: 50000, depositsReceived: 20000, outstandingBalances: 15000, refundSummary: 0 },
  },
  frontDeskShift: { open: true, collected: 8000, openingFloat: 5000 },
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
  it("opens Accounting reservations without routing through the room board it cannot access", () => {
    const setSection = vi.fn();
    const onOpenRack = vi.fn();
    render(<Overview data={data} setSection={setSection} allowed={["overview", "reservations"]} role="accounting" onScan={() => {}} onOpenRack={onOpenRack} />);
    fireEvent.click(screen.getByText("View all"));
    expect(setSection).toHaveBeenCalledWith("reservations");
    expect(onOpenRack).not.toHaveBeenCalled();
  });
  it("manager keeps the occupancy chart and leads with decisions & exceptions", () => {
    show("manager", ["overview", "reservations", "rooms", "approvals", "insights"]);
    expect(screen.getByRole("heading", { name: "Hotel dashboard" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Booked occupancy" })).toBeTruthy();
    expect(screen.getByText("Decisions & exceptions")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Room readiness" })).toBeTruthy();
    expect(screen.getByText("Predictive insights")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Occupancy period"), { target: { value: "previous" } });
    expect(screen.getByText("39%")).toBeTruthy();
  });

  it("manager masks all four peso figures until toggled and hides them again on a fresh visit", () => {
    const view = show("manager", ["overview"]);
    const toggle = screen.getByRole("button", { name: "Show financial amounts" });
    expect(screen.getByText("₱5*,***.**")).toBeTruthy();
    expect(screen.getByText("₱2*,***.**")).toBeTruthy();
    expect(screen.getByText("₱1*,***.**")).toBeTruthy();
    expect(screen.getByText("₱0.**")).toBeTruthy();
    expect(screen.queryByText("₱50,000.00")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("₱50,000.00")).toBeTruthy();
    expect(screen.getByText("₱20,000.00")).toBeTruthy();
    expect(screen.getByText("₱15,000.00")).toBeTruthy();
    expect(screen.getByText("₱0.00")).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByText("₱50,000.00")).toBeNull();
    fireEvent.click(toggle);
    view.unmount();
    show("manager", ["overview"]);
    expect(screen.getByRole("button", { name: "Show financial amounts" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("manager filters exception queues and opens the live destinations with the matching scope", () => {
    const setSection = vi.fn();
    const onOpenRack = vi.fn();
    render(<Overview data={data} setSection={setSection} allowed={["overview", "reservations", "rooms", "approvals", "maintenance_orders", "hotel_operations"]} role="manager" onScan={() => {}} onOpenRack={onOpenRack} />);
    fireEvent.click(screen.getByRole("button", { name: /^Decisions/ }));
    expect(screen.queryByText(/urgent or critical work order/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /2 pending approvals/ }));
    expect(setSection).toHaveBeenLastCalledWith("approvals");
    fireEvent.click(screen.getByRole("button", { name: /Operations/ }));
    fireEvent.click(screen.getByRole("button", { name: /arrivals need rooms/ }));
    expect(onOpenRack).toHaveBeenLastCalledWith("unassigned", "unassigned");
    fireEvent.click(screen.getByRole("button", { name: /Rooms ready/ }));
    expect(onOpenRack).toHaveBeenLastCalledWith("board", "all", "available");
    fireEvent.click(screen.getByRole("button", { name: "Shift briefing" }));
    expect(setSection).toHaveBeenLastCalledWith("hotel_operations");
  });

  it("front desk gets an arrivals queue panel and no occupancy chart", () => {
    const { container } = show("front_desk", ["overview", "reservations", "rooms", "guest_requests", "folios", "cash_shifts"]);
    expect(screen.getByRole("heading", { name: "Front Desk dashboard" })).toBeTruthy();
    expect(screen.getByText("Today's arrivals & departures")).toBeTruthy();
    expect(screen.queryByText("Booked occupancy this week")).toBeNull();
    expect(container.querySelector(".overview-role-front_desk")).toBeTruthy();
    expect(screen.getByText("₱8,***.**")).toBeTruthy();
    expect(screen.queryByText("₱8,000.00")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show financial amounts" }));
    expect(screen.getByText("₱8,000.00")).toBeTruthy();
  });

  it("accounting gets financial cards and actions, no occupancy chart", () => {
    show("accounting", ["overview", "payments", "refunds", "reconciliation", "documents", "folios", "approvals"]);
    expect(screen.getByText("Pending verifications")).toBeTruthy();
    expect(screen.getByText("Pending refunds")).toBeTruthy();
    expect(screen.getByText("Pending financial actions")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Accounting dashboard" })).toBeTruthy();
    expect(screen.queryByText("₱15,000.00")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show financial amounts" }));
    expect(screen.getByText("₱15,000.00")).toBeTruthy();
    expect(screen.queryByText("Booked occupancy this week")).toBeNull();
  });

  it("housekeeping gets a task-first panel and no occupancy chart", () => {
    show("housekeeping", ["overview", "rooms", "housekeeping_tasks", "guest_requests"]);
    expect(screen.getByText("Priority tasks this shift")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Housekeeping dashboard" })).toBeTruthy();
    expect(screen.queryByText("Booked occupancy this week")).toBeNull();
    expect(screen.queryByText("Recent bookings")).toBeNull();
  });

  it("maintenance gets a work-order panel, no chart, and no room creation", () => {
    const { container } = show("maintenance", ["overview", "rooms", "maintenance_orders", "guest_requests"]);
    expect(screen.getByText("Work orders needing attention")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Maintenance dashboard" })).toBeTruthy();
    expect(screen.queryByText("Booked occupancy this week")).toBeNull();
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

  it("front-desk queue buttons deep-link into the room reservations board tabs", () => {
    const onOpenRack = vi.fn();
    render(
      <Overview data={data} setSection={vi.fn()} allowed={["overview", "reservations", "rooms", "guest_requests"] as never} role="front_desk" onScan={() => {}} onOpenRack={onOpenRack} onNewReservation={vi.fn()} />
    );
    fireEvent.click(screen.getByText(/arrivals need rooms/));
    expect(onOpenRack).toHaveBeenCalledWith("board", "arrivals");
    fireEvent.click(screen.getByText(/arrivals today/));
    expect(onOpenRack).toHaveBeenCalledWith("arrivals", "arrivals");
    fireEvent.click(screen.getByText(/departures today/));
    expect(onOpenRack).toHaveBeenCalledWith("departures", "departures");
  });

  it("recent reservations view-all opens the all-reservations tab", () => {
    const onOpenRack = vi.fn();
    render(
      <Overview data={data} setSection={vi.fn()} allowed={["overview", "reservations", "rooms"] as never} role="front_desk" onScan={() => {}} onOpenRack={onOpenRack} onNewReservation={vi.fn()} />
    );
    fireEvent.click(screen.getByText("View all"));
    expect(onOpenRack).toHaveBeenCalledWith("all", "all");
  });

  it("new reservation opens the create dialog in place", () => {
    const onNewReservation = vi.fn();
    const setSection = vi.fn();
    render(
      <Overview data={data} setSection={setSection} allowed={["overview", "reservations", "rooms"] as never} role="front_desk" onScan={() => {}} onOpenRack={vi.fn()} onNewReservation={onNewReservation} />
    );
    fireEvent.click(screen.getByText("New reservation"));
    expect(onNewReservation).toHaveBeenCalledTimes(1);
    expect(setSection).not.toHaveBeenCalled();
  });

  it("rooms-ready opens the board for rack roles, the rooms table otherwise", () => {
    const onOpenRack = vi.fn();
    const setSection = vi.fn();
    render(
      <Overview data={data} setSection={setSection} allowed={["overview", "reservations", "rooms", "approvals"] as never} role="front_desk" onScan={() => {}} onOpenRack={onOpenRack} onNewReservation={vi.fn()} />
    );
    fireEvent.click(screen.getByText(/rooms ready/));
    expect(onOpenRack).toHaveBeenCalledWith("board", "all", "available");
    expect(setSection).not.toHaveBeenCalledWith("rooms");
    cleanup();
    render(
      <Overview data={data} setSection={setSection} allowed={["overview", "rooms", "housekeeping_tasks"] as never} role="housekeeping" onScan={() => {}} onOpenRack={onOpenRack} onNewReservation={vi.fn()} />
    );
    fireEvent.click(screen.getByText(/technically blocked room/));
    expect(setSection).toHaveBeenCalledWith("rooms");
  });
});
