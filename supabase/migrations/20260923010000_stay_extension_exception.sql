-- Stay extension as an explicit Manager exception type.
--
-- Semantics (D-009):
--   * Stay extension = additional reservation NIGHTS (checkout DATE changes). It is
--     deliberately distinct from late_checkout (same date, later time).
--   * Normal extension (room free through the new checkout) stays with
--     front_desk_extend_stay — no Manager involved. The exception exists for the
--     case the normal path refuses (EXTENSION_REQUIRES_ROOM_CHANGE): the Manager
--     authorizes the extension plan; execution still never creates an overlap.
--   * In-house only (checked_in). Pre-arrival checkout changes are
--     reservation_modification's scope — not duplicated here.
--   * Room moves at execution are SAME-TYPE only; a cross-type move must go through
--     the existing room-change exception (reason-coded financial responsibility,
--     migration 20260922010000) first, then extend normally at the new type's rate.
--   * Pricing: the reserved room type's current base_rate × added nights — the same
--     rule front_desk_extend_stay already applies. No new pricing policy.
--
-- Recreates three existing SECURITY DEFINER objects from their LIVE definitions
-- (fetched via pg_get_functiondef before writing; the live bodies match migration
-- 20260922010000). front_desk_extend_stay itself is untouched and remains the ONE
-- extension implementation: the execute branch performs it with the approval id as
-- idempotency key, so every guard (overlap, dates, assignment) re-runs atomically.

-- 1) request_manager_approval -- accept 'stay_extension', validate the requested
-- checkout, and stamp the server-computed extension snapshot the Manager reviews and
-- execution consumes. Client-supplied snapshots are stripped like 'financials'.
create or replace function public.request_manager_approval(p_request_type text,p_related_entity_type text,p_related_entity_id text,p_reservation_id text,p_guest_request_id uuid,p_department text,p_severity text,p_reason text,p_requested_action jsonb,p_staff_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;g guest_requests%rowtype;aid uuid;normal_result jsonb:='{}'::jsonb;policy jsonb;deposit_paid numeric;normal_refund numeric;v_target text;v_type room_types%rowtype;v_new_out date;v_added numeric;v_conflict boolean;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','front_desk','housekeeping','maintenance','accounting')then raise exception'APPROVAL_REQUEST_FORBIDDEN';end if;
if p_request_type not in('room_upgrade','room_type_exception','reservation_modification','early_check_in','late_checkout','guest_compensation','refund_exception','checkout_exception','guest_escalation','stay_extension')or nullif(trim(p_reason),'')is null then raise exception'INVALID_APPROVAL_REQUEST';end if;
if p_severity not in('normal','high','critical')then raise exception'INVALID_SEVERITY';end if;
if p_request_type<>'guest_escalation'and p_reservation_id is null then raise exception'RESERVATION_REQUIRED';end if;
if p_reservation_id is not null then select * into r from reservations where id=p_reservation_id;if not found then raise exception'RESERVATION_NOT_FOUND';end if;policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());
 normal_result:=jsonb_build_object('reservationStatus',r.status,'roomType',r.room_type,'checkIn',r.check_in,'checkOut',r.check_out,'policySnapshot',policy);end if;
if p_request_type='guest_escalation'then select * into g from guest_requests where id=p_guest_request_id for update;if not found or g.status='completed'then raise exception'GUEST_REQUEST_NOT_ESCALATABLE';end if;
 update guest_requests set severity=p_severity,escalation_status='escalated',escalated_by=p_staff_user_id,escalated_at=now()where id=g.id;end if;
if p_request_type='refund_exception'then
 if r.status not in('cancelled','no_show')then raise exception'REFUND_EXCEPTION_REQUIRES_CLOSURE';end if;
 select coalesce(sum(amount),0)into deposit_paid from payments where reservation_id=r.id and purpose='reservation_deposit'and status='paid';
 select coalesce(max(eligible_amount),0)into normal_refund from refund_requests where reservation_id=r.id and exception_approval_id is null;
 normal_result:=normal_result||jsonb_build_object('settledDeposit',deposit_paid,'normalPolicyRefund',normal_refund);
