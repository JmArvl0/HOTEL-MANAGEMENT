// @vitest-environment jsdom
// Admin governance views (rooms, audit/security, policy): the summary cards,
// filters, and footer all count the same loaded rows, card clicks drive the
// existing filters, and the policy view groups and formats the raw columns.
// Pure render; no fetches.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AuditView, PolicyView, RoomsView } from "./admin-dashboard-client";
import type { RecordItem } from "@/lib/types";

// The dashboard module imports panels that read layout/motion APIs jsdom lacks.
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
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

const rooms: RecordItem[] = [
  { id: "r1", number: "101", floor: 1, type: "Deluxe King", wing: "north", administrative_designation: null, administratively_active: true, status: "occupied", housekeeping: "clean" },
  { id: "r2", number: "102", floor: 1, type: "Deluxe Twin", wing: "north", administrative_designation: "Corner room", administratively_active: false, status: "available", housekeeping: "inspection" },
  { id: "r3", number: "201", floor: 2, type: "Premier Suite", wing: "south", administrative_designation: null, administratively_active: true, status: "dirty", housekeeping: "cleaning" },
];

const events: RecordItem[] = [
  { id: "a1", created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), action: "admin_create_user", entity_type: "user_account", entity_id: "u-9" },
  { id: "a2", created_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(), action: "account_recovery_completed", entity_type: "user_account", entity_id: "u-2" },
  { id: "a3", created_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(), action: "admin_create_user", entity_type: "room", entity_id: "rm-8" },
];

const policy = {
  id: "policy", key: "default", version: 3, updated_at: "2026-09-01T04:00:00Z",
  hotel_timezone: "Asia/Manila", check_in_time: "14:00:00", check_out_time: "12:00:00", no_show_cutoff_time: "22:00:00",
  minimum_booking_age: 18, valid_id_required: true,
  cancellation_full_refund_days: 7, cancellation_partial_refund_days: 3, cancellation_partial_refund_basis_points: 3000,
  self_service_modification_days: 2, early_check_in_allowed: false, housekeeping_inspection_required: true,
};

const tableRows = () => Array.from(document.querySelectorAll<HTMLTableRowElement>("table tbody tr"));

afterEach(cleanup);

describe("RoomsView", () => {
  it("renders summary cards from the loaded rows and drives the status filter", () => {
    render(<RoomsView rows={rooms} configure={() => {}} />);
    const summary = screen.getByRole("group", { name: "Room configuration summary" });
    expect(within(summary).getByText("Rooms on record").tagName).toBe("SPAN");
    const inactiveCard = within(summary).getByRole("button", { name: /Administratively inactive/ });
    expect(inactiveCard.querySelector("b")?.textContent).toBe("1");
    expect(within(summary).getByText("Room types").nextElementSibling?.textContent).toBe("3");
    expect(within(summary).getByText("Floors").nextElementSibling?.textContent).toBe("2");
    // Card == filter: clicking the inactive card narrows the table to room 102.
    fireEvent.click(inactiveCard);
    expect(inactiveCard.getAttribute("aria-pressed")).toBe("true");
    expect(tableRows()).toHaveLength(1);
    expect(within(tableRows()[0]).getByText("102")).toBeTruthy();
    expect(screen.getByText("Showing 1 of 3 rooms")).toBeTruthy();
  });

  it("filters by type and wing, searches, and shows badges for every state column", () => {
    render(<RoomsView rows={rooms} configure={() => {}} />);
    expect(screen.getByText("Showing 3 of 3 rooms")).toBeTruthy();
    expect(screen.getByText("Corner room")).toBeTruthy();
    // Operational and housekeeping state render as badges (read-only display).
    expect(screen.getByText("occupied")).toBeTruthy();
    expect(screen.getByText("inspection")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "Deluxe King" } });
    expect(tableRows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Type"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Wing"), { target: { value: "south" } });
    expect(tableRows()).toHaveLength(1);
    expect(within(tableRows()[0]).getByText("201")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Wing"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Search rooms"), { target: { value: "corner" } });
    expect(tableRows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Search rooms"), { target: { value: "no such room" } });
    expect(screen.getByText("No rooms match these filters")).toBeTruthy();
    fireEvent.click(screen.getByText("Clear filters"));
    expect(tableRows()).toHaveLength(3);
  });
});

describe("AuditView", () => {
  it("summarizes the event stream and filters by action and search", () => {
    render(<AuditView security={false} rows={events} />);
    expect(screen.getByRole("heading", { name: "Administrative audit" })).toBeTruthy();
    const summary = screen.getByRole("group", { name: "Audit summary" });
    expect(within(summary).getByText("Events on record")).toBeTruthy();
    expect(within(summary).getByText("Last 24 hours").nextElementSibling?.textContent).toBe("1");
    expect(within(summary).getByText("Action types").nextElementSibling?.textContent).toBe("2");
    expect(screen.getByText("Showing 3 of 3 events")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "admin_create_user" } });
    expect(tableRows()).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Action"), { target: { value: "all" } });
    fireEvent.change(screen.getByLabelText("Search events"), { target: { value: "u-2" } });
    expect(tableRows()).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Search events"), { target: { value: "nothing" } });
    expect(screen.getByText("No events match these filters")).toBeTruthy();
    fireEvent.click(screen.getByText("Clear filters"));
    expect(tableRows()).toHaveLength(3);
  });

  it("frames the same stream as security events", () => {
    render(<AuditView security rows={events} />);
    expect(screen.getByRole("heading", { name: "Security and account events" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Audit summary" })).toBeTruthy();
  });
});

describe("PolicyView", () => {
  it("groups the raw policy columns into labeled, formatted sections", () => {
    render(<PolicyView item={policy} edit={() => {}} />);
    expect(screen.getByRole("heading", { name: "Locale and daily schedule" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Cancellation and refunds" })).toBeTruthy();
    // Human labels, not snake_case; values formatted (time, boolean, percent).
    expect(screen.getByText("Check-in time")).toBeTruthy();
    expect(screen.queryByText("check_in_time")).toBeNull();
    expect(screen.getByText("14:00")).toBeTruthy();
    expect(screen.getByText("Valid ID required at check-in")).toBeTruthy();
    expect(screen.getAllByText("Yes").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Partial refund rate")).toBeTruthy();
    expect(screen.getByText("30%")).toBeTruthy();
    // The version and update stamp are surfaced, and the edit CTA stays.
    expect(screen.getByText(/Version 3 · updated/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Update policy" })).toBeTruthy();
  });

  it("keeps unknown schema keys visible under Additional settings", () => {
    render(<PolicyView item={{ ...policy, future_flag: true } as RecordItem} edit={() => {}} />);
    expect(screen.getByRole("heading", { name: "Additional settings" })).toBeTruthy();
    expect(screen.getByText("Future flag")).toBeTruthy();
  });
});
