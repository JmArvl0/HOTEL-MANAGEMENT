-- Front Desk arrival: Manager-authorized room-type exception for check-in.
--
-- When no eligible (clean, serviceable, conflict-free) room of the reserved type is
-- available at arrival, Front Desk may request a Manager exception to place the guest
-- into a different active room type. Manager approves only when no same-type room is
-- eligible and at least one target-type room is eligible. Execution is NOT a separate
-- room-change step: it is consumed by front_desk_check_in itself, which re-runs every
-- existing gate (identity, deposit, folio balance, window, availability, maintenance,
-- assignment conflicts) atomically, then updates the reservation's room_type/total and
-- reprices the folio to the target type's base rate x nights (deposit untouched, any
-- added balance must be collected before check-in -- the transaction rolls back if not).
--
-- Recreates three existing SECURITY DEFINER RPCs. Bodies are the current authoritative
-- definitions (20260829030000 / 20260829031000 as patched NULL-safe by
-- 20260830040000_null_safe_actor_role_guards.sql) with the room_type_exception branches
-- spliced in; every pre-existing line is preserved. No data rewrites.

-- Widen the request_type allowlist CHECK constraint (created at 20260829030000 line 6)
-- so room_type_exception rows can be inserted. Purely widening, additive only.
alter table public.manager_approval_requests drop constraint if exists manager_approval_requests_request_type_check;
alter table public.manager_approval_requests add constraint manager_approval_requests_request_type_check check(request_type in('room_upgrade','room_type_exception','reservation_modification','early_check_in','late_checkout','guest_compensation','refund_exception','checkout_exception','guest_escalation'));

-- 1) request_manager_approval -- allow the new type and validate its target.
create or replace function public.request_manager_approval(p_request_type text,p_related_entity_type text,p_related_entity_id text,p_reservation_id text,p_guest_request_id uuid,p_department text,p_severity text,p_reason text,p_requested_action jsonb,p_staff_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;g guest_requests%rowtype;aid uuid;normal_result jsonb:='{}'::jsonb;policy jsonb;deposit_paid numeric;normal_refund numeric;begin
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
insert into manager_approval_requests(request_type,related_entity_type,related_entity_id,reservation_id,guest_request_id,department,severity,reason,requested_action,normal_policy_result,requested_by)
values(p_request_type,p_related_entity_type,p_related_entity_id,p_reservation_id,p_guest_request_id,lower(trim(p_department)),p_severity,trim(p_reason),coalesce(p_requested_action,'{}'),normal_result,p_staff_user_id)returning id into aid;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'request_manager_approval','manager_approval',aid::text,jsonb_build_object('type',p_request_type,'reason',trim(p_reason),'relatedEntityId',p_related_entity_id));
return aid;exception when unique_violation then raise exception'APPROVAL_ALREADY_PENDING';end$$;

-- 2) review_manager_approval -- approve a room-type exception only when the reserved
-- type has no eligible room and the target type still has one.
create or replace function public.review_manager_approval(p_approval_id uuid,p_decision text,p_reason text,p_expected_version integer,p_manager_user_id uuid)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;a manager_approval_requests%rowtype;r reservations%rowtype;available_same int;available_target int;inventory int;reserved int;held int;target_type text;requested_amount numeric;deposit_paid numeric;already_refunded numeric;i invoices%rowtype;rid uuid;begin
select role into actor from user_accounts where id=p_manager_user_id and active;if actor is null or actor not in('owner','admin','manager')then raise exception'MANAGER_REVIEW_FORBIDDEN';end if;
if p_decision not in('approve','reject')or nullif(trim(p_reason),'')is null then raise exception'INVALID_MANAGER_DECISION';end if;
select * into a from manager_approval_requests where id=p_approval_id for update;if not found then raise exception'APPROVAL_NOT_FOUND';end if;
if a.status<>'pending'or a.version<>p_expected_version then raise exception'APPROVAL_ALREADY_REVIEWED';end if;if a.requested_by=p_manager_user_id then raise exception'SELF_APPROVAL_FORBIDDEN';end if;
if a.reservation_id is not null then select * into r from reservations where id=a.reservation_id for update;if not found then raise exception'APPROVAL_STALE';end if;end if;
if a.request_type in('room_upgrade','room_type_exception','reservation_modification','early_check_in','late_checkout','checkout_exception')and r.status in('cancelled','no_show','checked_out')then raise exception'APPROVAL_STALE';end if;
if p_decision='approve'and a.request_type='room_upgrade'then
 target_type:=nullif(a.requested_action->>'requestedRoomType','');if target_type is null or target_type=r.room_type then raise exception'INVALID_UPGRADE_REQUEST';end if;
 select count(*)into available_same from rooms x where x.type=r.room_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
 if available_same>0 then raise exception'SAME_TYPE_ROOM_AVAILABLE';end if;
 select count(*)into available_target from rooms x where x.type=target_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
 if available_target=0 then raise exception'UPGRADE_ROOM_UNAVAILABLE';end if;
