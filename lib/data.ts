import { demoStore, makeId } from "@/lib/demo-store";
import { env } from "@/lib/env";
import { hotelToday } from "@/lib/booking";
import { supabase } from "@/lib/supabase";
import type { DashboardData, RecordItem, Resource, Role } from "@/lib/types";

export const databaseMode = env.databaseMode;

export async function list(resource: Resource): Promise<RecordItem[]> {
  if (!supabase) return demoStore[resource];
  const { data, error } = await supabase.from(resource).select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as RecordItem[];
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

export async function getDashboard(role: Role): Promise<DashboardData> {
  const [reservations, rooms, tasks, invoices, payments, requests, maintenance] = await Promise.all([list("reservations"), list("rooms"), list("housekeeping_tasks"), list("invoices"), list("payments"), list("guest_requests"), list("maintenance_orders")]);
  const today = hotelToday();
  const occupied = rooms.filter((record) => record.status === "occupied").length;
  const activeMaintenanceStatuses = new Set(["open", "assigned", "in_progress", "waiting_parts", "deferred"]);
  const blockedMaintenanceRoomIds = new Set(maintenance.filter((order) => activeMaintenanceStatuses.has(String(order.status)) && ["blocked", "out_of_service"].includes(String(order.serviceability_impact))).map((order) => order.room_id));
  const serviceableRooms = rooms.filter((record) => record.administratively_active !== false && !blockedMaintenanceRoomIds.has(record.id)).length;
  const financialRole = ["manager", "front_desk", "accounting"].includes(role);
  const cashHandlingRole = ["front_desk", "accounting"].includes(role);
  const operationalRole = ["manager", "front_desk"].includes(role);
  const revenue = financialRole ? invoices.reduce((sum, item) => sum + Number(item.paid || 0), 0) : 0;
  const counts = (status: string) => rooms.filter((record) => record.status === status).length;
  // Occupancy history is derived from the reservations themselves - one point per hotel day for the
  // trailing week - so reports never present a hard-coded figure as measured data.
  const shiftDay = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });
  const occupancyTrend = Array.from({ length: 7 }, (_, index) => {
    const day = shiftDay(today, index - 6);
    const nights = reservations.filter((record) => ["confirmed", "checked_in", "checked_out"].includes(String(record.status)) && String(record.check_in) <= day && String(record.check_out) > day).length;
    return { day: weekday.format(new Date(`${day}T00:00:00Z`)), occupancy: Math.round((nights / Math.max(serviceableRooms, 1)) * 100) };
  });
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
  const managerRole=["manager"].includes(role);
  const [approvalResult,policyResult]=supabase&&managerRole?await Promise.all([supabase.from("manager_approval_requests").select("id,request_type,related_entity_id,reservation_id,severity,reason,status,requested_at").order("requested_at",{ascending:false}),supabase.from("hotel_operational_policies").select("manager_arrival_risk_minutes,guest_request_overdue_minutes,housekeeping_turnover_overdue_minutes").eq("key","default").maybeSingle()]):[{data:[]},{data:null}];
  const approvals=(approvalResult.data??[])as RecordItem[];const alertPolicy=policyResult.data??{manager_arrival_risk_minutes:120,guest_request_overdue_minutes:60,housekeeping_turnover_overdue_minutes:180};const now=Date.now();
  const ageMinutes=(value:unknown)=>value?Math.max((now-new Date(String(value)).getTime())/60000,0):0;
  const overdueGuestRequests=requests.filter(item=>item.status!=="completed"&&((item.due_at&&new Date(String(item.due_at)).getTime()<now)||ageMinutes(item.created_at)>Number(alertPolicy.guest_request_overdue_minutes)));
  const overdueHousekeeping=tasks.filter(item=>item.status!=="completed"&&ageMinutes(item.created_at)>Number(alertPolicy.housekeeping_turnover_overdue_minutes));
  const localDate=(value:unknown)=>value?new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila"}).format(new Date(String(value))):"";
  const settledToday=payments.filter(item=>item.status==="paid"&&localDate(item.verified_at||item.created_at)===today);
  const collectionsToday=financialRole?settledToday.filter(item=>item.purpose!=="refund").reduce((sum,item)=>sum+Number(item.amount||0),0):0;
  const depositsReceived=financialRole?settledToday.filter(item=>item.purpose==="reservation_deposit").reduce((sum,item)=>sum+Number(item.amount||0),0):0;
  const refundSummary=financialRole?settledToday.filter(item=>item.purpose==="refund").reduce((sum,item)=>sum+Number(item.amount||0),0):0;
  const notifications: DashboardData["notifications"] = [];
  if (operationalRole) {
    for (const reservation of online.filter((record) => record.status === "confirmed").slice(0, 5)) {
      notifications.push({
        id: `reservation-${reservation.id}`,
        title: "New online reservation confirmed",
        detail: `${reservation.confirmation_number || reservation.id} - ${reservation.guest_name} - ${reservation.check_in}`,
        section: "reservations",
        createdAt: typeof reservation.created_at === "string" ? reservation.created_at : undefined
      });
    }
  }
  if(role==="manager"){
    const maintenanceRooms=new Set(maintenance.filter(item=>activeMaintenanceStatuses.has(String(item.status))&&["blocked","out_of_service"].includes(String(item.serviceability_impact))).map(item=>item.room_id));
    for(const arrival of activeArrivals.filter(item=>!item.room_id).slice(0,5))notifications.push({id:`manager-unassigned-${arrival.id}`,title:"Arrival awaiting room assignment",detail:`${arrival.confirmation_number||arrival.id} - ${arrival.guest_name}`,section:"reservations"});
    for(const arrival of activeArrivals){const room=rooms.find(item=>item.id===arrival.room_id);if(room&&(room.housekeeping!=="clean"||room.status==="maintenance"||maintenanceRooms.has(room.id)))notifications.push({id:`manager-room-risk-${arrival.id}`,title:"Arrival room readiness risk",detail:`${arrival.confirmation_number||arrival.id} - Room ${room.number}`,section:"rooms"});}
    for(const order of maintenance.filter(item=>item.status!=="resolved"&&["urgent","critical"].includes(String(item.priority))).slice(0,5))notifications.push({id:`manager-maintenance-${order.id}`,title:"Critical Maintenance issue",detail:`Room ${order.room_number} - ${order.issue}`,section:"maintenance_orders",createdAt:typeof order.created_at==="string"?order.created_at:undefined});
    for(const request of requests.filter(item=>item.escalation_status==="escalated").slice(0,5))notifications.push({id:`manager-escalation-${request.id}`,title:"Escalated guest issue",detail:`${request.department} - ${request.request}`,section:"approvals",createdAt:typeof request.escalated_at==="string"?request.escalated_at:undefined});
    for(const approval of approvals.filter(item=>item.status==="pending").slice(0,5))notifications.push({id:`manager-approval-${approval.id}`,title:"Manager approval requested",detail:`${String(approval.request_type).replaceAll("_"," ")} - ${approval.reason}`,section:"approvals",createdAt:typeof approval.requested_at==="string"?approval.requested_at:undefined});
  }
  if (role === "front_desk") {
    const invoiceByReservation=new Map(invoices.map(invoice=>[invoice.reservation_id,invoice]));
    const maintenanceRooms=new Set(maintenance.filter(order=>activeMaintenanceStatuses.has(String(order.status))&&["blocked","out_of_service"].includes(String(order.serviceability_impact))).map(order=>order.room_id));
    for(const reservation of activeArrivals.filter(item=>!item.room_id))notifications.push({id:`unassigned-${reservation.id}`,title:"Arrival needs a room assignment",detail:`${reservation.confirmation_number||reservation.id} - ${reservation.guest_name}`,section:"reservations"});
    for(const reservation of [...activeArrivals,...activeDepartures]){const invoice=invoiceByReservation.get(reservation.id);if(Number(invoice?.balance||0)>0)notifications.push({id:`balance-${reservation.id}`,title:reservation.check_out===today?"Departure has an outstanding balance":"Arrival balance requires attention",detail:`${reservation.confirmation_number||reservation.id} - ${new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(invoice?.balance||0))}`,section:"reservations"});const room=rooms.find(item=>item.id===reservation.room_id);if(room&&(room.status==="maintenance"||room.housekeeping!=="clean"||maintenanceRooms.has(room.id)))notifications.push({id:`room-block-${reservation.id}`,title:"Assigned room is not ready",detail:`${reservation.confirmation_number||reservation.id} - Room ${room.number}`,section:"rooms"});}
    for(const request of requests.filter(item=>item.status!=="completed").slice(0,5))notifications.push({id:`request-${request.id}`,title:"Guest request requires coordination",detail:`${request.department} - ${request.request}`,section:"guest_requests",createdAt:typeof request.created_at==="string"?request.created_at:undefined});
  }
  if (cashHandlingRole) {
    for (const payment of payments.filter((record) => record.status === "pending_verification").slice(0, 5)) {
      notifications.push({
        id: `payment-${payment.id}`,
        title: "Reservation deposit needs verification",
        detail: `${payment.reservation_id} - ${payment.reference || "Reference pending"}`,
        section: "payments",
        createdAt: typeof payment.submitted_at === "string" ? payment.submitted_at : undefined
      });
    }
  }
  if (refundRole) {
    for (const refund of refunds.slice(0, 5)) notifications.push({ id:`refund-${refund.id}`, title:refund.status==="failed"?"Refund attempt failed - retry required":"Refund awaiting Accounting", detail:`${refund.reservation_id} - ${new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(refund.eligible_amount||0))}`, section:"refunds", createdAt:typeof refund.created_at==="string"?refund.created_at:undefined });
  }  return {
    metrics: {
      occupancy: Math.round((occupied / Math.max(serviceableRooms, 1)) * 100),
      arrivals: activeArrivals.length,
      departures: activeDepartures.length,
      revenue,
      openTasks: tasks.filter((task) => task.status !== "completed").length,
      availableRooms: rooms.filter(item=>item.administratively_active!==false&&item.status==="available"&&item.housekeeping==="clean"&&!blockedMaintenanceRoomIds.has(item.id)).length,
      onlineBookings: online.length,
      inHouse: reservations.filter(item=>item.status==="checked_in").length,
      unassignedArrivals: activeArrivals.filter(item=>!item.room_id).length,
      dirtyRooms: rooms.filter(item=>["dirty","reclean_required"].includes(String(item.housekeeping))).length,
      outOfServiceRooms: blockedMaintenanceRoomIds.size,
      openRequests: requests.filter(item=>item.status!=="completed").length,
      balancesAttention: [...activeArrivals,...activeDepartures].filter(item=>Number(invoices.find(invoice=>invoice.reservation_id===item.id)?.balance||0)>0).length,
      roomsCleaning:rooms.filter(item=>item.housekeeping==="cleaning").length,roomsAwaitingInspection:rooms.filter(item=>item.housekeeping==="inspection").length,overdueHousekeeping:overdueHousekeeping.length,openMaintenance:maintenance.filter(item=>activeMaintenanceStatuses.has(String(item.status))).length,criticalMaintenance:maintenance.filter(item=>activeMaintenanceStatuses.has(String(item.status))&&["urgent","critical"].includes(String(item.priority))).length,overdueRequests:overdueGuestRequests.length,escalatedIssues:requests.filter(item=>item.escalation_status==="escalated").length,pendingApprovals:approvals.filter(item=>item.status==="pending").length,collectionsToday,depositsReceived,refundSummary,outstandingBalances:financialRole?invoices.reduce((sum,item)=>sum+Number(item.balance||0),0):0
    },
    occupancyTrend,
    roomMix: [{ name: "Occupied", value: counts("occupied"), color: "#1f6b52" }, { name: "Available", value: counts("available"), color: "#9ac8b8" }, { name: "Reserved", value: counts("reserved"), color: "#d79855" }, { name: "Service", value: counts("maintenance") + counts("dirty"), color: "#d7d4cb" }],
    recentReservations,
    notifications
  };
}
