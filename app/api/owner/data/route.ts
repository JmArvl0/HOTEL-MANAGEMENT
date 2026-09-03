import { NextResponse } from "next/server";
import { getAccountingLedger } from "@/lib/accounting";
import { ROLE_CAPABILITIES } from "@/lib/admin";
import { guardOwner, ownerGuardFailed } from "@/lib/owner-route";


type Row = Record<string, unknown>;
const activeMaintenance = new Set(["open", "assigned", "in_progress", "waiting_parts", "deferred"]);
const localDate = (value: unknown, timeZone: string) => value ? new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(String(value))) : "";
const shiftDay = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const sum = (rows: Row[], key: string) => rows.reduce((total, row) => total + Number(row[key] || 0), 0);

export async function GET(request: Request) {
  const context = await guardOwner();
  if (ownerGuardFailed(context)) return context;
  const section = new URL(request.url).searchParams.get("section") ?? "overview";
  const db = context.client;
  try {
    if (section === "financial") {
      const ledger = await getAccountingLedger("owner");
      return NextResponse.json({ data: ledger });
    }
    if (section === "admins") {
      const { data, error } = await db.from("user_accounts").select("id,email,name,role,active,account_status,recovery_required,phone,department,employee_reference,auth_version,created_at,updated_at").in("role", ["owner", "admin"]).order("created_at");
      if (error) throw error;
      return NextResponse.json({ data });
    }
    if (section === "roles") return NextResponse.json({ data: { catalogue: ROLE_CAPABILITIES, ownerPrinciples: ["Broad executive visibility", "Admin and protected-role governance", "Critical policy authority", "Owner-level exception authorization", "No routine departmental execution", "No audit or financial-history bypass"] } });
    if (section === "policy") {
      const { data, error } = await db.from("hotel_operational_policies").select("*").eq("key", "default").single();
      if (error) throw error;
      return NextResponse.json({ data });
    }
    if (section === "audit" || section === "security") {
      let query = db.from("audit_logs").select("id,user_id,action,entity_type,entity_id,before_data,after_data,ip_address,created_at").order("created_at", { ascending: false }).limit(150);
      if (section === "security") query = query.or("action.ilike.admin_%,action.ilike.owner_%,action.ilike.%recovery%,action.ilike.%password%,action.ilike.%role%,action.ilike.%status%");
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ data });
    }
    if (section === "exceptions") {
      const { data, error } = await db.from("manager_approval_requests").select("id,request_type,related_entity_type,related_entity_id,reservation_id,department,severity,reason,requested_action,normal_policy_result,requested_by,requested_at,status,reviewed_by,reviewed_at,decision_reason,execution_status,executed_by,executed_at,version,authority_level,owner_escalated_by,owner_escalated_at,owner_escalation_reason,owner_reviewed_by,owner_reviewed_at").eq("authority_level", "owner").order("requested_at", { ascending: false }).limit(150);
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      const reservationIds = [...new Set(rows.map((row) => String(row.reservation_id || "")).filter(Boolean))];
      const userIds = [...new Set(rows.flatMap((row) => [row.requested_by, row.owner_escalated_by, row.owner_reviewed_by].map((value) => String(value || ""))).filter(Boolean))];
      const [reservations, users] = await Promise.all([
        reservationIds.length ? db.from("reservations").select("id,confirmation_number,guest_name,room_type,room_number,check_in,check_out,status,payment_status").in("id", reservationIds) : Promise.resolve({ data: [] }),
        userIds.length ? db.from("user_accounts").select("id,name,role").in("id", userIds) : Promise.resolve({ data: [] })
      ]);
      const enriched = rows.map((row) => {
        const reservation = reservations.data?.find((item) => item.id === row.reservation_id);
        const requester = users.data?.find((item) => item.id === row.requested_by);
        const escalator = users.data?.find((item) => item.id === row.owner_escalated_by);
        return { ...row, reservation_reference: reservation?.confirmation_number ?? row.reservation_id, guest_name: reservation?.guest_name ?? null, stay_dates: reservation ? `${reservation.check_in} to ${reservation.check_out}` : null, reservation_status: reservation?.status ?? null, requester_name: requester?.name ?? "Unknown", escalator_name: escalator?.name ?? "Unknown" };
      });
      return NextResponse.json({ data: enriched });
    }

    const [policyResult, reservationResult, roomResult, taskResult, maintenanceResult, requestResult, invoiceResult, paymentResult, userResult, approvalResult, auditResult] = await Promise.all([
      db.from("hotel_operational_policies").select("hotel_timezone,housekeeping_turnover_overdue_minutes,guest_request_overdue_minutes").eq("key", "default").maybeSingle(),
      db.from("reservations").select("id,confirmation_number,room_id,room_number,room_type,check_in,check_out,status,source,total,created_at").order("created_at", { ascending: false }).limit(500),
      db.from("rooms").select("id,number,floor,type,status,housekeeping,administratively_active").order("number"),
      db.from("housekeeping_tasks").select("id,room_id,room_number,task,priority,status,created_at,completed_at").order("created_at", { ascending: false }).limit(300),
      db.from("maintenance_orders").select("id,room_id,room_number,issue,priority,severity,status,serviceability_impact,assigned_user_id,created_at,completed_at").order("created_at", { ascending: false }).limit(300),
      db.from("guest_requests").select("id,department,priority,severity,status,escalation_status,created_at,due_at").order("created_at", { ascending: false }).limit(300),
      db.from("invoices").select("id,reservation_id,amount,paid,balance,credit_balance,status,created_at").order("created_at", { ascending: false }).limit(500),
      db.from("payments").select("id,reservation_id,purpose,method,amount,status,verified_at,created_at").order("created_at", { ascending: false }).limit(500),
      db.from("user_accounts").select("id,role,active,account_status,recovery_required,created_at"),
      db.from("manager_approval_requests").select("id,request_type,department,severity,status,execution_status,authority_level,requested_at").order("requested_at", { ascending: false }).limit(300),
      db.from("audit_logs").select("id,action,entity_type,entity_id,created_at").order("created_at", { ascending: false }).limit(12)
    ]);
    for (const result of [reservationResult, roomResult, taskResult, maintenanceResult, requestResult, invoiceResult, paymentResult, userResult, approvalResult, auditResult]) if (result.error) throw result.error;
    const timeZone = policyResult.data?.hotel_timezone ?? "Asia/Manila";
    const today = localDate(new Date(), timeZone);
    const reservations = (reservationResult.data ?? []) as Row[], rooms = (roomResult.data ?? []) as Row[], tasks = (taskResult.data ?? []) as Row[], maintenance = (maintenanceResult.data ?? []) as Row[], requests = (requestResult.data ?? []) as Row[], invoices = (invoiceResult.data ?? []) as Row[], payments = (paymentResult.data ?? []) as Row[], users = (userResult.data ?? []) as Row[], approvals = (approvalResult.data ?? []) as Row[];
    const blockedOrders = maintenance.filter((row) => activeMaintenance.has(String(row.status)) && ["blocked", "out_of_service"].includes(String(row.serviceability_impact)));
    const blockedRoomIds = new Set(blockedOrders.map((row) => row.room_id));
    const serviceableRooms = rooms.filter((row) => row.administratively_active !== false && !blockedRoomIds.has(row.id));
    const occupied = rooms.filter((row) => row.status === "occupied").length;
    const now = Date.now(), taskOverdue = Number(policyResult.data?.housekeeping_turnover_overdue_minutes ?? 180), requestOverdue = Number(policyResult.data?.guest_request_overdue_minutes ?? 60);
    const ageMinutes = (value: unknown) => value ? Math.max((now - new Date(String(value)).getTime()) / 60000, 0) : 0;
    const overdueTasks = tasks.filter((row) => row.status !== "completed" && ageMinutes(row.created_at) > taskOverdue);
    const overdueRequests = requests.filter((row) => row.status !== "completed" && ((row.due_at && new Date(String(row.due_at)).getTime() < now) || ageMinutes(row.created_at) > requestOverdue));
    const settled = payments.filter((row) => row.status === "paid");
    const financial = { grossCollected: sum(settled.filter((row) => row.purpose !== "refund"), "amount"), refundsIssued: sum(settled.filter((row) => row.purpose === "refund"), "amount"), outstandingBalance: sum(invoices, "balance"), folioCredit: sum(invoices, "credit_balance") };
    const days = Array.from({ length: 7 }, (_, index) => shiftDay(today, index - 6));
    const trend = days.map((day) => {
      const nights = reservations.filter((row) => ["confirmed", "checked_in", "checked_out"].includes(String(row.status)) && String(row.check_in) <= day && String(row.check_out) > day).length;
      const dayPayments = settled.filter((row) => localDate(row.verified_at || row.created_at, timeZone) === day);
      return { day, occupancy: Math.round((nights / Math.max(serviceableRooms.length, 1)) * 100), collected: sum(dayPayments.filter((row) => row.purpose !== "refund"), "amount"), refunded: sum(dayPayments.filter((row) => row.purpose === "refund"), "amount") };
    });
    const roleCounts = Object.fromEntries(Object.keys(ROLE_CAPABILITIES).map((role) => [role, users.filter((row) => row.role === role).length]));
    const departmentSummary = {
      frontDesk: { arrivals: reservations.filter((row) => row.check_in === today && ["confirmed", "checked_in"].includes(String(row.status))).length, departures: reservations.filter((row) => row.check_out === today && ["confirmed", "checked_in"].includes(String(row.status))).length, unassignedArrivals: reservations.filter((row) => row.check_in === today && row.status === "confirmed" && !row.room_id).length },
      housekeeping: { open: tasks.filter((row) => row.status !== "completed").length, overdue: overdueTasks.length },
      maintenance: { open: maintenance.filter((row) => activeMaintenance.has(String(row.status))).length, critical: maintenance.filter((row) => activeMaintenance.has(String(row.status)) && ["urgent", "critical"].includes(String(row.priority || row.severity))).length, blockedRooms: blockedRoomIds.size },
      guestService: { open: requests.filter((row) => row.status !== "completed").length, overdue: overdueRequests.length, escalated: requests.filter((row) => ["escalated", "coordinated"].includes(String(row.escalation_status))).length },
      accounting: { outstandingBalance: financial.outstandingBalance, refundsIssued: financial.refundsIssued },
      management: { pending: approvals.filter((row) => row.status === "pending" && row.authority_level !== "owner").length, ownerEscalations: approvals.filter((row) => row.status === "pending" && row.authority_level === "owner").length }
    };
    const data = { timeZone, today, metrics: { occupancy: Math.round((occupied / Math.max(serviceableRooms.length, 1)) * 100), occupied, availableRooms: rooms.filter((row) => row.administratively_active !== false && row.status === "available" && row.housekeeping === "clean" && !blockedRoomIds.has(row.id)).length, blockedRooms: blockedRoomIds.size, outOfServiceRooms: blockedOrders.filter((row) => row.serviceability_impact === "out_of_service").length, overdueHousekeeping: overdueTasks.length, criticalMaintenance: departmentSummary.maintenance.critical, unresolvedEscalations: departmentSummary.guestService.escalated, activeStaff: users.filter((row) => row.role !== "guest" && row.active).length, inactiveStaff: users.filter((row) => row.role !== "guest" && !row.active).length, securityWarnings: users.filter((row) => row.recovery_required || row.account_status === "suspended").length, pendingOwnerExceptions: departmentSummary.management.ownerEscalations }, financial: { ...financial, netRevenue: Math.max(financial.grossCollected - financial.refundsIssued, 0) }, trend, roleCounts, departmentSummary, risks: { blockedRooms: blockedOrders.slice(0, 20), overdueHousekeeping: overdueTasks.slice(0, 20), overdueGuestRequests: overdueRequests.slice(0, 20), criticalMaintenance: maintenance.filter((row) => activeMaintenance.has(String(row.status)) && ["urgent", "critical"].includes(String(row.priority || row.severity))).slice(0, 20) }, recentAudit: auditResult.data ?? [] };
    if (section === "operations") return NextResponse.json({ data: { metrics: data.metrics, departmentSummary, risks: data.risks, trend } });
    if (section === "departments") return NextResponse.json({ data: { departmentSummary, risks: data.risks } });
    return NextResponse.json({ data });
  } catch {
    return NextResponse.json({ error: "Unable to load executive governance data." }, { status: 500 });
  }
}