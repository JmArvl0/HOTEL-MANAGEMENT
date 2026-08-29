-- Connected hotel operations. All values are provisional policies and configurable.
create table if not exists public.hotel_operational_policies(
 key text primary key,hotel_timezone text not null default 'Asia/Manila',check_in_time time not null default '15:00',check_out_time time not null default '12:00',no_show_cutoff_time time not null default '23:59',
 valid_id_required boolean not null default true,minimum_booking_age integer not null default 18 check(minimum_booking_age between 1 and 120),
 cancellation_full_refund_days integer not null default 14 check(cancellation_full_refund_days>=0),cancellation_partial_refund_days integer not null default 7 check(cancellation_partial_refund_days>=0),
 cancellation_partial_refund_basis_points integer not null default 5000 check(cancellation_partial_refund_basis_points between 0 and 10000),
 self_service_modification_days integer not null default 3 check(self_service_modification_days>=0),incidentals_due text not null default 'At checkout',
 pets_allowed boolean not null default false,smoking_allowed boolean not null default false,special_requests_guaranteed boolean not null default false,email_verification_required boolean not null default false,
 updated_at timestamptz not null default now(),check(cancellation_full_refund_days>=cancellation_partial_refund_days));
insert into public.hotel_operational_policies(key)values('default')on conflict(key)do nothing;
alter table public.hotel_operational_policies enable row level security;revoke all on table public.hotel_operational_policies from anon,authenticated;
alter table public.booking_holds add column if not exists operational_policy_snapshot jsonb;
alter table public.reservations add column if not exists operational_policy_snapshot jsonb;
alter table public.reservations add column if not exists identity_status text not null default 'unverified';
alter table public.reservations add column if not exists identity_verified_by uuid references public.user_accounts(id)on delete set null;
alter table public.reservations add column if not exists identity_verified_at timestamptz;
alter table public.reservations drop constraint if exists reservations_identity_status_check;
alter table public.reservations add constraint reservations_identity_status_check check(identity_status in('unverified','verified'));
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check check(status in('unpaid','deposit','partial','paid','refund_pending','partial_refund','refunded','cancelled'));
alter table public.reservations drop constraint if exists reservations_payment_status_check;
alter table public.reservations add constraint reservations_payment_status_check check(payment_status in('unpaid','deposit','partial','paid','failed','partial_refund','refunded'));
create table if not exists public.folio_charges(id uuid primary key default gen_random_uuid(),invoice_id text not null references public.invoices(id)on delete restrict,reservation_id text not null references public.reservations(id)on delete restrict,description text not null,category text not null default 'incidental',amount numeric(12,2)not null check(amount>0),posted_by uuid references public.user_accounts(id)on delete set null,idempotency_key uuid,created_at timestamptz not null default now());
create unique index if not exists folio_charges_idempotency_unique on public.folio_charges(idempotency_key)where idempotency_key is not null;alter table public.folio_charges enable row level security;
create table if not exists public.refund_requests(id uuid primary key default gen_random_uuid(),reservation_id text not null references public.reservations(id)on delete restrict,invoice_id text not null references public.invoices(id)on delete restrict,requested_by uuid references public.user_accounts(id)on delete set null,reason text not null,paid_deposit numeric(12,2)not null default 0 check(paid_deposit>=0),refund_basis_points integer not null default 0 check(refund_basis_points between 0 and 10000),eligible_amount numeric(12,2)not null default 0 check(eligible_amount>=0),status text not null default 'pending'check(status in('pending','processed','failed','cancelled')),processed_by uuid references public.user_accounts(id)on delete set null,processed_at timestamptz,reference text,created_at timestamptz not null default now());
create unique index if not exists refund_requests_open_unique on public.refund_requests(reservation_id)where status='pending';alter table public.refund_requests enable row level security;
create table if not exists public.reservation_change_requests(id uuid primary key default gen_random_uuid(),reservation_id text not null references public.reservations(id)on delete restrict,requested_by uuid references public.user_accounts(id)on delete set null,requested_check_in date,requested_check_out date,requested_room_type text,reason text not null,status text not null default 'pending'check(status in('pending','approved','rejected','cancelled')),reviewed_by uuid references public.user_accounts(id)on delete set null,reviewed_at timestamptz,created_at timestamptz not null default now());
create unique index if not exists reservation_change_open_unique on public.reservation_change_requests(reservation_id)where status='pending';alter table public.reservation_change_requests enable row level security;
create or replace function public.current_operational_policy_snapshot()returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_build_object('hotelTimezone',hotel_timezone,'checkInTime',check_in_time::text,'checkOutTime',check_out_time::text,'noShowCutoffTime',no_show_cutoff_time::text,'validIdRequired',valid_id_required,'minimumBookingAge',minimum_booking_age,'cancellationFullRefundDays',cancellation_full_refund_days,'cancellationPartialRefundDays',cancellation_partial_refund_days,'cancellationPartialRefundBasisPoints',cancellation_partial_refund_basis_points,'selfServiceModificationDays',self_service_modification_days,'incidentalsDue',incidentals_due,'petsAllowed',pets_allowed,'smokingAllowed',smoking_allowed,'specialRequestsGuaranteed',special_requests_guaranteed,'emailVerificationRequired',email_verification_required)from hotel_operational_policies where key='default'$$;
create or replace function public.apply_operational_policy_snapshot()returns trigger language plpgsql security definer set search_path=public as $$begin if new.operational_policy_snapshot is null then new.operational_policy_snapshot:=current_operational_policy_snapshot();end if;return new;end$$;
drop trigger if exists booking_holds_policy_snapshot on public.booking_holds;create trigger booking_holds_policy_snapshot before insert on public.booking_holds for each row execute function public.apply_operational_policy_snapshot();
drop trigger if exists reservations_policy_snapshot on public.reservations;create trigger reservations_policy_snapshot before insert on public.reservations for each row execute function public.apply_operational_policy_snapshot();
update public.booking_holds set operational_policy_snapshot=public.current_operational_policy_snapshot()where operational_policy_snapshot is null;
update public.reservations set operational_policy_snapshot=public.current_operational_policy_snapshot()where operational_policy_snapshot is null;

