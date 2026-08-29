-- Haven Hotel Management System — Supabase/PostgreSQL schema
-- Paste this entire file into Supabase > SQL Editor and select Run.
create extension if not exists pgcrypto;

create table if not exists user_accounts (
  id uuid primary key default gen_random_uuid(), email text unique not null, name text not null,
  role text not null check (role in ('owner','admin','manager','front_desk','housekeeping','maintenance','accounting','guest')),
  password_hash text not null, active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists guests (
  id text primary key default ('GST-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  name text not null, email text unique, phone text, loyalty_tier text default 'Member', loyalty_points integer default 0,
  stays integer default 0, preferences text, special_requests text, created_at timestamptz not null default now()
);
create table if not exists rooms (
  id text primary key default ('RM-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  number text unique not null, floor integer not null, type text not null, rate numeric(12,2) not null,
  status text not null default 'available' check (status in ('available','reserved','occupied','dirty','maintenance')),
  housekeeping text not null default 'clean', qr_code text unique, amenities jsonb default '[]', created_at timestamptz not null default now()
);
create table if not exists reservations (
  id text primary key default ('RSV-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  guest_id text references guests(id) on delete set null, guest_name text not null, room_id text references rooms(id) on delete set null,
  room_number text, room_type text not null, check_in date not null, check_out date not null, guests integer not null default 1,
  status text not null default 'pending' check (status in ('pending','confirmed','checked_in','checked_out','cancelled')),
  source text default 'Direct', total numeric(12,2) default 0, deposit numeric(12,2) default 0,
  group_code text, cancellation_reason text, created_at timestamptz not null default now(), check (check_out > check_in)
);
create table if not exists housekeeping_tasks (
  id text primary key default ('HKT-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  room_id text references rooms(id) on delete set null, room_number text not null, task text not null, assignee text,
  priority text default 'normal', status text default 'pending' check (status in ('pending','in_progress','completed')),
  due text, notes text, created_at timestamptz not null default now(), completed_at timestamptz
);
create table if not exists maintenance_orders (
  id text primary key default ('MWO-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  room_id text references rooms(id) on delete set null, room_number text not null, issue text not null, category text,
  assignee text, priority text default 'normal', status text default 'open' check (status in ('open','in_progress','resolved')),
  cost numeric(12,2) default 0, notes text, created_at timestamptz not null default now(), resolved_at timestamptz
);
create table if not exists invoices (
  id text primary key default ('INV-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  reservation_id text references reservations(id) on delete set null, guest_name text not null,
  currency char(3) not null default 'PHP', amount numeric(12,2) not null default 0, paid numeric(12,2) not null default 0,
  balance numeric(12,2) not null default 0, status text default 'unpaid' check (status in ('unpaid','deposit','partial','paid')),
  method text, corporate_account text, due_date date, created_at timestamptz not null default now()
);
create table if not exists payments (
  id uuid primary key default gen_random_uuid(), invoice_id text references invoices(id) on delete cascade,
  amount numeric(12,2) not null, currency char(3) not null default 'PHP', method text not null,
  reference text, received_by uuid references user_accounts(id), created_at timestamptz not null default now()
);
create table if not exists inventory (
  id text primary key default ('ITM-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  name text not null, category text not null, quantity numeric(12,2) not null default 0, reorder_point numeric(12,2) not null default 0,
  unit text not null, status text default 'healthy' check (status in ('healthy','low','out')), unit_cost numeric(12,2) default 0,
  vendor_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists staff (
  id text primary key default ('STF-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  user_id uuid references user_accounts(id) on delete set null, name text not null, role text not null, department text,
  shift text, attendance text default 'Scheduled', status text default 'off_duty' check (status in ('off_duty','on_duty','on_leave')),
  created_at timestamptz not null default now()
);
create table if not exists guest_requests (
  id uuid primary key default gen_random_uuid(), reservation_id text references reservations(id) on delete cascade,
  guest_id text references guests(id) on delete set null, request text not null, department text not null,
  priority text default 'normal', status text default 'open', assigned_to uuid references user_accounts(id), created_at timestamptz default now()
);
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(), guest_id text references guests(id) on delete set null,
  reservation_id text references reservations(id) on delete set null, rating integer check (rating between 1 and 5),
  comment text, response text, created_at timestamptz default now()
);
create table if not exists vendors (
  id uuid primary key default gen_random_uuid(), name text not null, contact_name text, email text, phone text,
  category text, status text default 'active', created_at timestamptz default now()
);
alter table inventory drop constraint if exists inventory_vendor_id_fkey;
alter table inventory add constraint inventory_vendor_id_fkey foreign key (vendor_id) references vendors(id) on delete set null;
create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(), vendor_id uuid references vendors(id), status text default 'draft',
  total numeric(12,2) default 0, items jsonb not null default '[]', ordered_by uuid references user_accounts(id), created_at timestamptz default now()
);
create table if not exists audit_logs (
  id bigint generated always as identity primary key, user_id uuid references user_accounts(id) on delete set null,
  action text not null, entity_type text not null, entity_id text, before_data jsonb, after_data jsonb,
  ip_address inet, created_at timestamptz not null default now()
);

create index if not exists reservations_dates_idx on reservations(check_in, check_out);
create index if not exists reservations_status_idx on reservations(status);
create index if not exists rooms_status_idx on rooms(status);
create index if not exists housekeeping_status_idx on housekeeping_tasks(status);
create index if not exists maintenance_status_idx on maintenance_orders(status);
create index if not exists invoice_status_idx on invoices(status);

-- The app talks to these tables only from its server using the service-role key.
alter table user_accounts enable row level security;
alter table guests enable row level security;
alter table rooms enable row level security;
alter table reservations enable row level security;
alter table housekeeping_tasks enable row level security;
alter table maintenance_orders enable row level security;
alter table invoices enable row level security;
alter table payments enable row level security;
alter table inventory enable row level security;
alter table staff enable row level security;
alter table guest_requests enable row level security;
alter table reviews enable row level security;
alter table vendors enable row level security;
alter table purchase_orders enable row level security;
alter table audit_logs enable row level security;

-- Seed accounts. Created INACTIVE with no usable password: this file is public,
-- so any hash committed here is a public credential. `lib/auth.ts` evaluates
-- `active` before bcrypt, so these rows cannot authenticate in any form.
--
-- Activate them and set real passwords with:
--   node scripts/set-passwords.mjs owner@haven.test
--
-- which prompts for the password with echo off and stores only the bcrypt hash.
-- Nothing is generated, displayed or written to disk.
insert into user_accounts (email, name, role, password_hash, active) values
  ('owner@haven.test', 'Amelia Hart', 'owner', 'locked-run-set-passwords', false),
  ('admin@haven.test', 'Noah Santos', 'admin', 'locked-run-set-passwords', false),
  ('manager@haven.test', 'Maya Reyes', 'manager', 'locked-run-set-passwords', false),
  ('frontdesk@haven.test', 'Liam Cruz', 'front_desk', 'locked-run-set-passwords', false),
  ('housekeeping@haven.test', 'Sofia Lim', 'housekeeping', 'locked-run-set-passwords', false),
  ('maintenance@haven.test', 'Ethan Tan', 'maintenance', 'locked-run-set-passwords', false),
  ('accounting@haven.test', 'Chloe Garcia', 'accounting', 'locked-run-set-passwords', false),
  ('guest@haven.test', 'Jamie Lee', 'guest', 'locked-run-set-passwords', false)
on conflict (email) do nothing;



-- Guest booking flow, room-type inventory, ownership, holds, and protected check-in.
create table if not exists public.room_types (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  description text not null,
  max_guests integer not null check (max_guests > 0),
  beds text not null,
  size_sqm integer check (size_sqm is null or size_sqm > 0),
  amenities jsonb not null default '[]'::jsonb,
  base_rate numeric(12,2) not null check (base_rate >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.room_types (name, description, max_guests, beds, size_sqm, amenities, base_rate) values
  ('Garden Twin', 'A serene garden-facing room designed for restful shared stays.', 2, '2 twin beds', 32, '["Wi-Fi","Air conditioning","Rain shower","Garden view"]', 5800),
  ('Deluxe King', 'A spacious retreat with a king bed and calm contemporary finishes.', 2, '1 king bed', 36, '["Wi-Fi","Air conditioning","King bed","Work desk"]', 6400),
  ('Ocean Suite', 'An elevated suite with a separate lounge and expansive ocean outlook.', 3, '1 king bed and lounge', 52, '["Wi-Fi","Ocean view","Separate lounge","Premium minibar"]', 8900),
  ('Executive Suite', 'A generous suite for longer stays with dedicated living space.', 4, '1 king bed and sofa bed', 60, '["Wi-Fi","Living area","Premium minibar","Bathtub"]', 11600)
on conflict (name) do update set
  description = excluded.description,
  max_guests = excluded.max_guests,
  beds = excluded.beds,
  size_sqm = excluded.size_sqm,
  amenities = excluded.amenities,
  base_rate = excluded.base_rate,
  active = true;

alter table public.guests add column if not exists user_account_id uuid references public.user_accounts(id) on delete set null;
alter table public.guests add column if not exists first_name text;
alter table public.guests add column if not exists last_name text;
alter table public.guests add column if not exists address text;
alter table public.guests add column if not exists nationality text;
create unique index if not exists guests_user_account_unique on public.guests(user_account_id) where user_account_id is not null;

alter table public.reservations add column if not exists user_id uuid references public.user_accounts(id) on delete set null;
alter table public.reservations add column if not exists confirmation_number text;
alter table public.reservations add column if not exists guest_email text;
alter table public.reservations add column if not exists special_requests text;
alter table public.reservations add column if not exists expected_arrival text;
alter table public.reservations add column if not exists payment_status text not null default 'unpaid';
alter table public.reservations add column if not exists payment_method text;
alter table public.reservations add column if not exists idempotency_key uuid;
create unique index if not exists reservations_confirmation_unique on public.reservations(confirmation_number) where confirmation_number is not null;
create unique index if not exists reservations_idempotency_unique on public.reservations(idempotency_key) where idempotency_key is not null;
create index if not exists reservations_user_dates_idx on public.reservations(user_id, check_in desc);
create index if not exists reservations_availability_idx on public.reservations(room_type, check_in, check_out) where status in ('pending','confirmed','checked_in');

do $$ begin
  alter table public.reservations add constraint reservations_payment_status_check check (payment_status in ('unpaid','deposit','partial','paid','failed','refunded'));
exception when duplicate_object then null; end $$;

create table if not exists public.booking_holds (
  token uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  room_type text not null references public.room_types(name),
  check_in date not null,
  check_out date not null,
  guest_count integer not null check (guest_count > 0),
  nightly_rate numeric(12,2) not null check (nightly_rate >= 0),
  subtotal numeric(12,2) not null check (subtotal >= 0),
  taxes numeric(12,2) not null default 0,
  service_charge numeric(12,2) not null default 0,
  total numeric(12,2) not null check (total >= 0),
  first_name text not null,
  last_name text not null,
  email text not null,
  mobile text not null,
  address text,
  nationality text,
  expected_arrival text,
  special_requests text,
  guarantee_method text,
  status text not null default 'active' check (status in ('active','completed','expired')),
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  created_at timestamptz not null default now(),
  check (check_out > check_in)
);
create index if not exists booking_holds_inventory_idx on public.booking_holds(room_type, check_in, check_out, expires_at) where status = 'active';
create index if not exists booking_holds_user_idx on public.booking_holds(user_id, created_at desc);

alter table public.room_types enable row level security;
alter table public.booking_holds enable row level security;

create or replace function public.create_booking_hold(
  p_user_id uuid,
  p_room_type text,
  p_check_in date,
  p_check_out date,
  p_guest_count integer,
  p_first_name text,
  p_last_name text,
  p_email text,
  p_mobile text,
  p_address text default null,
  p_nationality text default null,
  p_expected_arrival text default null,
  p_special_requests text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type room_types%rowtype;
  v_inventory integer;
  v_reserved integer;
  v_held integer;
  v_nights integer;
  v_token uuid;
begin
  if p_check_in < current_date or p_check_out <= p_check_in then raise exception 'INVALID_DATES'; end if;
  if p_guest_count < 1 then raise exception 'INVALID_GUEST_COUNT'; end if;
  if nullif(trim(p_first_name),'') is null or nullif(trim(p_last_name),'') is null or nullif(trim(p_email),'') is null or nullif(trim(p_mobile),'') is null then raise exception 'INVALID_GUEST_DETAILS'; end if;

  perform pg_advisory_xact_lock(hashtextextended(lower(p_room_type), 0));
  select * into v_type from room_types where name = p_room_type and active;
  if not found or p_guest_count > v_type.max_guests then raise exception 'ROOM_TYPE_UNAVAILABLE'; end if;

  update booking_holds set status = 'expired' where status = 'active' and expires_at <= now();
  select count(*) into v_inventory from rooms r where r.type = p_room_type and r.status <> 'maintenance' and (p_check_in > current_date or r.housekeeping = 'clean');
  select count(*) into v_reserved from reservations r where r.room_type = p_room_type and r.status in ('pending','confirmed','checked_in') and r.check_in < p_check_out and r.check_out > p_check_in;
  select count(*) into v_held from booking_holds h where h.room_type = p_room_type and h.status = 'active' and h.expires_at > now() and h.check_in < p_check_out and h.check_out > p_check_in;
  if v_inventory - v_reserved - v_held <= 0 then raise exception 'ROOM_TYPE_UNAVAILABLE'; end if;

  v_nights := p_check_out - p_check_in;
  insert into booking_holds (user_id, room_type, check_in, check_out, guest_count, nightly_rate, subtotal, total, first_name, last_name, email, mobile, address, nationality, expected_arrival, special_requests)
  values (p_user_id, p_room_type, p_check_in, p_check_out, p_guest_count, v_type.base_rate, v_type.base_rate * v_nights, v_type.base_rate * v_nights, trim(p_first_name), trim(p_last_name), lower(trim(p_email)), trim(p_mobile), nullif(trim(p_address),''), nullif(trim(p_nationality),''), nullif(trim(p_expected_arrival),''), nullif(trim(p_special_requests),''))
  returning token into v_token;
  return v_token;
end
$$;

create or replace function public.confirm_booking_hold(p_token uuid, p_user_id uuid, p_guarantee_method text)
returns table (reservation_id text, confirmation_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hold booking_holds%rowtype;
  v_inventory integer;
  v_reserved integer;
  v_guest_id text;
  v_reservation_id text;
  v_confirmation text;
begin
  select * into v_hold from booking_holds where token = p_token and user_id = p_user_id for update;
  if not found then raise exception 'HOLD_NOT_FOUND'; end if;
  if v_hold.status = 'completed' then
    return query select r.id, r.confirmation_number from reservations r where r.idempotency_key = p_token;
    return;
  end if;
  if v_hold.status <> 'active' or v_hold.expires_at <= now() then raise exception 'HOLD_EXPIRED'; end if;
  if p_guarantee_method not in ('pay_at_hotel','cash_guarantee') then raise exception 'UNSUPPORTED_GUARANTEE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(lower(v_hold.room_type), 0));
  select count(*) into v_inventory from rooms r where r.type = v_hold.room_type and r.status <> 'maintenance' and (v_hold.check_in > current_date or r.housekeeping = 'clean');
  select count(*) into v_reserved from reservations r where r.room_type = v_hold.room_type and r.status in ('pending','confirmed','checked_in') and r.check_in < v_hold.check_out and r.check_out > v_hold.check_in;
  if v_inventory - v_reserved <= 0 then raise exception 'ROOM_TYPE_UNAVAILABLE'; end if;

  select g.id into v_guest_id from guests g where g.user_account_id = p_user_id or lower(g.email) = lower(v_hold.email) order by (g.user_account_id = p_user_id) desc limit 1 for update;
  if v_guest_id is null then
    insert into guests (name, first_name, last_name, email, phone, user_account_id, address, nationality, special_requests)
    values (trim(v_hold.first_name || ' ' || v_hold.last_name), v_hold.first_name, v_hold.last_name, v_hold.email, v_hold.mobile, p_user_id, v_hold.address, v_hold.nationality, v_hold.special_requests)
    returning id into v_guest_id;
  else
    update guests set user_account_id = coalesce(user_account_id, p_user_id), name = trim(v_hold.first_name || ' ' || v_hold.last_name), first_name = v_hold.first_name, last_name = v_hold.last_name, phone = v_hold.mobile, address = coalesce(v_hold.address,address), nationality = coalesce(v_hold.nationality,nationality), special_requests = coalesce(v_hold.special_requests,special_requests) where id = v_guest_id;
  end if;

  v_confirmation := 'HVN-' || to_char(clock_timestamp(),'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into reservations (guest_id, user_id, guest_name, guest_email, room_type, check_in, check_out, guests, status, source, total, deposit, special_requests, expected_arrival, payment_status, payment_method, confirmation_number, idempotency_key)
  values (v_guest_id, p_user_id, trim(v_hold.first_name || ' ' || v_hold.last_name), v_hold.email, v_hold.room_type, v_hold.check_in, v_hold.check_out, v_hold.guest_count, 'confirmed', 'Website', v_hold.total, 0, v_hold.special_requests, v_hold.expected_arrival, 'unpaid', p_guarantee_method, v_confirmation, p_token)
  returning id into v_reservation_id;

  insert into invoices (reservation_id, guest_name, amount, paid, balance, status, method, due_date)
  values (v_reservation_id, trim(v_hold.first_name || ' ' || v_hold.last_name), v_hold.total, 0, v_hold.total, 'unpaid', p_guarantee_method, v_hold.check_in);
  update booking_holds set status = 'completed', guarantee_method = p_guarantee_method where token = p_token;
  return query select v_reservation_id, v_confirmation;
end
$$;

revoke all on function public.create_booking_hold(uuid,text,date,date,integer,text,text,text,text,text,text,text,text) from public;
revoke all on function public.confirm_booking_hold(uuid,uuid,text) from public;
grant execute on function public.create_booking_hold(uuid,text,date,date,integer,text,text,text,text,text,text,text,text) to service_role;
grant execute on function public.confirm_booking_hold(uuid,uuid,text) to service_role;
create or replace function public.front_desk_check_in(p_reservation_id text, p_room_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations%rowtype;
  v_room rooms%rowtype;
begin
  select * into v_reservation from reservations where id = p_reservation_id for update;
  if not found or v_reservation.status not in ('pending','confirmed') then raise exception 'RESERVATION_NOT_CHECKIN_READY'; end if;
  if current_date < v_reservation.check_in or current_date >= v_reservation.check_out then raise exception 'OUTSIDE_CHECKIN_WINDOW'; end if;
  select * into v_room from rooms where id = p_room_id or number = p_room_id limit 1 for update;
  if not found or v_room.type <> v_reservation.room_type then raise exception 'ROOM_TYPE_MISMATCH'; end if;
  if v_room.status <> 'available' or v_room.housekeeping <> 'clean' then raise exception 'ROOM_NOT_READY'; end if;
  if exists(select 1 from maintenance_orders m where m.room_id=v_room.id and m.status in ('open','in_progress')) then raise exception 'ROOM_UNDER_MAINTENANCE'; end if;
  if exists(select 1 from reservations r where r.id<>v_reservation.id and r.room_id=v_room.id and r.status in ('confirmed','checked_in') and r.check_in<v_reservation.check_out and r.check_out>v_reservation.check_in) then raise exception 'ROOM_ALREADY_ASSIGNED'; end if;
  update reservations set room_id=v_room.id,room_number=v_room.number,status='checked_in' where id=v_reservation.id;
  update rooms set status='occupied' where id=v_room.id;
end
$$;
revoke all on function public.front_desk_check_in(text,text) from public;
grant execute on function public.front_desk_check_in(text,text) to service_role;
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


-- Qualify booking hold ownership inside the verification RPC to avoid an output-column name collision.
create or replace function public.verify_reservation_deposit(p_payment_id uuid,p_staff_user_id uuid)
returns table(reservation_id text,reservation_status text,payment_status text,deposit_paid numeric,remaining_balance numeric)
language plpgsql security definer set search_path=public as $$
declare p payments%rowtype;r reservations%rowtype;i invoices%rowtype;h booking_holds%rowtype;actor text;inventory int;reserved int;paid_total numeric(12,2);
begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk','accounting')then raise exception'PAYMENT_VERIFICATION_FORBIDDEN';end if;
 perform expire_booking_holds();select * into p from payments where id=p_payment_id for update;if not found or p.purpose<>'reservation_deposit'then raise exception'PAYMENT_NOT_FOUND';end if;
 select * into r from reservations where id=p.reservation_id for update;select * into i from invoices where id=p.invoice_id for update;select bh.* into h from booking_holds bh where bh.reservation_id=r.id for update;
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



-- Enforce reservation deposits only for bookings carrying the new policy snapshot; preserve historical website reservations.
create or replace function public.front_desk_check_in(p_reservation_id text,p_room_id text)returns void language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;room rooms%rowtype;begin perform expire_booking_holds();select * into r from reservations where id=p_reservation_id for update;if not found then raise exception'RESERVATION_NOT_CHECKIN_READY';end if;
 if lower(coalesce(r.source,''))='website'and coalesce(r.deposit_required,0)>0 then if r.status<>'confirmed'or coalesce(r.deposit,0)<r.deposit_required or r.payment_status not in('partial','paid')then raise exception'RESERVATION_DEPOSIT_REQUIRED';end if;
 elsif r.status not in('pending','confirmed')then raise exception'RESERVATION_NOT_CHECKIN_READY';end if;
 if current_date<r.check_in or current_date>=r.check_out then raise exception'OUTSIDE_CHECKIN_WINDOW';end if;
 select * into room from rooms where id=p_room_id or number=p_room_id limit 1 for update;if not found or room.type<>r.room_type then raise exception'ROOM_TYPE_MISMATCH';end if;
 if room.status<>'available'or room.housekeeping<>'clean'then raise exception'ROOM_NOT_READY';end if;
 if exists(select 1 from maintenance_orders m where m.room_id=room.id and m.status in('open','in_progress'))then raise exception'ROOM_UNDER_MAINTENANCE';end if;
 if exists(select 1 from reservations x where x.id<>r.id and x.room_id=room.id and x.status in('confirmed','checked_in')and x.check_in<r.check_out and x.check_out>r.check_in)then raise exception'ROOM_ALREADY_ASSIGNED';end if;
 update reservations set room_id=room.id,room_number=room.number,status='checked_in'where id=r.id;update rooms set status='occupied'where id=room.id;end$$;



-- Connected operational workflow (migration 20260828050000)
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


-- Hold-time policy preservation (migration 20260828060000)
-- Preserve the operational policy accepted when the booking hold was created.
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
 insert into reservations(guest_id,user_id,guest_name,guest_email,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,deposit_policy_snapshot,operational_policy_snapshot,special_requests,expected_arrival,payment_status,payment_method,payment_due_at,confirmation_number,idempotency_key)
 values(guest,p_user_id,trim(h.first_name||' '||h.last_name),h.email,h.room_type,h.check_in,h.check_out,h.guest_count,'pending','Website',h.total,0,h.deposit_required,h.deposit_policy_snapshot,h.operational_policy_snapshot,h.special_requests,h.expected_arrival,'unpaid',p_payment_method,h.expires_at,confirmation,p_token)returning id into rid;
 insert into invoices(reservation_id,guest_name,amount,paid,balance,status,method,due_date)values(rid,trim(h.first_name||' '||h.last_name),h.total,0,h.total,'unpaid',p_payment_method,h.check_in)returning id into iid;
 insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key)values(iid,rid,h.deposit_required,'PHP',p_payment_method,trim(p_payment_reference),'reservation_deposit','pending_verification',p_token);
 update booking_holds set status='payment_submitted',reservation_id=rid,guarantee_method=null,submitted_at=now()where token=p_token;
 return query select rid,confirmation,'pending'::text,'unpaid'::text,h.deposit_required,h.total-h.deposit_required;
end$$;

revoke all on function public.submit_reservation_deposit(uuid,uuid,text,text)from public;
grant execute on function public.submit_reservation_deposit(uuid,uuid,text,text)to service_role;


-- Front Desk operations (migration 20260828070000)
-- Integrated Front Desk operations: assignment history, staff bookings, room changes, extensions, and operational timestamps.
create extension if not exists btree_gist;
alter table public.hotel_operational_policies add column if not exists early_check_in_allowed boolean not null default false;
alter table public.reservations add column if not exists checked_in_at timestamptz;
alter table public.reservations add column if not exists checked_out_at timestamptz;

create table if not exists public.reservation_room_assignments(
 id uuid primary key default gen_random_uuid(),reservation_id text not null references public.reservations(id)on delete restrict,room_id text not null references public.rooms(id)on delete restrict,
 check_in date not null,check_out date not null,assigned_by uuid references public.user_accounts(id)on delete set null,assigned_at timestamptz not null default now(),
 released_at timestamptz,status text not null default 'active'check(status in('active','reassigned','completed','cancelled','no_show')),
 reason text,is_upgrade boolean not null default false,authorized_by uuid references public.user_accounts(id)on delete set null,check(check_out>check_in));
create unique index if not exists reservation_active_room_unique on public.reservation_room_assignments(reservation_id)where status='active';
do $$begin alter table public.reservation_room_assignments add constraint room_assignment_no_overlap exclude using gist(room_id with =,daterange(check_in,check_out,'[)')with &&)where(status='active');exception when duplicate_object or duplicate_table then null;end$$;
create index if not exists room_assignment_history_idx on public.reservation_room_assignments(reservation_id,assigned_at desc);
alter table public.reservation_room_assignments enable row level security;
insert into public.reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_at,released_at,status,reason)
select r.id,r.room_id,r.check_in,r.check_out,r.created_at,case when r.status in('checked_out','cancelled','no_show')then coalesce(r.checked_out_at,now())end,
case r.status when'checked_out'then'completed'when'cancelled'then'cancelled'when'no_show'then'no_show'else'active'end,'Historical assignment backfill'
from public.reservations r where r.room_id is not null and not exists(select 1 from public.reservation_room_assignments a where a.reservation_id=r.id);

create or replace function public.current_operational_policy_snapshot()returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_build_object('hotelTimezone',hotel_timezone,'checkInTime',check_in_time::text,'checkOutTime',check_out_time::text,'noShowCutoffTime',no_show_cutoff_time::text,'validIdRequired',valid_id_required,'minimumBookingAge',minimum_booking_age,'cancellationFullRefundDays',cancellation_full_refund_days,'cancellationPartialRefundDays',cancellation_partial_refund_days,'cancellationPartialRefundBasisPoints',cancellation_partial_refund_basis_points,'selfServiceModificationDays',self_service_modification_days,'incidentalsDue',incidentals_due,'petsAllowed',pets_allowed,'smokingAllowed',smoking_allowed,'specialRequestsGuaranteed',special_requests_guaranteed,'emailVerificationRequired',email_verification_required,'earlyCheckInAllowed',early_check_in_allowed)from hotel_operational_policies where key='default'$$;

create or replace function public.front_desk_create_reservation(p_guest_name text,p_email text,p_phone text,p_room_type text,p_check_in date,p_check_out date,p_guest_count integer,p_source text,p_special_requests text,p_expected_arrival text,p_idempotency_key uuid,p_staff_user_id uuid)
returns table(reservation_id text,confirmation_number text,total numeric)language plpgsql security definer set search_path=public as $$
declare actor text;t room_types%rowtype;inventory int;reserved int;guest text;rid text;iid text;confirmation text;amount numeric;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk')then raise exception'STAFF_RESERVATION_FORBIDDEN';end if;
if p_check_in<(now()at time zone'Asia/Manila')::date or p_check_out<=p_check_in then raise exception'INVALID_DATES';end if;if p_guest_count<1 then raise exception'INVALID_GUEST_COUNT';end if;
if nullif(trim(p_guest_name),'')is null or nullif(trim(p_email),'')is null or nullif(trim(p_phone),'')is null then raise exception'INVALID_GUEST_DETAILS';end if;if p_source not in('Front Desk','Walk-In','Phone')then raise exception'INVALID_BOOKING_SOURCE';end if;
select id into rid from reservations where idempotency_key=p_idempotency_key;if found then return query select r.id,r.confirmation_number,r.total from reservations r where r.id=rid;return;end if;
perform pg_advisory_xact_lock(hashtextextended(lower(p_room_type),0));select * into t from room_types where name=p_room_type and active;if not found or p_guest_count>t.max_guests then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
select count(*)into inventory from rooms where type=p_room_type and status<>'maintenance';select count(*)into reserved from reservations where room_type=p_room_type and status in('pending','confirmed','checked_in')and check_in<p_check_out and check_out>p_check_in;
if inventory-reserved<=0 then raise exception'ROOM_TYPE_UNAVAILABLE';end if;amount:=round(t.base_rate*(p_check_out-p_check_in),2);
select id into guest from guests where lower(email)=lower(trim(p_email))limit 1 for update;if guest is null then insert into guests(name,email,phone)values(trim(p_guest_name),lower(trim(p_email)),trim(p_phone))returning id into guest;else update guests set name=trim(p_guest_name),phone=trim(p_phone)where id=guest;end if;
confirmation:='HVN-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
insert into reservations(guest_id,guest_name,guest_email,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,special_requests,expected_arrival,payment_status,confirmation_number,idempotency_key)
values(guest,trim(p_guest_name),lower(trim(p_email)),p_room_type,p_check_in,p_check_out,p_guest_count,'confirmed',p_source,amount,0,0,nullif(trim(p_special_requests),''),nullif(trim(p_expected_arrival),''),'unpaid',confirmation,p_idempotency_key)returning id into rid;
insert into invoices(reservation_id,guest_name,amount,paid,balance,status,due_date)values(rid,trim(p_guest_name),amount,0,amount,'unpaid',p_check_in)returning id into iid;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'create_staff_reservation','reservation',rid,jsonb_build_object('source',p_source,'roomType',p_room_type,'checkIn',p_check_in,'checkOut',p_check_out,'total',amount));return query select rid,confirmation,amount;end$$;

create or replace function public.front_desk_assign_room(p_reservation_id text,p_room_id text,p_reason text,p_staff_user_id uuid)returns uuid language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;room rooms%rowtype;old reservation_room_assignments%rowtype;aid uuid;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk')then raise exception'ROOM_ASSIGNMENT_FORBIDDEN';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'confirmed'then raise exception'RESERVATION_NOT_ASSIGNABLE';end if;select * into room from rooms where id=p_room_id or number=p_room_id limit 1 for update;
if not found or room.type<>r.room_type then raise exception'ROOM_TYPE_MISMATCH';end if;if room.status<>'available'or room.housekeeping<>'clean'then raise exception'ROOM_NOT_READY';end if;if exists(select 1 from maintenance_orders where room_id=room.id and status in('open','in_progress'))then raise exception'ROOM_UNDER_MAINTENANCE';end if;
if exists(select 1 from reservation_room_assignments where room_id=room.id and reservation_id<>r.id and status='active'and check_in<r.check_out and check_out>r.check_in)then raise exception'ROOM_ALREADY_ASSIGNED';end if;
select * into old from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found and old.room_id=room.id then return old.id;elsif found then update reservation_room_assignments set status='reassigned',released_at=now(),reason=coalesce(nullif(trim(p_reason),''),'Pre-arrival reassignment')where id=old.id;end if;
insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason)values(r.id,room.id,r.check_in,r.check_out,p_staff_user_id,nullif(trim(p_reason),''))returning id into aid;update reservations set room_id=room.id,room_number=room.number where id=r.id;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'assign_room','reservation',r.id,jsonb_build_object('roomId',old.room_id),jsonb_build_object('roomId',room.id,'roomNumber',room.number,'reason',p_reason));return aid;end$$;
create or replace function public.front_desk_check_in(p_reservation_id text,p_room_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;room rooms%rowtype;i invoices%rowtype;policy jsonb;tz text;local_now timestamp;assignment reservation_room_assignments%rowtype;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk')then raise exception'CHECKIN_FORBIDDEN';end if;perform expire_booking_holds();
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'confirmed'then raise exception'RESERVATION_NOT_CHECKIN_READY';end if;if r.guest_id is null or nullif(trim(r.guest_name),'')is null then raise exception'GUEST_DETAILS_REQUIRED';end if;
if lower(coalesce(r.source,''))='website'and coalesce(r.deposit_required,0)>0 and(coalesce(r.deposit,0)<r.deposit_required or r.payment_status not in('partial','paid'))then raise exception'RESERVATION_DEPOSIT_REQUIRED';end if;
policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());tz:=coalesce(policy->>'hotelTimezone','Asia/Manila');local_now:=now()at time zone tz;
if local_now::date<r.check_in or local_now::date>=r.check_out then raise exception'OUTSIDE_CHECKIN_WINDOW';end if;if local_now<(r.check_in+coalesce((policy->>'checkInTime')::time,'15:00'::time))and not coalesce((policy->>'earlyCheckInAllowed')::boolean,false)then raise exception'EARLY_CHECKIN_NOT_ALLOWED';end if;
if coalesce((policy->>'validIdRequired')::boolean,true)and r.identity_status<>'verified'then raise exception'IDENTITY_VERIFICATION_REQUIRED';end if;select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;if coalesce(i.balance,0)>0 then raise exception'REMAINING_BALANCE_REQUIRED';end if;
select * into room from rooms where id=p_room_id or number=p_room_id limit 1 for update;if not found or room.type<>r.room_type then raise exception'ROOM_TYPE_MISMATCH';end if;if room.status<>'available'or room.housekeeping<>'clean'then raise exception'ROOM_NOT_READY';end if;if exists(select 1 from maintenance_orders where room_id=room.id and status in('open','in_progress'))then raise exception'ROOM_UNDER_MAINTENANCE';end if;
if exists(select 1 from reservation_room_assignments where room_id=room.id and reservation_id<>r.id and status='active'and check_in<r.check_out and check_out>r.check_in)then raise exception'ROOM_ALREADY_ASSIGNED';end if;
select * into assignment from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found and assignment.room_id<>room.id then update reservation_room_assignments set status='reassigned',released_at=now(),reason='Changed during check-in'where id=assignment.id;assignment.id:=null;end if;
if assignment.id is null then insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason)values(r.id,room.id,r.check_in,r.check_out,p_staff_user_id,'Check-in assignment');end if;
update reservations set room_id=room.id,room_number=room.number,status='checked_in',checked_in_at=coalesce(checked_in_at,now())where id=r.id;update rooms set status='occupied'where id=room.id;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reservation_check_in','reservation',r.id,jsonb_build_object('status',r.status,'roomId',r.room_id),jsonb_build_object('status','checked_in','roomId',room.id,'room',room.number));end$$;

create or replace function public.front_desk_change_room(p_reservation_id text,p_new_room_id text,p_reason text,p_staff_user_id uuid)returns uuid language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;oldroom rooms%rowtype;newroom rooms%rowtype;assignment reservation_room_assignments%rowtype;aid uuid;upgrade boolean;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk')then raise exception'ROOM_CHANGE_FORBIDDEN';end if;if nullif(trim(p_reason),'')is null then raise exception'ROOM_CHANGE_REASON_REQUIRED';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'checked_in'or r.room_id is null then raise exception'RESERVATION_NOT_IN_HOUSE';end if;select * into oldroom from rooms where id=r.room_id for update;select * into newroom from rooms where id=p_new_room_id or number=p_new_room_id limit 1 for update;
if not found or newroom.id=oldroom.id then raise exception'INVALID_REPLACEMENT_ROOM';end if;upgrade:=newroom.type<>r.room_type;if upgrade and actor not in('owner','admin','manager')then raise exception'UPGRADE_AUTHORIZATION_REQUIRED';end if;if newroom.status<>'available'or newroom.housekeeping<>'clean'then raise exception'ROOM_NOT_READY';end if;if exists(select 1 from maintenance_orders where room_id=newroom.id and status in('open','in_progress'))then raise exception'ROOM_UNDER_MAINTENANCE';end if;
if exists(select 1 from reservation_room_assignments where room_id=newroom.id and reservation_id<>r.id and status='active'and check_in<r.check_out and check_out>r.check_in)then raise exception'ROOM_ALREADY_ASSIGNED';end if;
select * into assignment from reservation_room_assignments where reservation_id=r.id and status='active'for update;if not found then raise exception'ACTIVE_ASSIGNMENT_NOT_FOUND';end if;update reservation_room_assignments set status='reassigned',released_at=now(),reason=trim(p_reason)where id=assignment.id;
insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason,is_upgrade,authorized_by)values(r.id,newroom.id,r.check_in,r.check_out,p_staff_user_id,trim(p_reason),upgrade,case when upgrade then p_staff_user_id end)returning id into aid;
update rooms set status=case when exists(select 1 from maintenance_orders where room_id=oldroom.id and status in('open','in_progress'))then'maintenance'else'dirty'end,housekeeping='dirty'where id=oldroom.id;update rooms set status='occupied'where id=newroom.id;update reservations set room_id=newroom.id,room_number=newroom.number where id=r.id;
if not exists(select 1 from housekeeping_tasks where room_id=oldroom.id and status in('pending','in_progress'))then insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)values(oldroom.id,oldroom.number,'Room-change turnover','high','pending','Before next assignment','Guest transferred: '||trim(p_reason));end if;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'change_room','reservation',r.id,jsonb_build_object('roomId',oldroom.id,'room',oldroom.number),jsonb_build_object('roomId',newroom.id,'room',newroom.number,'upgrade',upgrade,'reason',p_reason));return aid;end$$;

create or replace function public.front_desk_extend_stay(p_reservation_id text,p_new_check_out date,p_reason text,p_idempotency_key uuid,p_staff_user_id uuid)
returns table(new_check_out date,additional_amount numeric,new_balance numeric)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;room rooms%rowtype;t room_types%rowtype;i invoices%rowtype;a reservation_room_assignments%rowtype;added numeric;cid uuid;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk')then raise exception'EXTENSION_FORBIDDEN';end if;if nullif(trim(p_reason),'')is null then raise exception'EXTENSION_REASON_REQUIRED';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'checked_in'or r.room_id is null then raise exception'RESERVATION_NOT_IN_HOUSE';end if;if p_new_check_out<=r.check_out then raise exception'INVALID_EXTENSION_DATE';end if;
select id into cid from folio_charges where idempotency_key=p_idempotency_key;if found then select * into i from invoices where reservation_id=r.id;return query select r.check_out,(select amount from folio_charges where id=cid),i.balance;return;end if;
select * into room from rooms where id=r.room_id for update;select * into a from reservation_room_assignments where reservation_id=r.id and status='active'for update;if not found then raise exception'ACTIVE_ASSIGNMENT_NOT_FOUND';end if;
if exists(select 1 from reservation_room_assignments where room_id=room.id and reservation_id<>r.id and status='active'and check_in<p_new_check_out and check_out>r.check_out)or exists(select 1 from reservations where id<>r.id and room_id=room.id and status in('confirmed','checked_in')and check_in<p_new_check_out and check_out>r.check_out)then raise exception'EXTENSION_REQUIRES_ROOM_CHANGE';end if;
select * into t from room_types where name=r.room_type and active;if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;added:=round(t.base_rate*(p_new_check_out-r.check_out),2);select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key)values(i.id,r.id,'Stay extension through '||p_new_check_out,'extension',added,p_staff_user_id,p_idempotency_key)returning id into cid;
update invoices set amount=amount+added,balance=balance+added,status=case when paid>0 then'partial'else'unpaid'end where id=i.id returning * into i;update reservations set check_out=p_new_check_out,total=total+added,payment_status=case when deposit>0 then'partial'else'unpaid'end where id=r.id;update reservation_room_assignments set check_out=p_new_check_out where id=a.id;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'extend_stay','reservation',r.id,jsonb_build_object('checkOut',r.check_out,'total',r.total),jsonb_build_object('checkOut',p_new_check_out,'additionalAmount',added,'reason',p_reason));return query select p_new_check_out,added,i.balance;end$$;
create or replace function public.front_desk_update_guest(p_reservation_id text,p_phone text,p_expected_arrival text,p_operational_notes text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;g guests%rowtype;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk')then raise exception'GUEST_UPDATE_FORBIDDEN';end if;select * into r from reservations where id=p_reservation_id for update;if not found or r.status not in('pending','confirmed','checked_in')then raise exception'RESERVATION_NOT_EDITABLE';end if;select * into g from guests where id=r.guest_id for update;if not found then raise exception'GUEST_NOT_FOUND';end if;
update guests set phone=coalesce(nullif(trim(p_phone),''),phone),special_requests=coalesce(nullif(trim(p_operational_notes),''),special_requests)where id=g.id;update reservations set expected_arrival=coalesce(nullif(trim(p_expected_arrival),''),expected_arrival),special_requests=coalesce(nullif(trim(p_operational_notes),''),special_requests)where id=r.id;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'update_guest_operations','guest',g.id,jsonb_build_object('phone',g.phone,'expectedArrival',r.expected_arrival,'notes',r.special_requests),jsonb_build_object('phone',coalesce(nullif(trim(p_phone),''),g.phone),'expectedArrival',coalesce(nullif(trim(p_expected_arrival),''),r.expected_arrival),'notes',coalesce(nullif(trim(p_operational_notes),''),r.special_requests)));end$$;

create or replace function public.front_desk_checkout(p_reservation_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;i invoices%rowtype;a reservation_room_assignments%rowtype;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk')then raise exception'CHECKOUT_FORBIDDEN';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'checked_in'then raise exception'RESERVATION_NOT_CHECKOUT_READY';end if;select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;if coalesce(i.balance,0)>0 then raise exception'FOLIO_BALANCE_REQUIRED';end if;
select * into a from reservation_room_assignments where reservation_id=r.id and status='active'for update;if not found then raise exception'ACTIVE_ASSIGNMENT_NOT_FOUND';end if;update reservation_room_assignments set status='completed',released_at=now()where id=a.id;update reservations set status='checked_out',checked_out_at=coalesce(checked_out_at,now())where id=r.id;
update rooms set status='dirty',housekeeping='dirty'where id=a.room_id;if not exists(select 1 from housekeeping_tasks where room_id=a.room_id and status in('pending','in_progress'))then insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)values(a.room_id,r.room_number,'Post-checkout room turnover','high','pending','Before next arrival','Automatically created at checkout');end if;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reservation_checkout','reservation',r.id,jsonb_build_object('status',r.status,'room',r.room_number),jsonb_build_object('status','checked_out','roomStatus','dirty','assignmentStatus','completed'));end$$;

create or replace function public.release_terminal_assignment()returns trigger language plpgsql security definer set search_path=public as $$begin if new.status in('cancelled','no_show')and old.status is distinct from new.status then update reservation_room_assignments set status=case new.status when'cancelled'then'cancelled'else'no_show'end,released_at=now(),reason=coalesce(new.cancellation_reason,reason)where reservation_id=new.id and status='active';end if;return new;end$$;
drop trigger if exists reservations_release_terminal_assignment on public.reservations;create trigger reservations_release_terminal_assignment after update of status on public.reservations for each row execute function public.release_terminal_assignment();

revoke all on table public.reservation_room_assignments from anon,authenticated;
revoke all on function public.front_desk_create_reservation(text,text,text,text,date,date,integer,text,text,text,uuid,uuid)from public;
revoke all on function public.front_desk_assign_room(text,text,text,uuid)from public;revoke all on function public.front_desk_change_room(text,text,text,uuid)from public;
revoke all on function public.front_desk_extend_stay(text,date,text,uuid,uuid)from public;revoke all on function public.front_desk_update_guest(text,text,text,text,uuid)from public;
revoke all on function public.front_desk_check_in(text,text,uuid)from public;revoke all on function public.front_desk_checkout(text,uuid)from public;
grant execute on function public.front_desk_create_reservation(text,text,text,text,date,date,integer,text,text,text,uuid,uuid)to service_role;
grant execute on function public.front_desk_assign_room(text,text,text,uuid)to service_role;grant execute on function public.front_desk_change_room(text,text,text,uuid)to service_role;
grant execute on function public.front_desk_extend_stay(text,date,text,uuid,uuid)to service_role;grant execute on function public.front_desk_update_guest(text,text,text,text,uuid)to service_role;
grant execute on function public.front_desk_check_in(text,text,uuid)to service_role;grant execute on function public.front_desk_checkout(text,uuid)to service_role;
-- Integrated Accounting operations. Existing reservations, invoices, payments, refunds and audits remain authoritative.
alter table public.invoices add column if not exists credit_balance numeric(12,2)not null default 0 check(credit_balance>=0);
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check check(status in('unpaid','deposit','partial','paid','credit','refund_pending','partial_refund','refunded','cancelled'));
alter table public.reservations drop constraint if exists reservations_payment_status_check;
alter table public.reservations add constraint reservations_payment_status_check check(payment_status in('unpaid','deposit','partial','paid','credit','failed','partial_refund','refunded'));
alter table public.folio_charges add column if not exists source text not null default 'hotel_operations';
alter table public.folio_charges add column if not exists source_record_id text;
alter table public.folio_charges add column if not exists status text not null default 'posted';
alter table public.folio_charges drop constraint if exists folio_charges_status_check;
alter table public.folio_charges add constraint folio_charges_status_check check(status in('posted','partially_reversed','reversed'));
alter table public.payments add column if not exists reviewed_by uuid references public.user_accounts(id)on delete set null;
alter table public.payments add column if not exists reviewed_at timestamptz;
alter table public.payments add column if not exists decision_reason text;

create table if not exists public.financial_adjustments(
 id uuid primary key default gen_random_uuid(),invoice_id text not null references public.invoices(id)on delete restrict,reservation_id text not null references public.reservations(id)on delete restrict,
 transaction_type text not null check(transaction_type in('adjustment','credit','reversal','write_off')),direction text not null check(direction in('debit','credit')),amount numeric(12,2)not null check(amount>0),
 reason text not null,source_charge_id uuid references public.folio_charges(id)on delete restrict,created_by uuid references public.user_accounts(id)on delete set null,idempotency_key uuid not null unique,created_at timestamptz not null default now());
create index if not exists financial_adjustments_reservation_idx on public.financial_adjustments(reservation_id,created_at desc);
create table if not exists public.cash_shifts(
 id uuid primary key default gen_random_uuid(),staff_user_id uuid not null references public.user_accounts(id)on delete restrict,location text not null default 'Front Desk',opening_amount numeric(12,2)not null check(opening_amount>=0),
 status text not null default 'open'check(status in('open','closed','reconciled')),opened_at timestamptz not null default now(),closed_at timestamptz,expected_cash numeric(12,2),actual_cash numeric(12,2),variance numeric(12,2),
 close_notes text,close_idempotency_key uuid unique,reconciled_by uuid references public.user_accounts(id)on delete set null,reconciled_at timestamptz,reconciliation_notes text);
create unique index if not exists cash_shift_one_open_per_staff on public.cash_shifts(staff_user_id)where status='open';
alter table public.payments add column if not exists cash_shift_id uuid references public.cash_shifts(id)on delete restrict;
create table if not exists public.payment_reconciliations(
 id uuid primary key default gen_random_uuid(),period_start date not null,period_end date not null check(period_end>=period_start),payment_method text not null,expected_amount numeric(12,2)not null,
 settled_amount numeric(12,2)not null check(settled_amount>=0),variance numeric(12,2)not null,status text not null check(status in('balanced','variance')),notes text,
 reconciled_by uuid references public.user_accounts(id)on delete set null,reconciled_at timestamptz not null default now(),idempotency_key uuid not null unique);
create table if not exists public.refund_attempts(
 id uuid primary key default gen_random_uuid(),refund_request_id uuid not null references public.refund_requests(id)on delete restrict,status text not null check(status in('processed','failed')),
 reference text,reason text,attempted_by uuid references public.user_accounts(id)on delete set null,attempted_at timestamptz not null default now());
create table if not exists public.financial_documents(
 id uuid primary key default gen_random_uuid(),document_number text not null unique,document_type text not null check(document_type in('receipt','folio')),reservation_id text references public.reservations(id)on delete restrict,
 payment_id uuid references public.payments(id)on delete restrict,snapshot jsonb not null,generated_by uuid references public.user_accounts(id)on delete set null,idempotency_key uuid not null unique,created_at timestamptz not null default now());
alter table public.financial_adjustments enable row level security;alter table public.cash_shifts enable row level security;alter table public.payment_reconciliations enable row level security;
alter table public.refund_attempts enable row level security;alter table public.financial_documents enable row level security;
revoke all on table public.financial_adjustments,public.cash_shifts,public.payment_reconciliations,public.refund_attempts,public.financial_documents from anon,authenticated;

create or replace function public.protect_settled_payment()returns trigger language plpgsql set search_path=public as $$
begin if tg_op='DELETE'and old.status='paid'then raise exception'SETTLED_PAYMENT_IMMUTABLE';end if;
if tg_op='UPDATE'and old.status='paid'and(old.amount is distinct from new.amount or old.currency is distinct from new.currency or old.method is distinct from new.method or old.reference is distinct from new.reference or old.purpose is distinct from new.purpose or old.invoice_id is distinct from new.invoice_id or old.reservation_id is distinct from new.reservation_id)then raise exception'SETTLED_PAYMENT_IMMUTABLE';end if;
return case when tg_op='DELETE'then old else new end;end$$;
drop trigger if exists payments_preserve_settled_history on public.payments;create trigger payments_preserve_settled_history before update or delete on public.payments for each row execute function public.protect_settled_payment();
create or replace function public.protect_audit_history()returns trigger language plpgsql as $$begin raise exception'AUDIT_HISTORY_IMMUTABLE';end$$;
drop trigger if exists audit_logs_immutable on public.audit_logs;create trigger audit_logs_immutable before update or delete on public.audit_logs for each statement execute function public.protect_audit_history();

-- Accounting financial operations (server-authoritative). Additive only: reservations, invoices,
-- payments, folio_charges, refund_requests and audit_logs remain the single authoritative record.
-- Corrections are made by reversal/adjustment, never by editing or deleting settled history.

-- One authoritative folio recomputation. Every financial mutation routes through this so paid,
-- balance, credit_balance and status are derived from payments rather than hand-edited per caller.
create or replace function public.sync_invoice_financials(p_invoice_id text)returns invoices language plpgsql security definer set search_path=public as $$
declare i invoices%rowtype;v_gross numeric;v_refunded numeric;v_net numeric;v_applied numeric;v_credit numeric;begin
 select * into i from invoices where id=p_invoice_id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 select coalesce(sum(amount),0)into v_gross from payments where invoice_id=i.id and status='paid'and purpose<>'refund';
 select coalesce(sum(amount),0)into v_refunded from payments where invoice_id=i.id and status='paid'and purpose='refund';
 v_net:=greatest(round(v_gross-v_refunded,2),0);v_applied:=least(v_net,round(i.amount,2));v_credit:=greatest(round(v_net-i.amount,2),0);
 update invoices set paid=v_applied,balance=greatest(round(i.amount-v_applied,2),0),credit_balance=v_credit,
  status=case when i.status in('cancelled','refund_pending')then i.status when v_credit>0 then'credit'when v_refunded>0 and v_applied=0 then'refunded'when v_refunded>0 then'partial_refund'when i.amount>0 and v_applied>=round(i.amount,2)then'paid'when v_applied>0 then'partial'else'unpaid'end
  where id=i.id returning * into i;
 if i.reservation_id is not null and i.status not in('cancelled','refund_pending')then update reservations set payment_status=i.status where id=i.reservation_id;end if;
 return i;end$$;
revoke all on function public.sync_invoice_financials(text)from public;

-- Payment collection now records the owning cash shift and, for authorized financial roles only,
-- routes a documented overpayment into the folio credit balance instead of rejecting the money.
drop function if exists public.record_staff_payment(text,numeric,text,text,uuid,uuid);
create or replace function public.record_staff_payment(p_reservation_id text,p_amount numeric,p_method text,p_reference text,p_idempotency_key uuid,p_staff_user_id uuid,p_allow_overpayment boolean default false)
returns table(payment_id uuid,paid numeric,balance numeric,payment_status text,folio_credit numeric)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;i invoices%rowtype;existing payments%rowtype;v_pid uuid;v_shift uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk','accounting')then raise exception'PAYMENT_COLLECTION_FORBIDDEN';end if;
 if p_allow_overpayment and actor not in('owner','admin','accounting')then raise exception'OVERPAYMENT_FORBIDDEN';end if;
 if p_amount<=0 then raise exception'INVALID_PAYMENT_AMOUNT';end if;if nullif(trim(p_method),'')is null or nullif(trim(p_reference),'')is null then raise exception'INVALID_PAYMENT_DETAILS';end if;
 select * into existing from payments where idempotency_key=p_idempotency_key;if found then select * into i from invoices where id=existing.invoice_id;return query select existing.id,i.paid,i.balance,i.status,i.credit_balance;return;end if;
 select * into r from reservations where id=p_reservation_id for update;if not found or r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_PAYMENT_READY';end if;
 select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 if round(p_amount,2)>round(i.balance,2)and not p_allow_overpayment then raise exception'PAYMENT_EXCEEDS_BALANCE';end if;
 if lower(trim(p_method))='cash'then select cs.id into v_shift from cash_shifts cs where cs.staff_user_id=p_staff_user_id and cs.status='open'limit 1;end if;
 insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,received_by,verified_at,cash_shift_id)
 values(i.id,r.id,round(p_amount,2),'PHP',trim(p_method),trim(p_reference),'stay_payment','paid',p_idempotency_key,p_staff_user_id,now(),v_shift)returning id into v_pid;
 select * into i from sync_invoice_financials(i.id);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'collect_payment','payment',v_pid::text,jsonb_build_object('reservationId',r.id,'amount',round(p_amount,2),'method',trim(p_method),'reference',trim(p_reference),'cashShiftId',v_shift,'creditBalance',i.credit_balance));
 return query select v_pid,i.paid,i.balance,i.status,i.credit_balance;end$$;

-- Operational charge posting stays with the operating departments (separation of duties).
-- Accounting corrects the folio through accounting_reverse_charge / accounting_record_adjustment.
create or replace function public.post_folio_charge(p_reservation_id text,p_description text,p_category text,p_amount numeric,p_idempotency_key uuid,p_staff_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;i invoices%rowtype;v_cid uuid;v_existing uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','front_desk')then raise exception'CHARGE_POSTING_FORBIDDEN';end if;
 if p_amount<=0 or nullif(trim(p_description),'')is null then raise exception'INVALID_CHARGE';end if;select id into v_existing from folio_charges where idempotency_key=p_idempotency_key;if found then return v_existing;end if;
 select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'checked_in'then raise exception'RESERVATION_NOT_IN_HOUSE';end if;select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,source_record_id)
 values(i.id,r.id,trim(p_description),coalesce(nullif(trim(p_category),''),'incidental'),round(p_amount,2),p_staff_user_id,p_idempotency_key,'hotel_operations',r.id)returning id into v_cid;
 update invoices set amount=round(amount+round(p_amount,2),2)where id=i.id;perform sync_invoice_financials(i.id);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'post_folio_charge','folio_charge',v_cid::text,jsonb_build_object('reservationId',r.id,'amount',round(p_amount,2),'description',trim(p_description)));return v_cid;end$$;

