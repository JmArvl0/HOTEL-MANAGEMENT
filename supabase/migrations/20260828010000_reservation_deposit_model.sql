-- Mandatory reservation deposit model for new website bookings. Historical reservations remain unchanged.
create table if not exists public.reservation_deposit_policies(
 key text primary key,enabled boolean not null default true,
 calculation_type text not null check(calculation_type in('percentage','fixed')),
 percentage_basis_points integer not null default 3000 check(percentage_basis_points between 0 and 10000),
 fixed_amount numeric(12,2) not null default 0 check(fixed_amount>=0),
 hold_minutes integer not null default 15 check(hold_minutes between 1 and 1440),
 remaining_balance_due text not null default 'At hotel / check-in according to hotel policy',
 active_from timestamptz not null default now(),updated_at timestamptz not null default now());
insert into public.reservation_deposit_policies values('online_reservation',true,'percentage',3000,0,15,'At hotel / check-in according to hotel policy',now(),now()) on conflict(key) do nothing;
alter table public.reservation_deposit_policies enable row level security;
alter table public.booking_holds add column if not exists deposit_required numeric(12,2) not null default 0;
alter table public.booking_holds add column if not exists deposit_policy_snapshot jsonb;
alter table public.booking_holds add column if not exists reservation_id text references public.reservations(id) on delete set null;
alter table public.booking_holds add column if not exists submitted_at timestamptz;
alter table public.booking_holds drop constraint if exists booking_holds_status_check;
alter table public.booking_holds add constraint booking_holds_status_check check(status in('active','payment_submitted','completed','expired'));
drop index if exists public.booking_holds_inventory_idx;
create index booking_holds_inventory_idx on public.booking_holds(room_type,check_in,check_out,expires_at) where status in('active','payment_submitted');
alter table public.reservations add column if not exists deposit_required numeric(12,2) not null default 0;
alter table public.reservations add column if not exists deposit_policy_snapshot jsonb;
alter table public.reservations add column if not exists payment_due_at timestamptz;
alter table public.payments add column if not exists reservation_id text references public.reservations(id) on delete set null;
alter table public.payments add column if not exists purpose text not null default 'stay_payment';
alter table public.payments add column if not exists status text not null default 'paid';
alter table public.payments add column if not exists idempotency_key uuid;
alter table public.payments add column if not exists submitted_at timestamptz not null default now();
alter table public.payments add column if not exists verified_at timestamptz;
alter table public.payments add column if not exists notes text;
create unique index if not exists payments_idempotency_unique on public.payments(idempotency_key) where idempotency_key is not null;
do $$begin alter table public.payments add constraint payments_purpose_check check(purpose in('reservation_deposit','stay_payment','refund'));exception when duplicate_object then null;end$$;
do $$begin alter table public.payments add constraint payments_status_check check(status in('pending_verification','paid','failed','expired','refunded'));exception when duplicate_object then null;end$$;

create or replace function public.expire_booking_holds() returns integer language plpgsql security definer set search_path=public as $$
declare n integer;begin
 update booking_holds set status='expired' where status in('active','payment_submitted') and expires_at<=now();get diagnostics n=row_count;
 update reservations r set status='cancelled',payment_status='failed',cancellation_reason=coalesce(cancellation_reason,'Reservation hold expired before deposit verification')
 where lower(coalesce(source,''))='website' and status='pending' and payment_due_at<=now() and exists(select 1 from booking_holds h where h.reservation_id=r.id and h.status='expired');
 update payments p set status='expired',notes=coalesce(notes,'Reservation hold expired before payment verification') where status='pending_verification' and exists(select 1 from reservations r where r.id=p.reservation_id and r.status='cancelled' and r.cancellation_reason='Reservation hold expired before deposit verification');
 return n;end$$;