end if;
if p_decision='approve'and a.request_type='room_type_exception'then
 target_type:=nullif(a.requested_action->>'roomType','');if target_type is null or target_type=r.room_type then raise exception'ROOM_TYPE_EXCEPTION_SAME_TYPE';end if;
 if not exists(select 1 from room_types where name=target_type and active)then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
 select count(*)into available_same from rooms x where x.type=r.room_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
 if available_same>0 then raise exception'ROOM_TYPE_EXCEPTION_NOT_NEEDED';end if;
 select count(*)into available_target from rooms x where x.type=target_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
 if available_target=0 then raise exception'ROOM_TYPE_EXCEPTION_UNAVAILABLE';end if;
end if;
if p_decision='approve'and a.request_type='reservation_modification'then
 if nullif(a.requested_action->>'checkIn','')is null or nullif(a.requested_action->>'checkOut','')is null or(a.requested_action->>'checkOut')::date<=(a.requested_action->>'checkIn')::date then raise exception'INVALID_MODIFICATION_REQUEST';end if;
 target_type:=coalesce(nullif(a.requested_action->>'roomType',''),r.room_type);
 if r.status not in('pending','confirmed')then raise exception'APPROVAL_STALE';end if;perform pg_advisory_xact_lock(hashtextextended(target_type,0));perform expire_booking_holds();
 select count(*)into inventory from rooms x where x.type=target_type and x.status<>'maintenance'and((a.requested_action->>'checkIn')::date>current_date or x.housekeeping='clean');
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

-- 3) front_desk_check_in -- consume an approved room_type_exception on type mismatch.
-- Every pre-existing gate and the tail (assignment reuse, checked_in/occupied, audit)
-- are unchanged; only the room-type step and the tail update are extended.
create or replace function public.front_desk_check_in(p_reservation_id text,p_room_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;room rooms%rowtype;i invoices%rowtype;policy jsonb;tz text;local_now timestamp;assignment reservation_room_assignments%rowtype;early_approved boolean;type_mismatch boolean;appr manager_approval_requests%rowtype;t room_types%rowtype;new_total numeric;new_paid numeric;begin
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
 select * into t from room_types where name=room.type and active;if not found then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
 new_total:=round(t.base_rate*(r.check_out-r.check_in),2);new_paid:=i.paid;
 if new_total>new_paid then raise exception'ROOM_TYPE_EXCEPTION_BALANCE_DUE';end if;
end if;
select * into assignment from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found and assignment.room_id<>room.id then update reservation_room_assignments set status='reassigned',released_at=now(),reason='Changed during check-in'where id=assignment.id;assignment.id:=null;end if;
if assignment.id is null then insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason)values(r.id,room.id,r.check_in,r.check_out,p_staff_user_id,'Check-in assignment');end if;
update reservations set room_id=room.id,room_number=room.number,room_type=room.type,status='checked_in',checked_in_at=coalesce(checked_in_at,now()),total=case when appr.id is null then r.total else new_total end where id=r.id;update rooms set status='occupied'where id=room.id;
if appr.id is not null then
 update invoices set amount=new_total,balance=round(greatest(new_total-new_paid,0),2),credit_balance=round(greatest(new_paid-new_total,0),2),status=case when new_paid>new_total then'credit'when new_paid=new_total then'paid'when new_paid>0 then'partial'else'unpaid'end where id=i.id;
 update manager_approval_requests set execution_status='executed',executed_by=p_staff_user_id,executed_at=now(),version=version+1,updated_at=now()where id=appr.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'execute_room_type_exception','manager_approval',appr.id::text,jsonb_build_object('reservationId',r.id,'previousRoomType',r.room_type,'roomType',room.type,'room',room.number,'newTotal',new_total));
end if;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reservation_check_in','reservation',r.id,jsonb_build_object('status',r.status,'roomId',r.room_id),jsonb_build_object('status','checked_in','roomId',room.id,'room',room.number,'managerEarlyApproval',early_approved));end$$;
