-- Room-type change / upgrade financial responsibility rules.
--
-- Financial responsibility is DERIVED from a structured, Manager-approved reason code --
-- never from a manual "who pays?" control:
--   * hotel-caused reasons  -> the hotel absorbs any positive rate difference; the guest
--     keeps the original agreed price (reservations.total and the folio are untouched;
--     the absorbed amount is recorded in the audit trail).
--   * guest-requested reasons -> the guest pays the positive difference. Front Desk
--     records the guest's acceptance (record_room_type_change_acceptance); the difference
--     is posted through the existing folio_charges/invoices architecture and must settle
--     through the existing balance gates before check-in/execution finalizes.
--   * negative difference (downgrade) -> displayed and flagged for review; pricing stays
--     at the original total -- no refund policy is invented here.
--
-- The reason code and the financial snapshot (originalTotal from the booking-time
-- reservations.total snapshot, targetRate x nights, difference) are stamped into
-- requested_action by request_manager_approval -- server-computed only; any client-supplied
-- financial fields are stripped. Approval and execution consume the stamp, so history is
-- reproducible even if base rates later change. hotel_early_checkin_failure additionally
-- requires reservations.early_check_in_approved_until (an unapproved early arrival is never
-- hotel-caused).
--
-- Recreates five existing SECURITY DEFINER objects. Bases are the LIVE definitions (which
-- have drifted from the migration files: room_is_sellable in the modification inventory
-- counts, the checkout_exception execute branch, and the front-desk-only actor check in
-- front_desk_execute_manager_approval); every pre-existing line is preserved except where
-- a responsibility branch replaces it. No data rewrites.

-- Reason-code -> responsibility derivation. Single source for every gate below; mirrored
-- in lib/manager.ts (ROOM_TYPE_EXCEPTION_REASONS) for the UI selects.
create or replace function public.room_type_change_responsibility(p_reason text)returns text language sql immutable as $$
select case when p_reason in('hotel_type_unavailable','hotel_room_unserviceable','hotel_maintenance','hotel_overbooking','hotel_error','hotel_early_checkin_failure')then'hotel'
when p_reason in('guest_larger_room','guest_premium_type','guest_better_view','guest_early_arrival_upgrade')then'guest'else null end$$;
revoke all on function public.room_type_change_responsibility(text) from public,anon,authenticated;

-- Guest acceptance of a guest-pays difference. Nullable; only set for guest-responsibility
-- room-type changes with a positive difference.
alter table public.manager_approval_requests add column if not exists guest_accepted_at timestamptz;
alter table public.manager_approval_requests add column if not exists guest_accepted_by uuid references public.user_accounts(id)on delete set null;

-- 1) request_manager_approval -- validate the reason code, strip any client-supplied
-- financial fields, and stamp the server-computed financial snapshot.
create or replace function public.request_manager_approval(p_request_type text,p_related_entity_type text,p_related_entity_id text,p_reservation_id text,p_guest_request_id uuid,p_department text,p_severity text,p_reason text,p_requested_action jsonb,p_staff_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;g guest_requests%rowtype;aid uuid;normal_result jsonb:='{}'::jsonb;policy jsonb;deposit_paid numeric;normal_refund numeric;v_target text;v_type room_types%rowtype;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','front_desk','housekeeping','maintenance','accounting')then raise exception'APPROVAL_REQUEST_FORBIDDEN';end if;
if p_request_type not in('room_upgrade','room_type_exception','reservation_modification','early_check_in','late_checkout','guest_compensation','refund_exception','checkout_exception','guest_escalation')or nullif(trim(p_reason),'')is null then raise exception'INVALID_APPROVAL_REQUEST';end if;
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
insert into manager_approval_requests(request_type,related_entity_type,related_entity_id,reservation_id,guest_request_id,department,severity,reason,requested_action,normal_policy_result,requested_by)
values(p_request_type,p_related_entity_type,p_related_entity_id,p_reservation_id,p_guest_request_id,lower(trim(p_department)),p_severity,trim(p_reason),coalesce(p_requested_action,'{}'),normal_result,p_staff_user_id)returning id into aid;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'request_manager_approval','manager_approval',aid::text,jsonb_build_object('type',p_request_type,'reason',trim(p_reason),'relatedEntityId',p_related_entity_id));
return aid;exception when unique_violation then raise exception'APPROVAL_ALREADY_PENDING';end$$;