create or replace function public.create_booking_hold(p_user_id uuid,p_room_type text,p_check_in date,p_check_out date,p_guest_count integer,p_first_name text,p_last_name text,p_email text,p_mobile text,p_address text default null,p_nationality text default null,p_expected_arrival text default null,p_special_requests text default null)returns uuid language plpgsql security definer set search_path=public as $$
declare t room_types%rowtype;p reservation_deposit_policies%rowtype;inventory int;reserved int;held int;nights int;total numeric(12,2);required numeric(12,2);result uuid;
begin
 perform expire_booking_holds();
 if p_check_in<current_date or p_check_out<=p_check_in then raise exception 'INVALID_DATES';end if;
 if p_guest_count<1 then raise exception 'INVALID_GUEST_COUNT';end if;
 if nullif(trim(p_first_name),'')is null or nullif(trim(p_last_name),'')is null or nullif(trim(p_email),'')is null or nullif(trim(p_mobile),'')is null then raise exception 'INVALID_GUEST_DETAILS';end if;
 select * into p from reservation_deposit_policies where key='online_reservation' and active_from<=now();if not found or not p.enabled then raise exception 'DEPOSIT_POLICY_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(p_room_type),0));
 select * into t from room_types where name=p_room_type and active;if not found or p_guest_count>t.max_guests then raise exception 'ROOM_TYPE_UNAVAILABLE';end if;
 select count(*)into inventory from rooms r where r.type=p_room_type and r.status<>'maintenance' and(p_check_in>current_date or r.housekeeping='clean');
 select count(*)into reserved from reservations r where r.room_type=p_room_type and(r.status in('confirmed','checked_in')or(r.status='pending'and(lower(coalesce(r.source,''))<>'website'or r.payment_due_at is null or r.payment_due_at>now())))and r.check_in<p_check_out and r.check_out>p_check_in;
 select count(*)into held from booking_holds h where h.room_type=p_room_type and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<p_check_out and h.check_out>p_check_in;
 if inventory-reserved-held<=0 then raise exception 'ROOM_TYPE_UNAVAILABLE';end if;
 nights:=p_check_out-p_check_in;total:=round(t.base_rate*nights,2);required:=case p.calculation_type when'percentage'then round(total*p.percentage_basis_points/10000.0,2)else least(total,round(p.fixed_amount,2))end;
 insert into booking_holds(user_id,room_type,check_in,check_out,guest_count,nightly_rate,subtotal,total,deposit_required,deposit_policy_snapshot,first_name,last_name,email,mobile,address,nationality,expected_arrival,special_requests,expires_at)
 values(p_user_id,p_room_type,p_check_in,p_check_out,p_guest_count,t.base_rate,total,total,required,jsonb_build_object('key',p.key,'calculationType',p.calculation_type,'percentageBasisPoints',p.percentage_basis_points,'fixedAmount',p.fixed_amount,'remainingBalanceDue',p.remaining_balance_due),trim(p_first_name),trim(p_last_name),lower(trim(p_email)),trim(p_mobile),nullif(trim(p_address),''),nullif(trim(p_nationality),''),nullif(trim(p_expected_arrival),''),nullif(trim(p_special_requests),''),now()+make_interval(mins=>p.hold_minutes))returning token into result;return result;
end$$;

