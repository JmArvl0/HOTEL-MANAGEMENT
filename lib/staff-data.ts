import { demoStore } from "@/lib/demo-store";
import { canAccess, canViewGuestContact, canViewTransportation } from "@/lib/permissions";
import { supabase } from "@/lib/supabase";
import type { RecordItem, Resource, Role } from "@/lib/types";

export const operationalReservationFields = "id,confirmation_number,guest_id,guest_name,guest_email,room_id,room_number,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,payment_status,payment_method,special_requests,expected_arrival,cancellation_reason,identity_status,identity_verified_at,operational_policy_snapshot,created_at";
export const accountingReservationFields = "id,confirmation_number,guest_name,room_type,check_in,check_out,status,source,total,deposit,deposit_required,payment_status,payment_method,cancellation_reason,created_at";
export const departmentRequestFields = "id,reservation_id,request,department,priority,severity,due_at,escalation_status,escalated_at,status,created_at";

export async function listForRole(resource: Resource, role: Role): Promise<RecordItem[]> {
  if (!supabase) {
    const records = demoStore[resource];
    if (resource === "guest_requests" && ["housekeeping", "maintenance"].includes(role)) return records.filter((item) => item.department === role);
    if (resource === "reservations" && role === "manager") return decorateManagerAttentionDemo(records);
    return records;
  }
  if (resource === "reservations") {
    if (role === "accounting") {
      const { data, error } = await supabase.from("reservations").select("id,confirmation_number,guest_name,room_type,check_in,check_out,status,source,total,deposit,deposit_required,payment_status,payment_method,cancellation_reason,created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data as RecordItem[];
    }
    const { data, error } = await supabase.from("reservations").select("id,confirmation_number,guest_id,guest_name,guest_email,room_id,room_number,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,payment_status,payment_method,special_requests,expected_arrival,cancellation_reason,identity_status,identity_verified_at,operational_policy_snapshot,checked_in_at,checked_out_at,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    const ids=(data??[]).map(item=>item.id),guestIds=(data??[]).map(item=>item.guest_id).filter(Boolean) as string[];
    const [invoiceResult,guestResult]=await Promise.all([ids.length?supabase.from("invoices").select("reservation_id,balance,status").in("reservation_id",ids):Promise.resolve({data:[]}),guestIds.length?supabase.from("guests").select("id,phone").in("id",guestIds):Promise.resolve({data:[]})]);
    let decorated=(data??[]).map(item=>({...item,folio_balance:invoiceResult.data?.find(invoice=>invoice.reservation_id===item.id)?.balance??0,guest_phone:guestResult.data?.find(guest=>guest.id===item.guest_id)?.phone??null})) as RecordItem[];
    if (role === "manager") decorated = await decorateManagerAttention(decorated);
    return decorated;
  }
  if (resource === "guest_requests") {
    let query = supabase.from("guest_requests").select("id,reservation_id,guest_id,request,request_type,batch_id,approval_status,approval_note,approved_at,department,priority,severity,due_at,escalation_status,escalated_at,status,created_at,reservations(confirmation_number,guest_name,room_type)");
    if (role === "housekeeping" || role === "maintenance") query = query.eq("department", role);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(({ reservations, ...item }) => ({ ...item, reservation: ((reservations ?? null) as unknown as RecordItem | null) })) as RecordItem[];
  }
  if (resource === "housekeeping_tasks") {
    const { data, error } = await supabase.from("housekeeping_tasks").select("id,room_id,room_number,task,task_type,assignee,assigned_user_id,priority,status,due,notes,reservation_id,guest_request_id,source_type,started_at,completed_at,deferred_at,deferred_reason,inspection_status,inspection_reason,version,created_at,updated_at").order("created_at", { ascending: false });
    if (error) throw error;
    const roomIds=Array.from(new Set((data??[]).map(item=>item.room_id).filter(Boolean))) as string[];
    const userIds=Array.from(new Set((data??[]).map(item=>item.assigned_user_id).filter(Boolean))) as string[];
    const [roomsResult,maintenanceResult,arrivalsResult,usersResult]=await Promise.all([
      roomIds.length?supabase.from("rooms").select("id,type,status,housekeeping").in("id",roomIds):Promise.resolve({data:[]}),
      roomIds.length?supabase.from("maintenance_orders").select("room_id,id,priority,status,serviceability_impact").in("room_id",roomIds).in("status",["open","assigned","in_progress","waiting_parts","deferred"]).in("serviceability_impact",["blocked","out_of_service"]):Promise.resolve({data:[]}),
      roomIds.length?supabase.from("reservations").select("room_id,check_in").in("room_id",roomIds).in("status",["pending","confirmed"]).gte("check_in",new Date().toISOString().slice(0,10)).order("check_in",{ascending:true}):Promise.resolve({data:[]}),
      userIds.length?supabase.from("user_accounts").select("id,name").in("id",userIds):Promise.resolve({data:[]})
    ]);
    return (data??[]).map(item=>{const room=roomsResult.data?.find(value=>value.id===item.room_id);const blocks=maintenanceResult.data?.filter(value=>value.room_id===item.room_id)??[];const nextArrival=arrivalsResult.data?.find(value=>value.room_id===item.room_id);const assigned=usersResult.data?.find(value=>value.id===item.assigned_user_id);return{...item,assigned_to:assigned?.name??item.assignee??"Unassigned",room_type:room?.type??null,room_status:room?.status??null,room_housekeeping:room?.housekeeping??null,maintenance_blocked:blocks.length>0,maintenance_priority:blocks[0]?.priority??null,next_arrival:nextArrival?.check_in??null}}) as RecordItem[];
  }
  if (resource === "payments") {
    const { data, error } = await supabase.from("payments").select("id,reservation_id,invoice_id,purpose,method,reference,amount,currency,status,submitted_at,verified_at,reviewed_at,decision_reason,proof_original_name,proof_size_bytes,proof_uploaded_at,created_at,reservations(guest_name,confirmation_number,room_type,check_in,check_out,deposit_required,deposit,total,status,user_id)").order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map(({ reservations, ...item }) => ({ ...item, reservation: ((reservations ?? null) as unknown as RecordItem | null) })) as RecordItem[];
  }
  if (resource === "refunds") {
    const { data, error } = await supabase.from("refund_requests").select("id,reservation_id,invoice_id,reason,paid_deposit,refund_basis_points,eligible_amount,status,processed_at,reference,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    const ids = (data ?? []).map((item) => item.id);
    const attempts = ids.length ? ((await supabase.from("refund_attempts").select("refund_request_id,status,reason,attempted_at").in("refund_request_id", ids)).data ?? []) : [];
    return (data ?? []).map((item) => {
      const own = attempts.filter((attempt) => attempt.refund_request_id === item.id);
      const failure = own.filter((attempt) => attempt.status === "failed").sort((a, b) => String(b.attempted_at).localeCompare(String(a.attempted_at)))[0];
      return { ...item, attempts: own.length, processed_amount: item.status === "processed" ? item.eligible_amount : 0, last_failure: failure?.reason ?? null };
    }) as RecordItem[];
  }
  if (resource === "rooms" && ["housekeeping", "maintenance"].includes(role)) {
    const { data, error } = await supabase.from("rooms").select("id,number,floor,type,status,housekeeping,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    return data as RecordItem[];
  }
  if (resource === "inventory" && ["housekeeping", "maintenance", "front_desk"].includes(role)) {
    const { data, error } = await supabase.from("inventory").select("id,name,category,quantity,reorder_point,unit,status,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    return data as RecordItem[];
  }
  if (resource === "maintenance_orders") {
    const { data, error } = await supabase.from("maintenance_orders").select("id,room_id,room_number,reservation_id,guest_request_id,target_type,target_label,issue,category,assignee,assigned_user_id,priority,severity,status,serviceability_impact,serviceability_reason,diagnosis,parts_required,parts_status,external_service_required,estimated_completion,waiting_reason,resolution,cleanup_required,source_type,created_at,updated_at,resolved_at,completed_at").order("created_at", { ascending: false });
    if (error) throw error;
    return data as RecordItem[];
  }
  if (resource === "invoices") {
    const { data, error } = await supabase.from("invoices").select("id,reservation_id,guest_name,currency,amount,paid,balance,credit_balance,status,method,due_date,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    return data as RecordItem[];
  }
  const { data, error } = await supabase.from(resource).select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data as RecordItem[];
}

const OPEN_MAINTENANCE_STATUSES = ["open", "assigned", "in_progress", "waiting_parts", "deferred"];
const BLOCKING_SERVICEABILITY = ["blocked", "out_of_service"];
const ACTIVE_TRANSPORT_STATUSES = ["REQUESTED", "REVIEWED", "SCHEDULED", "ASSIGNED", "IN_PROGRESS"];

/**
 * Manager oversight decoration for the reservations list — batched lookups only
 * (no per-row queries) that attach the read-only inputs lib/manager-attention
 * derives its issue badges from: authoritative room state, pending approvals,
 * live transportation, unresolved refunds, and escalated guest requests.
 */
async function decorateManagerAttention(reservations: RecordItem[]): Promise<RecordItem[]> {
  if (!supabase) return reservations; // demo mode never reaches here — listForRole routes to the demo twin
  const roomIds = reservations.map((item) => item.room_id).filter(Boolean) as string[];
  const ids = reservations.map((item) => item.id);
  const [rooms, maintenance, approvals, transportation, refunds, escalated] = await Promise.all([
    roomIds.length ? supabase.from("rooms").select("id,number,status,housekeeping,administratively_active").in("id", roomIds) : Promise.resolve({ data: [] as RecordItem[] }),
    roomIds.length ? supabase.from("maintenance_orders").select("room_id").in("room_id", roomIds).in("status", OPEN_MAINTENANCE_STATUSES).in("serviceability_impact", BLOCKING_SERVICEABILITY) : Promise.resolve({ data: [] as RecordItem[] }),
    ids.length ? supabase.from("manager_approval_requests").select("reservation_id,request_type,severity").eq("status", "pending").in("reservation_id", ids) : Promise.resolve({ data: [] as RecordItem[] }),
    ids.length ? supabase.from("transportation_requests").select("reservation_id,service_type,status,pickup_date").in("status", ACTIVE_TRANSPORT_STATUSES).in("reservation_id", ids) : Promise.resolve({ data: [] as RecordItem[] }),
    ids.length ? supabase.from("refund_requests").select("reservation_id").in("status", ["pending", "failed"]).in("reservation_id", ids) : Promise.resolve({ data: [] as RecordItem[] }),
    ids.length ? supabase.from("guest_requests").select("reservation_id").eq("escalation_status", "escalated").neq("status", "completed").in("reservation_id", ids) : Promise.resolve({ data: [] as RecordItem[] }),
  ]);
  return reservations.map((item) => {
    const room = rooms.data?.find((value) => value.id === item.room_id) ?? null;
    const approval = approvals.data?.find((value) => value.reservation_id === item.id) ?? null;
    const transport = transportation.data?.find((value) => value.reservation_id === item.id) ?? null;
    return {
      ...item,
      room_status: room?.status ?? null,
      room_housekeeping: room?.housekeeping ?? null,
      room_administratively_active: room ? room.administratively_active !== false : null,
      room_maintenance_blocked: Boolean(maintenance.data?.some((value) => value.room_id === item.room_id)),
      pending_approval_type: approval?.request_type ?? null,
      pending_approval_severity: approval?.severity ?? null,
      transport_status: transport?.status ?? null,
      transport_pickup_date: transport?.pickup_date ?? null,
      refund_pending: Boolean(refunds.data?.some((value) => value.reservation_id === item.id)),
      escalated_request: Boolean(escalated.data?.some((value) => value.reservation_id === item.id)),
    };
  });
}

/** Demo-mode twin: derive room readiness from the demo store; the rest stays absent. */
function decorateManagerAttentionDemo(reservations: RecordItem[]): RecordItem[] {
  return reservations.map((item) => {
    const room = demoStore.rooms.find((value) => String(value.number) === String(item.room_number)) ?? null;
    const blocked = room ? demoStore.maintenance_orders.some((order) => String(order.room_number) === String(room.number) && ["open", "in_progress"].includes(String(order.status))) : false;
    return { ...item, room_status: room?.status ?? null, room_housekeeping: room?.housekeeping ?? null, room_administratively_active: room ? true : null, room_maintenance_blocked: blocked };
  });
}

export async function getStaffReservation(id: string, role: Role) {
  if (!supabase) {
    const reservation = demoStore.reservations.find((item) => item.id === id);
    return reservation ? { reservation, guest: null, invoice: null, payments: [], charges: [], adjustments: [], refunds: [], refundAttempts: [], documents: [], changeRequests: [], assignments: [], requests: [], room: null, maintenance: [], transportation: [], approvals: [], turnover: null } : null;
  }
  const result = role === "accounting"
    ? await supabase.from("reservations").select("id,confirmation_number,guest_name,room_type,check_in,check_out,status,source,total,deposit,deposit_required,payment_status,payment_method,cancellation_reason,created_at").eq("id", id).maybeSingle()
    : await supabase.from("reservations").select("id,confirmation_number,guest_id,guest_name,guest_email,room_id,room_number,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,payment_status,payment_method,special_requests,expected_arrival,cancellation_reason,identity_status,identity_verified_at,operational_policy_snapshot,checked_in_at,checked_out_at,created_at").eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  const reservation = result.data as RecordItem | null;
  if (!reservation) return null;
  const [{data:invoice},{data:payments},{data:charges},{data:adjustments},{data:refunds},{data:documents},{data:changeRequests},{data:assignments},{data:requests},{data:room},{data:maintenance},{data:transportation},{data:approvals},{data:turnover}] = await Promise.all([
    supabase.from("invoices").select("id,reservation_id,amount,paid,balance,credit_balance,status,method,due_date").eq("reservation_id",id).maybeSingle(),
    supabase.from("payments").select("id,purpose,method,reference,amount,currency,status,submitted_at,verified_at,reviewed_at,decision_reason").eq("reservation_id",id).order("created_at",{ascending:false}),
    supabase.from("folio_charges").select("id,description,category,amount,status,source,created_at").eq("reservation_id",id).order("created_at",{ascending:false}),
    supabase.from("financial_adjustments").select("id,transaction_type,direction,amount,reason,source_charge_id,created_at").eq("reservation_id",id).order("created_at",{ascending:false}),
    supabase.from("refund_requests").select("id,eligible_amount,refund_basis_points,status,reference,created_at,processed_at").eq("reservation_id",id).order("created_at",{ascending:false}),
    supabase.from("financial_documents").select("id,document_number,document_type,created_at").eq("reservation_id",id).order("created_at",{ascending:false}),
    supabase.from("reservation_change_requests").select("id,requested_check_in,requested_check_out,requested_room_type,reason,status,created_at").eq("reservation_id",id).order("created_at",{ascending:false}),
    supabase.from("reservation_room_assignments").select("id,room_id,check_in,check_out,assigned_at,released_at,status,reason,is_upgrade").eq("reservation_id",id).order("assigned_at",{ascending:false}),
    supabase.from("guest_requests").select("id,request,department,priority,status,created_at").eq("reservation_id",id).order("created_at",{ascending:false}),
    reservation.room_id?supabase.from("rooms").select("id,number,type,status,housekeeping,administratively_active").eq("id",reservation.room_id).maybeSingle():Promise.resolve({data:null}),
    reservation.room_id?supabase.from("maintenance_orders").select("id,issue,priority,status,serviceability_impact,estimated_completion,created_at").eq("room_id",reservation.room_id).in("status",["open","assigned","in_progress","waiting_parts","deferred"]):Promise.resolve({data:[]}),
    // Manager oversight extras — read-only, batched into the same Promise.all (no N+1).
    canViewTransportation(role)?supabase.from("transportation_requests").select("id,service_type,status,pickup_location,dropoff_location,pickup_date,pickup_time,return_date,return_time,driver_name,vehicle_type_id,fare_amount").eq("reservation_id",id).order("created_at",{ascending:false}):Promise.resolve({data:[]}),
    (role==="manager"||role==="owner")?supabase.from("manager_approval_requests").select("id,request_type,severity,status,requested_at,requested_action,reason,decision_reason,execution_status,executed_at").eq("reservation_id",id).order("requested_at",{ascending:false}):Promise.resolve({data:[]}),
    supabase.from("housekeeping_tasks").select("id,task_type,status,started_at,completed_at,inspection_status").eq("reservation_id",id).eq("task_type","checkout_cleaning").order("created_at",{ascending:false}).limit(1)
  ]);
  const refundIds=(refunds??[]).map(item=>item.id);
  const refundAttempts=refundIds.length?((await supabase.from("refund_attempts").select("id,refund_request_id,status,reference,reason,attempted_at").in("refund_request_id",refundIds).order("attempted_at",{ascending:false})).data??[]):[];
  let guest: RecordItem | null = null;
  if (role !== "accounting" && reservation.guest_id) {
    const result = await supabase.from("guests").select("id,name,email,phone,loyalty_tier,preferences,special_requests").eq("id", reservation.guest_id).maybeSingle();
    guest = result.data as RecordItem | null;
  }
  return { reservation, guest, invoice: invoice as RecordItem | null, payments: (payments ?? []) as RecordItem[], charges:(charges??[])as RecordItem[], adjustments:(adjustments??[])as RecordItem[], refunds:(refunds??[])as RecordItem[], refundAttempts:refundAttempts as RecordItem[], documents:(documents??[])as RecordItem[], changeRequests:(changeRequests??[])as RecordItem[], assignments:(assignments??[])as RecordItem[], requests:(requests??[])as RecordItem[], room:room as RecordItem|null, maintenance:(maintenance??[])as RecordItem[], transportation:(transportation??[])as RecordItem[], approvals:(approvals??[])as RecordItem[], turnover:(turnover?.[0] ?? null) as RecordItem|null };
}

// Read-only room dossier: current state, room-type facts, physical booking history
// (reservation_room_assignments), housekeeping and maintenance history. Booking data
// is only gathered for roles that may see reservations and guest contact at all;
// housekeeping/maintenance receive the operational sections only.
export async function getRoomDetail(id: string, role: Role) {
  const bookingVisible = canAccess(role, "reservations") && canViewGuestContact(role);
  if (!supabase) {
    const room = demoStore.rooms.find((item) => item.id === id);
    if (!room) return null;
    const reservations = bookingVisible ? demoStore.reservations.filter((item) => String(item.room_number) === String(room.number)) : [];
    const tasks = demoStore.housekeeping_tasks.filter((item) => String(item.room_number) === String(room.number));
    const orders = demoStore.maintenance_orders.filter((item) => String(item.room_number) === String(room.number));
    return { room, roomType: null, bookingVisible, currentStay: reservations.find((item) => item.status === "checked_in") ?? null, nextReservation: reservations.find((item) => ["pending", "confirmed"].includes(String(item.status))) ?? null, assignments: reservations.map((reservation) => ({ id: String(reservation.id), room_id: id, check_in: reservation.check_in, check_out: reservation.check_out, status: "completed", reason: null, is_upgrade: false, reservation })), tasks, orders: orders.map((order) => ({ ...order, assigned_to: order.assignee ?? "Unassigned", events: [] })), blocked: orders.some((order) => ["open", "assigned", "in_progress", "waiting_parts", "deferred"].includes(String(order.status)) && ["blocked", "out_of_service"].includes(String(order.serviceability_impact ?? "serviceable"))) };
  }
  const roomResult = await supabase.from("rooms").select("id,number,floor,type,rate,status,housekeeping,amenities,wing,administrative_designation,administratively_active,deactivated_at,deactivation_reason,configuration_version,updated_at").eq("id", id).maybeSingle();
  if (roomResult.error) throw roomResult.error;
  const room = roomResult.data as RecordItem | null;
  if (!room) return null;
  const [{data: roomType}, {data: assignments}, {data: currentStay}, {data: nextReservation}, {data: tasks}, {data: orders}] = await Promise.all([
    supabase.from("room_types").select("name,description,max_guests,beds,size_sqm,base_rate,amenities,photo_urls").eq("name", String(room.type)).maybeSingle(),
    bookingVisible ? supabase.from("reservation_room_assignments").select("id,room_id,check_in,check_out,assigned_at,released_at,status,reason,is_upgrade,reservations(id,confirmation_number,guest_name,status,check_in,check_out,checked_in_at,checked_out_at)").eq("room_id", id).order("check_in", { ascending: false }).limit(25) : Promise.resolve({ data: [] }),
    bookingVisible ? supabase.from("reservations").select("id,confirmation_number,guest_name,check_in,check_out,guests,status,checked_in_at").eq("room_id", id).eq("status", "checked_in").maybeSingle() : Promise.resolve({ data: null }),
    bookingVisible ? supabase.from("reservations").select("id,confirmation_number,guest_name,check_in,check_out,guests,status").eq("room_id", id).in("status", ["pending", "confirmed"]).order("check_in", { ascending: true }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("housekeeping_tasks").select("id,task,task_type,assignee,assigned_user_id,priority,status,notes,started_at,completed_at,deferred_at,deferred_reason,inspection_status,inspected_by,inspected_at,created_at").eq("room_id", id).order("created_at", { ascending: false }).limit(15),
    supabase.from("maintenance_orders").select("id,issue,category,assignee,assigned_user_id,priority,status,serviceability_impact,serviceability_reason,diagnosis,resolution,created_at,started_at,resolved_at,completed_at").eq("room_id", id).order("created_at", { ascending: false }).limit(15)
  ]);
  const userIds = Array.from(new Set([...(tasks ?? []).flatMap((task) => [task.assigned_user_id, task.inspected_by]), ...(orders ?? []).map((order) => order.assigned_user_id)].filter(Boolean))) as string[];
  const activeOrderIds = (orders ?? []).filter((order) => !["resolved", "completed", "cancelled"].includes(String(order.status))).map((order) => order.id);
  const [usersResult, eventsResult] = await Promise.all([
    userIds.length ? supabase.from("user_accounts").select("id,name").in("id", userIds) : Promise.resolve({ data: [] }),
    activeOrderIds.length ? supabase.from("maintenance_order_events").select("id,order_id,event_type,from_status,to_status,note,created_at").in("order_id", activeOrderIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [] })
  ]);
  const name = (userId: string | null | undefined) => usersResult.data?.find((user) => user.id === userId)?.name ?? null;
  const decoratedTasks = (tasks ?? []).map((task) => ({ ...task, assigned_to: name(task.assigned_user_id) ?? task.assignee ?? "Unassigned", inspected_by_name: name(task.inspected_by) }));
  const decoratedOrders = (orders ?? []).map((order) => ({ ...order, assigned_to: name(order.assigned_user_id) ?? order.assignee ?? "Unassigned", events: (eventsResult.data ?? []).filter((event) => event.order_id === order.id) }));
  return {
    room,
    roomType: roomType as RecordItem | null,
    bookingVisible,
    currentStay: currentStay as RecordItem | null,
    nextReservation: nextReservation as RecordItem | null,
    assignments: (assignments ?? []).map(({ reservations, ...assignment }) => ({ ...assignment, reservation: ((reservations ?? null) as unknown as RecordItem | null) })) as RecordItem[],
    tasks: decoratedTasks as unknown as RecordItem[],
    orders: decoratedOrders as unknown as RecordItem[],
    blocked: (orders ?? []).some((order) => ["open", "assigned", "in_progress", "waiting_parts", "deferred"].includes(String(order.status)) && ["blocked", "out_of_service"].includes(String(order.serviceability_impact)))
  };
}