end if;
if p_request_type='room_type_exception'then
 if nullif(p_requested_action->>'roomType','')is null then raise exception'ROOM_TYPE_EXCEPTION_TYPE_REQUIRED';end if;
 if(p_requested_action->>'roomType')=r.room_type then raise exception'ROOM_TYPE_EXCEPTION_SAME_TYPE';end if;
 if not exists(select 1 from room_types where name=(p_requested_action->>'roomType')and active)then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
end if;
if p_request_type in('room_type_exception','room_upgrade')then
 -- Financial responsibility derives from the reason code only. Strip any caller-supplied
 -- financial field, validate the code, then stamp the server-computed snapshot that the
 -- Manager reviews and that approval/execution consume verbatim.
 p_requested_action:=p_requested_action-'financials'-'priceDifference'-'waived'-'guest_charge'-'hotel_absorbed_amount'-'financial_responsibility';
 if nullif(p_requested_action->>'reasonCode','')is null then raise exception'ROOM_TYPE_EXCEPTION_REASON_REQUIRED';end if;
 if public.room_type_change_responsibility(p_requested_action->>'reasonCode')is null then raise exception'ROOM_TYPE_EXCEPTION_REASON_INVALID';end if;
 if(p_requested_action->>'reasonCode')='hotel_early_checkin_failure'and r.early_check_in_approved_until is null then raise exception'ROOM_TYPE_EXCEPTION_EARLY_CHECKIN_PRECONDITION';end if;
 v_target:=coalesce(nullif(p_requested_action->>'roomType',''),nullif(p_requested_action->>'requestedRoomType',''));
 select * into v_type from room_types where name=v_target and active;if not found then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
 p_requested_action:=p_requested_action||jsonb_build_object('financials',jsonb_build_object('reasonCode',p_requested_action->>'reasonCode','responsibility',public.room_type_change_responsibility(p_requested_action->>'reasonCode'),'originalTotal',r.total,'targetRate',v_type.base_rate,'nights',(r.check_out-r.check_in),'targetTotal',round(v_type.base_rate*(r.check_out-r.check_in),2),'difference',round(round(v_type.base_rate*(r.check_out-r.check_in),2)-r.total,2)));
end if;
if p_request_type='stay_extension'then
 -- In-house only, later checkout required; every derived figure is server-stamped.
 p_requested_action:=p_requested_action-'stayExtension';
 if r.status<>'checked_in'then raise exception'STAY_EXTENSION_REQUIRES_IN_HOUSE';end if;
 if nullif(p_requested_action->>'requestedCheckOut','')is null or(p_requested_action->>'requestedCheckOut')!~'^\d{4}-\d{2}-\d{2}$'or(p_requested_action->>'requestedCheckOut')::date<=r.check_out then raise exception'STAY_EXTENSION_INVALID_DATE';end if;
 v_new_out:=(p_requested_action->>'requestedCheckOut')::date;
 select * into v_type from room_types where name=r.room_type and active;if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 v_added:=round(v_type.base_rate*(v_new_out-r.check_out),2);
 select exists(select 1 from reservation_room_assignments where room_id=r.room_id and reservation_id<>r.id and status='active'and check_in<v_new_out and check_out>r.check_out)or exists(select 1 from reservations where id<>r.id and room_id=r.room_id and status in('confirmed','checked_in')and check_in<v_new_out and check_out>r.check_out)into v_conflict;
 p_requested_action:=p_requested_action||jsonb_build_object('stayExtension',jsonb_build_object('currentCheckOut',r.check_out,'requestedCheckOut',v_new_out,'nights',(v_new_out-r.check_out),'rate',v_type.base_rate,'additionalAmount',v_added,'projectedTotal',round(r.total+v_added,2),'roomConflict',v_conflict,'roomNumber',r.room_number,'roomType',r.room_type));
end if;
insert into manager_approval_requests(request_type,related_entity_type,related_entity_id,reservation_id,guest_request_id,department,severity,reason,requested_action,normal_policy_result,requested_by)
values(p_request_type,p_related_entity_type,p_related_entity_id,p_reservation_id,p_guest_request_id,lower(trim(p_department)),p_severity,trim(p_reason),coalesce(p_requested_action,'{}'),normal_result,p_staff_user_id)returning id into aid;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'request_manager_approval','manager_approval',aid::text,jsonb_build_object('type',p_request_type,'reason',trim(p_reason),'relatedEntityId',p_related_entity_id));
return aid;exception when unique_violation then raise exception'APPROVAL_ALREADY_PENDING';end$$;