drop function if exists public.confirm_booking_hold(uuid,uuid,text);
create or replace function public.submit_reservation_deposit(p_token uuid,p_user_id uuid,p_payment_method text,p_payment_reference text)
returns table(reservation_id text,confirmation_number text,reservation_status text,payment_status text,deposit_required numeric,remaining_balance numeric)
language plpgsql security definer set search_path=public as $$
declare h booking_holds%rowtype;t room_types%rowtype;inventory int;reserved int;guest text;rid text;iid text;confirmation text;
begin
 perform expire_booking_holds();select * into h from booking_holds where token=p_token and user_id=p_user_id for update;if not found then raise exception'HOLD_NOT_FOUND';end if;
 if h.reservation_id is not null then return query select r.id,r.confirmation_number,r.status,r.payment_status,r.deposit_required,greatest(r.total-coalesce(i.paid,0),0)from reservations r left join invoices i on i.reservation_id=r.id where r.id=h.reservation_id;return;end if;
 if h.status<>'active'or h.expires_at<=now()then raise exception'HOLD_EXPIRED';end if;
 if p_payment_method not in('manual_bank_transfer','manual_gcash')then raise exception'UNSUPPORTED_PAYMENT_METHOD';end if;
 if nullif(trim(p_payment_reference),'')is null or length(trim(p_payment_reference))>120 then raise exception'INVALID_PAYMENT_REFERENCE';end if;
 if h.deposit_required<=0 then raise exception'INVALID_DEPOSIT_AMOUNT';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(h.room_type),0));select * into t from room_types where name=h.room_type and active;
 if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;if round(t.base_rate,2)<>round(h.nightly_rate,2)then raise exception'RATE_CHANGED';end if;
 select count(*)into inventory from rooms r where r.type=h.room_type and r.status<>'maintenance'and(h.check_in>current_date or r.housekeeping='clean');
 select count(*)into reserved from reservations r where r.room_type=h.room_type and(r.status in('confirmed','checked_in')or(r.status='pending'and(lower(coalesce(r.source,''))<>'website'or r.payment_due_at is null or r.payment_due_at>now())))and r.check_in<h.check_out and r.check_out>h.check_in;
 if inventory-reserved<=0 then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 select g.id into guest from guests g where g.user_account_id=p_user_id or lower(g.email)=lower(h.email)order by(g.user_account_id=p_user_id)desc limit 1 for update;
 if guest is null then insert into guests(name,first_name,last_name,email,phone,user_account_id,address,nationality,special_requests)values(trim(h.first_name||' '||h.last_name),h.first_name,h.last_name,h.email,h.mobile,p_user_id,h.address,h.nationality,h.special_requests)returning id into guest;
 else update guests set user_account_id=coalesce(user_account_id,p_user_id),name=trim(h.first_name||' '||h.last_name),first_name=h.first_name,last_name=h.last_name,phone=h.mobile,address=coalesce(h.address,address),nationality=coalesce(h.nationality,nationality),special_requests=coalesce(h.special_requests,special_requests)where id=guest;end if;
 confirmation:='HVN-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 insert into reservations(guest_id,user_id,guest_name,guest_email,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,deposit_policy_snapshot,special_requests,expected_arrival,payment_status,payment_method,payment_due_at,confirmation_number,idempotency_key)
 values(guest,p_user_id,trim(h.first_name||' '||h.last_name),h.email,h.room_type,h.check_in,h.check_out,h.guest_count,'pending','Website',h.total,0,h.deposit_required,h.deposit_policy_snapshot,h.special_requests,h.expected_arrival,'unpaid',p_payment_method,h.expires_at,confirmation,p_token)returning id into rid;
 insert into invoices(reservation_id,guest_name,amount,paid,balance,status,method,due_date)values(rid,trim(h.first_name||' '||h.last_name),h.total,0,h.total,'unpaid',p_payment_method,h.check_in)returning id into iid;
 insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key)values(iid,rid,h.deposit_required,'PHP',p_payment_method,trim(p_payment_reference),'reservation_deposit','pending_verification',p_token);
 update booking_holds set status='payment_submitted',reservation_id=rid,guarantee_method=null,submitted_at=now()where token=p_token;
 return query select rid,confirmation,'pending'::text,'unpaid'::text,h.deposit_required,h.total-h.deposit_required;
end$$;