create or replace function public.verify_guest_identity(p_reservation_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk')then raise exception'IDENTITY_VERIFICATION_FORBIDDEN';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_IDENTITY_READY';end if;
update reservations set identity_status='verified',identity_verified_by=p_staff_user_id,identity_verified_at=now()where id=r.id;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'verify_guest_identity','reservation',r.id,jsonb_build_object('identityStatus',r.identity_status),jsonb_build_object('identityStatus','verified'));end$$;
create or replace function public.record_staff_payment(p_reservation_id text,p_amount numeric,p_method text,p_reference text,p_idempotency_key uuid,p_staff_user_id uuid)
returns table(payment_id uuid,paid numeric,balance numeric,payment_status text)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;i invoices%rowtype;existing payments%rowtype;pid uuid;gross numeric;refunded numeric;net numeric;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk','accounting')then raise exception'PAYMENT_COLLECTION_FORBIDDEN';end if;
if p_amount<=0 then raise exception'INVALID_PAYMENT_AMOUNT';end if;if nullif(trim(p_method),'')is null or nullif(trim(p_reference),'')is null then raise exception'INVALID_PAYMENT_DETAILS';end if;
select * into existing from payments where idempotency_key=p_idempotency_key;if found then select * into i from invoices where id=existing.invoice_id;return query select existing.id,i.paid,i.balance,i.status;return;end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_PAYMENT_READY';end if;
select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;if round(p_amount,2)>round(i.balance,2)then raise exception'PAYMENT_EXCEEDS_BALANCE';end if;
insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,received_by,verified_at)values(i.id,r.id,round(p_amount,2),'PHP',trim(p_method),trim(p_reference),'stay_payment','paid',p_idempotency_key,p_staff_user_id,now())returning id into pid;
select coalesce(sum(amount),0)into gross from payments where invoice_id=i.id and status='paid'and purpose<>'refund';select coalesce(sum(amount),0)into refunded from payments where invoice_id=i.id and status='paid'and purpose='refund';net:=greatest(gross-refunded,0);
update invoices set paid=net,balance=greatest(amount-net,0),status=case when net>=amount then'paid'else'partial'end where id=i.id returning * into i;
update reservations set payment_status=case when i.balance=0 then'paid'else'partial'end where id=r.id;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'collect_payment','payment',pid::text,jsonb_build_object('reservationId',r.id,'amount',p_amount,'method',p_method,'reference',p_reference));return query select pid,i.paid,i.balance,i.status;end$$;
create or replace function public.post_folio_charge(p_reservation_id text,p_description text,p_category text,p_amount numeric,p_idempotency_key uuid,p_staff_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;i invoices%rowtype;cid uuid;existing uuid;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk','accounting')then raise exception'CHARGE_POSTING_FORBIDDEN';end if;
if p_amount<=0 or nullif(trim(p_description),'')is null then raise exception'INVALID_CHARGE';end if;select id into existing from folio_charges where idempotency_key=p_idempotency_key;if found then return existing;end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'checked_in'then raise exception'RESERVATION_NOT_IN_HOUSE';end if;select * into i from invoices where reservation_id=r.id for update;
insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key)values(i.id,r.id,trim(p_description),coalesce(nullif(trim(p_category),''),'incidental'),round(p_amount,2),p_staff_user_id,p_idempotency_key)returning id into cid;
update invoices set amount=amount+round(p_amount,2),balance=balance+round(p_amount,2),status=case when paid>0 then'partial'else'unpaid'end where id=i.id;
update reservations set payment_status=case when deposit>0 then'partial'else'unpaid'end where id=r.id;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'post_folio_charge','folio_charge',cid::text,jsonb_build_object('reservationId',r.id,'amount',p_amount,'description',p_description));return cid;end$$;