-- 2) review_manager_approval -- a stay-extension request is approvable only in-house
-- with a valid stamped date. A room conflict does NOT block approval (the conflict is
-- why the exception exists); execution enforces inventory integrity atomically.
create or replace function public.review_manager_approval(p_approval_id uuid,p_decision text,p_reason text,p_expected_version integer,p_manager_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;a manager_approval_requests%rowtype;r reservations%rowtype;available_same int;available_target int;inventory int;reserved int;held int;target_type text;requested_amount numeric;deposit_paid numeric;already_refunded numeric;i invoices%rowtype;rid uuid;begin
select role into actor from user_accounts where id=p_manager_user_id and active;if actor is null or actor not in('owner','admin','manager')then raise exception'MANAGER_REVIEW_FORBIDDEN';end if;
if p_decision not in('approve','reject')or nullif(trim(p_reason),'')is null then raise exception'INVALID_MANAGER_DECISION';end if;
select * into a from manager_approval_requests where id=p_approval_id for update;if not found then raise exception'APPROVAL_NOT_FOUND';end if;
if a.status<>'pending'or a.version<>p_expected_version then raise exception'APPROVAL_ALREADY_REVIEWED';end if;if a.requested_by=p_manager_user_id then raise exception'SELF_APPROVAL_FORBIDDEN';end if;
if a.reservation_id is not null then select * into r from reservations where id=a.reservation_id for update;if not found then raise exception'APPROVAL_STALE';end if;end if;
if a.request_type in('room_upgrade','room_type_exception','reservation_modification','early_check_in','late_checkout','checkout_exception','stay_extension')and r.status in('cancelled','no_show','checked_out')then raise exception'APPROVAL_STALE';end if;
if p_decision='approve'and a.request_type='room_upgrade'then
 target_type:=nullif(a.requested_action->>'requestedRoomType','');if target_type is null or target_type=r.room_type then raise exception'INVALID_UPGRADE_REQUEST';end if;
 if a.requested_action->'financials'is null then raise exception'ROOM_TYPE_EXCEPTION_REASON_REQUIRED';end if;
 if coalesce(a.requested_action->'financials'->>'responsibility','')='hotel'then
  select count(*)into available_same from rooms x where x.type=r.room_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
  if available_same>0 then raise exception'SAME_TYPE_ROOM_AVAILABLE';end if;
 end if;
 select count(*)into available_target from rooms x where x.type=target_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
 if available_target=0 then raise exception'UPGRADE_ROOM_UNAVAILABLE';end if;
end if;
if p_decision='approve'and a.request_type='room_type_exception'then
 target_type:=nullif(a.requested_action->>'roomType','');if target_type is null or target_type=r.room_type then raise exception'ROOM_TYPE_EXCEPTION_SAME_TYPE';end if;
 if not exists(select 1 from room_types where name=target_type and active)then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
 if a.requested_action->'financials'is null then raise exception'ROOM_TYPE_EXCEPTION_REASON_REQUIRED';end if;
 if coalesce(a.requested_action->'financials'->>'responsibility','')='hotel'then
  select count(*)into available_same from rooms x where x.type=r.room_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
  if available_same>0 then raise exception'ROOM_TYPE_EXCEPTION_NOT_NEEDED';end if;
 end if;
 select count(*)into available_target from rooms x where x.type=target_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
 if available_target=0 then raise exception'ROOM_TYPE_EXCEPTION_UNAVAILABLE';end if;
end if;
if p_decision='approve'and a.request_type='reservation_modification'then
 if nullif(a.requested_action->>'checkIn','')is null or nullif(a.requested_action->>'checkOut','')is null or(a.requested_action->>'checkOut')::date<=(a.requested_action->>'checkIn')::date then raise exception'INVALID_MODIFICATION_REQUEST';end if;
 target_type:=coalesce(nullif(a.requested_action->>'roomType',''),r.room_type);
 if r.status not in('pending','confirmed')then raise exception'APPROVAL_STALE';end if;perform pg_advisory_xact_lock(hashtextextended(target_type,0));perform expire_booking_holds();
 select count(*)into inventory from rooms x where x.type=target_type and room_is_sellable(x.id,(a.requested_action->>'checkIn')::date,null);
 select count(*)into reserved from reservations y where y.id<>r.id and y.room_type=target_type and y.status in('pending','confirmed','checked_in')and y.check_in<(a.requested_action->>'checkOut')::date and y.check_out>(a.requested_action->>'checkIn')::date;
 select count(*)into held from booking_holds h where h.room_type=target_type and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<(a.requested_action->>'checkOut')::date and h.check_out>(a.requested_action->>'checkIn')::date;available_target:=inventory-reserved-held;
 if available_target<=0 then raise exception'MODIFICATION_INVENTORY_UNAVAILABLE';end if;
end if;
if p_decision='approve'and a.request_type='early_check_in'then
 if r.status<>'confirmed'or r.room_id is null or not exists(select 1 from rooms x where x.id=r.room_id and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress')))then raise exception'EARLY_CHECKIN_NOT_SAFE';end if;
end if;
if p_decision='approve'and a.request_type='late_checkout'then
 if r.status<>'checked_in'or nullif(a.requested_action->>'requestedUntil','')is null then raise exception'INVALID_LATE_CHECKOUT';end if;
 if exists(select 1 from reservation_room_assignments ra where ra.room_id=r.room_id and ra.reservation_id<>r.id and ra.status='active'and ra.check_in<=((a.requested_action->>'requestedUntil')::timestamptz at time zone'Asia/Manila')::date and ra.check_out>r.check_out)then raise exception'LATE_CHECKOUT_CONFLICT';end if;
end if;
if p_decision='approve'and a.request_type='guest_compensation'then requested_amount:=coalesce((a.requested_action->>'amount')::numeric,0);select * into i from invoices where reservation_id=r.id for update;if not found or requested_amount<=0 or requested_amount>i.amount then raise exception'COMPENSATION_EXCEEDS_FOLIO';end if;end if;
if p_decision='approve'and a.request_type='checkout_exception'then if r.status<>'checked_in'or nullif(a.requested_action->>'arrangement','')is null then raise exception'INVALID_CHECKOUT_EXCEPTION';end if;end if;
if p_decision='approve'and a.request_type='stay_extension'then
 if r.status<>'checked_in'or a.requested_action->'stayExtension'is null or(a.requested_action->'stayExtension'->>'requestedCheckOut')::date<=r.check_out then raise exception'APPROVAL_STALE';end if;
end if;
if p_decision='approve'and a.request_type='refund_exception'then
 requested_amount:=coalesce((a.requested_action->>'amount')::numeric,0);select coalesce(sum(amount),0)into deposit_paid from payments where reservation_id=r.id and purpose='reservation_deposit'and status='paid';
 select coalesce(sum(amount),0)into already_refunded from payments where reservation_id=r.id and purpose='refund'and status='paid';if requested_amount<=0 or requested_amount>deposit_paid-already_refunded then raise exception'REFUND_EXCEPTION_EXCEEDS_SETTLED_PAYMENT';end if;
 select * into i from invoices where reservation_id=r.id for update;insert into refund_requests(reservation_id,invoice_id,requested_by,reason,paid_deposit,refund_basis_points,eligible_amount,status,exception_approval_id,normal_policy_amount)
 values(r.id,i.id,a.requested_by,a.reason,deposit_paid,0,round(requested_amount,2),'pending',a.id,coalesce((a.normal_policy_result->>'normalPolicyRefund')::numeric,0))returning id into rid;
end if;
update manager_approval_requests set status=case when p_decision='approve'then'approved'else'rejected'end,reviewed_by=p_manager_user_id,reviewed_at=now(),decision_reason=trim(p_reason),
 execution_status=case when p_decision='reject'then'not_required'when request_type='guest_escalation'then'executed'else'awaiting_execution'end,executed_by=case when p_decision='approve'and request_type='guest_escalation'then p_manager_user_id else null end,executed_at=case when p_decision='approve'and request_type='guest_escalation'then now()else null end,version=version+1,updated_at=now()where id=a.id;
if a.request_type='guest_escalation'and p_decision='approve'then update guest_requests set escalation_status='coordinated',manager_resolution=trim(p_reason)where id=a.guest_request_id;end if;
insert into manager_notes(approval_id,note,created_by)values(a.id,trim(p_reason),p_manager_user_id);
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_manager_user_id,'manager_'||p_decision,'manager_approval',a.id::text,jsonb_build_object('status',a.status,'version',a.version),jsonb_build_object('status',case when p_decision='approve'then'approved'else'rejected'end,'reason',trim(p_reason),'refundRequestId',rid));
return jsonb_build_object('status',case when p_decision='approve'then'approved'else'rejected'end,'executionStatus',case when p_decision='reject'then'not_required'when a.request_type='guest_escalation'then'executed'else'awaiting_execution'end,'refundRequestId',rid);end$$;

-- 3) front_desk_execute_manager_approval -- stay_extension execution: optional
-- validated SAME-TYPE room move (p_room_id), then the standard audited extension
-- (front_desk_extend_stay, idempotency key = approval id). Every extend_stay guard
-- re-runs inside this transaction, so a remaining conflict raises
-- EXTENSION_REQUIRES_ROOM_CHANGE and rolls the move back too -- an overlap can
-- never be created.
create or replace function public.front_desk_execute_manager_approval(p_approval_id uuid,p_room_id text,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;a manager_approval_requests%rowtype;r reservations%rowtype;oldroom rooms%rowtype;newroom rooms%rowtype;assignment reservation_room_assignments%rowtype;t room_types%rowtype;i invoices%rowtype;new_total numeric;new_paid numeric;available_same int;inventory int;reserved int;held int;v_new_out date;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'FRONT_DESK_EXECUTION_FORBIDDEN';end if;
select * into a from manager_approval_requests where id=p_approval_id for update;if not found or a.status<>'approved'or a.execution_status<>'awaiting_execution'then raise exception'APPROVAL_NOT_EXECUTABLE';end if;
select * into r from reservations where id=a.reservation_id for update;if not found or r.status in('cancelled','no_show','checked_out')then raise exception'APPROVAL_STALE';end if;
if a.request_type='room_upgrade'then
 if a.requested_action->'financials'is null then raise exception'APPROVAL_STALE';end if;
 if coalesce(a.requested_action->'financials'->>'responsibility','')='hotel'then
  select count(*)into available_same from rooms x where x.type=r.room_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);if available_same>0 then raise exception'APPROVAL_STALE';end if;
 end if;
 select * into oldroom from rooms where id=r.room_id for update;select * into newroom from rooms where(id=p_room_id or number=p_room_id)for update;
 if not found or newroom.type<>(a.requested_action->>'requestedRoomType')or newroom.status<>'available'or newroom.housekeeping<>'clean'then raise exception'UPGRADE_ROOM_NOT_READY';end if;
 if exists(select 1 from maintenance_orders where room_id=newroom.id and status in('open','in_progress'))or exists(select 1 from reservation_room_assignments where room_id=newroom.id and reservation_id<>r.id and status='active'and check_in<r.check_out and check_out>r.check_in)then raise exception'UPGRADE_ROOM_UNAVAILABLE';end if;
 select * into assignment from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found then update reservation_room_assignments set status='reassigned',released_at=now(),reason=a.reason where id=assignment.id;end if;
 insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason,is_upgrade,authorized_by)values(r.id,newroom.id,r.check_in,r.check_out,p_staff_user_id,a.reason,true,a.reviewed_by);
 update reservations set room_id=newroom.id,room_number=newroom.number,room_type=newroom.type where id=r.id;update rooms set status=case when r.status='checked_in'then'occupied'else'reserved'end where id=newroom.id;
 if coalesce(a.requested_action->'financials'->>'responsibility','')='guest'and coalesce((a.requested_action->'financials'->>'difference')::numeric,0)>0 then
  if a.guest_accepted_at is null then raise exception'ROOM_TYPE_EXCEPTION_ACCEPTANCE_REQUIRED';end if;
  select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
  insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,source_record_id)values(i.id,r.id,'Manager-approved room upgrade to '||newroom.type,'upgrade',round((a.requested_action->'financials'->>'difference')::numeric,2),p_staff_user_id,a.id,'manager_approval',a.id::text);update invoices set amount=round(amount+round((a.requested_action->'financials'->>'difference')::numeric,2),2)where id=i.id;perform sync_invoice_financials(i.id);
 end if;
 if oldroom.id is not null then update rooms set status='dirty',housekeeping='dirty'where id=oldroom.id;insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)values(oldroom.id,oldroom.number,'Manager-approved room-change turnover','high','pending','Before next arrival',a.reason);end if;