create or replace function public.verify_reservation_deposit(p_payment_id uuid,p_staff_user_id uuid)
returns table(reservation_id text,reservation_status text,payment_status text,deposit_paid numeric,remaining_balance numeric)
language plpgsql security definer set search_path=public as $$
declare p payments%rowtype;r reservations%rowtype;i invoices%rowtype;h booking_holds%rowtype;actor text;inventory int;reserved int;paid_total numeric(12,2);
begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk','accounting')then raise exception'PAYMENT_VERIFICATION_FORBIDDEN';end if;
 perform expire_booking_holds();select * into p from payments where id=p_payment_id for update;if not found or p.purpose<>'reservation_deposit'then raise exception'PAYMENT_NOT_FOUND';end if;
 select * into r from reservations where id=p.reservation_id for update;select * into i from invoices where id=p.invoice_id for update;select * into h from booking_holds where reservation_id=r.id for update;
 if p.status='paid'then return query select r.id,r.status,r.payment_status,coalesce(r.deposit,0),greatest(i.balance,0);return;end if;
 if p.status<>'pending_verification'then raise exception'PAYMENT_NOT_PENDING';end if;
 if h.status<>'payment_submitted'or h.expires_at<=now()or r.status<>'pending'then raise exception'HOLD_EXPIRED';end if;
 if round(p.amount,2)<>round(r.deposit_required,2)or round(i.amount,2)<>round(r.total,2)then raise exception'PAYMENT_AMOUNT_MISMATCH';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(r.room_type),0));
 select count(*)into inventory from rooms x where x.type=r.room_type and x.status<>'maintenance'and(r.check_in>current_date or x.housekeeping='clean');
 select count(*)into reserved from reservations x where x.id<>r.id and x.room_type=r.room_type and(x.status in('confirmed','checked_in')or(x.status='pending'and(lower(coalesce(x.source,''))<>'website'or x.payment_due_at is null or x.payment_due_at>now())))and x.check_in<r.check_out and x.check_out>r.check_in;
 if inventory-reserved<=0 then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 update payments set status='paid',verified_at=now(),received_by=p_staff_user_id where id=p.id;
 select coalesce(sum(amount),0)into paid_total from payments where invoice_id=i.id and status='paid'and purpose<>'refund';
 update invoices set paid=least(paid_total,amount),balance=greatest(amount-paid_total,0),status=case when paid_total>=amount then'paid'else'partial'end where id=i.id;
 update reservations set status='confirmed',deposit=p.amount,payment_status=case when paid_total>=total then'paid'else'partial'end where id=r.id;
 update booking_holds set status='completed'where token=h.token;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'verify_reservation_deposit','payment',p.id::text,jsonb_build_object('reservationId',r.id,'amount',p.amount,'reference',p.reference));
 return query select r.id,'confirmed'::text,case when paid_total>=r.total then'paid'::text else'partial'::text end,p.amount,greatest(i.amount-paid_total,0);
end$$;

create or replace function public.front_desk_check_in(p_reservation_id text,p_room_id text)returns void language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;room rooms%rowtype;begin perform expire_booking_holds();select * into r from reservations where id=p_reservation_id for update;if not found then raise exception'RESERVATION_NOT_CHECKIN_READY';end if;
 if lower(coalesce(r.source,''))='website'then if r.status<>'confirmed'or coalesce(r.deposit,0)<coalesce(r.deposit_required,0)or r.payment_status not in('partial','paid')then raise exception'RESERVATION_DEPOSIT_REQUIRED';end if;
 elsif r.status not in('pending','confirmed')then raise exception'RESERVATION_NOT_CHECKIN_READY';end if;
 if current_date<r.check_in or current_date>=r.check_out then raise exception'OUTSIDE_CHECKIN_WINDOW';end if;
 select * into room from rooms where id=p_room_id or number=p_room_id limit 1 for update;if not found or room.type<>r.room_type then raise exception'ROOM_TYPE_MISMATCH';end if;
 if room.status<>'available'or room.housekeeping<>'clean'then raise exception'ROOM_NOT_READY';end if;
 if exists(select 1 from maintenance_orders m where m.room_id=room.id and m.status in('open','in_progress'))then raise exception'ROOM_UNDER_MAINTENANCE';end if;
 if exists(select 1 from reservations x where x.id<>r.id and x.room_id=room.id and x.status in('confirmed','checked_in')and x.check_in<r.check_out and x.check_out>r.check_in)then raise exception'ROOM_ALREADY_ASSIGNED';end if;
 update reservations set room_id=room.id,room_number=room.number,status='checked_in'where id=r.id;update rooms set status='occupied'where id=room.id;end$$;
revoke all on table public.reservation_deposit_policies from anon,authenticated;
revoke all on function public.expire_booking_holds()from public;
revoke all on function public.create_booking_hold(uuid,text,date,date,integer,text,text,text,text,text,text,text,text)from public;
revoke all on function public.submit_reservation_deposit(uuid,uuid,text,text)from public;
revoke all on function public.verify_reservation_deposit(uuid,uuid)from public;
revoke all on function public.front_desk_check_in(text,text)from public;
grant execute on function public.expire_booking_holds()to service_role;
grant execute on function public.create_booking_hold(uuid,text,date,date,integer,text,text,text,text,text,text,text,text)to service_role;
grant execute on function public.submit_reservation_deposit(uuid,uuid,text,text)to service_role;
grant execute on function public.verify_reservation_deposit(uuid,uuid)to service_role;
grant execute on function public.front_desk_check_in(text,text)to service_role;
