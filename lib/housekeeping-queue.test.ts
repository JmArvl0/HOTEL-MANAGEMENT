import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { groupQueueTask, queueTaskOrder } from "@/components/manager/housekeeping-queue-panel";
import { summarizeDailyActivity } from "@/lib/front-desk-reports";
import type { RecordItem } from "@/lib/types";

const panel = readFileSync("components/manager/housekeeping-queue-panel.tsx", "utf8");
const dashboard = readFileSync("components/manager/manager-dashboard-client.tsx", "utf8");
const reportsPanel = readFileSync("components/manager/front-desk-reports-panel.tsx", "utf8");
const resourcesRoute = readFileSync("app/api/resources/[resource]/route.ts", "utf8");

const task = (overrides: Partial<RecordItem>): RecordItem => ({ id: "T-1", room_number: "101", ...overrides } as RecordItem);

describe("housekeeping queue grouping", () => {
  const today = "2026-09-07";
  const me = "u-housekeeper";

  it("puts an unassigned checkout task at the top of needs attention", () => {
    expect(groupQueueTask(task({ status: "pending", task_type: "checkout_cleaning", created_at: "2026-09-07T10:00:00Z" }), me, today)).toBe("needs_attention");
  });
  it("escalates assigned urgent work to needs attention, parks assigned normal work", () => {
    expect(groupQueueTask(task({ status: "assigned", priority: "urgent", assigned_user_id: "u-other" }), me, today)).toBe("needs_attention");
    expect(groupQueueTask(task({ status: "assigned", priority: "normal", assigned_user_id: "u-other" }), me, today)).toBe("other_open");
  });
  it("groups my open tasks, in-progress teammates, and pending inspections separately", () => {
    expect(groupQueueTask(task({ status: "assigned", priority: "normal", assigned_user_id: me }), me, today)).toBe("my_tasks");
    expect(groupQueueTask(task({ status: "in_progress", assigned_user_id: "u-other" }), me, today)).toBe("in_progress");
    expect(groupQueueTask(task({ status: "completed", inspection_status: "pending", completed_at: "2026-09-07T12:00:00Z" }), me, today)).toBe("waiting_inspection");
  });
  it("maintenance-blocked open work gets its own group and hides cancelled and old history", () => {
    expect(groupQueueTask(task({ status: "pending", maintenance_blocked: true }), me, today)).toBe("blocked");
    expect(groupQueueTask(task({ status: "cancelled" }), me, today)).toBeNull();
    expect(groupQueueTask(task({ status: "completed", inspection_status: "passed", completed_at: "2026-09-06T12:00:00Z" }), me, today)).toBeNull();
  });
  it("orders by priority, then next arrival, then age", () => {
    const urgent = task({ id: "T-2", priority: "urgent", next_arrival: "2026-09-08" });
    const high = task({ id: "T-3", priority: "high", next_arrival: "2026-09-07" });
    const normal = task({ id: "T-4", priority: "normal", next_arrival: null });
    expect(queueTaskOrder(urgent, high)).toBeLessThan(0);
    expect(queueTaskOrder(high, normal)).toBeLessThan(0);
    expect(queueTaskOrder(task({ id: "T-5", priority: "high", next_arrival: "2026-09-07", created_at: "2026-09-07T08:00:00Z" }), task({ id: "T-6", priority: "high", next_arrival: "2026-09-07", created_at: "2026-09-07T09:00:00Z" }))).toBeLessThan(0);
  });
  it("a non-housekeeping viewer never sees my-tasks grouping", () => {
    // Front desk/manager pass an empty userId: unassigned work still surfaces
    // as needs attention, but nothing is ever "mine".
    expect(groupQueueTask(task({ status: "assigned", priority: "normal", assigned_user_id: "u-anyone" }), "", today)).toBe("other_open");
  });
});

