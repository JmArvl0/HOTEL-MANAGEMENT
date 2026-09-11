// @vitest-environment jsdom
// Render-layer smoke test for the Housekeeping queue summary cards: the counts
// must come from the same groupQueueTask grouping the visible queue renders, so
// card == queue by construction (same pattern as module-summary.test.tsx).
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
