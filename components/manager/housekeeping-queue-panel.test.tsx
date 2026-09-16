// @vitest-environment jsdom
// Render-layer smoke test for the Housekeeping queue summary cards: the counts
// must come from the same groupQueueTask grouping the visible queue renders, so
// card == queue by construction (same pattern as module-summary.test.tsx).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import HousekeepingQueuePanel, { groupQueueTask } from "./housekeeping-queue-panel";
import type { RecordItem } from "@/lib/types";

const noop = () => {};
// The panel derives "today" from the real clock (Asia/Manila); the test must
// use the same derivation so completed-today rows land in that group.
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const nowIso = new Date().toISOString();

const task = (overrides: Record<string, unknown> = {}): RecordItem => ({
  id: "t1", room_number: "101", room_type: "Deluxe King", task_type: "checkout_cleaning", task: "Turnover clean",
  status: "pending", priority: "normal", assigned_user_id: null, assigned_to: "Unassigned", maintenance_blocked: false,
  inspection_status: "none", room_housekeeping: "dirty", created_at: "2026-09-23T02:00:00Z", room_id: "rm1", room_status: "dirty",
  ...overrides,
} as RecordItem);

function renderPanel(items: RecordItem[], role: "housekeeping" | "manager" = "housekeeping") {
  render(<HousekeepingQueuePanel
    role={role} userId="u1" items={items} search="" setSearch={noop}
    housekeepingAction={noop} coordinate={noop} onViewMaintenance={noop} onViewRoom={noop}
  />);
}

afterEach(cleanup);

describe("HousekeepingQueuePanel summary cards", () => {
  it("counts the five cards from the same grouping the queue renders", () => {
    const items = [
      task(), // pending, unassigned → needs_attention
      task({ id: "t2", status: "in_progress" }), // → in_progress
      task({ id: "t3", status: "completed", inspection_status: "pending", completed_at: nowIso }), // → waiting_inspection
      task({ id: "t4", maintenance_blocked: true }), // → blocked
      task({ id: "t5", status: "completed", inspection_status: "passed", completed_at: nowIso }), // → completed_today
      task({ id: "t6", status: "cancelled" }), // grouped null — never counted
    ];
    // Sanity: the grouping itself puts each item where the test claims.
    const groups = items.map((item) => groupQueueTask(item, "u1", TODAY));
    expect(groups).toEqual(["needs_attention", "in_progress", "waiting_inspection", "blocked", "completed_today", null]);
    renderPanel(items);
    const summary = screen.getByRole("group", { name: "Housekeeping summary" });
    // Card values are the <b> inside each article; assert by label order.
    const cards = Array.from(summary.querySelectorAll("article")).map((card) => ({
      label: card.querySelector("span")?.textContent,
      value: card.querySelector("b")?.textContent,
    }));
    expect(cards).toEqual([
      { label: "Needs attention", value: "1" },
      { label: "In progress", value: "1" },
      { label: "Waiting for inspection", value: "1" },
      { label: "Blocked by Maintenance", value: "1" },
      { label: "Completed today", value: "1" },
    ]);
  });

  it("renders valid zero counts instead of hiding cards", () => {
    renderPanel([task({ id: "t1", status: "cancelled" })]);
    const cards = Array.from(screen.getByRole("group", { name: "Housekeeping summary" }).querySelectorAll("article")).map((card) => card.querySelector("b")?.textContent);
    expect(cards).toEqual(["0", "0", "0", "0", "0"]);
  });
});