-- Extension charges reuse the same authoritative recomputation so folio credit is honoured.
create or replace function public.front_desk_extend_stay(p_reservation_id text,p_new_check_out date,p_reason text,p_idempotency_key uuid,p_staff_user_id uuid)
returns table(new_check_out date,additional_amount numeric,new_balance numeric)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;room rooms%rowtype;t room_types%rowtype;i invoices%rowtype;a reservation_room_assignments%rowtype;added numeric;cid uuid;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk')then raise exception'EXTENSION_FORBIDDEN';end if;if nullif(trim(p_reason),'')is null then raise exception'EXTENSION_REASON_REQUIRED';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'checked_in'or r.room_id is null then raise exception'RESERVATION_NOT_IN_HOUSE';end if;if p_new_check_out<=r.check_out then raise exception'INVALID_EXTENSION_DATE';end if;
select id into cid from folio_charges where idempotency_key=p_idempotency_key;if found then select * into i from invoices where reservation_id=r.id;return query select r.check_out,(select amount from folio_charges where id=cid),i.balance;return;end if;
select * into room from rooms where id=r.room_id for update;select * into a from reservation_room_assignments where reservation_id=r.id and status='active'for update;if not found then raise exception'ACTIVE_ASSIGNMENT_NOT_FOUND';end if;
if exists(select 1 from reservation_room_assignments where room_id=room.id and reservation_id<>r.id and status='active'and check_in<p_new_check_out and check_out>r.check_out)or exists(select 1 from reservations where id<>r.id and room_id=room.id and status in('confirmed','checked_in')and check_in<p_new_check_out and check_out>r.check_out)then raise exception'EXTENSION_REQUIRES_ROOM_CHANGE';end if;
select * into t from room_types where name=r.room_type and active;if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;added:=round(t.base_rate*(p_new_check_out-r.check_out),2);select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,source_record_id)values(i.id,r.id,'Stay extension through '||p_new_check_out,'extension',added,p_staff_user_id,p_idempotency_key,'hotel_operations',r.id)returning id into cid;
update invoices set amount=round(amount+added,2)where id=i.id;update reservations set check_out=p_new_check_out,total=round(total+added,2)where id=r.id;update reservation_room_assignments set check_out=p_new_check_out where id=a.id;select * into i from sync_invoice_financials(i.id);
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'extend_stay','reservation',r.id,jsonb_build_object('checkOut',r.check_out,'total',r.total),jsonb_build_object('checkOut',p_new_check_out,'additionalAmount',added,'reason',trim(p_reason)));return query select p_new_check_out,added,i.balance;end$$;

