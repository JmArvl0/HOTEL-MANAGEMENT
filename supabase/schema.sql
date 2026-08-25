-- Haven Hotel Management System — Supabase/PostgreSQL schema
-- Paste this entire file into Supabase > SQL Editor and select Run.
create extension if not exists pgcrypto;

create table if not exists app_users (
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
  reference text, received_by uuid references app_users(id), created_at timestamptz not null default now()
);
create table if not exists inventory (
  id text primary key default ('ITM-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  name text not null, category text not null, quantity numeric(12,2) not null default 0, reorder_point numeric(12,2) not null default 0,
  unit text not null, status text default 'healthy' check (status in ('healthy','low','out')), unit_cost numeric(12,2) default 0,
  vendor_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists staff (
  id text primary key default ('STF-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  user_id uuid references app_users(id) on delete set null, name text not null, role text not null, department text,
  shift text, attendance text default 'Scheduled', status text default 'off_duty' check (status in ('off_duty','on_duty','on_leave')),
  created_at timestamptz not null default now()
);
create table if not exists guest_requests (
  id uuid primary key default gen_random_uuid(), reservation_id text references reservations(id) on delete cascade,
  guest_id text references guests(id) on delete set null, request text not null, department text not null,
  priority text default 'normal', status text default 'open', assigned_to uuid references app_users(id), created_at timestamptz default now()
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
  total numeric(12,2) default 0, items jsonb not null default '[]', ordered_by uuid references app_users(id), created_at timestamptz default now()
);
create table if not exists audit_logs (
  id bigint generated always as identity primary key, user_id uuid references app_users(id) on delete set null,
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
alter table app_users enable row level security;
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

-- First owner account. Change both email and password immediately after first login.
insert into app_users (email, name, role, password_hash)
values ('owner@yourhotel.com', 'Hotel Owner', 'owner', crypt('ChangeMe123!', gen_salt('bf')))
on conflict (email) do nothing;
