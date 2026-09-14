// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import type { DashboardData } from "@/lib/types";
import PerformanceReports from "./performance-reports";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: ReactNode }) => <svg>{children}</svg>,
  Area: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

const data: DashboardData = {
  metrics: {
    occupancy: 70, arrivals: 4, departures: 2, revenue: 52000, openTasks: 2, availableRooms: 12,
    onlineBookings: 3, inHouse: 20, unassignedArrivals: 1, dirtyRooms: 3, outOfServiceRooms: 2,
    openRequests: 2, balancesAttention: 1, roomsCleaning: 1, roomsAwaitingInspection: 1,
    overdueHousekeeping: 0, openMaintenance: 2, criticalMaintenance: 1, overdueRequests: 0,
    escalatedIssues: 0, pendingApprovals: 1, collectionsToday: 18000, depositsReceived: 6000,
    refundSummary: 1200, outstandingBalances: 9000,
  },
  occupancyTrend: [
    { day: "Mon", occupancy: 50 }, { day: "Tue", occupancy: 55 }, { day: "Wed", occupancy: 60 },
    { day: "Thu", occupancy: 65 }, { day: "Fri", occupancy: 70 }, { day: "Sat", occupancy: 75 },
    { day: "Sun", occupancy: 80 },
  ],
  roomMix: [
    { name: "Occupied", value: 20, color: "#176773" },
    { name: "Available", value: 12, color: "#85cbd0" },
    { name: "Reserved", value: 6, color: "#d48a43" },
    { name: "Service", value: 2, color: "#aaa69d" },
  ],
  recentReservations: [],
  notifications: [],
};

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("PerformanceReports", () => {
  it("presents real performance metrics with accessible chart and inventory evidence", () => {
    render(<PerformanceReports data={data} role="manager"/>);

    expect(screen.getByRole("heading", { name: "Property performance" })).toBeTruthy();
    expect(screen.getByText("₱18,000")).toBeTruthy();
    const summary = document.querySelector(".report-kpi-grid");
    expect(summary).toBeTruthy();
    expect(within(summary as HTMLElement).getByText("65%")).toBeTruthy();
    expect(within(summary as HTMLElement).getByText("95%")).toBeTruthy();
    expect(screen.getByRole("img", { name: /average 65 percent, ending at 80 percent/i })).toBeTruthy();
    expect(screen.getByText("20", { selector: ".report-room-status strong" })).toBeTruthy();

    fireEvent.click(screen.getByText("View occupancy data"));
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("Sun")).toBeTruthy();
    expect(screen.getByText("80%")).toBeTruthy();
  });

  it("keeps export as the existing print workflow", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<PerformanceReports data={data} role="manager"/>);

    fireEvent.click(screen.getByRole("button", { name: "Export property performance report" }));
    expect(print).toHaveBeenCalledOnce();
  });
});