-- Manual deposit rejection. The submitted proof is recorded as failed with the reviewer decision;
-- the payment row itself is preserved, never deleted.
create or replace function public.accounting_reject_deposit(p_payment_id uuid,p_staff_user_id uuid,p_reason text)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;p payments%rowtype;r reservations%rowtype;i invoices%rowtype;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk','accounting')then raise exception'PAYMENT_VERIFICATION_FORBIDDEN';end if;
 if nullif(trim(p_reason),'')is null then raise exception'REJECTION_REASON_REQUIRED';end if;
 select * into p from payments where id=p_payment_id for update;if not found or p.purpose<>'reservation_deposit'then raise exception'PAYMENT_NOT_FOUND';end if;
 if p.status='failed'then return jsonb_build_object('paymentStatus',p.status,'reservationId',p.reservation_id,'reason',p.decision_reason);end if;
 if p.status<>'pending_verification'then raise exception'PAYMENT_NOT_PENDING';end if;
 select * into r from reservations where id=p.reservation_id for update;select * into i from invoices where id=p.invoice_id for update;
 update payments set status='failed',reviewed_by=p_staff_user_id,reviewed_at=now(),decision_reason=trim(p_reason),notes=coalesce(notes,'Deposit proof rejected by financial review')where id=p.id;
 update booking_holds set status='expired'where reservation_id=r.id and status in('active','payment_submitted');
 if r.status='pending'then update reservations set status='cancelled',payment_status='failed',cancellation_reason=coalesce(nullif(trim(p_reason),''),'Reservation deposit could not be verified')where id=r.id;
  update invoices set balance=0,credit_balance=0,status='cancelled'where id=i.id;end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reject_reservation_deposit','payment',p.id::text,jsonb_build_object('status',p.status),jsonb_build_object('status','failed','reservationId',r.id,'reason',trim(p_reason)));
 return jsonb_build_object('paymentStatus','failed','reservationId',r.id,'reservationStatus',case when r.status='pending'then'cancelled'else r.status end,'reason',trim(p_reason));end$$;