create or replace function public.cancel_reservation(p_reservation_id text,p_actor_user_id uuid,p_reason text)
returns table(reservation_status text,refund_request_id uuid,eligible_refund numeric,refund_basis_points integer)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;i invoices%rowtype;policy jsonb;tz text;today date;days_before int;full_days int;partial_days int;partial_bp int;deposit_paid numeric;basis int;eligible numeric;refund_id uuid;existing refund_requests%rowtype;begin
select role into actor from user_accounts where id=p_actor_user_id and active;select * into r from reservations where id=p_reservation_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;
if actor='guest'and r.user_id<>p_actor_user_id then raise exception'RESERVATION_OWNERSHIP_REQUIRED';end if;if actor not in('guest','owner','admin','manager','front_desk')then raise exception'CANCELLATION_FORBIDDEN';end if;
select * into existing from refund_requests where reservation_id=r.id and status in('pending','processed')order by created_at desc limit 1;
if r.status='cancelled'then return query select r.status,existing.id,coalesce(existing.eligible_amount,0),coalesce(existing.refund_basis_points,0);return;end if;
if r.status not in('pending','confirmed')then raise exception'RESERVATION_NOT_CANCELLABLE';end if;if nullif(trim(p_reason),'')is null then raise exception'CANCELLATION_REASON_REQUIRED';end if;
policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());tz:=coalesce(policy->>'hotelTimezone','Asia/Manila');today:=(now()at time zone tz)::date;days_before:=r.check_in-today;
full_days:=coalesce((policy->>'cancellationFullRefundDays')::int,14);partial_days:=coalesce((policy->>'cancellationPartialRefundDays')::int,7);partial_bp:=coalesce((policy->>'cancellationPartialRefundBasisPoints')::int,5000);
select coalesce(sum(amount),0)into deposit_paid from payments where reservation_id=r.id and purpose='reservation_deposit'and status='paid';
basis:=case when days_before>=full_days then 10000 when days_before>=partial_days then partial_bp else 0 end;eligible:=round(deposit_paid*basis/10000.0,2);
select * into i from invoices where reservation_id=r.id for update;update reservations set status='cancelled',cancellation_reason=trim(p_reason)where id=r.id;
update invoices set balance=0,status=case when eligible>0 then'refund_pending'else'cancelled'end where id=i.id;
if eligible>0 then insert into refund_requests(reservation_id,invoice_id,requested_by,reason,paid_deposit,refund_basis_points,eligible_amount)values(r.id,i.id,p_actor_user_id,trim(p_reason),deposit_paid,basis,eligible)returning id into refund_id;end if;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'cancel_reservation','reservation',r.id,jsonb_build_object('status',r.status),jsonb_build_object('status','cancelled','reason',p_reason,'eligibleRefund',eligible,'refundBasisPoints',basis));
return query select'cancelled'::text,refund_id,eligible,basis;end$$;
create or replace function public.mark_reservation_no_show(p_reservation_id text,p_staff_user_id uuid,p_reason text)returns void language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;policy jsonb;tz text;cutoff time;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk')then raise exception'NO_SHOW_FORBIDDEN';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'confirmed'then raise exception'RESERVATION_NOT_NO_SHOW_READY';end if;
policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());tz:=coalesce(policy->>'hotelTimezone','Asia/Manila');cutoff:=coalesce((policy->>'noShowCutoffTime')::time,'23:59'::time);
if(now()at time zone tz)<(r.check_in+cutoff)then raise exception'NO_SHOW_CUTOFF_NOT_REACHED';end if;
update reservations set status='no_show',cancellation_reason=coalesce(nullif(trim(p_reason),''),'Guest did not arrive by no-show cutoff')where id=r.id;
if r.room_id is not null then update rooms set status=case when housekeeping='clean'then'available'else'dirty'end where id=r.room_id and status='reserved';end if;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reservation_no_show','reservation',r.id,jsonb_build_object('status',r.status),jsonb_build_object('status','no_show','depositRetained',r.deposit));end$$;
create or replace function public.process_refund(p_refund_id uuid,p_staff_user_id uuid,p_reference text)
returns table(refund_status text,refund_amount numeric,net_paid numeric)language plpgsql security definer set search_path=public as $$
declare actor text;rr refund_requests%rowtype;i invoices%rowtype;r reservations%rowtype;existing payments%rowtype;gross numeric;refunded numeric;net numeric;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','accounting')then raise exception'REFUND_PROCESSING_FORBIDDEN';end if;
select * into rr from refund_requests where id=p_refund_id for update;if not found then raise exception'REFUND_NOT_FOUND';end if;select * into i from invoices where id=rr.invoice_id for update;select * into r from reservations where id=rr.reservation_id for update;
if rr.status='processed'then select coalesce(sum(amount),0)into gross from payments where invoice_id=i.id and status='paid'and purpose<>'refund';select coalesce(sum(amount),0)into refunded from payments where invoice_id=i.id and status='paid'and purpose='refund';return query select rr.status,rr.eligible_amount,greatest(gross-refunded,0);return;end if;
if rr.status<>'pending'or rr.eligible_amount<=0 then raise exception'REFUND_NOT_PENDING';end if;if nullif(trim(p_reference),'')is null then raise exception'REFUND_REFERENCE_REQUIRED';end if;
select * into existing from payments where idempotency_key=rr.id;if not found then insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,received_by,verified_at)values(i.id,r.id,rr.eligible_amount,'PHP','manual_refund',trim(p_reference),'refund','paid',rr.id,p_staff_user_id,now());end if;
update refund_requests set status='processed',processed_by=p_staff_user_id,processed_at=now(),reference=trim(p_reference)where id=rr.id;
select coalesce(sum(amount),0)into gross from payments where invoice_id=i.id and status='paid'and purpose<>'refund';select coalesce(sum(amount),0)into refunded from payments where invoice_id=i.id and status='paid'and purpose='refund';net:=greatest(gross-refunded,0);
update invoices set paid=net,balance=0,status=case when net=0 then'refunded'else'partial_refund'end where id=i.id;update reservations set payment_status=case when net=0 then'refunded'else'partial_refund'end where id=r.id;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'process_refund','refund_request',rr.id::text,jsonb_build_object('reservationId',r.id,'amount',rr.eligible_amount,'reference',p_reference));
return query select'processed'::text,rr.eligible_amount,net;end$$;

