-- Three correctness fixes flagged by the 2026-09-23 standards audit. Both functions are
-- recreated from the LIVE pg_get_functiondef bodies (which include the 20260923
-- stay_extension branch and the drifted null-safe actor guards); every pre-existing line
-- is preserved except the fixes. Signatures unchanged, so the service_role EXECUTE
-- grants survive.
--
-- 1) reservation_modification execution REWROTE invoices.amount to a bare room reprice
--    (target rate x new nights), silently discarding every other folio component:
--    transportation fares (folded into the booking total and itemized as folio_charges
--    at deposit verification) and posted upgrade differences. The reprice now changes
--    the room component only -- new amount = target rate x new nights + all posted
--    folio charges -- and balances recompute through sync_invoice_financials (the same
--    never-rewrite-the-folio rule D-008 applied to check-in). Pre-stay folio charges can
--    only be transport itemization and upgrade differences (post_folio_charge and
--    extensions require checked_in), so the sum over folio_charges is exactly the
--    non-room component.
-- 2) early_check_in execution stamped a blanket now()+8h approval window and ignored
--    the requested arrival time entirely. The window now runs through the REQUESTED
--    time on the check-in date, in the reservation's policy-snapshot timezone. Legacy
--    rows without a parseable requestedTime keep the old 8h window -- and so does any
--    request whose requested time already passed at execution (an approval must never
--    be stillborn).
-- 3) front_desk_assign_room never checked rooms.administratively_active, so a retired
--    room could be assigned at the desk even though every availability count and
--    front_desk_room_is_eligible exclude it. Now raises ROOM_INACTIVE.

create or replace function public.front_desk_execute_manager_approval(p_approval_id uuid,p_room_id text,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;a manager_approval_requests%rowtype;r reservations%rowtype;oldroom rooms%rowtype;newroom rooms%rowtype;assignment reservation_room_assignments%rowtype;t room_types%rowtype;i invoices%rowtype;new_total numeric;available_same int;inventory int;reserved int;held int;v_new_out date;begin
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
 if r.room_id is not null then select * into oldroom from rooms where id=r.room_id for update;end if;
 -- Reprice the ROOM component only: target rate x new nights plus every posted folio
 -- charge (transport itemization, upgrade differences). The old code replaced
 -- invoices.amount with the bare reprice and silently dropped those charges.
 select round(t.base_rate*((a.requested_action->>'checkOut')::date-(a.requested_action->>'checkIn')::date),2)+coalesce((select sum(amount)from folio_charges where reservation_id=r.id),0)into new_total;
 select * into i from invoices where reservation_id=r.id for update;
 update reservations set check_in=(a.requested_action->>'checkIn')::date,check_out=(a.requested_action->>'checkOut')::date,room_type=t.name,total=new_total,room_id=null,room_number=null where id=r.id;
 update invoices set amount=new_total where id=i.id;perform sync_invoice_financials(i.id);
 update reservation_room_assignments set status='cancelled',released_at=now(),reason='Reservation modification requires reassignment'where reservation_id=r.id and status='active';if oldroom.id is not null then update rooms set status=case when housekeeping='clean'then'available'else'dirty'end where id=oldroom.id and status='reserved';end if;
elsif a.request_type='early_check_in'then
 -- Approve through the REQUESTED arrival time on the check-in date (policy-snapshot
 -- timezone), not a blanket 8h from execution. Legacy/unparseable requests, and
 -- requests whose time already passed at execution, keep the old window.
 if coalesce(a.requested_action->>'requestedTime','')~'^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$' and ((r.check_in::text||' '||(a.requested_action->>'requestedTime'))::timestamp at time zone coalesce((coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot())->>'hotelTimezone'),'Asia/Manila'))>now() then
  update reservations set early_check_in_approved_until=((r.check_in::text||' '||(a.requested_action->>'requestedTime'))::timestamp at time zone coalesce((coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot())->>'hotelTimezone'),'Asia/Manila'))where id=r.id;
 else
  update reservations set early_check_in_approved_until=now()+interval'8 hours'where id=r.id;
 end if;
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

create or replace function public.front_desk_assign_room(p_reservation_id text,p_room_id text,p_reason text,p_staff_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;room rooms%rowtype;old reservation_room_assignments%rowtype;aid uuid;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'ROOM_ASSIGNMENT_FORBIDDEN';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'confirmed'then raise exception'RESERVATION_NOT_ASSIGNABLE';end if;select * into room from rooms where id=p_room_id or number=p_room_id limit 1 for update;
if not found or room.type<>r.room_type then raise exception'ROOM_TYPE_MISMATCH';end if;if room.status<>'available'or room.housekeeping<>'clean'then raise exception'ROOM_NOT_READY';end if;
-- A retired room is never assignable, no matter how clean it looks (matches
-- front_desk_room_is_eligible and every availability count).
if not coalesce(room.administratively_active,true)then raise exception'ROOM_INACTIVE';end if;
if exists(select 1 from maintenance_orders where room_id=room.id and status in('open','in_progress'))then raise exception'ROOM_UNDER_MAINTENANCE';end if;
if exists(select 1 from reservation_room_assignments where room_id=room.id and reservation_id<>r.id and status='active'and check_in<r.check_out and check_out>r.check_in)then raise exception'ROOM_ALREADY_ASSIGNED';end if;
select * into old from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found and old.room_id=room.id then return old.id;elsif found then update reservation_room_assignments set status='reassigned',released_at=now(),reason=coalesce(nullif(trim(p_reason),''),'Pre-arrival reassignment')where id=old.id;end if;
insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason)values(r.id,room.id,r.check_in,r.check_out,p_staff_user_id,nullif(trim(p_reason),''))returning id into aid;update reservations set room_id=room.id,room_number=room.number where id=r.id;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'assign_room','reservation',r.id,jsonb_build_object('roomId',old.room_id),jsonb_build_object('roomId',room.id,'roomNumber',room.number,'reason',p_reason));return aid;end$$;

revoke all on function public.front_desk_execute_manager_approval(uuid,text,uuid),public.front_desk_assign_room(text,text,text,uuid)from public,anon,authenticated;
grant execute on function public.front_desk_execute_manager_approval(uuid,text,uuid),public.front_desk_assign_room(text,text,text,uuid)to service_role;