-- Charge reversal. The original charge row is preserved; the correction is a separate
-- financial_adjustments record that reduces the authoritative folio.
create or replace function public.accounting_reverse_charge(p_charge_id uuid,p_amount numeric,p_reason text,p_idempotency_key uuid,p_staff_user_id uuid)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;c folio_charges%rowtype;i invoices%rowtype;existing financial_adjustments%rowtype;v_reversed numeric;v_amount numeric;v_aid uuid;v_status text;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','accounting')then raise exception'CHARGE_REVERSAL_FORBIDDEN';end if;
 select * into existing from financial_adjustments where idempotency_key=p_idempotency_key;
 if found then select * into i from invoices where id=existing.invoice_id;select status into v_status from folio_charges where id=existing.source_charge_id;
  return jsonb_build_object('adjustmentId',existing.id,'chargeStatus',v_status,'folioAmount',i.amount,'folioBalance',i.balance,'folioStatus',i.status);end if;
 if nullif(trim(p_reason),'')is null then raise exception'REVERSAL_REASON_REQUIRED';end if;
 select * into c from folio_charges where id=p_charge_id for update;if not found then raise exception'CHARGE_NOT_FOUND';end if;
 select coalesce(sum(amount),0)into v_reversed from financial_adjustments where source_charge_id=c.id and transaction_type='reversal';
 v_amount:=round(coalesce(nullif(p_amount,0),round(c.amount-v_reversed,2)),2);
 if v_amount<=0 or v_amount>round(c.amount-v_reversed,2)then raise exception'REVERSAL_EXCEEDS_CHARGE';end if;
 select * into i from invoices where id=c.invoice_id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 insert into financial_adjustments(invoice_id,reservation_id,transaction_type,direction,amount,reason,source_charge_id,created_by,idempotency_key)
 values(i.id,c.reservation_id,'reversal','credit',v_amount,trim(p_reason),c.id,p_staff_user_id,p_idempotency_key)returning id into v_aid;
 v_status:=case when round(v_reversed+v_amount,2)>=round(c.amount,2)then'reversed'else'partially_reversed'end;
 update folio_charges set status=v_status where id=c.id;
 update invoices set amount=greatest(round(i.amount-v_amount,2),0)where id=i.id;select * into i from sync_invoice_financials(i.id);
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reverse_folio_charge','folio_charge',c.id::text,jsonb_build_object('chargeAmount',c.amount,'alreadyReversed',v_reversed,'chargeStatus',c.status),jsonb_build_object('adjustmentId',v_aid,'reversedAmount',v_amount,'chargeStatus',v_status,'reason',trim(p_reason)));
 return jsonb_build_object('adjustmentId',v_aid,'chargeStatus',v_status,'reversedAmount',v_amount,'folioAmount',i.amount,'folioBalance',i.balance,'folioStatus',i.status,'folioCredit',i.credit_balance);end$$;

