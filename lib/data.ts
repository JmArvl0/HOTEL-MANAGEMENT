import { demoStore, makeId } from "@/lib/demo-store";
import { env } from "@/lib/env";
import { hotelToday } from "@/lib/booking";
import { supabase } from "@/lib/supabase";
import { bookedOccupancyTrend } from "@/lib/analytics/occupancy";
import type { ReservationLike } from "@/lib/analytics/types";
import { depositSlaSummary, DEFAULT_DEPOSIT_SLA_HOURS } from "@/lib/deposit-sla";
import { maintenanceBlockedRoomIds, roomBoardState, type RackReservation, type RackRoom } from "@/lib/room-rack";
import { roomRackStays } from "@/lib/reservation-workspace";
import type { DashboardData, RecordItem, Resource, Role } from "@/lib/types";
import { readAllRows } from "@/lib/read-all-rows";

export const databaseMode = env.databaseMode;

export async function list(resource: Resource): Promise<RecordItem[]> {
  if (!supabase) return demoStore[resource];
  return readAllRows<RecordItem>(() => supabase!.from(resource).select("*").order("created_at", { ascending: false }));
}

export async function create(resource: Resource, payload: Omit<RecordItem, "id">): Promise<RecordItem> {
  if (!supabase) {
    const item = { ...payload, id: makeId(resource) } as RecordItem;
    demoStore[resource].unshift(item);
    return item;
  }
  const { data, error } = await supabase.from(resource).insert(payload).select().single();
  if (error) throw error;
  return data as RecordItem;
}

export async function update(resource: Resource, id: string, payload: Partial<RecordItem>): Promise<RecordItem> {
  if (!supabase) {
    const index = demoStore[resource].findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Record not found");
    demoStore[resource][index] = { ...demoStore[resource][index], ...payload };
    return demoStore[resource][index];
  }
  const { data, error } = await supabase.from(resource).update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data as RecordItem;
}