create or replace function public.complete_housekeeping_task(p_task_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;t housekeeping_tasks%rowtype;blocked boolean;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','housekeeping')then raise exception'HOUSEKEEPING_COMPLETION_FORBIDDEN';end if;
select * into t from housekeeping_tasks where id=p_task_id for update;if not found then raise exception'TASK_NOT_FOUND';end if;update housekeeping_tasks set status='completed',completed_at=now()where id=t.id;
if t.room_id is not null then select exists(select 1 from maintenance_orders where room_id=t.room_id and status in('open','in_progress'))into blocked;update rooms set housekeeping='clean',status=case when blocked then'maintenance'else'available'end where id=t.room_id and status<>'occupied';end if;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'complete_housekeeping_task','housekeeping_task',t.id,jsonb_build_object('roomId',t.room_id));end$$;
create or replace function public.resolve_maintenance_order(p_order_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;m maintenance_orders%rowtype;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','maintenance')then raise exception'MAINTENANCE_RESOLUTION_FORBIDDEN';end if;
select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;update maintenance_orders set status='resolved',resolved_at=now()where id=m.id;
if m.room_id is not null then update rooms set status='dirty',housekeeping='dirty'where id=m.room_id and status<>'occupied';
if not exists(select 1 from housekeeping_tasks where room_id=m.room_id and status in('pending','in_progress'))then insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)select id,number,'Post-maintenance clean and readiness check','normal','pending','Before next arrival','Maintenance resolved; cleaning is required before return to service'from rooms where id=m.room_id;end if;end if;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'resolve_maintenance_order','maintenance_order',m.id,jsonb_build_object('roomId',m.room_id));end$$;
create or replace function public.front_desk_check_in(p_reservation_id text,p_room_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;room rooms%rowtype;i invoices%rowtype;policy jsonb;tz text;local_date date;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk')then raise exception'CHECKIN_FORBIDDEN';end if;
perform expire_booking_holds();select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'confirmed'then raise exception'RESERVATION_NOT_CHECKIN_READY';end if;
if lower(coalesce(r.source,''))='website'and coalesce(r.deposit_required,0)>0 and(coalesce(r.deposit,0)<r.deposit_required or r.payment_status not in('partial','paid'))then raise exception'RESERVATION_DEPOSIT_REQUIRED';end if;
policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());tz:=coalesce(policy->>'hotelTimezone','Asia/Manila');local_date:=(now()at time zone tz)::date;if local_date<r.check_in or local_date>=r.check_out then raise exception'OUTSIDE_CHECKIN_WINDOW';end if;
if coalesce((policy->>'validIdRequired')::boolean,true)and r.identity_status<>'verified'then raise exception'IDENTITY_VERIFICATION_REQUIRED';end if;
select * into i from invoices where reservation_id=r.id for update;if coalesce(i.balance,0)>0 then raise exception'REMAINING_BALANCE_REQUIRED';end if;
select * into room from rooms where id=p_room_id or number=p_room_id limit 1 for update;if not found or room.type<>r.room_type then raise exception'ROOM_TYPE_MISMATCH';end if;
if room.status<>'available'or room.housekeeping<>'clean'then raise exception'ROOM_NOT_READY';end if;if exists(select 1 from maintenance_orders m where m.room_id=room.id and m.status in('open','in_progress'))then raise exception'ROOM_UNDER_MAINTENANCE';end if;
if exists(select 1 from reservations x where x.id<>r.id and x.room_id=room.id and x.status in('confirmed','checked_in')and x.check_in<r.check_out and x.check_out>r.check_in)then raise exception'ROOM_ALREADY_ASSIGNED';end if;
update reservations set room_id=room.id,room_number=room.number,status='checked_in'where id=r.id;update rooms set status='occupied'where id=room.id;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reservation_check_in','reservation',r.id,jsonb_build_object('status',r.status),jsonb_build_object('status','checked_in','room',room.number));end$$;
create or replace function public.front_desk_checkout(p_reservation_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;i invoices%rowtype;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk')then raise exception'CHECKOUT_FORBIDDEN';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'checked_in'then raise exception'RESERVATION_NOT_CHECKOUT_READY';end if;select * into i from invoices where reservation_id=r.id for update;if coalesce(i.balance,0)>0 then raise exception'FOLIO_BALANCE_REQUIRED';end if;
update reservations set status='checked_out'where id=r.id;if r.room_id is not null then update rooms set status='dirty',housekeeping='dirty'where id=r.room_id;
if not exists(select 1 from housekeeping_tasks where room_id=r.room_id and status in('pending','in_progress'))then insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)values(r.room_id,r.room_number,'Post-checkout room turnover','high','pending','Before next arrival','Automatically created at checkout');end if;end if;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reservation_checkout','reservation',r.id,jsonb_build_object('status',r.status,'room',r.room_number),jsonb_build_object('status','checked_out','roomStatus','dirty'));end$$;