-- Adjustments, goodwill credits and write-offs. Debit increases the guest obligation, credit and
-- write_off reduce it. Settled payments are never touched.
create or replace function public.accounting_record_adjustment(p_reservation_id text,p_transaction_type text,p_direction text,p_amount numeric,p_reason text,p_idempotency_key uuid,p_staff_user_id uuid)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;i invoices%rowtype;existing financial_adjustments%rowtype;v_aid uuid;v_amount numeric;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','accounting')then raise exception'ADJUSTMENT_FORBIDDEN';end if;
 select * into existing from financial_adjustments where idempotency_key=p_idempotency_key;
 if found then select * into i from invoices where id=existing.invoice_id;return jsonb_build_object('adjustmentId',existing.id,'folioAmount',i.amount,'folioBalance',i.balance,'folioStatus',i.status,'folioCredit',i.credit_balance);end if;
 if p_transaction_type not in('adjustment','credit','write_off')then raise exception'UNSUPPORTED_ADJUSTMENT_TYPE';end if;
 if p_direction not in('debit','credit')then raise exception'UNSUPPORTED_ADJUSTMENT_DIRECTION';end if;
 if p_transaction_type in('credit','write_off')and p_direction<>'credit'then raise exception'UNSUPPORTED_ADJUSTMENT_DIRECTION';end if;
 if nullif(trim(p_reason),'')is null then raise exception'ADJUSTMENT_REASON_REQUIRED';end if;
 v_amount:=round(p_amount,2);if v_amount<=0 then raise exception'INVALID_ADJUSTMENT_AMOUNT';end if;
 select * into r from reservations where id=p_reservation_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;
 select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 if i.status='cancelled'then raise exception'FOLIO_CLOSED';end if;
 if p_direction='credit'and v_amount>round(i.amount,2)then raise exception'ADJUSTMENT_EXCEEDS_FOLIO';end if;
 if p_transaction_type='write_off'and v_amount>round(i.balance,2)then raise exception'WRITE_OFF_EXCEEDS_BALANCE';end if;
 insert into financial_adjustments(invoice_id,reservation_id,transaction_type,direction,amount,reason,created_by,idempotency_key)
 values(i.id,r.id,p_transaction_type,p_direction,v_amount,trim(p_reason),p_staff_user_id,p_idempotency_key)returning id into v_aid;
 update invoices set amount=greatest(round(i.amount+case when p_direction='debit'then v_amount else-v_amount end,2),0)where id=i.id;
 select * into i from sync_invoice_financials(i.id);
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'record_financial_adjustment','invoice',i.id,jsonb_build_object('folioAmount',round(i.amount+case when p_direction='debit'then-v_amount else v_amount end,2)),jsonb_build_object('adjustmentId',v_aid,'transactionType',p_transaction_type,'direction',p_direction,'amount',v_amount,'reason',trim(p_reason),'folioAmount',i.amount,'folioBalance',i.balance));
 return jsonb_build_object('adjustmentId',v_aid,'transactionType',p_transaction_type,'direction',p_direction,'amount',v_amount,'folioAmount',i.amount,'folioBalance',i.balance,'folioStatus',i.status,'folioCredit',i.credit_balance);end$$;

-- Refund settlement. Every attempt is recorded, a failed attempt stays retryable, and no refund
-- may exceed the eligible amount or the cash actually received.
create or replace function public.process_refund(p_refund_id uuid,p_staff_user_id uuid,p_reference text)
returns table(refund_status text,refund_amount numeric,net_paid numeric)language plpgsql security definer set search_path=public as $$
declare actor text;rr refund_requests%rowtype;i invoices%rowtype;r reservations%rowtype;existing payments%rowtype;v_gross numeric;v_refunded numeric;v_net numeric;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','accounting')then raise exception'REFUND_PROCESSING_FORBIDDEN';end if;
 select * into rr from refund_requests where id=p_refund_id for update;if not found then raise exception'REFUND_NOT_FOUND';end if;
 select * into i from invoices where id=rr.invoice_id for update;select * into r from reservations where id=rr.reservation_id for update;
 select coalesce(sum(amount),0)into v_gross from payments where invoice_id=i.id and status='paid'and purpose<>'refund';
 select coalesce(sum(amount),0)into v_refunded from payments where invoice_id=i.id and status='paid'and purpose='refund';
 if rr.status='processed'then return query select rr.status,rr.eligible_amount,greatest(round(v_gross-v_refunded,2),0);return;end if;
 if rr.status not in('pending','failed')or rr.eligible_amount<=0 then raise exception'REFUND_NOT_PENDING';end if;
 if nullif(trim(p_reference),'')is null then raise exception'REFUND_REFERENCE_REQUIRED';end if;
 if round(v_refunded+rr.eligible_amount,2)>round(v_gross,2)then raise exception'REFUND_EXCEEDS_RECEIVED';end if;
 select * into existing from payments where idempotency_key=rr.id;
 if not found then insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,received_by,verified_at)values(i.id,r.id,rr.eligible_amount,'PHP','manual_refund',trim(p_reference),'refund','paid',rr.id,p_staff_user_id,now());end if;
 insert into refund_attempts(refund_request_id,status,reference,attempted_by)values(rr.id,'processed',trim(p_reference),p_staff_user_id);
 update refund_requests set status='processed',processed_by=p_staff_user_id,processed_at=now(),reference=trim(p_reference)where id=rr.id;
 select coalesce(sum(amount),0)into v_gross from payments where invoice_id=i.id and status='paid'and purpose<>'refund';
 select coalesce(sum(amount),0)into v_refunded from payments where invoice_id=i.id and status='paid'and purpose='refund';v_net:=greatest(round(v_gross-v_refunded,2),0);
 update invoices set paid=v_net,balance=0,credit_balance=0,status=case when v_net=0 then'refunded'else'partial_refund'end where id=i.id;
 update reservations set payment_status=case when v_net=0 then'refunded'else'partial_refund'end where id=r.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'process_refund','refund_request',rr.id::text,jsonb_build_object('reservationId',r.id,'amount',rr.eligible_amount,'reference',trim(p_reference)));
 return query select'processed'::text,rr.eligible_amount,v_net;end$$;

-- A refund that could not be settled externally is recorded as a failed attempt and stays in the
-- Accounting queue. Nothing is marked settled or provider-verified on the strength of an attempt.
create or replace function public.accounting_fail_refund(p_refund_id uuid,p_staff_user_id uuid,p_reason text)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;rr refund_requests%rowtype;v_attempts integer;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','accounting')then raise exception'REFUND_PROCESSING_FORBIDDEN';end if;
 if nullif(trim(p_reason),'')is null then raise exception'REFUND_FAILURE_REASON_REQUIRED';end if;
 select * into rr from refund_requests where id=p_refund_id for update;if not found then raise exception'REFUND_NOT_FOUND';end if;
 if rr.status='processed'then raise exception'REFUND_ALREADY_PROCESSED';end if;if rr.status='cancelled'then raise exception'REFUND_NOT_PENDING';end if;
 insert into refund_attempts(refund_request_id,status,reason,attempted_by)values(rr.id,'failed',trim(p_reason),p_staff_user_id);
 update refund_requests set status='failed'where id=rr.id;
 select count(*)into v_attempts from refund_attempts where refund_request_id=rr.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'fail_refund','refund_request',rr.id::text,jsonb_build_object('status',rr.status),jsonb_build_object('status','failed','reason',trim(p_reason),'attempts',v_attempts));
 return jsonb_build_object('refundStatus','failed','eligibleAmount',rr.eligible_amount,'attempts',v_attempts,'retryable',true);end$$;

-- Cash drawer shifts. Expected cash is always computed from the payments recorded against the
-- shift; the counted amount is recorded as a variance and never used to rewrite guest payments.
create or replace function public.accounting_open_cash_shift(p_staff_user_id uuid,p_location text,p_opening_amount numeric)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;v_id uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk','accounting')then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 if p_opening_amount is null or p_opening_amount<0 then raise exception'INVALID_OPENING_AMOUNT';end if;
 if exists(select 1 from cash_shifts where staff_user_id=p_staff_user_id and status='open')then raise exception'CASH_SHIFT_ALREADY_OPEN';end if;
 insert into cash_shifts(staff_user_id,location,opening_amount)values(p_staff_user_id,coalesce(nullif(trim(p_location),''),'Front Desk'),round(p_opening_amount,2))returning id into v_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'open_cash_shift','cash_shift',v_id::text,jsonb_build_object('openingAmount',round(p_opening_amount,2),'location',coalesce(nullif(trim(p_location),''),'Front Desk')));
 return jsonb_build_object('shiftId',v_id,'status','open','openingAmount',round(p_opening_amount,2));end$$;

create or replace function public.accounting_close_cash_shift(p_shift_id uuid,p_actual_cash numeric,p_notes text,p_idempotency_key uuid,p_staff_user_id uuid)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;s cash_shifts%rowtype;existing cash_shifts%rowtype;v_in numeric;v_out numeric;v_expected numeric;v_variance numeric;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk','accounting')then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 select * into existing from cash_shifts where close_idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('shiftId',existing.id,'status',existing.status,'expectedCash',existing.expected_cash,'actualCash',existing.actual_cash,'variance',existing.variance);end if;
 if p_actual_cash is null or p_actual_cash<0 then raise exception'INVALID_COUNTED_CASH';end if;
 select * into s from cash_shifts where id=p_shift_id for update;if not found then raise exception'CASH_SHIFT_NOT_FOUND';end if;
 if s.status<>'open'then raise exception'CASH_SHIFT_NOT_OPEN';end if;
 if s.staff_user_id<>p_staff_user_id and actor not in('owner','admin','manager','accounting')then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 select coalesce(sum(amount),0)into v_in from payments where cash_shift_id=s.id and status='paid'and purpose<>'refund';
 select coalesce(sum(amount),0)into v_out from payments where cash_shift_id=s.id and status='paid'and purpose='refund';
 v_expected:=round(s.opening_amount+v_in-v_out,2);v_variance:=round(round(p_actual_cash,2)-v_expected,2);
 update cash_shifts set status='closed',closed_at=now(),expected_cash=v_expected,actual_cash=round(p_actual_cash,2),variance=v_variance,close_notes=nullif(trim(p_notes),''),close_idempotency_key=p_idempotency_key where id=s.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'close_cash_shift','cash_shift',s.id::text,jsonb_build_object('expectedCash',v_expected,'actualCash',round(p_actual_cash,2),'variance',v_variance,'cashCollected',v_in,'cashPaidOut',v_out));
 return jsonb_build_object('shiftId',s.id,'status','closed','expectedCash',v_expected,'actualCash',round(p_actual_cash,2),'variance',v_variance,'cashCollected',v_in,'cashPaidOut',v_out);end$$;

