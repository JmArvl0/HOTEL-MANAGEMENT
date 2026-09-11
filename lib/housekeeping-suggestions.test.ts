// Roadmap Phase 6 — housekeeping assignment suggestions. The planner is pure
// and ADVISORY: it ranks unassigned open work and balances it across teammates
// by workload. These tests pin the ranking, the balancing, the exclusions, and
// the advisory surface contracts (a human confirms every assignment; nothing
// auto-assigns; duty comes from the Staff & Duty derivation, never login).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { suggestAssignments, type SuggestionStaff, type SuggestionTask } from "./housekeeping-suggestions";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const task = (overrides: Partial<SuggestionTask> & { id: string }): SuggestionTask => ({
  room_number: "101", task: "Clean room", task_type: "checkout_cleaning", priority: "normal",
  status: "pending", assignee: null, assigned_user_id: null, created_at: "2026-09-30T08:00:00Z", next_arrival: null, ...overrides
});
const staff = (id: string, name: string, openAssignments = 0): SuggestionStaff => ({ id, name, openAssignments });

describe("suggestAssignments", () => {
  it("returns no plan when there are no housekeeping teammates", () => {
    expect(suggestAssignments([task({ id: "t1" })], [])).toEqual([]);
  });

  it("orders by stored priority, then next arrival, then age", () => {
    const tasks = [
      task({ id: "low", priority: "low" }),
      task({ id: "urgent", priority: "urgent" }),
      task({ id: "normal-arrival", priority: "normal", next_arrival: "2026-10-02" }),
      task({ id: "normal-sooner", priority: "normal", next_arrival: "2026-10-01" }),
      task({ id: "normal-no-arrival-old", priority: "normal", created_at: "2026-09-28T08:00:00Z" }),
      task({ id: "normal-no-arrival-new", priority: "normal", created_at: "2026-09-29T08:00:00Z" })
    ];
    const plan = suggestAssignments(tasks, [staff("s1", "Ana")]);
    expect(plan.map((row) => row.taskId)).toEqual(["urgent", "normal-sooner", "normal-arrival", "normal-no-arrival-old", "normal-no-arrival-new", "low"]);
  });

  it("balances round-robin — fewest open assignments first, existing workload counts", () => {
    const tasks = [task({ id: "t1" }), task({ id: "t2" }), task({ id: "t3" }), task({ id: "t4" })];
    // Ben already carries 2 open tasks; Ana 0; Cara 1 → dealing order Ana, Cara, Ana, Ben.
    const plan = suggestAssignments(tasks, [staff("s2", "Ben", 2), staff("s1", "Ana", 0), staff("s3", "Cara", 1)]);
    expect(plan.map((row) => `${row.taskId}→${row.staffName}`)).toEqual(["t1→Ana", "t2→Cara", "t3→Ana", "t4→Ben"]);
  });

  it("breaks workload ties by name so the plan is deterministic", () => {
    const plan = suggestAssignments([task({ id: "t1" }), task({ id: "t2" })], [staff("s2", "Zoe"), staff("s1", "Ana")]);
    expect(plan.map((row) => row.staffName)).toEqual(["Ana", "Zoe"]);
  });

  it("excludes inspections, assigned tasks, and closed work — only open unassigned work is planned", () => {
    const tasks = [
      task({ id: "inspection", task_type: "inspection" }),
      task({ id: "assigned-user", assigned_user_id: "s1" }),
      task({ id: "assigned-name", assignee: "Ana" }),
      task({ id: "done", status: "completed" }),
      task({ id: "cancelled", status: "cancelled" }),
      task({ id: "planned" })
    ];
    const plan = suggestAssignments(tasks, [staff("s1", "Ana")]);
    expect(plan.map((row) => row.taskId)).toEqual(["planned"]);
  });

  it("carries a human-readable reason naming priority, arrival, and the balancing basis", () => {
    const [row] = suggestAssignments(
      [task({ id: "t1", priority: "urgent", next_arrival: "2026-10-01" })],
      [staff("s1", "Ana", 1)]
    );
    expect(row.reason).toContain("urgent priority");
    expect(row.reason).toContain("next arrival 2026-10-01");
    expect(row.reason).toContain("Ana has the fewest open tasks (2)");
    expect(row.roomNumber).toBe("101");
    expect(row.taskType).toBe("checkout cleaning");
  });
});

describe("advisory surface contracts", () => {
  it("the route guards suggestion roles and reuses the Staff & Duty derivation for workload", () => {
    const route = read("app/api/housekeeping/assignment-suggestions/route.ts");
    expect(route).toMatch(/\["housekeeping",\s*"manager",\s*"owner",\s*"admin"\]/);
    expect(route).toContain("getStaffDutySnapshot");
    expect(route).toContain("member.activeWork.filter((work) => work.source === \"housekeeping\")");
    expect(route).toContain("suggestAssignments(tasks, staff)");
  });

  it("the queue panel labels the plan as a suggestion and never assigns on its own", () => {
    const panel = read("components/manager/housekeeping-queue-panel.tsx");
    expect(panel).toContain("Suggested assignments");
    expect(panel).toContain("nothing is assigned automatically");
    expect(panel).toMatch(/applySuggestion\?\.\(suggestion\)|applySuggestion\(suggestion\)/);
    // Applying routes through the audited assign endpoint — no direct write here.
    const dashboard = read("components/manager/manager-dashboard-client.tsx");
    expect(dashboard).toMatch(/\/api\/housekeeping\/tasks\/\$\{s\.taskId\}\/assign/);
    expect(dashboard).toContain("Assigned from the suggested plan");
  });

  it("housekeeping self-assigns and owner assigns the suggested teammate (Manager coordinates only)", () => {
    const dashboard = read("components/manager/manager-dashboard-client.tsx");
    expect(dashboard).toContain("const self = user.role === \"housekeeping\"");
    expect(dashboard).toMatch(/assignedUserId: s\.staffId/);
    const panel = read("components/manager/housekeeping-queue-panel.tsx");
    expect(panel).toContain("Suggestion only — coordinate via Prioritize");
    expect(panel).toContain("\"Assign to me\"");
  });
});
