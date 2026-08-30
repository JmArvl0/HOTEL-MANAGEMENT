import { demoStore } from "@/lib/demo-store";
import { supabase } from "@/lib/supabase";
import type { RecordItem, Resource, Role } from "@/lib/types";

export const operationalReservationFields = "id,confirmation_number,guest_id,guest_name,guest_email,room_id,room_number,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,payment_status,payment_method,special_requests,expected_arrival,cancellation_reason,identity_status,identity_verified_at,operational_policy_snapshot,created_at";
export const accountingReservationFields = "id,confirmation_number,guest_name,room_type,check_in,check_out,status,source,total,deposit,deposit_required,payment_status,payment_method,cancellation_reason,created_at";
export const departmentRequestFields = "id,reservation_id,request,department,priority,severity,due_at,escalation_status,escalated_at,status,created_at";

export async function listForRole(resource: Resource, role: Role): Promise<RecordItem[]> {
  if (!supabase) {
    const records = demoStore[resource];
    if (resource === "guest_requests" && ["housekeeping", "maintenance"].includes(role)) return records.filter((item) => item.department === role);
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
    return (data??[]).map(item=>({...item,folio_balance:invoiceResult.data?.find(invoice=>invoice.reservation_id===item.id)?.balance??0,guest_phone:guestResult.data?.find(guest=>guest.id===item.guest_id)?.phone??null})) as RecordItem[];
  }
  if (resource === "guest_requests") {
    let query = supabase.from("guest_requests").select("id,reservation_id,request,department,priority,severity,due_at,escalation_status,escalated_at,status,created_at");
    if (role === "housekeeping" || role === "maintenance") query = query.eq("department", role);
    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw error;
    return data as RecordItem[];
  }
  if (resource === "housekeeping_tasks") {
    const { data, error } = await supabase.from("housekeeping_tasks").select("id,room_id,room_number,task,task_type,assignee,assigned_user_id,priority,status,due,notes,reservation_id,guest_request_id,source_type,started_at,completed_at,deferred_at,deferred_reason,inspection_status,inspection_reason,version,created_at,updated_at").order("created_at", { ascending: false });
    if (error) throw error;
    const roomIds=Array.from(new Set((data??[]).map(item=>item.room_id).filter(Boolean))) as string[];
    const userIds=Array.from(new Set((data??[]).map(item=>item.assigned_user_id).filter(Boolean))) as string[];
    const [roomsResult,maintenanceResult,arrivalsResult,usersResult]=await Promise.all([
      roomIds.length?supabase.from("rooms").select("id,type,status,housekeeping").in("id",roomIds):Promise.resolve({data:[]}),
      roomIds.length?supabase.from("maintenance_orders").select("room_id,id,priority,status").in("room_id",roomIds).in("status",["open","in_progress"]):Promise.resolve({data:[]}),
      roomIds.length?supabase.from("reservations").select("room_id,check_in").in("room_id",roomIds).in("status",["pending","confirmed"]).gte("check_in",new Date().toISOString().slice(0,10)).order("check_in",{ascending:true}):Promise.resolve({data:[]}),
      userIds.length?supabase.from("user_accounts").select("id,name").in("id",userIds):Promise.resolve({data:[]})
    ]);
    return (data??[]).map(item=>{const room=roomsResult.data?.find(value=>value.id===item.room_id);const blocks=maintenanceResult.data?.filter(value=>value.room_id===item.room_id)??[];const nextArrival=arrivalsResult.data?.find(value=>value.room_id===item.room_id);const assigned=usersResult.data?.find(value=>value.id===item.assigned_user_id);return{...item,assigned_to:assigned?.name??item.assignee??"Unassigned",room_type:room?.type??null,room_status:room?.status??null,room_housekeeping:room?.housekeeping??null,maintenance_blocked:blocks.length>0,maintenance_priority:blocks[0]?.priority??null,next_arrival:nextArrival?.check_in??null}}) as RecordItem[];
  }
  if (resource === "payments") {
    const { data, error } = await supabase.from("payments").select("id,reservation_id,invoice_id,purpose,method,reference,amount,currency,status,submitted_at,verified_at,reviewed_at,decision_reason,created_at").order("created_at", { ascending: false });
    if (error) throw error;
    return data as RecordItem[];
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
  if (resource === "inventory" && ["housekeeping", "maintenance"].includes(role)) {
    const { data, error } = await supabase.from("inventory").select("id,name,category,quantity,reorder_point,unit,status,created_at").order("created_at", { ascending: false });
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

export async function getStaffReservation(id: string, role: Role) {
  if (!supabase) {
    const reservation = demoStore.reservations.find((item) => item.id === id);
    return reservation ? { reservation, guest: null, invoice: null, payments: [], charges: [], adjustments: [], refunds: [], refundAttempts: [], documents: [], changeRequests: [], assignments: [], requests: [], room: null, maintenance: [] } : null;
  }
  const result = role === "accounting"
    ? await supabase.from("reservations").select("id,confirmation_number,guest_name,room_type,check_in,check_out,status,source,total,deposit,deposit_required,payment_status,payment_method,cancellation_reason,created_at").eq("id", id).maybeSingle()
    : await supabase.from("reservations").select("id,confirmation_number,guest_id,guest_name,guest_email,room_id,room_number,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,payment_status,payment_method,special_requests,expected_arrival,cancellation_reason,identity_status,identity_verified_at,operational_policy_snapshot,created_at").eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  const reservation = result.data as RecordItem | null;
  if (!reservation) return null;
  const [{data:invoice},{data:payments},{data:charges},{data:adjustments},{data:refunds},{data:documents},{data:changeRequests},{data:assignments},{data:requests},{data:room},{data:maintenance}] = await Promise.all([
    supabase.from("invoices").select("id,reservation_id,amount,paid,balance,credit_balance,status,method,due_date").eq("reservation_id",id).maybeSingle(),
    supabase.from("payments").select("id,purpose,method,reference,amount,currency,status,submitted_at,verified_at,reviewed_at,decision_reason").eq("reservation_id",id).order("created_at",{ascending:false}),
    supabase.from("folio_charges").select("id,description,category,amount,status,source,created_at").eq("reservation_id",id).order("created_at",{ascending:false}),
    supabase.from("financial_adjustments").select("id,transaction_type,direction,amount,reason,source_charge_id,created_at").eq("reservation_id",id).order("created_at",{ascending:false}),
    supabase.from("refund_requests").select("id,eligible_amount,refund_basis_points,status,reference,created_at,processed_at").eq("reservation_id",id).order("created_at",{ascending:false}),
    supabase.from("financial_documents").select("id,document_number,document_type,created_at").eq("reservation_id",id).order("created_at",{ascending:false}),
    supabase.from("reservation_change_requests").select("id,requested_check_in,requested_check_out,requested_room_type,reason,status,created_at").eq("reservation_id",id).order("created_at",{ascending:false}),
    supabase.from("reservation_room_assignments").select("id,room_id,check_in,check_out,assigned_at,released_at,status,reason,is_upgrade").eq("reservation_id",id).order("assigned_at",{ascending:false}),
    supabase.from("guest_requests").select("id,request,department,priority,status,created_at").eq("reservation_id",id).order("created_at",{ascending:false}),
    reservation.room_id?supabase.from("rooms").select("id,number,type,status,housekeeping").eq("id",reservation.room_id).maybeSingle():Promise.resolve({data:null}),
    reservation.room_id?supabase.from("maintenance_orders").select("id,issue,priority,status,created_at").eq("room_id",reservation.room_id).in("status",["open","in_progress"]):Promise.resolve({data:[]})
  ]);
  const refundIds=(refunds??[]).map(item=>item.id);
  const refundAttempts=refundIds.length?((await supabase.from("refund_attempts").select("id,refund_request_id,status,reference,reason,attempted_at").in("refund_request_id",refundIds).order("attempted_at",{ascending:false})).data??[]):[];
  let guest: RecordItem | null = null;
  if (role !== "accounting" && reservation.guest_id) {
    const result = await supabase.from("guests").select("id,name,email,phone,loyalty_tier,preferences,special_requests").eq("id", reservation.guest_id).maybeSingle();
    guest = result.data as RecordItem | null;
  }
  return { reservation, guest, invoice: invoice as RecordItem | null, payments: (payments ?? []) as RecordItem[], charges:(charges??[])as RecordItem[], adjustments:(adjustments??[])as RecordItem[], refunds:(refunds??[])as RecordItem[], refundAttempts:refundAttempts as RecordItem[], documents:(documents??[])as RecordItem[], changeRequests:(changeRequests??[])as RecordItem[], assignments:(assignments??[])as RecordItem[], requests:(requests??[])as RecordItem[], room:room as RecordItem|null, maintenance:(maintenance??[])as RecordItem[] };
}