create or replace function public.accounting_reconcile_cash_shift(p_shift_id uuid,p_staff_user_id uuid,p_notes text)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;s cash_shifts%rowtype;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','accounting')then raise exception'RECONCILIATION_FORBIDDEN';end if;
 select * into s from cash_shifts where id=p_shift_id for update;if not found then raise exception'CASH_SHIFT_NOT_FOUND';end if;
 if s.status='reconciled'then return jsonb_build_object('shiftId',s.id,'status',s.status,'variance',s.variance);end if;
 if s.status<>'closed'then raise exception'CASH_SHIFT_NOT_CLOSED';end if;
 if coalesce(s.variance,0)<>0 and nullif(trim(p_notes),'')is null then raise exception'VARIANCE_EXPLANATION_REQUIRED';end if;
 update cash_shifts set status='reconciled',reconciled_by=p_staff_user_id,reconciled_at=now(),reconciliation_notes=nullif(trim(p_notes),'')where id=s.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reconcile_cash_shift','cash_shift',s.id::text,jsonb_build_object('status',s.status,'variance',s.variance),jsonb_build_object('status','reconciled','variance',s.variance,'notes',nullif(trim(p_notes),'')));
 return jsonb_build_object('shiftId',s.id,'status','reconciled','variance',s.variance);end$$;

-- Payment-source reconciliation. Expected is derived from recorded payments; the settled figure is
-- the operator-entered statement total. A variance is recorded as a variance, never auto-applied.
create or replace function public.accounting_reconcile_payments(p_period_start date,p_period_end date,p_method text,p_settled_amount numeric,p_notes text,p_idempotency_key uuid,p_staff_user_id uuid)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;existing payment_reconciliations%rowtype;v_in numeric;v_out numeric;v_expected numeric;v_variance numeric;v_status text;v_id uuid;v_method text;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','accounting')then raise exception'RECONCILIATION_FORBIDDEN';end if;
 select * into existing from payment_reconciliations where idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('reconciliationId',existing.id,'expectedAmount',existing.expected_amount,'settledAmount',existing.settled_amount,'variance',existing.variance,'status',existing.status);end if;
 v_method:=lower(nullif(trim(p_method),''));if v_method is null then raise exception'PAYMENT_METHOD_REQUIRED';end if;
 if p_period_start is null or p_period_end is null or p_period_end<p_period_start then raise exception'INVALID_RECONCILIATION_PERIOD';end if;
 if p_settled_amount is null or p_settled_amount<0 then raise exception'INVALID_SETTLED_AMOUNT';end if;
 select coalesce(sum(amount),0)into v_in from payments where lower(method)=v_method and status='paid'and purpose<>'refund'and coalesce(verified_at,created_at)::date between p_period_start and p_period_end;
 select coalesce(sum(amount),0)into v_out from payments where lower(method)=v_method and status='paid'and purpose='refund'and coalesce(verified_at,created_at)::date between p_period_start and p_period_end;
 v_expected:=round(v_in-v_out,2);v_variance:=round(round(p_settled_amount,2)-v_expected,2);v_status:=case when v_variance=0 then'balanced'else'variance'end;
 if v_status='variance'and nullif(trim(p_notes),'')is null then raise exception'VARIANCE_EXPLANATION_REQUIRED';end if;
 insert into payment_reconciliations(period_start,period_end,payment_method,expected_amount,settled_amount,variance,status,notes,reconciled_by,idempotency_key)
 values(p_period_start,p_period_end,v_method,v_expected,round(p_settled_amount,2),v_variance,v_status,nullif(trim(p_notes),''),p_staff_user_id,p_idempotency_key)returning id into v_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'reconcile_payments','payment_reconciliation',v_id::text,jsonb_build_object('periodStart',p_period_start,'periodEnd',p_period_end,'method',v_method,'expectedAmount',v_expected,'settledAmount',round(p_settled_amount,2),'variance',v_variance,'status',v_status));
 return jsonb_build_object('reconciliationId',v_id,'expectedAmount',v_expected,'settledAmount',round(p_settled_amount,2),'variance',v_variance,'status',v_status);end$$;

-- Receipts and folio statements are immutable snapshots of authoritative records. No payment
-- credentials, card data, authentication material or unrelated guest identity data is captured.
create or replace function public.accounting_generate_document(p_document_type text,p_reservation_id text,p_payment_id uuid,p_idempotency_key uuid,p_staff_user_id uuid)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;existing financial_documents%rowtype;r reservations%rowtype;i invoices%rowtype;p payments%rowtype;v_number text;v_snapshot jsonb;v_id uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','manager','front_desk','accounting')then raise exception'DOCUMENT_FORBIDDEN';end if;
 select * into existing from financial_documents where idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('documentId',existing.id,'documentNumber',existing.document_number,'documentType',existing.document_type,'snapshot',existing.snapshot);end if;
 if p_document_type not in('receipt','folio')then raise exception'UNSUPPORTED_DOCUMENT_TYPE';end if;
 if p_document_type='receipt'then
  select * into p from payments where id=p_payment_id;if not found or p.status<>'paid'then raise exception'PAYMENT_NOT_SETTLED';end if;
  select * into r from reservations where id=p.reservation_id;select * into i from invoices where id=p.invoice_id;
 else select * into r from reservations where id=p_reservation_id;if not found then raise exception'RESERVATION_NOT_FOUND';end if;select * into i from invoices where reservation_id=r.id;end if;
 if i.id is null then raise exception'FOLIO_NOT_FOUND';end if;
 v_number:=case p_document_type when'receipt'then'RCP-'else'FOL-'end||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 v_snapshot:=jsonb_build_object('documentType',p_document_type,'documentNumber',v_number,'reservationId',r.id,'confirmationNumber',r.confirmation_number,'guestName',r.guest_name,'roomType',r.room_type,'checkIn',r.check_in,'checkOut',r.check_out,
  'currency',i.currency,'folioAmount',i.amount,'paid',i.paid,'balance',i.balance,'creditBalance',i.credit_balance,'folioStatus',i.status,'generatedAt',now(),
  'charges',(select coalesce(jsonb_agg(jsonb_build_object('description',fc.description,'category',fc.category,'amount',fc.amount,'status',fc.status,'postedAt',fc.created_at)order by fc.created_at),'[]'::jsonb)from folio_charges fc where fc.invoice_id=i.id),
  'adjustments',(select coalesce(jsonb_agg(jsonb_build_object('transactionType',fa.transaction_type,'direction',fa.direction,'amount',fa.amount,'reason',fa.reason,'createdAt',fa.created_at)order by fa.created_at),'[]'::jsonb)from financial_adjustments fa where fa.invoice_id=i.id),
  'payments',case when p_document_type='receipt'then jsonb_build_array(jsonb_build_object('purpose',p.purpose,'method',p.method,'reference',p.reference,'amount',p.amount,'receivedAt',coalesce(p.verified_at,p.created_at)))
   else(select coalesce(jsonb_agg(jsonb_build_object('purpose',pp.purpose,'method',pp.method,'reference',pp.reference,'amount',pp.amount,'receivedAt',coalesce(pp.verified_at,pp.created_at))order by pp.created_at),'[]'::jsonb)from payments pp where pp.invoice_id=i.id and pp.status='paid')end);
 insert into financial_documents(document_number,document_type,reservation_id,payment_id,snapshot,generated_by,idempotency_key)
 values(v_number,p_document_type,r.id,case when p_document_type='receipt'then p.id else null end,v_snapshot,p_staff_user_id,p_idempotency_key)returning id into v_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'generate_financial_document','financial_document',v_id::text,jsonb_build_object('documentNumber',v_number,'documentType',p_document_type,'reservationId',r.id));
 return jsonb_build_object('documentId',v_id,'documentNumber',v_number,'documentType',p_document_type,'snapshot',v_snapshot);end$$;

revoke all on function public.record_staff_payment(text,numeric,text,text,uuid,uuid,boolean)from public;
revoke all on function public.accounting_reject_deposit(uuid,uuid,text)from public;revoke all on function public.accounting_reverse_charge(uuid,numeric,text,uuid,uuid)from public;
revoke all on function public.accounting_record_adjustment(text,text,text,numeric,text,uuid,uuid)from public;revoke all on function public.accounting_fail_refund(uuid,uuid,text)from public;
revoke all on function public.accounting_open_cash_shift(uuid,text,numeric)from public;revoke all on function public.accounting_close_cash_shift(uuid,numeric,text,uuid,uuid)from public;
revoke all on function public.accounting_reconcile_cash_shift(uuid,uuid,text)from public;revoke all on function public.accounting_reconcile_payments(date,date,text,numeric,text,uuid,uuid)from public;
revoke all on function public.accounting_generate_document(text,text,uuid,uuid,uuid)from public;
grant execute on function public.record_staff_payment(text,numeric,text,text,uuid,uuid,boolean)to service_role;
grant execute on function public.accounting_reject_deposit(uuid,uuid,text)to service_role;grant execute on function public.accounting_reverse_charge(uuid,numeric,text,uuid,uuid)to service_role;
grant execute on function public.accounting_record_adjustment(text,text,text,numeric,text,uuid,uuid)to service_role;grant execute on function public.accounting_fail_refund(uuid,uuid,text)to service_role;
grant execute on function public.accounting_open_cash_shift(uuid,text,numeric)to service_role;grant execute on function public.accounting_close_cash_shift(uuid,numeric,text,uuid,uuid)to service_role;
grant execute on function public.accounting_reconcile_cash_shift(uuid,uuid,text)to service_role;grant execute on function public.accounting_reconcile_payments(date,date,text,numeric,text,uuid,uuid)to service_role;
grant execute on function public.accounting_generate_document(text,text,uuid,uuid,uuid)to service_role;
create index if not exists payments_cash_shift_idx on public.payments(cash_shift_id)where cash_shift_id is not null;
create index if not exists refund_attempts_request_idx on public.refund_attempts(refund_request_id,attempted_at desc);
create index if not exists financial_documents_reservation_idx on public.financial_documents(reservation_id,created_at desc);

-- Supabase's default privileges grant execute on every newly created function to anon and
-- authenticated, and a security definer function bypasses RLS. Nothing in this app ever talks to
-- Postgres with the anon key - lib/supabase.ts builds a service-role client only - so any other
-- grant is a way to reach a money path behind the API's server-side authorization (spec 6, 89).
-- Re-runnable: it recomputes the definer set every time, so later functions are covered too.
do $$declare v_fn text;v_role text;begin
 for v_fn in select p.oid::regprocedure::text from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef loop
  execute format('revoke all on function %s from public',v_fn);
  foreach v_role in array array['anon','authenticated'] loop
   if to_regrole(v_role) is not null then execute format('revoke all on function %s from %I',v_fn,v_role);end if;
  end loop;
 end loop;
 -- The folio recomputation helper stays internal: it is only ever called from inside another
 -- definer function, which runs as the owner, so no API role needs it at all.
 if to_regrole('service_role') is not null then revoke all on function public.sync_invoice_financials(text)from service_role;end if;
end$$;

-- Manager / Operations Manager approvals and escalations.
alter table public.hotel_operational_policies add column if not exists manager_arrival_risk_minutes integer not null default 120 check(manager_arrival_risk_minutes between 15 and 1440);
alter table public.hotel_operational_policies add column if not exists guest_request_overdue_minutes integer not null default 60 check(guest_request_overdue_minutes between 15 and 10080);
alter table public.hotel_operational_policies add column if not exists housekeeping_turnover_overdue_minutes integer not null default 180 check(housekeeping_turnover_overdue_minutes between 15 and 10080);
create table if not exists public.manager_approval_requests(
 id uuid primary key default gen_random_uuid(),request_type text not null check(request_type in('room_upgrade','reservation_modification','early_check_in','late_checkout','guest_compensation','refund_exception','checkout_exception','guest_escalation')),
 related_entity_type text not null,related_entity_id text not null,reservation_id text references public.reservations(id)on delete restrict,guest_request_id uuid references public.guest_requests(id)on delete restrict,
 department text not null,severity text not null default 'normal'check(severity in('normal','high','critical')),reason text not null,requested_action jsonb not null default'{}',normal_policy_result jsonb not null default'{}',
 requested_by uuid not null references public.user_accounts(id)on delete restrict,requested_at timestamptz not null default now(),status text not null default'pending'check(status in('pending','approved','rejected','cancelled','expired')),
 reviewed_by uuid references public.user_accounts(id)on delete set null,reviewed_at timestamptz,decision_reason text,execution_status text not null default'pending_review'check(execution_status in('pending_review','awaiting_execution','executed','not_required','cancelled')),
 executed_by uuid references public.user_accounts(id)on delete set null,executed_at timestamptz,version integer not null default 1,updated_at timestamptz not null default now());
create unique index if not exists manager_approval_one_pending on public.manager_approval_requests(request_type,related_entity_type,related_entity_id)where status='pending';
create index if not exists manager_approval_queue_idx on public.manager_approval_requests(status,severity,requested_at desc);
create table if not exists public.manager_notes(id uuid primary key default gen_random_uuid(),approval_id uuid not null references public.manager_approval_requests(id)on delete restrict,note text not null,created_by uuid references public.user_accounts(id)on delete set null,created_at timestamptz not null default now());
alter table public.guest_requests add column if not exists severity text not null default'normal';
alter table public.guest_requests add column if not exists due_at timestamptz;
alter table public.guest_requests add column if not exists escalation_status text not null default'none';
alter table public.guest_requests add column if not exists escalated_by uuid references public.user_accounts(id)on delete set null;
alter table public.guest_requests add column if not exists escalated_at timestamptz;
alter table public.guest_requests add column if not exists manager_resolution text;
alter table public.guest_requests drop constraint if exists guest_requests_severity_check;
alter table public.guest_requests add constraint guest_requests_severity_check check(severity in('normal','high','critical'));
alter table public.guest_requests drop constraint if exists guest_requests_escalation_status_check;
alter table public.guest_requests add constraint guest_requests_escalation_status_check check(escalation_status in('none','escalated','coordinated','resolved'));
alter table public.reservations add column if not exists early_check_in_approved_until timestamptz;
alter table public.reservations add column if not exists late_checkout_until timestamptz;
alter table public.refund_requests add column if not exists exception_approval_id uuid references public.manager_approval_requests(id)on delete restrict;
alter table public.refund_requests add column if not exists normal_policy_amount numeric(12,2)not null default 0 check(normal_policy_amount>=0);
alter table public.financial_adjustments add column if not exists manager_approval_id uuid references public.manager_approval_requests(id)on delete restrict;
create unique index if not exists financial_adjustments_manager_approval_unique on public.financial_adjustments(manager_approval_id)where manager_approval_id is not null;
drop index if exists public.refund_requests_open_unique;
create unique index if not exists refund_requests_normal_open_unique on public.refund_requests(reservation_id)where status='pending'and exception_approval_id is null;
create unique index if not exists refund_requests_exception_unique on public.refund_requests(exception_approval_id)where exception_approval_id is not null;
alter table public.manager_approval_requests enable row level security;alter table public.manager_notes enable row level security;
revoke all on table public.manager_approval_requests,public.manager_notes from anon,authenticated;

