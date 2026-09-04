-- Feature (DB): Grab-style transfer fare model at booking checkout, replacing the flat
-- transport_services catalogue (Feature 3). The guest picks a pickup address (drop-off is
-- fixed at the hotel) and a vehicle type; the server prices the ride from a TomTom
-- geocoded/routed distance + duration using base + per-km + per-minute + booking fee.
--
-- Design:
--  * transport_vehicle_types is the manager-maintained fare table (owner/admin/manager write
--    via upsert_transport_vehicle_type; service-role reads; RLS on, no table grants).
--  * transport_services is dropped. Holds/reservations freeze transport_lines as jsonb
--    {name,price,...} and never FK to the live catalogue, so existing history is untouched.
--  * The hotel drop-off origin (lat/lon/label) lives on the single-row
--    hotel_operational_policies table (key='default'), seeded to a placeholder the operator
--    replaces with the real hotel. Null coordinates => transfer not configured.
--  * A chosen ride stays one element of the existing transport_lines jsonb
--    {name,price,note,ride:{...}} with the fare already resolved server-side, so
--    verify_reservation_deposit / reverse_reservation_transport / TRANSPORT_REQUIRES_STAFF
--    all keep working unchanged.

-- Fare catalogue table
create table if not exists public.transport_vehicle_types(
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 description text,
 seats integer not null default 4 check(seats between 1 and 20),
 base_fare numeric(12,2) not null default 0 check(base_fare>=0),
 per_km numeric(12,2) not null default 0 check(per_km>=0),
 per_minute numeric(12,2) not null default 0 check(per_minute>=0),
 booking_fee numeric(12,2) not null default 0 check(booking_fee>=0),
 active boolean not null default true,
 sort integer not null default 0,
 version integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now());
insert into public.transport_vehicle_types(name,description,seats,base_fare,per_km,per_minute,booking_fee,sort)values
 ('4-seater','Compact sedan for up to 4 guests.',4,45,15,2,20,1),
 ('6-seater','Spacious MPV for up to 6 guests.',6,55,18,3,20,2),
 ('SUV / Van','Roomy SUV or van for up to 7 guests with luggage.',7,75,22,4,20,3)
 on conflict(name)do nothing;
alter table public.transport_vehicle_types enable row level security;
revoke all on table public.transport_vehicle_types from public,anon,authenticated;

-- Hotel drop-off origin (single-row operational policy). Operator updates to the real hotel.
alter table public.hotel_operational_policies add column if not exists transfer_hotel_lat numeric(9,6);
alter table public.hotel_operational_policies add column if not exists transfer_hotel_lon numeric(9,6);
alter table public.hotel_operational_policies add column if not exists transfer_hotel_label text;
update public.hotel_operational_policies set transfer_hotel_lat=14.5547,transfer_hotel_lon=121.0244,transfer_hotel_label='Haven Hotel, Ayala Avenue, Makati City' where key='default'and transfer_hotel_lat is null;

-- Retire the flat-price catalogue and its writer. Safe: lines are jsonb copies.
drop function if exists public.upsert_transport_service(uuid,text,text,numeric,text,boolean,integer,text,integer,uuid);
drop table if exists public.transport_services;

-- Catalog write RPC (owner/admin/manager), audited, optimistic version for updates.
-- Deactivation only -- never delete (house rules preserve history).
create or replace function public.upsert_transport_vehicle_type(p_id uuid,p_name text,p_description text,p_seats integer,p_base_fare numeric,p_per_km numeric,p_per_minute numeric,p_booking_fee numeric,p_active boolean,p_sort integer,p_reason text,p_expected_version integer,p_actor_user_id uuid)returns uuid language plpgsql security definer set search_path=public as $$
declare actor text;existing record;new_id uuid;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin','manager')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;
 if nullif(trim(p_name),'')is null or length(trim(p_name))>120 or length(trim(coalesce(p_description,'')))>500 or p_seats is null or p_seats<1 or p_seats>20 or p_base_fare is null or p_base_fare<0 or p_per_km is null or p_per_km<0 or p_per_minute is null or p_per_minute<0 or p_booking_fee is null or p_booking_fee<0 then raise exception'INVALID_TRANSPORT_VEHICLE_TYPE';end if;
 if p_id is null then
  if exists(select 1 from transport_vehicle_types where lower(name)=lower(trim(p_name)))then raise exception'TRANSPORT_VEHICLE_TYPE_NAME_TAKEN';end if;
  insert into transport_vehicle_types(name,description,seats,base_fare,per_km,per_minute,booking_fee,active,sort,version)
  values(trim(p_name),nullif(trim(coalesce(p_description,'')),''),p_seats,round(p_base_fare,2),round(p_per_km,2),round(p_per_minute,2),round(p_booking_fee,2),coalesce(p_active,true),coalesce(p_sort,0),1)returning id into new_id;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_actor_user_id,'create_transport_vehicle_type','transport_vehicle_type',new_id::text,jsonb_build_object('name',trim(p_name),'seats',p_seats,'baseFare',round(p_base_fare,2),'perKm',round(p_per_km,2),'perMinute',round(p_per_minute,2),'bookingFee',round(p_booking_fee,2)));
  return new_id;
 end if;
 select * into existing from transport_vehicle_types where id=p_id for update;if not found then raise exception'TRANSPORT_VEHICLE_TYPE_NOT_FOUND';end if;
 if existing.version<>p_expected_version then raise exception'TRANSPORT_VEHICLE_TYPE_STALE';end if;
 if exists(select 1 from transport_vehicle_types where id<>p_id and lower(name)=lower(trim(p_name)))then raise exception'TRANSPORT_VEHICLE_TYPE_NAME_TAKEN';end if;
 update transport_vehicle_types set name=trim(p_name),description=nullif(trim(coalesce(p_description,'')),''),seats=p_seats,base_fare=round(p_base_fare,2),per_km=round(p_per_km,2),per_minute=round(p_per_minute,2),booking_fee=round(p_booking_fee,2),active=coalesce(p_active,true),sort=coalesce(p_sort,0),version=existing.version+1,updated_at=now()where id=p_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_actor_user_id,'update_transport_vehicle_type','transport_vehicle_type',p_id::text,jsonb_build_object('name',trim(p_name),'seats',p_seats,'baseFare',round(p_base_fare,2),'perKm',round(p_per_km,2),'perMinute',round(p_per_minute,2),'bookingFee',round(p_booking_fee,2),'active',coalesce(p_active,true),'reason',nullif(trim(coalesce(p_reason,'')),''),'version',existing.version+1));
 return p_id;end$$;

-- Only the service role may call the new SECURITY DEFINER function.
revoke all on function public.upsert_transport_vehicle_type(uuid,text,text,integer,numeric,numeric,numeric,numeric,boolean,integer,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.upsert_transport_vehicle_type(uuid,text,text,integer,numeric,numeric,numeric,numeric,boolean,integer,text,integer,uuid) to service_role;