elsif a.request_type='reservation_modification'then
 if r.status not in('pending','confirmed')then raise exception'APPROVAL_STALE';end if;select * into t from room_types where name=coalesce(nullif(a.requested_action->>'roomType',''),r.room_type)and active;if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;perform pg_advisory_xact_lock(hashtextextended(t.name,0));perform expire_booking_holds();
 select count(*)into inventory from rooms x where x.type=t.name and room_is_sellable(x.id,(a.requested_action->>'checkIn')::date,null);select count(*)into reserved from reservations y where y.id<>r.id and y.room_type=t.name and y.status in('pending','confirmed','checked_in')and y.check_in<(a.requested_action->>'checkOut')::date and y.check_out>(a.requested_action->>'checkIn')::date;select count(*)into held from booking_holds h where h.room_type=t.name and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<(a.requested_action->>'checkOut')::date and h.check_out>(a.requested_action->>'checkIn')::date;if inventory-reserved-held<=0 then raise exception'MODIFICATION_INVENTORY_UNAVAILABLE';end if;
 if r.room_id is not null then select * into oldroom from rooms where id=r.room_id for update;end if;new_total:=round(t.base_rate*((a.requested_action->>'checkOut')::date-(a.requested_action->>'checkIn')::date),2);select * into i from invoices where reservation_id=r.id for update;new_paid:=i.paid;
 update reservations set check_in=(a.requested_action->>'checkIn')::date,check_out=(a.requested_action->>'checkOut')::date,room_type=t.name,total=new_total,room_id=null,room_number=null where id=r.id;
 update invoices set amount=new_total,balance=greatest(new_total-new_paid,0),credit_balance=greatest(new_paid-new_total,0),status=case when new_paid>new_total then'credit'when new_paid=new_total then'paid'when new_paid>0 then'partial'else'unpaid'end where id=i.id;
 update reservation_room_assignments set status='cancelled',released_at=now(),reason='Reservation modification requires reassignment'where reservation_id=r.id and status='active';if oldroom.id is not null then update rooms set status=case when housekeeping='clean'then'available'else'dirty'end where id=oldroom.id and status='reserved';end if;