create or replace function public.request_manager_approval(p_request_type text,p_related_entity_type text,p_related_entity_id text,p_reservation_id text,p_guest_request_id uuid,p_department text,p_severity text,p_reason text,p_requested_action jsonb,p_staff_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;g guest_requests%rowtype;aid uuid;normal_result jsonb:='{}';policy jsonb;deposit_paid numeric;normal_refund numeric;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','front_desk','housekeeping','maintenance','accounting')then raise exception'APPROVAL_REQUEST_FORBIDDEN';end if;
if p_request_type not in('room_upgrade','reservation_modification','early_check_in','late_checkout','guest_compensation','refund_exception','checkout_exception','guest_escalation')or nullif(trim(p_reason),'')is null then raise exception'INVALID_APPROVAL_REQUEST';end if;
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
insert into manager_approval_requests(request_type,related_entity_type,related_entity_id,reservation_id,guest_request_id,department,severity,reason,requested_action,normal_policy_result,requested_by)
values(p_request_type,p_related_entity_type,p_related_entity_id,p_reservation_id,p_guest_request_id,lower(trim(p_department)),p_severity,trim(p_reason),coalesce(p_requested_action,'{}'),normal_result,p_staff_user_id)returning id into aid;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'request_manager_approval','manager_approval',aid::text,jsonb_build_object('type',p_request_type,'reason',trim(p_reason),'relatedEntityId',p_related_entity_id));
return aid;exception when unique_violation then raise exception'APPROVAL_ALREADY_PENDING';end$$;

create or replace function public.review_manager_approval(p_approval_id uuid,p_decision text,p_reason text,p_expected_version integer,p_manager_user_id uuid)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;a manager_approval_requests%rowtype;r reservations%rowtype;available_same int;available_target int;inventory int;reserved int;held int;target_type text;requested_amount numeric;deposit_paid numeric;already_refunded numeric;i invoices%rowtype;rid uuid;begin
select role into actor from user_accounts where id=p_manager_user_id and active;if actor not in('owner','admin','manager')then raise exception'MANAGER_REVIEW_FORBIDDEN';end if;
if p_decision not in('approve','reject')or nullif(trim(p_reason),'')is null then raise exception'INVALID_MANAGER_DECISION';end if;
select * into a from manager_approval_requests where id=p_approval_id for update;if not found then raise exception'APPROVAL_NOT_FOUND';end if;
if a.status<>'pending'or a.version<>p_expected_version then raise exception'APPROVAL_ALREADY_REVIEWED';end if;if a.requested_by=p_manager_user_id then raise exception'SELF_APPROVAL_FORBIDDEN';end if;
if a.reservation_id is not null then select * into r from reservations where id=a.reservation_id for update;if not found then raise exception'APPROVAL_STALE';end if;end if;
if a.request_type in('room_upgrade','reservation_modification','early_check_in','late_checkout','checkout_exception')and r.status in('cancelled','no_show','checked_out')then raise exception'APPROVAL_STALE';end if;
if p_decision='approve'and a.request_type='room_upgrade'then
 target_type:=nullif(a.requested_action->>'requestedRoomType','');if target_type is null or target_type=r.room_type then raise exception'INVALID_UPGRADE_REQUEST';end if;
 select count(*)into available_same from rooms x where x.type=r.room_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
 if available_same>0 then raise exception'SAME_TYPE_ROOM_AVAILABLE';end if;
 select count(*)into available_target from rooms x where x.type=target_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
 if available_target=0 then raise exception'UPGRADE_ROOM_UNAVAILABLE';end if;
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

create or replace function public.front_desk_execute_manager_approval(p_approval_id uuid,p_room_id text,p_staff_user_id uuid)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;a manager_approval_requests%rowtype;r reservations%rowtype;oldroom rooms%rowtype;newroom rooms%rowtype;assignment reservation_room_assignments%rowtype;t room_types%rowtype;i invoices%rowtype;new_total numeric;new_paid numeric;available_same int;inventory int;reserved int;held int;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','front_desk')then raise exception'FRONT_DESK_EXECUTION_FORBIDDEN';end if;
select * into a from manager_approval_requests where id=p_approval_id for update;if not found or a.status<>'approved'or a.execution_status<>'awaiting_execution'then raise exception'APPROVAL_NOT_EXECUTABLE';end if;
select * into r from reservations where id=a.reservation_id for update;if not found or r.status in('cancelled','no_show','checked_out')then raise exception'APPROVAL_STALE';end if;
if a.request_type='room_upgrade'then
 select count(*)into available_same from rooms x where x.type=r.room_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);if available_same>0 then raise exception'APPROVAL_STALE';end if;
 select * into oldroom from rooms where id=r.room_id for update;select * into newroom from rooms where(id=p_room_id or number=p_room_id)for update;
 if not found or newroom.type<>(a.requested_action->>'requestedRoomType')or newroom.status<>'available'or newroom.housekeeping<>'clean'then raise exception'UPGRADE_ROOM_NOT_READY';end if;
 if exists(select 1 from maintenance_orders where room_id=newroom.id and status in('open','in_progress'))or exists(select 1 from reservation_room_assignments where room_id=newroom.id and reservation_id<>r.id and status='active'and check_in<r.check_out and check_out>r.check_in)then raise exception'UPGRADE_ROOM_UNAVAILABLE';end if;
 select * into assignment from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found then update reservation_room_assignments set status='reassigned',released_at=now(),reason=a.reason where id=assignment.id;end if;
 insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason,is_upgrade,authorized_by)values(r.id,newroom.id,r.check_in,r.check_out,p_staff_user_id,a.reason,true,a.reviewed_by);
 update reservations set room_id=newroom.id,room_number=newroom.number,room_type=newroom.type where id=r.id;update rooms set status=case when r.status='checked_in'then'occupied'else'reserved'end where id=newroom.id;if not coalesce((a.requested_action->>'waived')::boolean,false)and coalesce((a.requested_action->>'priceDifference')::numeric,0)>0 then select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,source_record_id)values(i.id,r.id,'Manager-approved room upgrade to '||newroom.type,'upgrade',round((a.requested_action->>'priceDifference')::numeric,2),p_staff_user_id,a.id,'manager_approval',a.id::text);update invoices set amount=round(amount+round((a.requested_action->>'priceDifference')::numeric,2),2)where id=i.id;perform sync_invoice_financials(i.id);end if;
 if oldroom.id is not null then update rooms set status='dirty',housekeeping='dirty'where id=oldroom.id;insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)values(oldroom.id,oldroom.number,'Manager-approved room-change turnover','high','pending','Before next arrival',a.reason);end if;
elsif a.request_type='reservation_modification'then
 if r.status not in('pending','confirmed')then raise exception'APPROVAL_STALE';end if;select * into t from room_types where name=coalesce(nullif(a.requested_action->>'roomType',''),r.room_type)and active;if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;perform pg_advisory_xact_lock(hashtextextended(t.name,0));perform expire_booking_holds();
 select count(*)into inventory from rooms x where x.type=t.name and x.status<>'maintenance'and((a.requested_action->>'checkIn')::date>current_date or x.housekeeping='clean');select count(*)into reserved from reservations y where y.id<>r.id and y.room_type=t.name and y.status in('pending','confirmed','checked_in')and y.check_in<(a.requested_action->>'checkOut')::date and y.check_out>(a.requested_action->>'checkIn')::date;select count(*)into held from booking_holds h where h.room_type=t.name and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<(a.requested_action->>'checkOut')::date and h.check_out>(a.requested_action->>'checkIn')::date;if inventory-reserved-held<=0 then raise exception'MODIFICATION_INVENTORY_UNAVAILABLE';end if;
 if r.room_id is not null then select * into oldroom from rooms where id=r.room_id for update;end if;new_total:=round(t.base_rate*((a.requested_action->>'checkOut')::date-(a.requested_action->>'checkIn')::date),2);select * into i from invoices where reservation_id=r.id for update;new_paid:=i.paid;
 update reservations set check_in=(a.requested_action->>'checkIn')::date,check_out=(a.requested_action->>'checkOut')::date,room_type=t.name,total=new_total,room_id=null,room_number=null where id=r.id;
 update invoices set amount=new_total,balance=greatest(new_total-new_paid,0),credit_balance=greatest(new_paid-new_total,0),status=case when new_paid>new_total then'credit'when new_paid=new_total then'paid'when new_paid>0 then'partial'else'unpaid'end where id=i.id;
 update reservation_room_assignments set status='cancelled',released_at=now(),reason='Reservation modification requires reassignment'where reservation_id=r.id and status='active';if oldroom.id is not null then update rooms set status=case when housekeeping='clean'then'available'else'dirty'end where id=oldroom.id and status='reserved';end if;
elsif a.request_type='early_check_in'then update reservations set early_check_in_approved_until=now()+interval'8 hours'where id=r.id;
elsif a.request_type='late_checkout'then if r.status<>'checked_in'or exists(select 1 from reservation_room_assignments ra where ra.room_id=r.room_id and ra.reservation_id<>r.id and ra.status='active'and ra.check_in<=((a.requested_action->>'requestedUntil')::timestamptz at time zone'Asia/Manila')::date and ra.check_out>r.check_out)then raise exception'APPROVAL_STALE';end if;update reservations set late_checkout_until=(a.requested_action->>'requestedUntil')::timestamptz where id=r.id;
elsif a.request_type='checkout_exception'then if r.status<>'checked_in'or nullif(a.requested_action->>'arrangement','')is null then raise exception'APPROVAL_STALE';end if;select * into oldroom from rooms where id=r.room_id for update;update reservations set status='checked_out',checked_out_at=now()where id=r.id;update rooms set status='dirty',housekeeping='dirty'where id=r.room_id;update reservation_room_assignments set status='released',released_at=now(),reason='Manager-approved checkout exception; balance remains collectible'where reservation_id=r.id and status='active';if not exists(select 1 from housekeeping_tasks where room_id=r.room_id and status in('pending','in_progress'))then insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)values(r.room_id,oldroom.number,'Checkout turnover','high','pending','Before next arrival','Checkout exception executed; folio balance retained: '||(a.requested_action->>'arrangement'));end if;
else raise exception'APPROVAL_REQUIRES_OTHER_DEPARTMENT';end if;
update manager_approval_requests set execution_status='executed',executed_by=p_staff_user_id,executed_at=now(),version=version+1,updated_at=now()where id=a.id;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'execute_manager_approval','manager_approval',a.id::text,jsonb_build_object('requestType',a.request_type,'reservationId',r.id,'roomId',p_room_id));
return jsonb_build_object('status','executed','requestType',a.request_type,'reservationId',r.id);end$$;

create or replace function public.front_desk_check_in(p_reservation_id text,p_room_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;room rooms%rowtype;i invoices%rowtype;policy jsonb;tz text;local_now timestamp;assignment reservation_room_assignments%rowtype;early_approved boolean;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','front_desk')then raise exception'CHECKIN_FORBIDDEN';end if;perform expire_booking_holds();
select * into r from reservations where id=p_reservation_id for update;if not found or r.status<>'confirmed'then raise exception'RESERVATION_NOT_CHECKIN_READY';end if;if r.guest_id is null or nullif(trim(r.guest_name),'')is null then raise exception'GUEST_DETAILS_REQUIRED';end if;
if lower(coalesce(r.source,''))='website'and coalesce(r.deposit_required,0)>0 and(coalesce(r.deposit,0)<r.deposit_required or r.payment_status not in('partial','paid','credit'))then raise exception'RESERVATION_DEPOSIT_REQUIRED';end if;
policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());tz:=coalesce(policy->>'hotelTimezone','Asia/Manila');local_now:=now()at time zone tz;early_approved:=coalesce(r.early_check_in_approved_until>now(),false);
if local_now::date<r.check_in or local_now::date>=r.check_out then raise exception'OUTSIDE_CHECKIN_WINDOW';end if;if local_now<(r.check_in+coalesce((policy->>'checkInTime')::time,'15:00'::time))and not coalesce((policy->>'earlyCheckInAllowed')::boolean,false)and not early_approved then raise exception'EARLY_CHECKIN_NOT_ALLOWED';end if;
if coalesce((policy->>'validIdRequired')::boolean,true)and r.identity_status<>'verified'then raise exception'IDENTITY_VERIFICATION_REQUIRED';end if;select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;if coalesce(i.balance,0)>0 then raise exception'REMAINING_BALANCE_REQUIRED';end if;
select * into room from rooms where id=p_room_id or number=p_room_id limit 1 for update;if not found or room.type<>r.room_type then raise exception'ROOM_TYPE_MISMATCH';end if;if room.status<>'available'or room.housekeeping<>'clean'then raise exception'ROOM_NOT_READY';end if;if exists(select 1 from maintenance_orders where room_id=room.id and status in('open','in_progress'))then raise exception'ROOM_UNDER_MAINTENANCE';end if;
if exists(select 1 from reservation_room_assignments where room_id=room.id and reservation_id<>r.id and status='active'and check_in<r.check_out and check_out>r.check_in)then raise exception'ROOM_ALREADY_ASSIGNED';end if;
select * into assignment from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found and assignment.room_id<>room.id then update reservation_room_assignments set status='reassigned',released_at=now(),reason='Changed during check-in'where id=assignment.id;assignment.id:=null;end if;
if assignment.id is null then insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason)values(r.id,room.id,r.check_in,r.check_out,p_staff_user_id,'Check-in assignment');end if;
update reservations set room_id=room.id,room_number=room.number,status='checked_in',checked_in_at=coalesce(checked_in_at,now())where id=r.id;update rooms set status='occupied'where id=room.id;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'reservation_check_in','reservation',r.id,jsonb_build_object('status',r.status,'roomId',r.room_id),jsonb_build_object('status','checked_in','roomId',room.id,'room',room.number,'managerEarlyApproval',early_approved));end$$;

