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