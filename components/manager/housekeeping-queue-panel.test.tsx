// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import HousekeepingQueuePanel from "./housekeeping-queue-panel";
import type { RecordItem } from "@/lib/types";

const noop = () => {};
const now = new Date();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now);
const task = (overrides: Partial<RecordItem> = {}): RecordItem => ({
  id: "t1", room_number: "101", room_type: "Deluxe King", task_type: "checkout_cleaning",
  task: "Turnover clean", status: "pending", priority: "normal", assigned_user_id: null,
  assigned_to: "Unassigned", maintenance_blocked: false, inspection_status: "none",
  room_housekeeping: "dirty", room_status: "available", room_id: "room-101",
  created_at: "2026-09-23T02:00:00Z", ...overrides,
});

function renderPanel(items: RecordItem[], overrides: Partial<ComponentProps<typeof HousekeepingQueuePanel>> = {}) {
  return render(<HousekeepingQueuePanel
    role="housekeeping" userId="u1" items={items} search="" setSearch={noop}
    housekeepingAction={noop} coordinate={noop} onViewRoom={noop}
    {...overrides}
  />);
}

const queue = () => within(screen.getByRole("region", { name: "Room queue" }));
const detail = () => within(screen.getByRole("region", { name: "Selected room task" }));
const stages = () => within(screen.getByRole("group", { name: "Filter by task stage" }));
const rows = () => within(queue().getByRole("list", { name: "Room tasks" })).getAllByRole("button");
const taskRow = (room: string) => queue().getByRole("button", { name: new RegExp(`^Room ${room}\\b`) });

afterEach(cleanup);

it("shows one priority-ordered queue and updates the selected room", () => {
  renderPanel([
    task({ id: "later", room_number: "105", next_arrival: "2099-01-01" }),
    task({ id: "urgent", room_number: "106", priority: "urgent", notes: "Replace extra pillows.", room_floor: "Mezzanine" }),
    task({ id: "earlier", room_number: "107", next_arrival: today, next_arrival_time: "14:00" }),
  ]);
  expect(rows().map((row) => row.textContent)).toEqual([
    expect.stringContaining("106"), expect.stringContaining("107"), expect.stringContaining("105"),
  ]);
  expect(detail().getByRole("heading", { name: "Room 106" })).toBeTruthy();
  expect(detail().getByText("Replace extra pillows.")).toBeTruthy();
  expect(detail().getByText(/Mezzanine/)).toBeTruthy();
  fireEvent.click(taskRow("107"));
  expect(detail().getByRole("heading", { name: "Room 107" })).toBeTruthy();
  expect(detail().getByText(/Today.*2:00 PM/i)).toBeTruthy();
});

it("counts every visible stage once and filters the queue when a stage is pressed", () => {
  const items = [
    task(),
    task({ id: "t2", room_number: "102", status: "in_progress", assigned_user_id: "u1" }),
    task({ id: "t3", status: "completed", inspection_status: "pending", completed_at: now.toISOString() }),
    task({ id: "t4", maintenance_blocked: true }),
    task({ id: "t5", status: "completed", inspection_status: "passed", completed_at: now.toISOString() }),
    task({ id: "t6", status: "cancelled" }),
    task({ id: "t7", status: "completed", completed_at: "2020-01-01T00:00:00Z" }),
  ];
  renderPanel(items);
  for (const name of ["To clean", "Cleaning", "To inspect", "On hold", "Completed today"]) {
    expect(stages().getByRole("button", { name: `1 ${name}` })).toBeTruthy();
  }
  expect(rows()).toHaveLength(5);
  fireEvent.click(stages().getByRole("button", { name: "1 Cleaning" }));
  expect(rows()).toHaveLength(1);
  expect(detail().getByRole("heading", { name: "Room 102" })).toBeTruthy();
  expect(stages().getByRole("button", { name: "1 Cleaning" }).getAttribute("aria-pressed")).toBe("true");
});

it("keeps stage counts global and offers a clear state for empty filters", () => {
  const full = [task(), task({ id: "t2", status: "completed", inspection_status: "pending" })];
  renderPanel([full[1]], { allItems: full, search: "turnover" });
  expect(stages().getByRole("button", { name: "1 To clean" })).toBeTruthy();
  fireEvent.click(stages().getByRole("button", { name: "1 To clean" }));
  expect(queue().getByText("No matching tasks")).toBeTruthy();
  fireEvent.click(queue().getByRole("button", { name: "Clear filters" }));
  expect(rows()).toHaveLength(1);
});

it("combines work type and My tasks while keeping the shift counts global", () => {
  renderPanel([
    task({ assigned_user_id: "u1" }),
    task({ id: "t2", room_number: "102", task_type: "stayover_cleaning", status: "assigned", assigned_user_id: "u1" }),
    task({ id: "t3", room_number: "103", task_type: "stayover_cleaning", status: "assigned", assigned_user_id: "other" }),
  ]);
  fireEvent.click(queue().getByRole("button", { name: "Filter by work type" }));
  fireEvent.click(screen.getByRole("option", { name: "Stayover cleaning" }));
  fireEvent.click(queue().getByRole("button", { name: "My tasks" }));
  expect(rows()).toEqual([taskRow("102")]);
  expect(stages().getByRole("button", { name: "3 To clean" })).toBeTruthy();
});