elsif a.request_type='early_check_in'then update reservations set early_check_in_approved_until=now()+interval'8 hours'where id=r.id;
elsif a.request_type='late_checkout'then if r.status<>'checked_in'or exists(select 1 from reservation_room_assignments ra where ra.room_id=r.room_id and ra.reservation_id<>r.id and ra.status='active'and ra.check_in<=((a.requested_action->>'requestedUntil')::timestamptz at time zone'Asia/Manila')::date and ra.check_out>r.check_out)then raise exception'APPROVAL_STALE';end if;update reservations set late_checkout_until=(a.requested_action->>'requestedUntil')::timestamptz where id=r.id;
elsif a.request_type='checkout_exception'then if r.status<>'checked_in'or nullif(a.requested_action->>'arrangement','')is null then raise exception'APPROVAL_STALE';end if;select * into oldroom from rooms where id=r.room_id for update;update reservations set status='checked_out',checked_out_at=now()where id=r.id;update rooms set status='dirty',housekeeping='dirty'where id=r.room_id;update reservation_room_assignments set status='released',released_at=now(),reason='Manager-approved checkout exception; balance remains collectible'where reservation_id=r.id and status='active';if not exists(select 1 from housekeeping_tasks where room_id=r.room_id and status in('pending','in_progress'))then insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)values(r.room_id,oldroom.number,'Checkout turnover','high','pending','Before next arrival','Checkout exception executed; folio balance retained: '||(a.requested_action->>'arrangement'));end if;
elsif a.request_type='stay_extension'then
 if r.status<>'checked_in'or a.requested_action->'stayExtension'is null then raise exception'APPROVAL_STALE';end if;
 v_new_out:=(a.requested_action->'stayExtension'->>'requestedCheckOut')::date;
 if v_new_out<=r.check_out then raise exception'APPROVAL_STALE';end if;
 if nullif(trim(coalesce(p_room_id,'')),'')is not null then
  select * into oldroom from rooms where id=r.room_id for update;select * into newroom from rooms where(id=p_room_id or number=p_room_id)for update;
  if not found or newroom.type<>r.room_type or newroom.status<>'available'or newroom.housekeeping<>'clean'then raise exception'EXTENSION_ROOM_NOT_READY';end if;
  if exists(select 1 from maintenance_orders where room_id=newroom.id and status in('open','in_progress'))or exists(select 1 from reservation_room_assignments where room_id=newroom.id and reservation_id<>r.id and status='active'and check_in<v_new_out and check_out>r.check_in)then raise exception'EXTENSION_ROOM_UNAVAILABLE';end if;
  select * into assignment from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found then update reservation_room_assignments set status='reassigned',released_at=now(),reason='Stay-extension room move: '||a.reason where id=assignment.id;end if;
  insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason,is_upgrade,authorized_by)values(r.id,newroom.id,r.check_in,v_new_out,p_staff_user_id,'Stay-extension room move: '||a.reason,false,a.reviewed_by);
  update reservations set room_id=newroom.id,room_number=newroom.number where id=r.id;update rooms set status='occupied'where id=newroom.id;
  if oldroom.id is not null then update rooms set status='dirty',housekeeping='dirty'where id=oldroom.id;insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)values(oldroom.id,oldroom.number,'Stay-extension room-move turnover','high','pending','Before next arrival',a.reason);end if;
 end if;
 -- The ONE extension implementation: charge, dates, assignment, and audit, with every
 -- guard re-running atomically (idempotency key = approval id).
 perform public.front_desk_extend_stay(r.id,v_new_out,a.reason,a.id,p_staff_user_id);
