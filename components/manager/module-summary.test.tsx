// @vitest-environment jsdom
// Pure counting tests for the per-module quick-overview cards: the snapshot
// staff read instead of scrolling the table. Reservations counts must equal
// the queueFilter predicates the filter chips use; the other cases cover
// resources where a miscount would mislead (maintenance severity/blocks,
// refund basis split, billing balances). Also covers the shared card
// component's button/article split and selected state.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BedDouble, CalendarDays } from "lucide-react";
import { moduleSummary } from "./manager-dashboard-client";
import { ModuleSummaryCards } from "./module-summary-cards";
import type { RecordItem } from "@/lib/types";

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

const rows = (items: Record<string, unknown>[]) => items.map((item) => item as RecordItem);
const TODAY = "2026-09-23";

describe("moduleSummary counts", () => {
  it("reservations cards mirror the queueFilter predicates plus the arrival-prep blockers (active/arrivals/departures/in-house/prep)", () => {
    const items = rows([
      { id: "1", status: "confirmed", check_in: TODAY, check_out: "2026-09-25" },      // arrival
      { id: "2", status: "confirmed", check_in: "2026-09-20", check_out: TODAY },      // departure
      { id: "3", status: "checked_in", check_in: "2026-09-20", check_out: "2026-09-25" }, // in-house
      { id: "4", status: "pending", check_in: "2026-10-01", check_out: "2026-10-03" }, // upcoming, still active
      { id: "5", status: "checked_out", check_in: "2026-09-18", check_out: "2026-09-20" }, // terminal — not active
      { id: "6", status: "cancelled", check_in: TODAY, check_out: "2026-09-25" },      // terminal — never arrivals
      // Arrival-prep cases (today's confirmed arrivals): fully ready, unassigned, unverified ID, balance due, already in-house (not counted).
      { id: "7", status: "confirmed", check_in: TODAY, check_out: "2026-09-25", room_number: "101", identity_status: "verified", folio_balance: 0 },
      { id: "8", status: "confirmed", check_in: TODAY, check_out: "2026-09-25", room_number: null, identity_status: "verified", folio_balance: 0 },
      { id: "9", status: "confirmed", check_in: TODAY, check_out: "2026-09-25", room_number: "102", identity_status: "unverified", folio_balance: 0 },
      { id: "10", status: "confirmed", check_in: TODAY, check_out: "2026-09-25", room_number: "103", identity_status: "verified", folio_balance: 2500 },
      { id: "11", status: "checked_in", check_in: TODAY, check_out: "2026-09-25", room_number: null, identity_status: "unverified", folio_balance: 900 },
    ]);
    const chips = moduleSummary("reservations", items, TODAY);
    expect(chips.map(({ label, value, queue }) => ({ label, value, queue }))).toEqual([
      { label: "Active", value: 9, queue: undefined },
      { label: "Arrivals today", value: 6, queue: "arrivals" },
      { label: "Departures today", value: 1, queue: "departures" },
      { label: "In-house", value: 2, queue: "in_house" },
      { label: "Arrivals needing prep", value: 4, queue: undefined }, // ids 1, 8, 9, 10; 7 is ready, 11 already in-house
    ]);
  });

  it("counts maintenance queues, blocked rooms, and urgent severity separately", () => {
    const chips = moduleSummary("maintenance_orders", rows([
      { id: "1", status: "open", severity: "normal", serviceability_impact: "serviceable" },
      { id: "2", status: "assigned", severity: "high", serviceability_impact: "blocked" },
      { id: "3", status: "in_progress", severity: "critical", serviceability_impact: "serviceable" },
      { id: "4", status: "waiting_parts", severity: "normal", serviceability_impact: "serviceable" },
    ]), TODAY);
    expect(chips.map(({ label, value }) => [label, value])).toEqual([
      ["Unclaimed", 2],
      ["In progress", 1],
      ["Waiting parts / deferred", 1],
      ["Blocked rooms", 1],
      ["Urgent or critical", 2],
    ]);
  });

  it("splits refunds by policy vs Manager-approval basis and ignores processed exceptions", () => {
    const chips = moduleSummary("refunds", rows([
      { id: "1", status: "pending", exception_approval_id: null },
      { id: "2", status: "pending", exception_approval_id: "ap-1", approval_status: "pending" },
      { id: "3", status: "processed", exception_approval_id: "ap-2", approval_status: "approved" },
      { id: "4", status: "failed", exception_approval_id: null },
    ]), TODAY);
    expect(chips.map(({ label, value }) => [label, value])).toEqual([
      ["Within policy, to settle", 2],
      ["Awaiting Manager approval", 1],
      ["Processed", 1],
      ["Failed", 1],
    ]);
  });

  it("sums the outstanding balance across billing folios", () => {
    const chips = moduleSummary("invoices", rows([
      { id: "1", status: "unpaid", balance: 6400 },
      { id: "2", status: "partial", balance: 3200.50 },
      { id: "3", status: "paid", balance: 0 },
    ]), TODAY);
    expect(chips.find((chip) => chip.label === "Outstanding balance")?.value).toBe("₱9,601");
    expect(chips.find((chip) => chip.label === "Unpaid")?.value).toBe(1);
  });

  it("counts deposit-queue SLA breaches against the policy threshold", () => {
    const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();
    const chips = moduleSummary("payments", rows([
      { id: "1", status: "pending_verification", submitted_at: minutesAgo(30) },   // normal — not past SLA
      { id: "2", status: "pending_verification", submitted_at: minutesAgo(90) },   // attention band, under 4h
      { id: "3", status: "pending_verification", submitted_at: minutesAgo(300) },  // 5h — past 4h SLA
      { id: "4", status: "paid", submitted_at: minutesAgo(300) },                  // settled — never counted
    ]), TODAY, 4);
    expect(chips.map(({ label, value }) => [label, value])).toEqual([
      ["Pending verification", 3],
      ["Past SLA", 1],
      ["Failed or rejected", 0],
    ]);
  });

  it("returns no cards for reference lists like guests", () => {
    expect(moduleSummary("guests", rows([{ id: "GST-1", status: "active" }]), TODAY)).toEqual([]);
  });
});

describe("ModuleSummaryCards component", () => {
  afterEach(cleanup);

  it("renders a linked card as a button with a selected state and calls the filter", () => {
    const onSelect = vi.fn();
    render(<ModuleSummaryCards
      cards={[
        { label: "Active", value: 4, hint: "Pending, confirmed & in-house", icon: CalendarDays, tone: "today" },
        { label: "Arrivals today", value: 1, hint: "Expected check-ins", icon: BedDouble, tone: "active", queue: "arrivals" },
      ]}
      activeQueue="arrivals"
      onSelect={onSelect}
    />);
    const arrivalCard = screen.getByRole("button", { name: /Arrivals today/ });
    expect(arrivalCard.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(arrivalCard);
    expect(onSelect).toHaveBeenCalledWith("arrivals");
  });

  it("renders an informational card as a non-interactive article", () => {
    render(<ModuleSummaryCards cards={[{ label: "Active", value: 4, hint: "Pending, confirmed & in-house" }]} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });
});