-- 2) review_manager_approval -- the "same-type room available => exception unnecessary"
-- gates apply to HOTEL-caused changes only; a guest-requested voluntary upgrade is
-- legitimate while same-type rooms remain. Legacy rows without a financial snapshot can no
-- longer be approved (reject and re-request with a reason code).
create or replace function public.review_manager_approval(p_approval_id uuid,p_decision text,p_reason text,p_expected_version integer,p_manager_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;a manager_approval_requests%rowtype;r reservations%rowtype;available_same int;available_target int;inventory int;reserved int;held int;target_type text;requested_amount numeric;deposit_paid numeric;already_refunded numeric;i invoices%rowtype;rid uuid;begin
select role into actor from user_accounts where id=p_manager_user_id and active;if actor is null or actor not in('owner','admin','manager')then raise exception'MANAGER_REVIEW_FORBIDDEN';end if;
if p_decision not in('approve','reject')or nullif(trim(p_reason),'')is null then raise exception'INVALID_MANAGER_DECISION';end if;
select * into a from manager_approval_requests where id=p_approval_id for update;if not found then raise exception'APPROVAL_NOT_FOUND';end if;
if a.status<>'pending'or a.version<>p_expected_version then raise exception'APPROVAL_ALREADY_REVIEWED';end if;if a.requested_by=p_manager_user_id then raise exception'SELF_APPROVAL_FORBIDDEN';end if;
if a.reservation_id is not null then select * into r from reservations where id=a.reservation_id for update;if not found then raise exception'APPROVAL_STALE';end if;end if;
if a.request_type in('room_upgrade','room_type_exception','reservation_modification','early_check_in','late_checkout','checkout_exception')and r.status in('cancelled','no_show','checked_out')then raise exception'APPROVAL_STALE';end if;
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

-- 3) front_desk_execute_manager_approval -- room_upgrade execution uses the stamped,
-- server-derived difference (client priceDifference/waived are no longer trusted) and
-- requires recorded guest acceptance for a guest-pays difference.
create or replace function public.front_desk_execute_manager_approval(p_approval_id uuid,p_room_id text,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;a manager_approval_requests%rowtype;r reservations%rowtype;oldroom rooms%rowtype;newroom rooms%rowtype;assignment reservation_room_assignments%rowtype;t room_types%rowtype;i invoices%rowtype;new_total numeric;new_paid numeric;available_same int;inventory int;reserved int;held int;begin
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
else raise exception'APPROVAL_REQUIRES_OTHER_DEPARTMENT';end if;
update manager_approval_requests set execution_status='executed',executed_by=p_staff_user_id,executed_at=now(),version=version+1,updated_at=now()where id=a.id;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'execute_manager_approval','manager_approval',a.id::text,jsonb_build_object('requestType',a.request_type,'reservationId',r.id,'roomId',p_room_id,'financials',a.requested_action->'financials'));
return jsonb_build_object('status','executed','requestType',a.request_type,'reservationId',r.id);end$$;

