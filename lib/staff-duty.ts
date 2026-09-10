import { demoStore } from "@/lib/demo-store";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Role } from "@/lib/types";

/**
 * STAFF & DUTY — a read-only operational supervision view.
 *
 * HAVEN has no general shift/clock-in model, and login state is explicitly NOT
 * a duty signal. Duty here is derived from the only authoritative operational
 * records that exist: housekeeping tasks, maintenance work orders, and open
 * cash shifts. "Working" means an in_progress task/order or an open cash
 * shift; "Assigned" means open work not yet started. No shift times, breaks,
 * or off-duty rosters are invented. If a staff_shifts table is ever added, it
 * becomes the duty authority and this module joins onto it.
 */

export type StaffDutyStatus = "working" | "assigned" | "no_active_work";
export type DutyAssignmentKind = "housekeeping" | "maintenance" | "cash";

export interface StaffDutyWorkItem {
  id: string;
  source: DutyAssignmentKind;
  label: string;
  status: string;
  priority: string;
}

export interface StaffDutyWorkload {
  inProgress: number;
  assigned: number;
  completedToday: number;
}

export interface StaffDutyMember {
  id: string;
  name: string;
  role: Role;
  department: string;
  dutyStatus: StaffDutyStatus;
  currentAssignment: string | null;
  assignmentKind: DutyAssignmentKind | null;
  cashShiftOpen: boolean;
  workload: StaffDutyWorkload;
  activeWork: StaffDutyWorkItem[];
}

export interface StaffDutyDepartment {
  name: string;
  working: number;
  assigned: number;
  noActiveWork: number;
  total: number;
  activity: Record<string, number>;
}

export interface StaffDutySummary {
  working: number;
  assigned: number;
  noActiveWork: number;
  departments: number;
}

export interface StaffDutySnapshot {
  today: string;
  generatedAt: string;
  databaseMode: "supabase" | "demo";
  staff: StaffDutyMember[];
  departments: StaffDutyDepartment[];
  summary: StaffDutySummary;
  basisNote: string;
}

export const STAFF_DUTY_BASIS_NOTE =
  "Duty status is derived from live operational records — in-progress housekeeping tasks, maintenance work orders, and open cash shifts. Login activity is never used, and HAVEN keeps no shift schedule, so staff without active work are shown exactly as that.";

// The operational departments this view supervises. Owner/Admin are governance
// roles (their account administration lives in the Admin/Owner portals), and
// guests are never operational staff.
const DEPARTMENT_BY_ROLE: Record<string, string> = {
  manager: "Operations",
  front_desk: "Front Desk",
  housekeeping: "Housekeeping",
  maintenance: "Maintenance",
  accounting: "Accounting"
};
export const STAFF_DUTY_ROLES = Object.keys(DEPARTMENT_BY_ROLE) as Role[];

const OPEN_TASK_STATUSES = ["pending", "assigned", "deferred"];
const OPEN_ORDER_STATUSES = ["open", "assigned", "waiting_parts", "deferred"];

// Hotel-day boundaries in the authoritative property timezone (Asia/Manila,
// fixed UTC+8 — no DST), matching hotelToday() elsewhere in the app.
const manilaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
const dayKey = (timestamp: string | null | undefined) => (timestamp ? manilaDay.format(new Date(timestamp)) : null);
export const hotelTodayKey = () => manilaDay.format(new Date());

export interface StaffDutyInput {
  today: string;
  accounts: { id: string; name: string; role: string }[];
  housekeepingTasks: { id: string; room_number: string; task: string; task_type?: string | null; assignee?: string | null; assigned_user_id?: string | null; status: string; priority?: string | null; completed_at?: string | null }[];
  maintenanceOrders: { id: string; room_number: string; target_label?: string | null; issue: string; assignee?: string | null; assigned_user_id?: string | null; status: string; priority?: string | null; resolved_at?: string | null }[];
  openCashShifts: { staff_user_id: string; location: string }[];
  /** Demo mode has no user FKs — assignments carry names instead of ids. */
  matchByName?: boolean;
}

const taskLabel = (task: StaffDutyInput["housekeepingTasks"][number]) => `Room ${task.room_number} · ${task.task || task.task_type || "Housekeeping"}`;
const orderLabel = (order: StaffDutyInput["maintenanceOrders"][number]) => `${order.target_label || order.room_number} · ${order.issue}`;

