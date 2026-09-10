// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import TransportationPanel from "./transportation-panel";

// Render-layer smoke test: the redesign must keep the Front Desk contract —
// actionable KPI cards, aria-pressed filter chips, a table when rows exist,
// a compact differentiated empty state, and a Clear-filters recovery. The
// transition workflow itself is covered by lib/transportation.test.ts.
const trip = (overrides: Record<string, unknown> = {}) => ({
  id: "t1", reservation_id: "r1", service_type: "PICKUP",
  pickup_location: "NAIA Terminal 3", dropoff_location: "Haven Hotel",
  pickup_date: "2026-09-07", pickup_time: "20:30",
  return_location: null, return_date: null, return_time: null,
  passenger_count: 2, special_instructions: null, status: "REQUESTED",
  driver_name: null, fare_amount: null, staff_notes: null, customer_visible_notes: null,
  cancellation_reason: null, completed_at: null, version: 1, created_at: "2026-09-01",
  reservations: { confirmation_number: "HVN-260907-ABCD", guest_name: "Mark Cruz", guest_email: null, check_in: "2026-09-07", check_out: "2026-09-09" },
  ...overrides,
});

function mockFetch(trips: unknown[]) {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: trips, vehicleTypes: [] }) } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// The desktop table and the mobile card list both render (CSS picks one), so
// guest rows appear twice — query with the *AllBy* variants throughout.
async function loaded() {
  await waitFor(() => expect(screen.getAllByText("Mark Cruz").length).toBeGreaterThan(0));
}

describe("TransportationPanel render layer", () => {
  it("renders rows, KPI cards and pressed-state filter chips when requests exist", async () => {
    mockFetch([trip()]);
    render(<TransportationPanel role="front_desk" />);
    await loaded();
    expect(screen.getByRole("table", { name: "Transportation requests" })).toBeTruthy();
    const allChip = screen.getByRole("button", { name: /All/ });
    expect(allChip.getAttribute("aria-pressed")).toBe("true");
    const kpi = screen.getAllByRole("button", { name: /Needs review/ }).find((b) => b.className.includes("tp-kpi"));
    expect(kpi?.getAttribute("aria-pressed")).toBe("false");
  });

  it("clicking a KPI card activates its queue filter", async () => {
    mockFetch([trip(), trip({ id: "t2", status: "COMPLETED", completed_at: new Date().toISOString(), reservations: { confirmation_number: "HVN-260907-ZZZZ", guest_name: "Ana Reyes", guest_email: null, check_in: "2026-09-07", check_out: "2026-09-09" } })]);
    render(<TransportationPanel role="front_desk" />);
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: /Completed this week/ }));
    await waitFor(() => expect(screen.queryAllByText("HVN-260907-ABCD").length).toBe(0));
  });

  it("shows the no-requests empty state without a table when nothing exists", async () => {
    mockFetch([]);
    render(<TransportationPanel role="front_desk" />);
    await waitFor(() => expect(screen.getByText("No transportation requests")).toBeTruthy());
    expect(screen.queryByRole("table")).not.toBeTruthy();
    expect(screen.getByText(/appear here as soon as they are submitted/i)).toBeTruthy();
  });

  it("differentiates a filtered empty state and recovers via Clear filters", async () => {
    mockFetch([trip()]);
    render(<TransportationPanel role="front_desk" />);
    await loaded();
    fireEvent.change(screen.getByLabelText("Search transportation requests"), { target: { value: "nowhere" } });
    expect(screen.getByText("No requests match the current filters or search.")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: /Clear filters/ })[0]);
    await loaded();
  });

  it("hides Front Desk action buttons from the read-only Owner view", async () => {
    mockFetch([trip()]);
    render(<TransportationPanel role="owner" />);
    await loaded();
    expect(screen.queryByRole("button", { name: "Review" })).not.toBeTruthy();
    expect(screen.getAllByText("View only").length).toBeGreaterThan(0);
  });
});