-- 4) front_desk_check_in -- the exception branch derives the outcome from the stamped
-- responsibility instead of always repricing to the live target rate:
--   hotel   -> total stays r.total, folio untouched, absorbed amount audited;
--   guest   -> acceptance must be recorded (the difference was posted to the folio at
--              acceptance and settled through the balance gate above); total becomes the
--              stamped targetTotal;
--   downgrade (difference<=0) -> original total stands, difference audited, no refund.
-- The unconditional invoice rewrite is gone: the folio already reflects any posted
-- difference, and overwriting invoices.amount would also drop unrelated charges
-- (e.g. transportation fares) that the old rewrite silently discarded.
create or replace function public.front_desk_check_in(p_reservation_id text,p_room_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;room rooms%rowtype;i invoices%rowtype;policy jsonb;tz text;local_now timestamp;assignment reservation_room_assignments%rowtype;early_approved boolean;type_mismatch boolean;appr manager_approval_requests%rowtype;t room_types%rowtype;new_total numeric;diff numeric;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','front_desk')then raise exception'CHECKIN_FORBIDDEN';end if;perform expire_booking_holds();
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'confirmed'then raise exception'RESERVATION_NOT_CHECKIN_READY';end if;if r.guest_id is null or nullif(trim(r.guest_name),'')is null then raise exception'GUEST_DETAILS_REQUIRED';end if;
if lower(coalesce(r.source,''))='website'and coalesce(r.deposit_required,0)>0 and(coalesce(r.deposit,0)<r.deposit_required or r.payment_status not in('partial','paid','credit'))then raise exception'RESERVATION_DEPOSIT_REQUIRED';end if;
policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());tz:=coalesce(policy->>'hotelTimezone','Asia/Manila');local_now:=now()at time zone tz;early_approved:=coalesce(r.early_check_in_approved_until>now(),false);
if local_now::date<r.check_in or local_now::date>=r.check_out then raise exception'OUTSIDE_CHECKIN_WINDOW';end if;if local_now<(r.check_in+coalesce((policy->>'checkInTime')::time,'15:00'::time))and not coalesce((policy->>'earlyCheckInAllowed')::boolean,false)and not early_approved then raise exception'EARLY_CHECKIN_NOT_ALLOWED';end if;
if coalesce((policy->>'validIdRequired')::boolean,true)and r.identity_status<>'verified'then raise exception'IDENTITY_VERIFICATION_REQUIRED';end if;select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;if coalesce(i.balance,0)>0 then raise exception'REMAINING_BALANCE_REQUIRED';end if;
select * into room from rooms where id=p_room_id or number=p_room_id limit 1 for update;if not found then raise exception'ROOM_TYPE_MISMATCH';end if;type_mismatch:=(room.type<>r.room_type);if room.status<>'available'or room.housekeeping<>'clean'then raise exception'ROOM_NOT_READY';end if;if exists(select 1 from maintenance_orders where room_id=room.id and status in('open','in_progress'))then raise exception'ROOM_UNDER_MAINTENANCE';end if;
if exists(select 1 from reservation_room_assignments where room_id=room.id and reservation_id<>r.id and status='active'and check_in<r.check_out and check_out>r.check_in)then raise exception'ROOM_ALREADY_ASSIGNED';end if;
if type_mismatch then
 select * into appr from manager_approval_requests where reservation_id=r.id and request_type='room_type_exception' and status='approved' and execution_status='awaiting_execution' and requested_action->>'roomType'=room.type order by requested_at desc limit 1;
 if appr.id is null then raise exception'ROOM_TYPE_MISMATCH';end if;
 if appr.requested_action->'financials'is null then raise exception'APPROVAL_STALE';end if;
 select * into t from room_types where name=room.type and active;if not found then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
 -- The request-time snapshot governs (historically reproducible even if base rates later
 -- change); only the night count is re-derived so a date change cannot silently
 -- invalidate the approved numbers.
 if coalesce((appr.requested_action->'financials'->>'nights')::int,0)<>(r.check_out-r.check_in)then raise exception'APPROVAL_STALE';end if;
 diff:=round(coalesce((appr.requested_action->'financials'->>'difference')::numeric,0),2);
 if coalesce(appr.requested_action->'financials'->>'responsibility','')='guest'and diff>0 then
  if appr.guest_accepted_at is null then raise exception'ROOM_TYPE_EXCEPTION_ACCEPTANCE_REQUIRED';end if;
  new_total:=round(coalesce((appr.requested_action->'financials'->>'targetTotal')::numeric,0),2);
 else
  new_total:=r.total;
 end if;
end if;
select * into assignment from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found and assignment.room_id<>room.id then update reservation_room_assignments set status='reassigned',released_at=now(),reason='Changed during check-in'where id=assignment.id;assignment.id:=null;end if;
if assignment.id is null then insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason)values(r.id,room.id,r.check_in,r.check_out,p_staff_user_id,'Check-in assignment');end if;
update reservations set room_id=room.id,room_number=room.number,room_type=room.type,status='checked_in',checked_in_at=coalesce(checked_in_at,now()),total=case when appr.id is null then r.total else new_total end where id=r.id;update rooms set status='occupied'where id=room.id;
if appr.id is not null then
 update manager_approval_requests set execution_status='executed',executed_by=p_staff_user_id,executed_at=now(),version=version+1,updated_at=now()where id=appr.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'execute_room_type_exception','manager_approval',appr.id::text,jsonb_build_object('reservationId',r.id,'previousRoomType',r.room_type,'roomType',room.type,'room',room.number,'newTotal',new_total,'reasonCode',appr.requested_action->'financials'->>'reasonCode','responsibility',appr.requested_action->'financials'->>'responsibility','hotelAbsorbedAmount',case when coalesce(appr.requested_action->'financials'->>'responsibility','')='hotel'then round(coalesce((appr.requested_action->'financials'->>'targetTotal')::numeric,0)-coalesce((appr.requested_action->'financials'->>'originalTotal')::numeric,0),2)else 0 end,'guestPaidDifference',case when coalesce(appr.requested_action->'financials'->>'responsibility','')='guest'then diff else 0 end));
end if;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reservation_check_in','reservation',r.id,jsonb_build_object('status',r.status,'roomId',r.room_id),jsonb_build_object('status','checked_in','roomId',room.id,'room',room.number,'managerEarlyApproval',early_approved));end$$;