export function deriveStaffDuty(input: StaffDutyInput): Pick<StaffDutySnapshot, "staff" | "departments" | "summary"> {
  const accounts = input.accounts.filter((account) => DEPARTMENT_BY_ROLE[account.role]);
  const owner = (assignedId: string | null | undefined, assignee: string | null | undefined) =>
    input.matchByName
      ? accounts.find((account) => account.name === (assignee ?? ""))?.id ?? assignedId ?? null
      : assignedId ?? null;

  const staff: StaffDutyMember[] = accounts.map((account) => {
    const tasks = input.housekeepingTasks.filter((task) => owner(task.assigned_user_id, task.assignee) === account.id);
    const orders = input.maintenanceOrders.filter((order) => owner(order.assigned_user_id, order.assignee) === account.id);
    const cashShift = input.openCashShifts.find((shift) => shift.staff_user_id === account.id);

    const activeTasks = tasks.filter((task) => [...OPEN_TASK_STATUSES, "in_progress"].includes(task.status));
    const activeOrders = orders.filter((order) => [...OPEN_ORDER_STATUSES, "in_progress"].includes(order.status));
    const workingTask = activeTasks.find((task) => task.status === "in_progress");
    const workingOrder = activeOrders.find((order) => order.status === "in_progress");
    const nextTask = activeTasks.find((task) => OPEN_TASK_STATUSES.includes(task.status));
    const nextOrder = activeOrders.find((order) => OPEN_ORDER_STATUSES.includes(order.status));

    const inProgress = (workingTask ? 1 : 0) + (workingOrder ? 1 : 0);
    const assigned =
      activeTasks.filter((task) => OPEN_TASK_STATUSES.includes(task.status)).length +
      activeOrders.filter((order) => OPEN_ORDER_STATUSES.includes(order.status)).length;
    const completedToday =
      tasks.filter((task) => task.status === "completed" && dayKey(task.completed_at) === input.today).length +
      orders.filter((order) => order.status === "resolved" && dayKey(order.resolved_at) === input.today).length;

    // A cash shift is cash-handling responsibility only — it never defines a
    // person's whole duty status, but while one is open the cashier is working.
    const dutyStatus: StaffDutyStatus = inProgress > 0 || cashShift ? "working" : assigned > 0 ? "assigned" : "no_active_work";

    const current = workingTask
      ? { label: taskLabel(workingTask), kind: "housekeeping" as DutyAssignmentKind }
      : workingOrder
        ? { label: orderLabel(workingOrder), kind: "maintenance" as DutyAssignmentKind }
        : cashShift
          ? { label: `Cash handling · ${cashShift.location}`, kind: "cash" as DutyAssignmentKind }
          : nextTask
            ? { label: taskLabel(nextTask), kind: "housekeeping" as DutyAssignmentKind }
            : nextOrder
              ? { label: orderLabel(nextOrder), kind: "maintenance" as DutyAssignmentKind }
              : null;

    const activeWork: StaffDutyWorkItem[] = [
      ...activeTasks.map((task) => ({ id: task.id, source: "housekeeping" as DutyAssignmentKind, label: taskLabel(task), status: task.status, priority: String(task.priority ?? "normal") })),
      ...activeOrders.map((order) => ({ id: order.id, source: "maintenance" as DutyAssignmentKind, label: orderLabel(order), status: order.status, priority: String(order.priority ?? "normal") })),
      ...(cashShift ? [{ id: `cash-${account.id}`, source: "cash" as DutyAssignmentKind, label: `Open cash shift · ${cashShift.location}`, status: "open", priority: "normal" }] : [])
    ];

    return {
      id: account.id,
      name: account.name,
      role: account.role as Role,
      department: DEPARTMENT_BY_ROLE[account.role],
      dutyStatus,
      currentAssignment: current?.label ?? null,
      assignmentKind: current?.kind ?? null,
      cashShiftOpen: Boolean(cashShift),
      workload: { inProgress, assigned, completedToday },
      activeWork
    };
  });

  const departmentNames = [...new Set(staff.map((member) => member.department))];
  const departments: StaffDutyDepartment[] = departmentNames.map((name) => {
    const members = staff.filter((member) => member.department === name);
    return {
      name,
      working: members.filter((member) => member.dutyStatus === "working").length,
      assigned: members.filter((member) => member.dutyStatus === "assigned").length,
      noActiveWork: members.filter((member) => member.dutyStatus === "no_active_work").length,
      total: members.length,
      activity: {
        Cleaning: members.filter((member) => member.activeWork.some((work) => work.source === "housekeeping" && work.status === "in_progress")).length,
        "Work order": members.filter((member) => member.activeWork.some((work) => work.source === "maintenance" && work.status === "in_progress")).length,
        "Cash handling": members.filter((member) => member.cashShiftOpen).length
      }
    };
  });

  return {
    staff,
    departments,
    summary: {
      working: staff.filter((member) => member.dutyStatus === "working").length,
      assigned: staff.filter((member) => member.dutyStatus === "assigned").length,
      noActiveWork: staff.filter((member) => member.dutyStatus === "no_active_work").length,
      departments: departments.length
    }
  };
}