describe("HousekeepingQueuePanel workspace", () => {
  it("renders the hero, the typical-path legend, and prominent active work", () => {
    renderPanel([task({ status: "in_progress", assigned_user_id: "u1" })]);
    expect(screen.getByRole("heading", { name: "Housekeeping" })).toBeTruthy();
    const flow = screen.getByRole("list", { name: "Typical room-care path" });
    expect(flow.textContent).toContain("Pending");
    expect(flow.textContent).toContain("Ready");
    // The non-empty work group carries primary emphasis.
    expect(document.querySelector(".hk-group-primary")).toBeTruthy();
    // Complete Task leads the actions on an in-progress card.
    const card = document.querySelector(".hk-group-primary .hk-queue-card")!;
    const actions = Array.from(card.querySelectorAll("button")).map((b) => b.textContent);
    expect(actions[0]).toBe("Complete Task");
  });

  it("filters the queue by work type and status while cards stay global", () => {
    renderPanel([
      task({ id: "t1", task_type: "checkout_cleaning", status: "pending" }),
      task({ id: "t2", task: "Stayover tidy", task_type: "stayover_cleaning", status: "in_progress", assigned_user_id: null, assigned_to: "Unassigned" }),
    ]);
    // Narrow to stayover work: only the stayover card remains listed.
    fireEvent.click(screen.getByRole("button", { name: "Filter by work type" }));
    fireEvent.click(screen.getByRole("option", { name: "stayover cleaning" }));
    const queue = screen.getByRole("region", { name: "Room care queue" });
    expect(within(queue).queryByText("checkout cleaning")).toBeNull();
    expect(within(queue).getByText("stayover cleaning")).toBeTruthy();
    // Cards still describe the whole loaded queue.
    const cards = Array.from(screen.getByRole("group", { name: "Housekeeping summary" }).querySelectorAll("article")).map((card) => card.querySelector("b")?.textContent);
    expect(cards).toEqual(["1", "1", "0", "0", "0"]);
  });

  it("links to Guest Requests with the live open count and no duplicate actions", () => {
    const open = vi.fn();
    render(<HousekeepingQueuePanel
      role="housekeeping" userId="u1" items={[task()]} search="" setSearch={noop}
      housekeepingAction={noop} coordinate={noop} onViewMaintenance={noop} onViewRoom={noop}
      guestRequestOpen={4} onOpenGuestRequests={open}
    />);
    const strip = screen.getByRole("region", { name: "Guest service requests" });
    expect(strip.textContent).toContain("4 open");
    expect(within(strip).queryByRole("button", { name: "Start" })).toBeNull();
    expect(within(strip).queryByRole("button", { name: "Complete" })).toBeNull();
    fireEvent.click(within(strip).getByRole("button", { name: "Open Guest Requests" }));
    expect(open).toHaveBeenCalledOnce();
  });

  it("hides the guest strip without a navigator and for other roles", () => {
    renderPanel([task()]);
    expect(screen.queryByRole("region", { name: "Guest service requests" })).toBeNull();
    cleanup();
    render(<HousekeepingQueuePanel
      role="manager" userId="u1" items={[task()]} search="" setSearch={noop}
      housekeepingAction={noop} coordinate={noop} onViewMaintenance={noop} onViewRoom={noop}
      guestRequestOpen={4} onOpenGuestRequests={noop}
    />);
    expect(screen.queryByRole("region", { name: "Guest service requests" })).toBeNull();
  });

  it("keeps completed history collapsible and the maintenance block explicit", () => {
    renderPanel([
      task({ id: "t1", status: "completed", inspection_status: "passed", completed_at: nowIso }),
      task({ id: "t2", task: "Stayover tidy", maintenance_blocked: true }),
    ]);
    // Completed-today starts collapsed behind its toggle (task text lives in
    // the card body, so assert on the section's content, not a bare text node).
    const completedSection = () => screen.getByRole("region", { name: "Completed today" });
    expect(completedSection().textContent).not.toContain("Turnover clean");
    const toggle = screen.getByRole("button", { name: /Completed today/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(completedSection().textContent).toContain("Turnover clean");
    // Blocked work names the blocker (card + section) and links the work order.
    expect(screen.getAllByText("Blocked by Maintenance")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "View work order" })).toBeTruthy();
  });
});