-- 5) record_room_type_change_acceptance -- Front Desk records that the guest accepted the
-- guest-pays difference. For arrival-time room_type_exceptions the difference is posted to
-- the folio NOW so the balance is collectible before check-in; mid-stay room_upgrades post
-- it at execution instead. Assigns no room, checks nobody in. Idempotent: a replay is a
-- no-op once acceptance is stamped (and the folio insert is keyed on the approval id).
create or replace function public.record_room_type_change_acceptance(p_approval_id uuid,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;a manager_approval_requests%rowtype;r reservations%rowtype;i invoices%rowtype;diff numeric;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('owner','admin','front_desk')then raise exception'ACCEPTANCE_FORBIDDEN';end if;
select * into a from manager_approval_requests where id=p_approval_id for update;if not found or a.request_type not in('room_type_exception','room_upgrade')or a.status<>'approved'or a.execution_status<>'awaiting_execution'then raise exception'ACCEPTANCE_NOT_AVAILABLE';end if;
if a.requested_action->'financials'is null then raise exception'APPROVAL_STALE';end if;
if coalesce(a.requested_action->'financials'->>'responsibility','')<>'guest'then raise exception'ACCEPTANCE_NOT_REQUIRED';end if;
diff:=round(coalesce((a.requested_action->'financials'->>'difference')::numeric,0),2);if diff<=0 then raise exception'ACCEPTANCE_NOT_REQUIRED';end if;
if a.guest_accepted_at is not null then return;end if;
select * into r from reservations where id=a.reservation_id for update;if not found then raise exception'APPROVAL_STALE';end if;
if a.request_type='room_type_exception'then
 select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,source_record_id)values(i.id,r.id,'Room upgrade to '||(a.requested_action->>'roomType'),'upgrade',diff,p_staff_user_id,a.id,'manager_approval',a.id::text);
 update invoices set amount=round(amount+diff,2)where id=i.id;perform sync_invoice_financials(i.id);
end if;
update manager_approval_requests set guest_accepted_at=now(),guest_accepted_by=p_staff_user_id,updated_at=now()where id=a.id;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'record_room_type_change_acceptance','manager_approval',a.id::text,jsonb_build_object('reservationId',r.id,'reasonCode',a.requested_action->'financials'->>'reasonCode','difference',diff,'chargePosted',a.request_type='room_type_exception'));
end$$;
revoke all on function public.record_room_type_change_acceptance(uuid,uuid) from public,anon,authenticated;

-- 6) Exception trigger gates -- reason-code validation on insert; the approval gate's
-- "same-type room eligible => not needed" check now applies to hotel-caused changes only
-- (a guest-requested voluntary upgrade is legitimate while same-type rooms remain).
create or replace function public.validate_room_type_exception_request()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  r reservations%rowtype;
  t room_types%rowtype;
  requested_room rooms%rowtype;
  target_id uuid;
begin
  if new.request_type<>'room_type_exception' then return new;end if;
  select * into r from reservations where id=new.reservation_id;
  if not found then raise exception'APPROVAL_STALE';end if;
  if coalesce(new.requested_action->>'requestedRoomTypeId','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
  target_id:=(new.requested_action->>'requestedRoomTypeId')::uuid;
  select * into t from room_types where id=target_id and active;
  if not found or t.name=r.room_type then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
  if nullif(new.requested_action->>'roomType','') is distinct from t.name then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
  if public.room_type_change_responsibility(new.requested_action->>'reasonCode') is null then raise exception'ROOM_TYPE_EXCEPTION_REASON_INVALID';end if;
  select * into requested_room from rooms where id=new.requested_action->>'requestedRoomId';
  if not found then raise exception'ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE';end if;
  if requested_room.type<>t.name then raise exception'ROOM_TYPE_EXCEPTION_ROOM_TYPE_MISMATCH';end if;
  if not public.front_desk_room_is_eligible(requested_room.id,r.id) then raise exception'ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE';end if;
  return new;
end$$;

create or replace function public.validate_room_type_exception_approval()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  r reservations%rowtype;
  t room_types%rowtype;
  requested_room rooms%rowtype;
  target_id uuid;
begin
  if new.request_type<>'room_type_exception' or old.status<>'pending' or new.status<>'approved' then return new;end if;
  select * into r from reservations where id=new.reservation_id for update;
  if not found or r.status<>'confirmed' then raise exception'APPROVAL_STALE';end if;
  if coalesce(new.requested_action->>'requestedRoomTypeId','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
  target_id:=(new.requested_action->>'requestedRoomTypeId')::uuid;
  select * into t from room_types where id=target_id and active;
  if not found or t.name=r.room_type then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
  select * into requested_room from rooms where id=new.requested_action->>'requestedRoomId' for update;
  if not found then raise exception'ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE';end if;
  if requested_room.type<>t.name then raise exception'ROOM_TYPE_EXCEPTION_ROOM_TYPE_MISMATCH';end if;
  -- Hotel-caused only: a guest-requested voluntary upgrade does not need the reserved
  -- type to be exhausted.
  if coalesce(new.requested_action->'financials'->>'responsibility','')='hotel'
     and exists(select 1 from rooms x where x.type=r.room_type and public.front_desk_room_is_eligible(x.id,r.id)) then raise exception'ROOM_TYPE_EXCEPTION_NOT_NEEDED';end if;
  if not public.front_desk_room_is_eligible(requested_room.id,r.id) then raise exception'ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE';end if;
  return new;
end$$;