describe("housekeeping queue surface", () => {
  it("is a grouped card list, not a CRUD table", () => {
    expect(panel).toContain("hk-queue-card");
    expect(panel).not.toContain("<table");
    for (const group of ["Needs attention", "My tasks", "Waiting for inspection", "Blocked by Maintenance", "Completed today"]) expect(panel).toContain(group);
  });
  it("reuses the existing RPC action handlers and adds no write path of its own", () => {
    expect(panel).not.toContain("supabase");
    expect(panel).not.toContain("fetch(");
    expect(dashboard).toContain('housekeepingAction={operateHousekeeping}');
    expect(dashboard).toContain("HousekeepingQueuePanel");
    expect(panel).toContain('housekeepingAction(item, "start")');
    expect(panel).toContain('housekeepingAction(item, "inspect")');
  });
  it("keeps role authority: housekeeping acts, manager prioritizes, front desk views", () => {
    expect(panel).toContain("View only");
    expect(panel).toContain("canHousekeep");
    expect(panel).toContain("canCoordinate");
    expect(dashboard).toContain('role={user.role} userId={user.id} items={filtered}');
  });
  it("never claims sellability — cards show the recorded room state", () => {
    expect(panel).toContain("Room state:");
    expect(panel).not.toContain("available now");
    expect(panel).toContain("not sellable until inspection passes");
  });
});

describe("daily report housekeeping block", () => {
  const base = {
    reservationsCreated: [], checkedIn: [], checkedOut: [], reservationAuditEvents: [],
    guestRequestsOpened: [], guestRequestsEscalated: [], openRequests: [],
    settledPayments: [], cashShiftsClosed: [], rooms: [], transportation: [], approvals: []
  };
  const completed = (started: string | null, completedAt: string) =>
    ({ task_type: "checkout_cleaning", started_at: started, completed_at: completedAt, inspection_status: "pending", status: "completed" });

  it("counts tasks, by type, awaiting inspection, and average turnaround", () => {
    const snapshot = summarizeDailyActivity({ ...base, housekeepingCompleted: [
      completed("2026-09-07T10:00:00Z", "2026-09-07T11:30:00Z"),
      { task_type: "stayover_cleaning", started_at: "2026-09-07T09:00:00Z", completed_at: "2026-09-07T09:20:00Z", inspection_status: "passed", status: "completed" }
    ] }, "2026-09-07");
    expect(snapshot.housekeeping?.tasksCompleted).toBe(2);
    expect(snapshot.housekeeping?.byType.checkout_cleaning).toBe(1);
    expect(snapshot.housekeeping?.awaitingInspection).toBe(1);
    // (90 + 20) / 2 = 55
    expect(snapshot.housekeeping?.avgTurnaroundMinutes).toBe(55);
  });
  it("reports null turnaround when nothing completed with a start time", () => {
    const snapshot = summarizeDailyActivity({ ...base, housekeepingCompleted: [completed(null, "2026-09-07T11:30:00Z")] }, "2026-09-07");
    expect(snapshot.housekeeping?.tasksCompleted).toBe(1);
    expect(snapshot.housekeeping?.avgTurnaroundMinutes).toBeNull();
  });
  it("renders in the report snapshot view and aggregates the authoritative table", () => {
    expect(reportsPanel).toContain("Room care turnover");
    expect(reportsPanel).toContain("snapshot.housekeeping");
    expect(readFileSync("lib/front-desk-reports.ts", "utf8")).toContain('from("housekeeping_tasks")');
  });
});

describe("generic resources route no longer carries the dead completion branch", () => {
  it("removes the unreachable complete_housekeeping_task RPC call", () => {
    expect(resourcesRoute).not.toContain("complete_housekeeping_task");
    // Every role is 403'd for housekeeping_tasks before that branch could run —
    // the guard chain itself stays intact.
    expect(resourcesRoute).toContain('["payments","refunds","housekeeping_tasks"].includes(resource)');
  });
});