it("shows the Manager unassigned tasks and invokes the existing priority action", () => {
  const coordinate = vi.fn();
  const item = task();
  renderPanel([item, task({ id: "t2", room_number: "102", assigned_user_id: "u1" })], { role: "manager", coordinate });
  fireEvent.click(queue().getByRole("button", { name: "Unassigned" }));
  expect(rows()).toEqual([taskRow("101")]);
  fireEvent.click(detail().getByRole("button", { name: "Prioritize task" }));
  expect(coordinate).toHaveBeenCalledWith(item);
  expect(detail().queryByRole("button", { name: /Claim|Start cleaning/ })).toBeNull();
});

it("filters Front Desk to today's arrivals without exposing task mutations", () => {
  renderPanel([
    task({ next_arrival: "2099-01-01" }),
    task({ id: "t2", room_number: "102", next_arrival: today, room_status: "reserved", room_housekeeping: "inspection", status: "completed", inspection_status: "pending" }),
  ], { role: "front_desk" });
  fireEvent.click(queue().getByRole("button", { name: "Arrivals today" }));
  expect(rows()).toEqual([taskRow("102")]);
  expect(detail().getByText(/Awaiting Housekeeping inspection/)).toBeTruthy();
  expect(detail().getByText("Reserved")).toBeTruthy();
  expect(detail().getByRole("button", { name: "Room details" })).toBeTruthy();
  expect(detail().queryByRole("button", { name: /Inspect room|Prioritize task|Claim/ })).toBeNull();
});

it("keeps the selected task after its action moves it out of the current filter", () => {
  const original = task({ status: "assigned", assigned_user_id: "u1" });
  const other = task({ id: "t2", room_number: "102", status: "pending" });
  const props = { role: "housekeeping" as const, userId: "u1", search: "", setSearch: noop,
    housekeepingAction: vi.fn(), coordinate: noop, onViewRoom: noop };
  const view = render(<HousekeepingQueuePanel {...props} items={[original, other]} />);
  fireEvent.click(stages().getByRole("button", { name: "2 To clean" }));
  fireEvent.click(detail().getByRole("button", { name: "Start cleaning" }));
  expect(props.housekeepingAction).toHaveBeenCalledWith(original, "start");
  view.rerender(<HousekeepingQueuePanel {...props} items={[{ ...original, status: "in_progress" }, other]} />);
  expect(rows()).toEqual([taskRow("102")]);
  expect(detail().getByRole("heading", { name: "Room 101" })).toBeTruthy();
  expect(detail().getByRole("button", { name: "Complete cleaning" })).toBeTruthy();
});

it("keeps inspection available to Housekeeping after a different worker cleans", () => {
  renderPanel([task({ status: "completed", assigned_user_id: "other", inspection_status: "pending" })]);
  expect(detail().getByRole("button", { name: "Inspect room" })).toBeTruthy();
  expect(detail().queryByRole("button", { name: "Complete cleaning" })).toBeNull();
});

it("shows the possible inspection step before a turnover has been evaluated for inspection", () => {
  renderPanel([task({ inspection_status: "not_required" })]);
  const progress = within(detail().getByRole("list", { name: "Task progress" }));
  expect(progress.getByText("Inspection if required")).toBeTruthy();
});

it("shows DND and maintenance holds and keeps another worker's task protected", () => {
  renderPanel([
    task({ dnd_active: true, task_type: "stayover_cleaning", assigned_user_id: "u1" }),
    task({ id: "t2", room_number: "102", maintenance_blocked: true }),
    task({ id: "t3", room_number: "103", status: "in_progress", assigned_user_id: "other" }),
  ]);
  expect(stages().getByRole("button", { name: "2 On hold" })).toBeTruthy();
  fireEvent.click(taskRow("101"));
  expect(detail().getByText("Do Not Disturb")).toBeTruthy();
  expect(detail().queryByRole("button", { name: "Start cleaning" })).toBeNull();
  fireEvent.click(taskRow("102"));
  expect(detail().getByRole("button", { name: "View work order" })).toBeTruthy();
  fireEvent.click(taskRow("103"));
  expect(detail().getByText("Assigned to another Housekeeping worker")).toBeTruthy();
  expect(detail().queryByRole("button", { name: "Complete cleaning" })).toBeNull();
});

it("keeps core task actions available when service instructions are unavailable", () => {
  renderPanel([task({ task_type: "stayover_cleaning", active_reservation_id: "R-1",
    assigned_user_id: "u1", service_instructions_available: false })], { onSetDnd: noop, onServiceOutcome: noop });
  expect(detail().queryByRole("button", { name: /Set DND|Guest declined|Mark late/ })).toBeNull();
  expect(detail().getByRole("button", { name: "Start cleaning" })).toBeTruthy();
});

it("links Housekeeping to the separate Guest Requests workflow with the live count", () => {
  const open = vi.fn();
  renderPanel([task()], { guestRequestOpen: 4, onOpenGuestRequests: open });
  fireEvent.click(screen.getByRole("button", { name: "Guest requests, 4 open" }));
  expect(open).toHaveBeenCalledOnce();
  cleanup();
  renderPanel([task()], { role: "front_desk", guestRequestOpen: 4, onOpenGuestRequests: open });
  expect(screen.queryByRole("button", { name: "Guest requests, 4 open" })).toBeNull();
});
