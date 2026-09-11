// Roadmap Phase 6 — housekeeping assignment ASSISTANCE, advisory only.
//
// The system suggests a balanced plan; a human applies it through the existing
// audited assign workflow (housekeeping self-assign, owner/admin assign).
// Nothing here assigns anything. Duty/workload comes from the Staff & Duty
// derivation (operational records only — login is never a duty signal), and no
// skill scores are invented: the only ranking inputs are the task's stored
// priority, the room's next arrival, and each teammate's current open work.

export const SUGGESTION_BASIS_NOTE =
  "Suggestions balance open tasks across Housekeeping teammates by current workload (derived from live operational records — never login state). A person confirms every assignment.";

export interface SuggestionTask {
  id: string;
  room_number: string;
  task: string;
  task_type: string | null;
  priority: string | null;
  status: string;
  assignee: string | null;
  assigned_user_id: string | null;
  created_at: string | null;
  /** Next pending/confirmed arrival for the room, if any — drives urgency. */
  next_arrival?: string | null;
}

export interface SuggestionStaff {
  id: string;
  name: string;
  /** Active housekeeping work already on this teammate's plate. */
  openAssignments: number;
}

export interface AssignmentSuggestion {
  taskId: string;
  roomNumber: string;
  taskType: string;
  priority: string;
  staffId: string;
  staffName: string;
  /** Human-readable why — shown verbatim next to the confirm button. */
  reason: string;
}

const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const openStatuses = ["pending", "assigned", "deferred"];

const label = (value: string | null | undefined) => String(value ?? "").replaceAll("_", " ") || "Housekeeping";

/**
 * Pure planner: unassigned open tasks (inspections excluded — those belong to
 * the inspection workflow), ordered by stored priority → next arrival → age,
 * dealt round-robin to the teammate carrying the fewest open assignments
 * (ties broken by name so the plan is deterministic). No staff → no plan.
 */
export function suggestAssignments(tasks: SuggestionTask[], staff: SuggestionStaff[]): AssignmentSuggestion[] {
  const candidates = [...staff].sort((a, b) => a.name.localeCompare(b.name));
  if (candidates.length === 0) return [];

  const queue = tasks
    .filter((task) => openStatuses.includes(task.status) && !task.assigned_user_id && !task.assignee && task.task_type !== "inspection")
    .sort((a, b) =>
      (priorityRank[String(a.priority)] ?? 3) - (priorityRank[String(b.priority)] ?? 3)
      || String(a.next_arrival ?? "9999").localeCompare(String(b.next_arrival ?? "9999"))
      || String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
    );

  // Running load = existing open work + suggestions already handed out, so the
  // plan stays balanced as it is dealt; ties rotate to whoever has received
  // the fewest suggestions (then name) so one teammate never sweeps a run.
  const load = new Map(candidates.map((member) => [member.id, member.openAssignments]));
  const given = new Map(candidates.map((member) => [member.id, 0]));
  return queue.map((task) => {
    const lightest = candidates.reduce((best, member) =>
      (load.get(member.id) ?? 0) < (load.get(best.id) ?? 0)
      || ((load.get(member.id) ?? 0) === (load.get(best.id) ?? 0) && (given.get(member.id) ?? 0) < (given.get(best.id) ?? 0))
        ? member : best, candidates[0]);
    load.set(lightest.id, (load.get(lightest.id) ?? 0) + 1);
    given.set(lightest.id, (given.get(lightest.id) ?? 0) + 1);
    const priority = String(task.priority ?? "normal");
    const reason = [
      `${priority} priority`,
      task.next_arrival ? `next arrival ${task.next_arrival}` : null,
      `${lightest.name} has the fewest open tasks (${load.get(lightest.id) ?? 1})`
    ].filter(Boolean).join(" · ");
    return { taskId: task.id, roomNumber: String(task.room_number), taskType: label(task.task_type), priority, staffId: lightest.id, staffName: lightest.name, reason };
  });
}