function snapshot(input: StaffDutyInput, databaseMode: "supabase" | "demo"): StaffDutySnapshot {
  return { today: input.today, generatedAt: new Date().toISOString(), databaseMode, basisNote: STAFF_DUTY_BASIS_NOTE, ...deriveStaffDuty(input) };
}

function demoSnapshot(): StaffDutySnapshot {
  // Demo store rows carry assignee names rather than user FKs; role comes from
  // the seeded staff department. Cash shifts don't exist in demo data.
  const departmentRole: Record<string, Role> = { Operations: "manager", "Front Office": "front_desk", "Front Desk": "front_desk", Housekeeping: "housekeeping", Maintenance: "maintenance", Accounting: "accounting" };
  const accounts = demoStore.staff
    .map((row) => ({ id: String(row.id), name: String(row.name), role: departmentRole[String(row.department)] ?? "front_desk" }))
    .filter((account) => DEPARTMENT_BY_ROLE[account.role]);
  return snapshot(
    {
      today: hotelTodayKey(),
      accounts,
      housekeepingTasks: demoStore.housekeeping_tasks.map((row) => ({
        id: String(row.id), room_number: String(row.room_number ?? ""), task: String(row.task ?? ""), task_type: row.task_type != null ? String(row.task_type) : null,
        assignee: row.assignee ? String(row.assignee) : null, assigned_user_id: null, status: String(row.status ?? "pending"), priority: row.priority ? String(row.priority) : "normal", completed_at: row.completed_at ? String(row.completed_at) : null
      })),
      maintenanceOrders: demoStore.maintenance_orders.map((row) => ({
        id: String(row.id), room_number: String(row.room_number ?? ""), target_label: row.target_label ? String(row.target_label) : null, issue: String(row.issue ?? ""),
        assignee: row.assignee ? String(row.assignee) : null, assigned_user_id: null, status: String(row.status ?? "open"), priority: row.priority ? String(row.priority) : "normal", resolved_at: row.resolved_at ? String(row.resolved_at) : null
      })),
      openCashShifts: [],
      matchByName: true
    },
    "demo"
  );
}

export async function getStaffDutySnapshot(client: SupabaseClient | null): Promise<StaffDutySnapshot> {
  if (!client) return demoSnapshot();
  const today = hotelTodayKey();
  const dayStart = `${today}T00:00:00+08:00`; // Asia/Manila, fixed offset
  const taskColumns = "id,room_number,task,task_type,assignee,assigned_user_id,status,priority,completed_at";
  const orderColumns = "id,room_number,target_label,issue,assignee,assigned_user_id,status,priority,resolved_at";
  const [accountsResult, openTasksResult, completedTasksResult, openOrdersResult, resolvedOrdersResult, shiftsResult] = await Promise.all([
    client.from("user_accounts").select("id,name,role").eq("active", true).in("role", STAFF_DUTY_ROLES as string[]).order("name"),
    client.from("housekeeping_tasks").select(taskColumns).in("status", [...OPEN_TASK_STATUSES, "in_progress"]),
    client.from("housekeeping_tasks").select(`id,room_number,task,task_type,assignee,assigned_user_id,status,priority,completed_at`).eq("status", "completed").gte("completed_at", dayStart),
    client.from("maintenance_orders").select(orderColumns).in("status", [...OPEN_ORDER_STATUSES, "in_progress"]),
    client.from("maintenance_orders").select(orderColumns).eq("status", "resolved").gte("resolved_at", dayStart),
    client.from("cash_shifts").select("staff_user_id,location").eq("status", "open")
  ]);
  const firstError = [accountsResult, openTasksResult, completedTasksResult, openOrdersResult, resolvedOrdersResult, shiftsResult].find((result) => result.error)?.error;
  if (firstError) throw firstError;
  return snapshot(
    {
      today,
      accounts: accountsResult.data ?? [],
      housekeepingTasks: [...(openTasksResult.data ?? []), ...(completedTasksResult.data ?? [])],
      maintenanceOrders: [...(openOrdersResult.data ?? []), ...(resolvedOrdersResult.data ?? [])],
      openCashShifts: (shiftsResult.data ?? []).map((row) => ({ staff_user_id: row.staff_user_id as string, location: String(row.location ?? "Front Desk") }))
    },
    "supabase"
  );
}