else raise exception'APPROVAL_REQUIRES_OTHER_DEPARTMENT';end if;
update manager_approval_requests set execution_status='executed',executed_by=p_staff_user_id,executed_at=now(),version=version+1,updated_at=now()where id=a.id;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'execute_manager_approval','manager_approval',a.id::text,jsonb_build_object('requestType',a.request_type,'reservationId',r.id,'roomId',p_room_id,'financials',a.requested_action->'financials','stayExtension',a.requested_action->'stayExtension'));
return jsonb_build_object('status','executed','requestType',a.request_type,'reservationId',r.id);end$$;

-- 4) Read-only preview for the Extend stay dialog: the same checks the write path
-- performs (in-house, later date, room type active, room conflict) without any writes.
-- The dialog never derives nights, rate, or totals client-side.
create or replace function public.front_desk_extend_stay_preview(p_reservation_id text,p_new_check_out date,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;room rooms%rowtype;t room_types%rowtype;i invoices%rowtype;v_nights int;v_added numeric;v_conflict boolean;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'EXTENSION_FORBIDDEN';end if;
select * into r from reservations where id=p_reservation_id;if not found then raise exception'RESERVATION_NOT_FOUND';end if;
if r.status<>'checked_in'or r.room_id is null then raise exception'RESERVATION_NOT_IN_HOUSE';end if;
if p_new_check_out<=r.check_out then raise exception'INVALID_EXTENSION_DATE';end if;
select * into room from rooms where id=r.room_id;
select * into t from room_types where name=r.room_type and active;if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
select * into i from invoices where reservation_id=r.id;if not found then raise exception'FOLIO_NOT_FOUND';end if;
v_nights:=p_new_check_out-r.check_out;v_added:=round(t.base_rate*v_nights,2);
select exists(select 1 from reservation_room_assignments where room_id=room.id and reservation_id<>r.id and status='active'and check_in<p_new_check_out and check_out>r.check_out)or exists(select 1 from reservations where id<>r.id and room_id=room.id and status in('confirmed','checked_in')and check_in<p_new_check_out and check_out>r.check_out)into v_conflict;
return jsonb_build_object('currentCheckOut',r.check_out,'requestedCheckOut',p_new_check_out,'nights',v_nights,'rate',t.base_rate,'additionalAmount',v_added,'projectedTotal',round(i.amount+v_added,2),'balance',i.balance,'roomConflict',v_conflict,'roomNumber',room.number,'roomType',r.room_type);
end$$;

revoke all on function public.front_desk_extend_stay_preview(text,date,uuid)from public,anon,authenticated;
grant execute on function public.front_desk_extend_stay_preview(text,date,uuid)to service_role;
