-- Feature (DB): manager-configured guest request catalog.
-- The portal Requests module previously offered the hardcoded
-- PORTAL_REQUEST_VALUES list (lib/request-options.ts). Now a catalog table
-- owns what guests may select: the manager adds/deactivates types, and both
-- the /api/account/requests validation and guest_request_route consult it.
-- Design mirrors transport_vehicle_types (RLS on, no table grants,
-- service-role access only). guest_requests history never FKs to the catalog,
-- so deactivating or deleting a type cannot strand old rows.

create table if not exists public.guest_request_catalog(
 id uuid primary key default gen_random_uuid(),
 value text not null unique,
 label text not null,
 department text not null default 'front_desk' check(department in('front_desk','housekeeping','maintenance')),
 active boolean not null default true,
 sort_order integer not null default 0,
 created_at timestamptz not null default now());
insert into public.guest_request_catalog(value,label,department,sort_order)values
 ('extra_towels','Extra towels','housekeeping',1),
 ('extra_pillows','Extra pillows','housekeeping',2),
 ('toiletries','Toiletries','housekeeping',3),
 ('housekeeping','Housekeeping request','housekeeping',4),
 ('maintenance','Maintenance concern','maintenance',5),
 ('room_assistance','Room assistance','front_desk',6),
 ('room_change','Room change request','front_desk',7),
 ('stay_extension','Stay extension request','front_desk',8),
 ('late_check_out','Late check-out request','front_desk',9),
 ('general','General hotel assistance','front_desk',10)
 on conflict(value)do nothing;
alter table public.guest_request_catalog enable row level security;
revoke all on table public.guest_request_catalog from public,anon,authenticated;

-- Routing now prefers an active catalog row (manager-controlled label +
-- department, including custom types) and falls back to the previous CASE for
-- anything else (e.g. checkout auto-filed types not in the catalog).
create or replace function public.guest_request_route(p_request_type text)
returns table(department text,label text) language sql security definer set search_path=public as $$
select coalesce(
  (select g.department from public.guest_request_catalog g where g.value=p_request_type and g.active limit 1),
  case p_request_type
   when'extra_towels'then 'housekeeping' when'extra_pillows'then 'housekeeping'
   when'toiletries'then 'housekeeping' when'baby_crib'then 'housekeeping'
   when'housekeeping'then 'housekeeping' when'maintenance'then 'maintenance'
   else 'front_desk' end),
 coalesce(
  (select g.label from public.guest_request_catalog g where g.value=p_request_type and g.active limit 1),
  case p_request_type
   when'extra_towels'then 'Extra towels' when'extra_pillows'then 'Extra pillows'
   when'toiletries'then 'Toiletries' when'baby_crib'then 'Baby crib'
   when'housekeeping'then 'Housekeeping request' when'maintenance'then 'Maintenance concern'
   when'room_assistance'then 'Room assistance' when'room_change'then 'Room change request'
   when'stay_extension'then 'Stay extension request' when'general'then 'General hotel assistance'
   when'high_floor_quiet'then 'High floor / quiet room request'
   when'early_check_in'then 'Early check-in request' when'late_check_out'then 'Late check-out request'
   when'celebration'then 'Celebration arrangement request'
   else replace(p_request_type,'_',' ') end);$$;
