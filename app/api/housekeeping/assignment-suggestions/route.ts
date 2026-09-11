import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { demoStore } from "@/lib/demo-store";
import { supabase } from "@/lib/supabase";
import { getStaffDutySnapshot, hotelTodayKey } from "@/lib/staff-duty";
import { SUGGESTION_BASIS_NOTE, suggestAssignments, type SuggestionStaff, type SuggestionTask } from "@/lib/housekeeping-suggestions";
import type { Role } from "@/lib/types";

// Roadmap Phase 6 — read-only assignment ASSISTANCE for the Housekeeping queue.
// Returns an advisory plan (open unassigned tasks → teammates by current
// workload). Assignments happen only through the existing audited
// POST /api/housekeeping/tasks/[id]/assign — a person confirms each one.
// Duty/workload reuses the Staff & Duty derivation: operational records only,
// never login state. Housekeeping/Manager/Owner/Admin may read the plan.

const SUGGESTION_ROLES: Role[] = ["housekeeping", "manager", "owner", "admin"];

function demoPlan() {
  // Demo store rows carry assignee names rather than user FKs (same caveat as
  // the Staff & Duty demo snapshot).
  const open = ["pending", "assigned", "deferred"];
  const staff: SuggestionStaff[] = demoStore.staff
    .filter((row) => row.department === "Housekeeping")
    .map((row) => ({
      id: String(row.id),
      name: String(row.name),
      openAssignments: demoStore.housekeeping_tasks.filter((task) => open.includes(String(task.status ?? "pending")) && task.assignee === row.name).length
    }));
  const tasks: SuggestionTask[] = demoStore.housekeeping_tasks
    .filter((row) => open.includes(String(row.status ?? "pending")) && !row.assignee)
    .map((row) => ({
      id: String(row.id), room_number: String(row.room_number ?? ""), task: String(row.task ?? ""),
      task_type: row.task_type != null ? String(row.task_type) : null, priority: row.priority ? String(row.priority) : "normal",
      status: String(row.status ?? "pending"), assignee: null, assigned_user_id: null,
      created_at: row.created_at ? String(row.created_at) : null, next_arrival: null
    }));
  return { suggestions: suggestAssignments(tasks, staff), staff, basisNote: SUGGESTION_BASIS_NOTE, databaseMode: "demo" as const };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!SUGGESTION_ROLES.includes(session.user.role as Role)) return NextResponse.json({ error: "Housekeeping suggestion access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ data: demoPlan() });
  try {
    const today = hotelTodayKey();
    // Open unassigned tasks (inspection workflow excluded by the pure planner).
    const tasksResult = await supabase
      .from("housekeeping_tasks")
      .select("id,room_id,room_number,task,task_type,assignee,assigned_user_id,priority,status,created_at")
      .in("status", ["pending", "assigned", "deferred"])
      .is("assigned_user_id", null)
      .order("created_at", { ascending: true });
    if (tasksResult.error) throw tasksResult.error;
    const rows = tasksResult.data ?? [];
    // Next arrival per room (same decoration the queue cards show).
    const roomIds = Array.from(new Set(rows.map((row) => row.room_id).filter(Boolean))) as string[];
    const arrivalsResult = roomIds.length
      ? await supabase.from("reservations").select("room_id,check_in").in("room_id", roomIds).in("status", ["pending", "confirmed"]).gte("check_in", today).order("check_in", { ascending: true })
      : { data: [] as { room_id: string; check_in: string }[], error: null as null };
    if (arrivalsResult.error) throw arrivalsResult.error;
    const tasks: SuggestionTask[] = rows.map((row) => ({
      ...(row as unknown as SuggestionTask),
      next_arrival: arrivalsResult.data?.find((arrival) => arrival.room_id === row.room_id)?.check_in ?? null
    }));
    // Teammates + workload from the Staff & Duty derivation (operational
    // records only). Housekeeping work already on their plate seeds the
    // round-robin; maintenance orders and cash shifts never influence it.
    const duty = await getStaffDutySnapshot(supabase);
    const staff: SuggestionStaff[] = duty.staff
      .filter((member) => member.role === "housekeeping")
      .map((member) => ({ id: member.id, name: member.name, openAssignments: member.activeWork.filter((work) => work.source === "housekeeping").length }));
    return NextResponse.json({ data: { suggestions: suggestAssignments(tasks, staff), staff, basisNote: SUGGESTION_BASIS_NOTE, databaseMode: "supabase" } });
  } catch {
    return NextResponse.json({ error: "Unable to load assignment suggestions." }, { status: 500 });
  }
}