export async function getDashboard(role: Role, userId?: string): Promise<DashboardData> {
  const [reservations, rooms, tasks, invoices, payments, requests, maintenance] = await Promise.all([list("reservations"), list("rooms"), list("housekeeping_tasks"), list("invoices"), list("payments"), list("guest_requests"), list("maintenance_orders")]);
  const today = hotelToday();
  const managerRole = role === "manager";
  const occupied = rooms.filter((record) => record.status === "occupied").length;
  const activeMaintenanceStatuses = new Set(["open", "assigned", "in_progress", "waiting_parts", "deferred"]);
  // MGR-002: one shared blocked-room derivation (room_id link with a room
  // number fallback), so metrics, board, and gates can never disagree.
  const blockedMaintenanceRoomIds = maintenanceBlockedRoomIds(
    maintenance.map((order) => ({ room_id: order.room_id, room_number: order.room_number, status: order.status, serviceability_impact: order.serviceability_impact })),
    rooms.map((room) => ({ id: String(room.id), number: room.number }))
  );
  // MGR-001/MGR-002: readiness slices are the board's own state histogram —
  // one derivation (holds + blocks included) feeding Overview, Reports, and
  // the board, so the three surfaces cannot disagree with each other.
  const stays = reservations as unknown as RackReservation[];
  const rackReservations = managerRole ? roomRackStays(stays, today) : stays;
  const boardStateById = new Map(rooms.map((room) => [String(room.id), roomBoardState(room as unknown as RackRoom, rackReservations, today, blockedMaintenanceRoomIds).state]));
  const countBoardState = (state: string) => rooms.filter((room) => boardStateById.get(String(room.id)) === state).length;
  const serviceableRooms = rooms.filter((record) => record.administratively_active !== false && !blockedMaintenanceRoomIds.has(record.id)).length;
  const financialRole = ["manager", "front_desk", "accounting"].includes(role);
  const operationalRole = ["manager", "front_desk"].includes(role);
  const revenue = financialRole ? invoices.reduce((sum, item) => sum + Number(item.paid || 0), 0) : 0;
  // Occupancy history is BOOKED occupancy — the reservations themselves, one point per
  // hotel day for the trailing week, on the engine's shared night-covering basis
  // (bookedOccupancyTrend). It is measured from reservation stay dates, so it is not the
  // live room rack behind metrics.occupancy/roomMix: a reservation covering tonight whose
  // room Front Desk has not marked occupied counts here and not there. The Reports and
  // Overview surfaces label both accordingly.
  const bookedHistory = bookedOccupancyTrend(reservations as unknown as ReservationLike[], serviceableRooms, today, managerRole ? 14 : 7);
  const occupancyTrend = bookedHistory.slice(-7);
  const activeArrivals = reservations.filter((record) => record.check_in === today && ["confirmed", "checked_in"].includes(String(record.status)));
  const activeDepartures = reservations.filter((record) => record.check_out === today && ["confirmed", "checked_in"].includes(String(record.status)));
  const online = reservations.filter((record) => record.source === "Website" && ["pending", "confirmed", "checked_in"].includes(String(record.status)));
  const recentReservations = operationalRole || role === "accounting"
    ? reservations.slice(0, 5).map((record) => role === "accounting" ? {
        id: record.id, confirmation_number: record.confirmation_number, guest_name: record.guest_name, room_type: record.room_type,
        check_in: record.check_in, status: record.status, source: record.source, payment_status: record.payment_status
      } : record)
    : [];
  const refundRole = ["accounting"].includes(role);
  const refunds: RecordItem[] = refundRole ? (!supabase ? demoStore.refunds : (((await supabase.from("refund_requests").select("id,reservation_id,eligible_amount,status,created_at").in("status",["pending","failed"]).order("created_at",{ascending:false})).data ?? []) as RecordItem[])) : [];
  const [approvalResult, policyResult] = await Promise.all([
    supabase && managerRole ? supabase.from("manager_approval_requests").select("id,request_type,related_entity_id,reservation_id,severity,reason,status,requested_at").order("requested_at", { ascending: false }) : { data: [] },
    supabase && (managerRole || role === "housekeeping") ? supabase.from("hotel_operational_policies").select("manager_arrival_risk_minutes,guest_request_overdue_minutes,housekeeping_turnover_overdue_minutes").eq("key", "default").maybeSingle() : { data: null },
  ]);
  const approvals=(approvalResult.data??[])as RecordItem[];const alertPolicy=policyResult.data??{manager_arrival_risk_minutes:120,guest_request_overdue_minutes:60,housekeeping_turnover_overdue_minutes:180};const now=Date.now();
  const ageMinutes=(value:unknown)=>value?Math.max((now-new Date(String(value)).getTime())/60000,0):0;
  const overdueGuestRequests=requests.filter(item=>item.status!=="completed"&&((item.due_at&&new Date(String(item.due_at)).getTime()<now)||ageMinutes(item.created_at)>Number(alertPolicy.guest_request_overdue_minutes)));
  const overdueHousekeeping=tasks.filter(item=>item.status!=="completed"&&ageMinutes(item.created_at)>Number(alertPolicy.housekeeping_turnover_overdue_minutes));
  // Deposit-verification SLA (Phase 5): visibility only — aging metrics for the
  // roles that work the deposit queue. depositSlaHours feeds the client-side age
  // chips (financial roles); the aging aggregates are Accounting-only.
  const slaResult=financialRole&&supabase?await supabase.from("hotel_operational_policies").select("deposit_sla_hours").eq("key","default").maybeSingle():{data:null};
  const depositSlaHours=Number((slaResult.data as RecordItem|null)?.deposit_sla_hours??DEFAULT_DEPOSIT_SLA_HOURS);
  const pendingAges=refundRole?payments.filter((item)=>item.status==="pending_verification").map((item)=>ageMinutes(item.submitted_at)):[];
  const {oldestMinutes:oldestPendingVerificationMinutes,pastSla:pendingPastSla}=depositSlaSummary(pendingAges,depositSlaHours);
  // Daily front desk operations reports: the Manager reviews submissions,
  // Front Desk sees manager returns that need resubmission.
  const reportRoles=["manager","front_desk"].includes(role);
  const reportResult=supabase&&reportRoles?await supabase.from("front_desk_reports").select("id,report_date,submitted_at,review_note").eq("status",managerRole?"submitted":"returned").order("submitted_at",{ascending:false}).limit(5):{data:[]};
  const reportNotifications=(reportResult.data??[])as RecordItem[];
  const localDate=(value:unknown)=>value?new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila"}).format(new Date(String(value))):"";
  const settledToday=payments.filter(item=>item.status==="paid"&&localDate(item.verified_at||item.created_at)===today);
  const collectionsToday=financialRole?settledToday.filter(item=>item.purpose!=="refund").reduce((sum,item)=>sum+Number(item.amount||0),0):0;
  const depositsReceived=financialRole?settledToday.filter(item=>item.purpose==="reservation_deposit").reduce((sum,item)=>sum+Number(item.amount||0),0):0;
  const refundSummary=financialRole?settledToday.filter(item=>item.purpose==="refund").reduce((sum,item)=>sum+Number(item.amount||0),0):0;
  const outstandingBalances = financialRole ? invoices.reduce((sum, item) => sum + Number(item.balance || 0), 0) : 0;
  // Single shared drawer: cash accountability reads the property-wide open shift
  // (not the caller's own), derived from recorded payments so no stored total
  // can drift. cashThisShift/shiftFloat are drawer totals while it is open.
  let frontDeskShift: DashboardData["frontDeskShift"];
  if (role === "front_desk" && supabase && userId) {
    const shift = await supabase.from("cash_shifts").select("id,opening_amount").eq("status", "open").order("opened_at", { ascending: true }).limit(1).maybeSingle();
    if (!shift.error && !shift.data) {
      frontDeskShift = { open: false, collected: 0, openingFloat: 0 };
    } else if (!shift.error && shift.data) {
      const drawerId = shift.data.id;
      try {
        const payments = await readAllRows<{ amount: number }>(() => supabase!.from("payments").select("amount").eq("cash_shift_id", drawerId).eq("status", "paid").neq("purpose", "refund").order("id"));
        const collected = Math.round(payments.reduce((sum, row) => sum + Number(row.amount || 0), 0) * 100) / 100;
        frontDeskShift = { open: true, collected, openingFloat: Number(shift.data.opening_amount || 0) };
      } catch { /* The dashboard can still load while the drawer summary is unavailable. */ }
    }
  }

  const notifications: DashboardData["notifications"] = [];
  if (operationalRole) {
    for (const reservation of online.filter((record) => record.status === "confirmed").slice(0, 5)) {
      notifications.push({
        id: `reservation-${reservation.id}`,
        title: "New online reservation confirmed",
        detail: `${reservation.confirmation_number || reservation.id} - ${reservation.guest_name} - ${reservation.check_in}`,
        section: "room_rack",
        createdAt: typeof reservation.created_at === "string" ? reservation.created_at : undefined
      });
    }
  }
  // Standalone Transportation Service: new guest requests surface for the roles that work them.
  const pendingTrips = operationalRole && supabase
    ? ((await supabase.from("transportation_requests").select("id,reservation_id,service_type,pickup_location,dropoff_location,pickup_date,created_at").eq("status", "REQUESTED").order("created_at", { ascending: false })).data ?? []) as RecordItem[]
    : [];
  if (operationalRole && supabase) {
    for (const trip of pendingTrips.slice(0, 5)) notifications.push({ id: `transportation-${trip.id}`, title: "New transportation request", detail: `${String(trip.service_type).replaceAll("_", " ")} - ${trip.pickup_location} → ${trip.dropoff_location} - ${trip.pickup_date}`, section: "transportation", createdAt: typeof trip.created_at === "string" ? trip.created_at : undefined });
  }
  if(role==="manager"){
    const maintenanceRooms=blockedMaintenanceRoomIds;
    for(const arrival of activeArrivals.filter(item=>!item.room_id).slice(0,5))notifications.push({id:`manager-unassigned-${arrival.id}`,title:"Arrival awaiting room assignment",detail:`${arrival.confirmation_number||arrival.id} - ${arrival.guest_name}`,section:"room_rack"});
    for(const arrival of activeArrivals){const room=rooms.find(item=>item.id===arrival.room_id);if(room&&(room.housekeeping!=="clean"||room.status==="maintenance"||maintenanceRooms.has(room.id)))notifications.push({id:`manager-room-risk-${arrival.id}`,title:"Arrival room readiness risk",detail:`${arrival.confirmation_number||arrival.id} - Room ${room.number}`,section:"room_rack"});}
    for(const order of maintenance.filter(item=>item.status!=="resolved"&&["urgent","critical"].includes(String(item.priority))).slice(0,5))notifications.push({id:`manager-maintenance-${order.id}`,title:"Critical Maintenance issue",detail:`Room ${order.room_number} - ${order.issue}`,section:"maintenance_orders",createdAt:typeof order.created_at==="string"?order.created_at:undefined});
    for(const request of requests.filter(item=>item.escalation_status==="escalated").slice(0,5))notifications.push({id:`manager-escalation-${request.id}`,title:"Escalated guest issue",detail:`${request.department} - ${request.request}`,section:"approvals",createdAt:typeof request.escalated_at==="string"?request.escalated_at:undefined});
    for(const approval of approvals.filter(item=>item.status==="pending").slice(0,5))notifications.push({id:`manager-approval-${approval.id}`,title:"Manager approval requested",detail:`${String(approval.request_type).replaceAll("_"," ")} - ${approval.reason}`,section:"approvals",createdAt:typeof approval.requested_at==="string"?approval.requested_at:undefined});
    for(const report of reportNotifications)notifications.push({id:`manager-report-${report.id}`,title:"Daily operations report awaiting review",detail:`${report.report_date} - submitted by Front Desk`,section:"reports",createdAt:typeof report.submitted_at==="string"?report.submitted_at:undefined});
  }
  if (role === "front_desk") {
    const invoiceByReservation=new Map(invoices.map(invoice=>[invoice.reservation_id,invoice]));
    const maintenanceRooms=blockedMaintenanceRoomIds;
    for(const reservation of activeArrivals.filter(item=>!item.room_id))notifications.push({id:`unassigned-${reservation.id}`,title:"Arrival needs a room assignment",detail:`${reservation.confirmation_number||reservation.id} - ${reservation.guest_name}`,section:"room_rack"});
    for(const reservation of [...activeArrivals,...activeDepartures]){const invoice=invoiceByReservation.get(reservation.id);if(Number(invoice?.balance||0)>0)notifications.push({id:`balance-${reservation.id}`,title:reservation.check_out===today?"Departure has an outstanding balance":"Arrival balance requires attention",detail:`${reservation.confirmation_number||reservation.id} - ${new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(invoice?.balance||0))}`,section:"room_rack"});const room=rooms.find(item=>item.id===reservation.room_id);if(room&&(room.status==="maintenance"||room.housekeeping!=="clean"||maintenanceRooms.has(room.id)))notifications.push({id:`room-block-${reservation.id}`,title:"Assigned room is not ready",detail:`${reservation.confirmation_number||reservation.id} - Room ${room.number}`,section:"room_rack"});}
    for(const request of requests.filter(item=>item.status!=="completed").slice(0,5))notifications.push({id:`request-${request.id}`,title:"Guest request requires coordination",detail:`${request.department} - ${request.request}`,section:"guest_requests",createdAt:typeof request.created_at==="string"?request.created_at:undefined});
    for(const report of reportNotifications)notifications.push({id:`report-returned-${report.id}`,title:"Daily operations report returned by manager",detail:`${report.report_date}${report.review_note?` - ${report.review_note}`:""}`,section:"reports",createdAt:typeof report.submitted_at==="string"?report.submitted_at:undefined});
  }
  if (refundRole) {
    for (const payment of payments.filter((record) => record.status === "pending_verification").slice(0, 5)) {
      notifications.push({
        id: `payment-${payment.id}`,
        title: "Reservation deposit needs verification",
        detail: `${payment.reservation_id} - ${payment.reference || "Reference pending"}`,
        section: "payments",
        createdAt: typeof payment.submitted_at === "string" ? payment.submitted_at : undefined
      });
    }
    // SLA breach alert (visibility only — nothing is auto-decided).
    if (pendingPastSla > 0) notifications.push({ id: "deposit-sla-breach", title: "Deposit verification past SLA", detail: `${pendingPastSla} payment${pendingPastSla !== 1 ? "s" : ""} waiting ${depositSlaHours}h or longer`, section: "payments" });
  }
  // Sidebar module badges — outstanding actionable workload per role, the same
  // domain predicates the module queues use. Counts exist only where the role
  // can act on them; the bell above stays a separate live-alert concept.
  const pendingRequestBatches = operationalRole ? new Set(requests.filter((item) => String(item.approval_status) === "pending" && item.batch_id).map((item) => String(item.batch_id))).size : 0;
  const departmentRequests = role === "housekeeping" || role === "maintenance"
    ? requests.filter((item) => String(item.approval_status) === "approved" && String(item.department) === role && ["open", "in_progress"].includes(String(item.status))).length
    : 0;
  const transportationRequested = operationalRole && supabase ? pendingTrips.length : 0;
  const pendingVerifications = refundRole ? payments.filter((item) => item.status === "pending_verification").length : 0;
  const pendingRefundCount = refundRole ? refunds.length : 0;
  if (refundRole) {
    for (const refund of refunds.slice(0, 5)) notifications.push({ id:`refund-${refund.id}`, title:refund.status==="failed"?"Refund attempt failed - retry required":"Refund awaiting Accounting", detail:`${refund.reservation_id} - ${new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(refund.eligible_amount||0))}`, section:"refunds", createdAt:typeof refund.created_at==="string"?refund.created_at:undefined });
  }  // Role-aware metric filtering: zero out metrics the role cannot see
  const forbiddenByRole: Record<Role, string[]> = {
    owner: [],
    admin: ['refunds', 'reconciliation', 'pendingRefundCount', 'pendingPastSla', 'depositSlaHours', 'oldestPendingVerificationMinutes'],
    manager: ['invoices', 'transactions', 'folios', 'payments', 'refunds', 'cash_shifts', 'reconciliation', 'documents', 'balancesAttention', 'pendingVerifications', 'pendingRefundCount', 'depositSlaHours', 'oldestPendingVerificationMinutes', 'pendingPastSla', 'cashThisShift', 'shiftFloat', 'shiftOpen', 'collectionsToday', 'depositsReceived', 'refundSummary', 'outstandingBalances'],
    front_desk: ['refunds', 'reconciliation', 'staff_duty', 'room_types', 'transport_services', 'request_types', 'insights', 'ai', 'housekeeping_tasks', 'maintenance_orders', 'inventory', 'refunds', 'reconciliation', 'pendingRefundCount', 'pendingPastSla', 'depositSlaHours', 'oldestPendingVerificationMinutes', 'pendingPastSla', 'cashThisShift', 'shiftFloat', 'shiftOpen', 'collectionsToday', 'depositsReceived', 'refundSummary', 'outstandingBalances', 'pendingVerifications'],
    housekeeping: ['room_rack', 'guests', 'guest_requests', 'transportation', 'maintenance_orders', 'inventory', 'reports', 'invoices', 'transactions', 'folios', 'payments', 'refunds', 'cash_shifts', 'reconciliation', 'documents', 'staff_duty', 'room_types', 'transport_services', 'request_types', 'insights', 'ai', 'occupancy', 'arrivals', 'departures', 'revenue', 'onlineBookings', 'inHouse', 'unassignedArrivals', 'openRequests', 'balancesAttention', 'openMaintenance', 'criticalMaintenance', 'overdueRequests', 'escalatedIssues', 'pendingApprovals', 'collectionsToday', 'depositsReceived', 'refundSummary', 'outstandingBalances', 'cashThisShift', 'shiftFloat', 'shiftOpen', 'pendingRequestBatches', 'transportationRequested', 'pendingVerifications', 'pendingRefundCount', 'depositSlaHours', 'oldestPendingVerificationMinutes', 'pendingPastSla'],
    maintenance: ['room_rack', 'guests', 'guest_requests', 'transportation', 'housekeeping_tasks', 'inventory', 'reports', 'invoices', 'transactions', 'folios', 'payments', 'refunds', 'cash_shifts', 'reconciliation', 'documents', 'staff_duty', 'room_types', 'transport_services', 'request_types', 'insights', 'ai', 'occupancy', 'arrivals', 'departures', 'revenue', 'onlineBookings', 'inHouse', 'unassignedArrivals', 'dirtyRooms', 'openRequests', 'balancesAttention', 'roomsCleaning', 'roomsAwaitingInspection', 'overdueHousekeeping', 'overdueRequests', 'escalatedIssues', 'pendingApprovals', 'collectionsToday', 'depositsReceived', 'refundSummary', 'outstandingBalances', 'cashThisShift', 'shiftFloat', 'shiftOpen', 'pendingRequestBatches', 'transportationRequested', 'pendingVerifications', 'pendingRefundCount', 'depositSlaHours', 'oldestPendingVerificationMinutes', 'pendingPastSla'],
    accounting: ['room_rack', 'guests', 'guest_requests', 'transportation', 'housekeeping_tasks', 'maintenance_orders', 'inventory', 'staff_duty', 'room_types', 'transport_services', 'request_types', 'insights', 'ai', 'occupancy', 'arrivals', 'departures', 'revenue', 'onlineBookings', 'inHouse', 'unassignedArrivals', 'dirtyRooms', 'outOfServiceRooms', 'openRequests', 'roomsCleaning', 'roomsAwaitingInspection', 'overdueHousekeeping', 'openMaintenance', 'criticalMaintenance', 'overdueRequests', 'escalatedIssues', 'pendingApprovals', 'cashThisShift', 'shiftFloat', 'shiftOpen', 'pendingRequestBatches', 'departmentRequests', 'transportationRequested'],
    guest: ['occupancy', 'arrivals', 'departures', 'revenue', 'openTasks', 'availableRooms', 'onlineBookings', 'inHouse', 'unassignedArrivals', 'dirtyRooms', 'outOfServiceRooms', 'openRequests', 'balancesAttention', 'roomsCleaning', 'roomsAwaitingInspection', 'overdueHousekeeping', 'openMaintenance', 'criticalMaintenance', 'overdueRequests', 'escalatedIssues', 'pendingApprovals', 'collectionsToday', 'depositsReceived', 'refundSummary', 'outstandingBalances', 'cashThisShift', 'shiftFloat', 'shiftOpen', 'pendingRequestBatches', 'departmentRequests', 'transportationRequested', 'pendingVerifications', 'pendingRefundCount', 'depositSlaHours', 'oldestPendingVerificationMinutes', 'pendingPastSla'],
  };

  const metrics: DashboardData["metrics"] = {
    occupancy: Math.round((occupied / Math.max(serviceableRooms, 1)) * 100),
      arrivals: activeArrivals.length,
      departures: activeDepartures.length,
      revenue,
      openTasks: tasks.filter((task) => task.status !== "completed").length,
      availableRooms: countBoardState("available"),
      onlineBookings: online.length,
      inHouse: reservations.filter(item=>item.status==="checked_in").length,
      unassignedArrivals: activeArrivals.filter(item=>!item.room_id).length,
      dirtyRooms: rooms.filter(item=>["dirty","reclean_required"].includes(String(item.housekeeping))).length,
      outOfServiceRooms: blockedMaintenanceRoomIds.size,
      openRequests: requests.filter(item=>item.status!=="completed").length,
      balancesAttention: [...activeArrivals,...activeDepartures].filter(item=>Number(invoices.find(invoice=>invoice.reservation_id===item.id)?.balance||0)>0).length,
      roomsCleaning:rooms.filter(item=>item.housekeeping==="cleaning").length,roomsAwaitingInspection:rooms.filter(item=>item.housekeeping==="inspection").length,overdueHousekeeping:overdueHousekeeping.length,openMaintenance:maintenance.filter(item=>activeMaintenanceStatuses.has(String(item.status))).length,criticalMaintenance:maintenance.filter(item=>activeMaintenanceStatuses.has(String(item.status))&&["urgent","critical"].includes(String(item.priority))).length,overdueRequests:overdueGuestRequests.length,escalatedIssues:requests.filter(item=>item.escalation_status==="escalated").length,pendingApprovals:approvals.filter(item=>item.status==="pending").length,collectionsToday,depositsReceived,refundSummary,outstandingBalances,cashThisShift: frontDeskShift?.collected ?? 0,shiftFloat: frontDeskShift?.openingFloat ?? 0,shiftOpen: frontDeskShift?.open ?? false,pendingRequestBatches,departmentRequests,transportationRequested,pendingVerifications,pendingRefundCount,depositSlaHours,oldestPendingVerificationMinutes,pendingPastSla
  };

  // Zero out metrics the role cannot see (role-aware metric filtering).
  for (const key of forbiddenByRole[role] || []) {
    if (key in metrics) (metrics as unknown as Record<string, unknown>)[key] = 0;
  }

  return {
    metrics,
    occupancyTrend,
    ...(frontDeskShift && { frontDeskShift }),
    ...(managerRole && {
      managerOverview: {
        previousOccupancyTrend: bookedHistory.slice(0, -7),
        roomReadiness: {
          occupied: countBoardState("occupied"),
          available: countBoardState("available"),
          reserved: countBoardState("reserved"),
          dirty: countBoardState("dirty"),
          out_of_service: countBoardState("out_of_service"),
        },
        checkedInArrivals: activeArrivals.filter(item => item.status === "checked_in").length,
        checkedOutDepartures: reservations.filter(item => item.status === "checked_out" && (item.checked_out_at ? localDate(item.checked_out_at) : item.check_out) === today).length,
        finances: { collectionsToday, depositsReceived, outstandingBalances, refundSummary },
      },
    }),
    roomMix: [{ name: "Occupied", value: countBoardState("occupied"), color: "#084b55" }, { name: "Available", value: countBoardState("available"), color: "#85cbd0" }, { name: "Reserved", value: countBoardState("reserved"), color: "#dfa062" }, { name: "Service", value: countBoardState("dirty") + countBoardState("out_of_service"), color: "#d7d4cb" }],
    recentReservations,
    notifications
  };
}
