// @vitest-environment jsdom
// Render-layer tests for the Manager reservations oversight panel: the derived
// Attention Required count, the issue badges, the Review Exception routing, and
// the filter chips. All handlers are stubbed — no server calls, no mutation.
import { afterEach, afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ManagerReservationsPanel } from "./manager-reservations-panel";
import type { RecordItem } from "@/lib/types";

// The panel derives "today" from the wall clock (Asia/Manila). The fixtures below
// hardcode 2026-09-08 as "today", so pin the clock for the whole file — otherwise
// the fixtures rot by one day every midnight.
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-08T12:00:00+08:00"));
});
afterAll(() => vi.useRealTimers());
afterEach(cleanup);

// The dashboard file pulls in recharts via its panel imports; jsdom has no
// ResizeObserver or layout. (Same stubs as approvals-view.test.tsx.)
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

// Arrival today with no room → "Room assignment pending"; overdue checkout → high.
const arrivalToday = {
  id: "r1", confirmation_number: "HV-2001", guest_name: "Reyes", status: "confirmed",
  check_in: "2026-09-08", check_out: "2026-09-10", room_number: null, room_type: "Deluxe King",
  source: "Website", total: 8900, folio_balance: 0,
} as RecordItem;
const overdue = {
  id: "r2", confirmation_number: "HV-2002", guest_name: "Cruz", status: "checked_in",
  check_in: "2026-08-25", check_out: "2026-09-06", room_number: "302", room_type: "Twin",
  source: "Direct", total: 7200, folio_balance: 500,
} as RecordItem;
const approvalPending = {
  id: "r3", confirmation_number: "HV-2003", guest_name: "Lim", status: "confirmed",
  check_in: "2026-09-08", check_out: "2026-09-09", room_number: "205", room_type: "Deluxe King",
  source: "Website", total: 4450, folio_balance: 0, pending_approval_type: "early_check_in",
} as RecordItem;
const quiet = {
  id: "r4", confirmation_number: "HV-2004", guest_name: "Tan", status: "confirmed",
  check_in: "2026-09-12", check_out: "2026-09-14", room_number: "101", room_type: "Deluxe King",
  source: "Direct", total: 8900, folio_balance: 0,
} as RecordItem;
const closed = {
  id: "r5", confirmation_number: "HV-2005", guest_name: "Sy", status: "checked_out",
  check_in: "2026-08-01", check_out: "2026-08-03", room_number: "103", room_type: "Deluxe King",
  source: "Direct", total: 8900, folio_balance: 0,
} as RecordItem;

const items = [quiet, closed, approvalPending, overdue, arrivalToday];

function renderPanel(overrides: Partial<Parameters<typeof ManagerReservationsPanel>[0]> = {}) {
  const props = {
    items,
    search: "",
    setSearch: vi.fn(),
    viewReservation: vi.fn(),
    onReviewException: vi.fn(),
    onScan: null,
    ...overrides,
  };
  render(<ManagerReservationsPanel {...props} />);
  return props;
}

const chips = () => Array.from(document.querySelectorAll<HTMLButtonElement>(".reservation-filters button"));
const rows = () => Array.from(document.querySelectorAll<HTMLTableRowElement>("table tbody tr"));
const cards = () => Array.from(document.querySelectorAll<HTMLElement>(".mr-card"));

describe("ManagerReservationsPanel", () => {
  it("defaults to Attention Required and derives its count — the high-severity overdue row sorts first", () => {
    renderPanel();
    const active = chips().find((chip) => chip.className.includes("active"))!;
    expect(active.textContent).toContain("Attention Required");
    expect(active.textContent).toContain("3"); // arrival, overdue, approval — quiet and closed drop out
    const refs = rows().map((row) => within(row).getAllByText(/HV-200\d/)[0].textContent);
    expect(refs).toEqual(["HV-2002", "HV-2001", "HV-2003"]); // overdue (high) → warning rows → info rows
  });

  it("shows the manager oversight subtitle, not the Front Desk queue copy", () => {
    renderPanel();
    expect(screen.getByText("Monitor reservation activity, operational risks, room readiness, and exceptions requiring management attention.")).toBeTruthy();
    expect(screen.queryByText("Website and staff bookings share this live queue.")).toBeNull();
  });

  it("badges the top derived issue per row and lists all issues on the badge title", () => {
    renderPanel();
    const overdueRow = rows().find((row) => within(row).queryByText("HV-2002"))!;
    expect(within(overdueRow).getByText("Overdue checkout")).toBeTruthy();
    const badge = overdueRow.querySelector(".mr-issue")!;
    expect(badge.getAttribute("title")).toContain("Outstanding balance"); // secondary issues in the tooltip
    const arrivalRow = rows().find((row) => within(row).queryByText("HV-2001"))!;
    expect(within(arrivalRow).getByText("Room assignment pending")).toBeTruthy();
    expect(within(arrivalRow).getAllByText("Not assigned").length).toBeGreaterThan(0);
    expect(within(arrivalRow).getByText("Arrival today")).toBeTruthy();
  });

  it("View opens the read-only detail; rows are keyboard reachable", () => {
    const props = renderPanel();
    fireEvent.click(within(rows()[0]).getByText("View"));
    expect(props.viewReservation).toHaveBeenCalledWith(overdue);
    fireEvent.keyDown(rows()[0], { key: "Enter" });
    expect(props.viewReservation).toHaveBeenCalledTimes(2);
  });

  it("Review Exception fires only on rows with a pending approval, and never mutates the reservation", () => {
    const props = renderPanel();
    const approvalRow = rows().find((row) => within(row).queryByText("HV-2003"))!;
    fireEvent.click(within(approvalRow).getByText("Review Exception"));
    expect(props.onReviewException).toHaveBeenCalledWith(approvalPending);
    expect(props.viewReservation).not.toHaveBeenCalled();
    const overdueRow = rows().find((row) => within(row).queryByText("HV-2002"))!;
    expect(within(overdueRow).queryByText("Review Exception")).toBeNull();
    expect(approvalPending.status).toBe("confirmed"); // routing only — status untouched
  });

  it("filter chips switch queues with derived counts, Closed covers checked_out/cancelled/no_show", () => {
    renderPanel();
    fireEvent.click(screen.getByText("Closed"));
    expect(rows().map((row) => within(row).getAllByText(/HV-200\d/)[0].textContent)).toEqual(["HV-2005"]);
    fireEvent.click(screen.getByText("All"));
    expect(rows()).toHaveLength(5);
    fireEvent.click(screen.getByText("Upcoming"));
    expect(rows().map((row) => within(row).getAllByText(/HV-200\d/)[0].textContent)).toEqual(["HV-2004"]);
  });

  it("renders the mobile card twin alongside the desktop table", () => {
    renderPanel();
    expect(cards()).toHaveLength(3); // mirrors the Attention Required rows
    fireEvent.click(cards()[0], {} as unknown as MouseEvent);
    expect(screen.getAllByText("Overdue checkout").length).toBe(2); // badge on the table row and the card twin
    expect(cards()[0].querySelector(".mr-issue")).not.toBeNull();
  });

  it("shows the caught-up empty state when no reservation needs attention", () => {
    renderPanel({ items: [quiet, closed] });
    expect(screen.getByText("No reservations need attention")).toBeTruthy();
  });
});