drop function if exists public.front_desk_check_in(text,text);
revoke all on function public.current_operational_policy_snapshot()from public;revoke all on function public.verify_guest_identity(text,uuid)from public;
revoke all on function public.record_staff_payment(text,numeric,text,text,uuid,uuid)from public;revoke all on function public.post_folio_charge(text,text,text,numeric,uuid,uuid)from public;
revoke all on function public.cancel_reservation(text,uuid,text)from public;revoke all on function public.mark_reservation_no_show(text,uuid,text)from public;
revoke all on function public.process_refund(uuid,uuid,text)from public;revoke all on function public.complete_housekeeping_task(text,uuid)from public;
revoke all on function public.resolve_maintenance_order(text,uuid)from public;revoke all on function public.front_desk_check_in(text,text,uuid)from public;revoke all on function public.front_desk_checkout(text,uuid)from public;
grant execute on function public.current_operational_policy_snapshot()to service_role;grant execute on function public.verify_guest_identity(text,uuid)to service_role;
grant execute on function public.record_staff_payment(text,numeric,text,text,uuid,uuid)to service_role;grant execute on function public.post_folio_charge(text,text,text,numeric,uuid,uuid)to service_role;
grant execute on function public.cancel_reservation(text,uuid,text)to service_role;grant execute on function public.mark_reservation_no_show(text,uuid,text)to service_role;
grant execute on function public.process_refund(uuid,uuid,text)to service_role;grant execute on function public.complete_housekeeping_task(text,uuid)to service_role;
grant execute on function public.resolve_maintenance_order(text,uuid)to service_role;grant execute on function public.front_desk_check_in(text,text,uuid)to service_role;grant execute on function public.front_desk_checkout(text,uuid)to service_role;
