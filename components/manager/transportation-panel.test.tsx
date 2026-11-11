// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import TransportationPanel from "./transportation-panel";

const today = "2026-11-10";
const previous = "2026-11-09";
const tomorrow = "2026-11-11";
const trip = (id = "t1", guest = "Mark Cruz", overrides: Record<string, unknown> = {}) => ({
  id, reservation_id: "r-" + id, service_type: "PICKUP",
  pickup_location: "NAIA Terminal 3", dropoff_location: "Haven Hotel",
  pickup_date: today, pickup_time: "16:30",
  return_location: null, return_date: null, return_time: null,
  passenger_count: 2, special_instructions: null, status: "REQUESTED",
  driver_name: null, fare_amount: null, staff_notes: null, customer_visible_notes: null,
  cancellation_reason: null, completed_at: null, version: 1, created_at: previous,
  reservations: { confirmation_number: "HVN-" + id, guest_name: guest, guest_email: null, check_in: previous, check_out: tomorrow },
  ...overrides,
});
const roundTrip = { service_type: "ROUND_TRIP", return_location: "NAIA Departures", return_date: today, return_time: "14:20" };
const vehicle = { id: "00000000-0000-4000-8000-000000000001", name: "Executive Van", seats: 6, base_fare: 2250, booking_fee: 150 };
const respond = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const list = (trips: unknown[]) => respond({ data: trips, vehicleTypes: [vehicle] });