create or replace function public.complete_housekeeping_task(p_task_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;t housekeeping_tasks%rowtype;blocked boolean;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','housekeeping')then raise exception'HOUSEKEEPING_COMPLETION_FORBIDDEN';end if;
select * into t from housekeeping_tasks where id=p_task_id for update;if not found then raise exception'TASK_NOT_FOUND';end if;update housekeeping_tasks set status='completed',completed_at=now()where id=t.id;
if t.room_id is not null then select exists(select 1 from maintenance_orders where room_id=t.room_id and status in('open','in_progress'))into blocked;update rooms set housekeeping='clean',status=case when blocked then'maintenance'else'available'end where id=t.room_id and status<>'occupied';end if;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'complete_housekeeping_task','housekeeping_task',t.id,jsonb_build_object('roomId',t.room_id));end$$;
create or replace function public.resolve_maintenance_order(p_order_id text,p_staff_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;m maintenance_orders%rowtype;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','maintenance')then raise exception'MAINTENANCE_RESOLUTION_FORBIDDEN';end if;
select * into m from maintenance_orders where id=p_order_id for update;if not found then raise exception'WORK_ORDER_NOT_FOUND';end if;update maintenance_orders set status='resolved',resolved_at=now()where id=m.id;
if m.room_id is not null then update rooms set status='dirty',housekeeping='dirty'where id=m.room_id and status<>'occupied';
if not exists(select 1 from housekeeping_tasks where room_id=m.room_id and status in('pending','in_progress'))then insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)select id,number,'Post-maintenance clean and readiness check','normal','pending','Before next arrival','Maintenance resolved; cleaning is required before return to service'from rooms where id=m.room_id;end if;end if;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'resolve_maintenance_order','maintenance_order',m.id,jsonb_build_object('roomId',m.room_id));end$$;

create or replace function public.manager_prioritize_housekeeping(p_task_id text,p_priority text,p_reason text,p_manager_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;t housekeeping_tasks%rowtype;begin select role into actor from user_accounts where id=p_manager_user_id and active;if actor not in('owner','admin','manager')then raise exception'MANAGER_COORDINATION_FORBIDDEN';end if;
if p_priority not in('normal','high','urgent')or nullif(trim(p_reason),'')is null then raise exception'INVALID_PRIORITY_COORDINATION';end if;select * into t from housekeeping_tasks where id=p_task_id for update;if not found or t.status='completed'then raise exception'TASK_NOT_COORDINATABLE';end if;
update housekeeping_tasks set priority=p_priority,notes=concat_ws(E'\n',notes,'Manager priority: '||trim(p_reason))where id=t.id;insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_manager_user_id,'manager_prioritize_housekeeping','housekeeping_task',t.id,jsonb_build_object('priority',t.priority),jsonb_build_object('priority',p_priority,'reason',trim(p_reason)));end$$;
create or replace function public.manager_escalate_maintenance(p_order_id text,p_priority text,p_reason text,p_manager_user_id uuid)returns void language plpgsql security definer set search_path=public as $$
declare actor text;m maintenance_orders%rowtype;begin select role into actor from user_accounts where id=p_manager_user_id and active;if actor not in('owner','admin','manager')then raise exception'MANAGER_COORDINATION_FORBIDDEN';end if;
if p_priority not in('high','urgent')or nullif(trim(p_reason),'')is null then raise exception'INVALID_MAINTENANCE_ESCALATION';end if;select * into m from maintenance_orders where id=p_order_id for update;if not found or m.status='resolved'then raise exception'WORK_ORDER_NOT_ESCALATABLE';end if;
update maintenance_orders set priority=p_priority,notes=concat_ws(E'\n',notes,'Manager escalation: '||trim(p_reason))where id=m.id;insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_manager_user_id,'manager_escalate_maintenance','maintenance_order',m.id,jsonb_build_object('priority',m.priority),jsonb_build_object('priority',p_priority,'reason',trim(p_reason)));end$$;

create or replace function public.accounting_execute_manager_financial_approval(p_approval_id uuid,p_staff_user_id uuid)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;a manager_approval_requests%rowtype;i invoices%rowtype;amount numeric;result jsonb;adjustment_id uuid;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','accounting')then raise exception'ACCOUNTING_EXECUTION_FORBIDDEN';end if;
select * into a from manager_approval_requests where id=p_approval_id for update;if not found or a.status<>'approved'or a.execution_status<>'awaiting_execution'or a.request_type<>'guest_compensation'then raise exception'APPROVAL_NOT_EXECUTABLE';end if;
select * into i from invoices where reservation_id=a.reservation_id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;amount:=coalesce((a.requested_action->>'amount')::numeric,0);if amount<=0 or amount>i.amount then raise exception'COMPENSATION_EXCEEDS_FOLIO';end if;
result:=accounting_record_adjustment(a.reservation_id,'credit','credit',amount,'Manager-approved service recovery: '||a.reason,a.id,p_staff_user_id);adjustment_id:=(result->>'adjustmentId')::uuid;
update financial_adjustments set manager_approval_id=a.id where id=adjustment_id and manager_approval_id is null;update manager_approval_requests set execution_status='executed',executed_by=p_staff_user_id,executed_at=now(),version=version+1,updated_at=now()where id=a.id;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'execute_manager_financial_approval','manager_approval',a.id::text,jsonb_build_object('adjustmentId',adjustment_id,'amount',amount,'reservationId',a.reservation_id));return result||jsonb_build_object('status','executed','approvalId',a.id);end$$;
revoke all on function public.accounting_execute_manager_financial_approval(uuid,uuid)from public;

create or replace function public.sync_manager_financial_execution()returns trigger language plpgsql security definer set search_path=public as $$
begin if new.status='processed'and old.status is distinct from new.status and new.exception_approval_id is not null then update manager_approval_requests set execution_status='executed',executed_by=new.processed_by,executed_at=new.processed_at,version=version+1,updated_at=now()where id=new.exception_approval_id and execution_status='awaiting_execution';end if;return new;end$$;
drop trigger if exists refund_completes_manager_approval on public.refund_requests;create trigger refund_completes_manager_approval after update on public.refund_requests for each row execute function public.sync_manager_financial_execution();
revoke all on function public.sync_manager_financial_execution()from public;

revoke all on function public.request_manager_approval(text,text,text,text,uuid,text,text,text,jsonb,uuid),public.review_manager_approval(uuid,text,text,integer,uuid),public.front_desk_execute_manager_approval(uuid,text,uuid),public.manager_prioritize_housekeeping(text,text,text,uuid),public.manager_escalate_maintenance(text,text,text,uuid),public.accounting_execute_manager_financial_approval(uuid,uuid)from public;
grant execute on function public.request_manager_approval(text,text,text,text,uuid,text,text,text,jsonb,uuid),public.review_manager_approval(uuid,text,text,integer,uuid),public.front_desk_execute_manager_approval(uuid,text,uuid),public.manager_prioritize_housekeeping(text,text,text,uuid),public.manager_escalate_maintenance(text,text,text,uuid),public.accounting_execute_manager_financial_approval(uuid,uuid)to service_role;

-- Manager SQL type cleanup and defense-in-depth RBAC. No data is rewritten.
create or replace function public.request_manager_approval(p_request_type text,p_related_entity_type text,p_related_entity_id text,p_reservation_id text,p_guest_request_id uuid,p_department text,p_severity text,p_reason text,p_requested_action jsonb,p_staff_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;g guest_requests%rowtype;aid uuid;normal_result jsonb:='{}'::jsonb;policy jsonb;deposit_paid numeric;normal_refund numeric;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','front_desk','housekeeping','maintenance','accounting')then raise exception'APPROVAL_REQUEST_FORBIDDEN';end if;
if p_request_type not in('room_upgrade','reservation_modification','early_check_in','late_checkout','guest_compensation','refund_exception','checkout_exception','guest_escalation')or nullif(trim(p_reason),'')is null then raise exception'INVALID_APPROVAL_REQUEST';end if;
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
insert into manager_approval_requests(request_type,related_entity_type,related_entity_id,reservation_id,guest_request_id,department,severity,reason,requested_action,normal_policy_result,requested_by)
values(p_request_type,p_related_entity_type,p_related_entity_id,p_reservation_id,p_guest_request_id,lower(trim(p_department)),p_severity,trim(p_reason),coalesce(p_requested_action,'{}'),normal_result,p_staff_user_id)returning id into aid;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'request_manager_approval','manager_approval',aid::text,jsonb_build_object('type',p_request_type,'reason',trim(p_reason),'relatedEntityId',p_related_entity_id));
return aid;exception when unique_violation then raise exception'APPROVAL_ALREADY_PENDING';end$$;

create or replace function public.front_desk_create_reservation(p_guest_name text,p_email text,p_phone text,p_room_type text,p_check_in date,p_check_out date,p_guest_count integer,p_source text,p_special_requests text,p_expected_arrival text,p_idempotency_key uuid,p_staff_user_id uuid)
returns table(reservation_id text,confirmation_number text,total numeric)language plpgsql security definer set search_path=public as $$
declare actor text;t room_types%rowtype;inventory int;reserved int;guest text;rid text;confirmation text;amount numeric;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','front_desk')then raise exception'STAFF_RESERVATION_FORBIDDEN';end if;
if p_check_in<(now()at time zone'Asia/Manila')::date or p_check_out<=p_check_in then raise exception'INVALID_DATES';end if;if p_guest_count<1 then raise exception'INVALID_GUEST_COUNT';end if;
if nullif(trim(p_guest_name),'')is null or nullif(trim(p_email),'')is null or nullif(trim(p_phone),'')is null then raise exception'INVALID_GUEST_DETAILS';end if;if p_source not in('Front Desk','Walk-In','Phone')then raise exception'INVALID_BOOKING_SOURCE';end if;
select id into rid from reservations where idempotency_key=p_idempotency_key;if found then return query select r.id,r.confirmation_number,r.total from reservations r where r.id=rid;return;end if;
perform pg_advisory_xact_lock(hashtextextended(lower(p_room_type),0));select * into t from room_types where name=p_room_type and active;if not found or p_guest_count>t.max_guests then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
select count(*)into inventory from rooms where type=p_room_type and status<>'maintenance';select count(*)into reserved from reservations where room_type=p_room_type and status in('pending','confirmed','checked_in')and check_in<p_check_out and check_out>p_check_in;
if inventory-reserved<=0 then raise exception'ROOM_TYPE_UNAVAILABLE';end if;amount:=round(t.base_rate*(p_check_out-p_check_in),2);
select id into guest from guests where lower(email)=lower(trim(p_email))limit 1 for update;if guest is null then insert into guests(name,email,phone)values(trim(p_guest_name),lower(trim(p_email)),trim(p_phone))returning id into guest;else update guests set name=trim(p_guest_name),phone=trim(p_phone)where id=guest;end if;
confirmation:='HVN-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
insert into reservations(guest_id,guest_name,guest_email,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,special_requests,expected_arrival,payment_status,confirmation_number,idempotency_key)
values(guest,trim(p_guest_name),lower(trim(p_email)),p_room_type,p_check_in,p_check_out,p_guest_count,'confirmed',p_source,amount,0,0,nullif(trim(p_special_requests),''),nullif(trim(p_expected_arrival),''),'unpaid',confirmation,p_idempotency_key)returning id into rid;
insert into invoices(reservation_id,guest_name,amount,paid,balance,status,due_date)values(rid,trim(p_guest_name),amount,0,amount,'unpaid',p_check_in);
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'create_staff_reservation','reservation',rid,jsonb_build_object('source',p_source,'roomType',p_room_type,'checkIn',p_check_in,'checkOut',p_check_out,'total',amount));return query select rid,confirmation,amount;end$$;

create or replace function public.process_refund(p_refund_id uuid,p_staff_user_id uuid,p_reference text)
returns table(refund_status text,refund_amount numeric,net_paid numeric)language plpgsql security definer set search_path=public as $$
declare actor text;rr refund_requests%rowtype;i invoices%rowtype;r reservations%rowtype;v_gross numeric;v_refunded numeric;v_net numeric;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','accounting')then raise exception'REFUND_PROCESSING_FORBIDDEN';end if;
 select * into rr from refund_requests where id=p_refund_id for update;if not found then raise exception'REFUND_NOT_FOUND';end if;
 select * into i from invoices where id=rr.invoice_id for update;select * into r from reservations where id=rr.reservation_id for update;
 select coalesce(sum(amount),0)into v_gross from payments where invoice_id=i.id and status='paid'and purpose<>'refund';
 select coalesce(sum(amount),0)into v_refunded from payments where invoice_id=i.id and status='paid'and purpose='refund';
 if rr.status='processed'then return query select rr.status,rr.eligible_amount,greatest(round(v_gross-v_refunded,2),0);return;end if;
 if rr.status not in('pending','failed')or rr.eligible_amount<=0 then raise exception'REFUND_NOT_PENDING';end if;
 if nullif(trim(p_reference),'')is null then raise exception'REFUND_REFERENCE_REQUIRED';end if;
 if round(v_refunded+rr.eligible_amount,2)>round(v_gross,2)then raise exception'REFUND_EXCEEDS_RECEIVED';end if;
 perform 1 from payments where idempotency_key=rr.id;
 if not found then insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,received_by,verified_at)values(i.id,r.id,rr.eligible_amount,'PHP','manual_refund',trim(p_reference),'refund','paid',rr.id,p_staff_user_id,now());end if;
 insert into refund_attempts(refund_request_id,status,reference,attempted_by)values(rr.id,'processed',trim(p_reference),p_staff_user_id);
 update refund_requests set status='processed',processed_by=p_staff_user_id,processed_at=now(),reference=trim(p_reference)where id=rr.id;
 select coalesce(sum(amount),0)into v_gross from payments where invoice_id=i.id and status='paid'and purpose<>'refund';
 select coalesce(sum(amount),0)into v_refunded from payments where invoice_id=i.id and status='paid'and purpose='refund';v_net:=greatest(round(v_gross-v_refunded,2),0);
 update invoices set paid=v_net,balance=0,credit_balance=0,status=case when v_net=0 then'refunded'else'partial_refund'end where id=i.id;
 update reservations set payment_status=case when v_net=0 then'refunded'else'partial_refund'end where id=r.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'process_refund','refund_request',rr.id::text,jsonb_build_object('reservationId',r.id,'amount',rr.eligible_amount,'reference',trim(p_reference)));
 return query select'processed'::text,rr.eligible_amount,v_net;end$$;