function mockFetch(trips: unknown[]) {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => list(trips));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const queue = () => screen.getByRole("region", { name: "Dispatch queue" });
const detail = () => screen.getByRole("complementary", { name: "Trip details" });
const rows = () => within(queue()).getAllByRole("button").filter(button => button.hasAttribute("aria-current"));
const select = (guest: string) => fireEvent.click(within(queue()).getByRole("button", { name: new RegExp(guest) }));
const filter = (name: string) => within(queue()).getByRole("button", { name: new RegExp("^" + name) });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  // Still November 9 in UTC. Manila has already rolled over.
  vi.setSystemTime(new Date("2026-11-09T17:00:00Z"));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Transportation dispatch workspace", () => {
  it("opens on the Manila day, sorts by the relevant leg and counts each trip once", async () => {
    mockFetch([
      trip(),
      trip("t2", "Isabel Reyes", { ...roundTrip, pickup_date: previous, status: "ASSIGNED" }),
      trip("t3", "Sofia Lim", { ...roundTrip, pickup_time: "09:45" }),
      trip("t4", "Closed guest", { ...roundTrip, status: "COMPLETED" }),
      trip("t5", "Incomplete guest", { ...roundTrip, pickup_date: previous, return_time: null }),
    ]);
    render(<TransportationPanel role="front_desk" />);
    await screen.findByRole("heading", { name: "Sofia Lim" });
    expect(filter("Today").getAttribute("aria-pressed")).toBe("true");
    expect(within(filter("Today")).getByLabelText("3 results")).toBeTruthy();
    expect(rows().map(row => row.querySelector(".tp-row-guest")?.textContent)).toEqual(["Sofia Lim", "Isabel Reyes", "Mark Cruz"]);
    expect(within(queue()).getByText("Return today")).toBeTruthy();
    select("Isabel Reyes");
    expect(within(detail()).getByText("Outbound")).toBeTruthy();
    expect(within(detail()).getByText("Return")).toBeTruthy();
    expect(within(detail()).getByText("NAIA Departures")).toBeTruthy();
    fireEvent.click(filter("History"));
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain("Closed guest");
    fireEvent.click(filter("All"));
    select("Incomplete guest");
    expect(within(detail()).getByText("Time unavailable")).toBeTruthy();
  });

  it("uses future returns in Upcoming and combines search with service type and counts", async () => {
    mockFetch([
      trip("t1", "Mark Cruz", { driver_name: "Al Rivera" }),
      trip("t2", "Isabel Reyes", { ...roundTrip, pickup_date: previous, return_date: tomorrow, driver_name: "Al Rivera" }),
      trip("t3", "Sofia Lim", { ...roundTrip, return_date: tomorrow, driver_name: "Bea Ong" }),
    ]);
    render(<TransportationPanel role="front_desk" />);
    await screen.findByRole("heading", { name: "Mark Cruz" });
    fireEvent.click(screen.getByRole("button", { name: "Filter by service type" }));
    fireEvent.click(screen.getByRole("option", { name: "Round trip" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search transportation requests" }), { target: { value: "Rivera" } });
    await waitFor(() => expect(within(filter("Upcoming")).getByLabelText("1 results")).toBeTruthy());
    fireEvent.click(filter("Upcoming"));
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain("Isabel Reyes");
    expect(rows()[0].textContent).toContain("Return");
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(filter("Today").getAttribute("aria-pressed")).toBe("true");
    expect(rows()).toHaveLength(2);
  });

  it("recovers from a failed load and distinguishes an empty dispatch queue", async () => {
    mockFetch([]).mockResolvedValueOnce(respond({ error: "Could not load transfers." }, 503));
    render(<TransportationPanel role="front_desk" />);
    expect(await screen.findByText("Could not load transfers.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No transportation requests")).toBeTruthy();
  });

  it("restores queue search and row focus after closing the itinerary", async () => {
    mockFetch([trip(), trip("t2", "Isabel Reyes")]);
    render(<TransportationPanel role="front_desk" />);
    await screen.findByRole("heading", { name: "Mark Cruz" });
    const search = screen.getByRole("searchbox", { name: "Search transportation requests" }) as HTMLInputElement;
    fireEvent.change(search, { target: { value: "Isabel" } });
    await waitFor(() => expect(rows()).toHaveLength(1));
    select("Isabel Reyes");
    const heading = await screen.findByRole("heading", { name: "Isabel Reyes" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    fireEvent.click(screen.getByRole("button", { name: "Back to queue" }));
    await waitFor(() => expect(document.activeElement).toBe(rows()[0]));
    expect(search.value).toBe("Isabel");
  });

  it("gives Manager the permitted exception actions and Owner a read-only itinerary", async () => {
    mockFetch([trip()]);
    const view = render(<TransportationPanel role="manager" />);
    await screen.findByRole("heading", { name: "Mark Cruz" });
    expect(within(detail()).getByRole("button", { name: "Cancel trip" })).toBeTruthy();
    expect(within(detail()).getByRole("button", { name: "Reject request" })).toBeTruthy();
    expect(within(detail()).queryByRole("button", { name: "Review request" })).toBeNull();
    view.rerender(<TransportationPanel role="owner" />);
    expect(within(detail()).getByText("Owner view · Read only")).toBeTruthy();
    expect(within(detail()).queryByRole("button", { name: "Cancel trip" })).toBeNull();
  });

  it("previews the round-trip fare, sends the versioned assignment and refreshes the selected trip", async () => {
    const assigned = trip("t2", "Isabel Reyes", { ...roundTrip, status: "SCHEDULED", version: 3 });
    const fetchMock = mockFetch([trip(), assigned])
      .mockResolvedValueOnce(list([trip(), assigned]))
      .mockResolvedValueOnce(respond({ data: "t2" }))
      .mockResolvedValueOnce(list([trip(), { ...assigned, status: "ASSIGNED", version: 4, driver_name: "Al Rivera", fare_amount: 4800, transport_vehicle_types: { name: vehicle.name } }]));
    render(<TransportationPanel role="front_desk" />);
    await screen.findByRole("heading", { name: "Mark Cruz" });
    select("Isabel Reyes");
    fireEvent.click(within(detail()).getByRole("button", { name: "Assign driver & vehicle" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Driver name/), { target: { value: " Al Rivera " } });
    expect(within(dialog).getByRole("option", { name: /Executive Van.*4,800/ })).toBeTruthy();
    fireEvent.change(within(dialog).getByLabelText(/Vehicle type/), { target: { value: vehicle.id } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Assign and post fare" }));
    await waitFor(() => expect(within(detail()).getByRole("button", { name: "Start trip" })).toBeTruthy());
    expect(within(detail()).getByRole("heading", { name: "Isabel Reyes" })).toBeTruthy();
    expect(within(detail()).getByText(/₱4,800 posted/)).toBeTruthy();
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(call?.[0]).toBe("/api/transportation/t2/transition");
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      action: "ASSIGN", expectedVersion: 3, details: { driverName: "Al Rivera", vehicleTypeId: vehicle.id },
    });
  });

  it("requires a cancellation reason and reloads a version conflict without resubmitting", async () => {
    const assigned = trip("t1", "Mark Cruz", { status: "ASSIGNED", fare_amount: 2400 });
    const fetchMock = mockFetch([assigned])
      .mockResolvedValueOnce(list([assigned]))
      .mockResolvedValueOnce(respond({ error: "This request was just updated by someone else." }, 409))
      .mockResolvedValueOnce(list([{ ...assigned, status: "IN_PROGRESS", version: 2 }]));
    render(<TransportationPanel role="front_desk" />);
    await screen.findByRole("heading", { name: "Mark Cruz" });
    fireEvent.click(within(detail()).getByRole("button", { name: "Cancel trip" }));
    const dialog = screen.getByRole("dialog");
    const reason = within(dialog).getByLabelText("Reason");
    fireEvent.change(reason, { target: { value: "   " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel trip" }));
    expect(await within(dialog).findByText("This field is required")).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
    fireEvent.change(reason, { target: { value: "Guest changed plans." } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel trip" }));
    expect((await screen.findByRole("alert")).textContent).toContain("This request was just updated by someone else.");
    expect(await within(detail()).findByRole("button", { name: "Complete trip" })).toBeTruthy();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(within(detail()).getByText(/₱2,400 posted/)).toBeTruthy();
  });
});
