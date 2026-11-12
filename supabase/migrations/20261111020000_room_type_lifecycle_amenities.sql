begin;

alter table public.room_types add column archived_at timestamptz;
alter table public.room_types add column archive_reason text;
alter table public.room_types add constraint archived_room_types_inactive check (archived_at is null or not active);
alter table public.rooms add column amenity_additions jsonb not null default '[]';
alter table public.rooms add column amenity_exclusions jsonb not null default '[]';
alter table public.booking_holds add column amenity_snapshot jsonb;
alter table public.reservations add column amenity_snapshot jsonb;

-- Do not backfill the vestigial rooms.amenities field or invent historical promises.
create function public.catalog_normalize_amenities(p_value jsonb)
returns jsonb language plpgsql immutable set search_path=public as $$
declare result jsonb;
begin
  if jsonb_typeof(coalesce(p_value,'[]')) <> 'array'
    or jsonb_array_length(coalesce(p_value,'[]')) > 100 then raise exception 'INVALID_ROOM_AMENITIES'; end if;
  if exists(select 1 from jsonb_array_elements(coalesce(p_value,'[]')) a
    where jsonb_typeof(a.value)<>'string' or length(trim(a.value#>>'{}')) not between 1 and 100)
    then raise exception 'INVALID_ROOM_AMENITIES'; end if;
  select coalesce(jsonb_agg(label order by ordinal),'[]') into result from (
    select distinct on (lower(regexp_replace(trim(value#>>'{}'),'\s+',' ','g')))
      regexp_replace(trim(value#>>'{}'),'\s+',' ','g') label,ordinal
    from jsonb_array_elements(coalesce(p_value,'[]')) with ordinality a(value,ordinal)
    order by lower(regexp_replace(trim(value#>>'{}'),'\s+',' ','g')),ordinal
  ) normalized;
  return result;
end $$;

create function public.catalog_effective_amenities(p_standard jsonb,p_additions jsonb,p_exclusions jsonb)
returns jsonb language sql immutable set search_path=public as $$
  select coalesce(jsonb_agg(a.value order by a.ordinal),'[]')
  from jsonb_array_elements(catalog_normalize_amenities(coalesce(p_standard,'[]')||coalesce(p_additions,'[]')))
    with ordinality a(value,ordinal)
  where not exists(select 1 from jsonb_array_elements(catalog_normalize_amenities(p_exclusions)) x
    where lower(x.value#>>'{}')=lower(a.value#>>'{}'));
$$;

create function public.catalog_actor(p_actor uuid,p_admin_only boolean default false)
returns text language plpgsql stable security definer set search_path=public as $$
declare actor text;
begin
  select role into actor from user_accounts where id=p_actor and active and not coalesce(recovery_required,false);
  if actor is null or actor not in ('owner','admin','manager') or (p_admin_only and actor='manager')
    then raise exception 'ADMIN_AUTHORITY_REQUIRED'; end if;
  return actor;
end $$;

create function public.catalog_room_has_commitment(p_room text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from reservations r where r.room_id=p_room
    and (r.status='checked_in' or r.check_out>hotel_today())
    and (r.status in ('confirmed','checked_in') or (r.status='pending' and
      (lower(coalesce(r.source,''))<>'website' or r.payment_due_at is null or r.payment_due_at>now()))))
  or exists(select 1 from reservation_room_assignments a join reservations r on r.id=a.reservation_id
    where a.room_id=p_room and a.status='active' and (r.status='checked_in' or a.check_out>hotel_today())
    and r.status in ('pending','confirmed','checked_in'))
  or exists(select 1 from booking_holds h where h.selected_room_id=p_room and h.reservation_id is null
    and h.status in ('active','payment_submitted') and h.expires_at>now());
$$;

create function public.catalog_type_has_commitment(p_type text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from reservations r where r.room_type=p_type
    and (r.status='checked_in' or r.check_out>hotel_today())
    and (r.status in ('confirmed','checked_in') or (r.status='pending' and
      (lower(coalesce(r.source,''))<>'website' or r.payment_due_at is null or r.payment_due_at>now()))))
  or exists(select 1 from booking_holds h where h.room_type=p_type and h.reservation_id is null
    and h.status in ('active','payment_submitted') and h.expires_at>now())
  or exists(select 1 from rooms r where r.type=p_type and catalog_room_has_commitment(r.id));
$$;

create function public.catalog_room_type_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.amenities:=catalog_normalize_amenities(new.amenities);
  if tg_op='UPDATE' then
    if old.archived_at is not null and new is distinct from old then raise exception 'ROOM_TYPE_ARCHIVED'; end if;
    if new.amenities is distinct from catalog_normalize_amenities(old.amenities)
      and catalog_type_has_commitment(old.name)
      and coalesce(current_setting('haven.catalog_amenity_review',true),'')<>'acknowledged'
      then raise exception 'ROOM_AMENITY_REVIEW_REQUIRED'; end if;
    if new.archived_at is not null and old.archived_at is null then
      if exists(select 1 from rooms r where r.type=old.name and r.administratively_active)
        then raise exception 'ROOM_TYPE_HAS_ACTIVE_ROOMS'; end if;
      if catalog_type_has_commitment(old.name) then raise exception 'ROOM_TYPE_HAS_COMMITMENTS'; end if;
    end if;
  end if;
  return new;
end $$;
create trigger room_type_lifecycle_guard before insert or update on public.room_types
for each row execute function public.catalog_room_type_guard();

create function public.catalog_room_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare t room_types%rowtype;
begin
  new.amenity_additions:=catalog_normalize_amenities(new.amenity_additions);
  new.amenity_exclusions:=catalog_normalize_amenities(new.amenity_exclusions);
  if exists(select 1 from jsonb_array_elements_text(new.amenity_additions) a
    join jsonb_array_elements_text(new.amenity_exclusions) x on lower(a.value)=lower(x.value))
    then raise exception 'ROOM_AMENITY_CONFLICT'; end if;
  if tg_op='INSERT' or new.type is distinct from old.type then
    select * into t from room_types where name=new.type for key share;
    if not found then raise exception 'ROOM_TYPE_NOT_FOUND'; end if;
    if t.archived_at is not null then raise exception 'ROOM_TYPE_ARCHIVED'; end if;
  end if;
  if tg_op='UPDATE' then
    if (new.type is distinct from old.type or (old.administratively_active and not new.administratively_active))
      and catalog_room_has_commitment(old.id) then raise exception 'ROOM_HAS_FUTURE_COMMITMENT'; end if;
    if (new.amenity_additions is distinct from old.amenity_additions or new.amenity_exclusions is distinct from old.amenity_exclusions)
      and catalog_room_has_commitment(old.id)
      and coalesce(current_setting('haven.catalog_amenity_review',true),'')<>'acknowledged'
      then raise exception 'ROOM_AMENITY_REVIEW_REQUIRED'; end if;
  end if;
  return new;
end $$;
create trigger physical_room_catalog_guard before insert or update of type,administratively_active,amenity_additions,amenity_exclusions on public.rooms
for each row execute function public.catalog_room_guard();

create function public.catalog_archive_room_type(p_type uuid,p_version integer,p_reason text,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t room_types%rowtype;
begin
  perform catalog_actor(p_actor,true);
  if length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'INVALID_ROOM_TYPE_CONFIGURATION'; end if;
  select * into t from room_types where id=p_type;
  if not found then raise exception 'ROOM_TYPE_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(lower(t.name),0));
  select * into t from room_types where id=p_type for update;
  if t.version is distinct from p_version then raise exception 'ROOM_TYPE_STALE'; end if;
  if t.archived_at is not null then raise exception 'ROOM_TYPE_ARCHIVED'; end if;
  if exists(select 1 from room_rate_proposals where room_type_id=t.id and status='pending')
    then raise exception 'RATE_APPROVAL_PENDING'; end if;
  update room_types set active=false,archived_at=now(),archive_reason=trim(p_reason),version=version+1,updated_at=now() where id=t.id;
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor,'archive_room_type','room_type',t.id::text,to_jsonb(t),jsonb_build_object('reason',trim(p_reason),'archived',true));
  return jsonb_build_object('id',t.id,'version',t.version+1);
end $$;

-- Keep existing rate/badge/activation governance in the existing root RPC.
create function public.catalog_update_room_type(p_type uuid,p_body jsonb,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  perform catalog_actor(p_actor);
  perform set_config('haven.catalog_amenity_review',case when p_body->>'acknowledgeAmenities'='true' then 'acknowledged' else '' end,true);
  result:=admin_update_room_type(p_room_type_id=>p_type,p_description=>p_body->>'description',p_max_guests=>(p_body->>'maxGuests')::int,
    p_beds=>p_body->>'beds',p_size_sqm=>(p_body->>'sizeSqm')::int,p_amenities=>p_body->'amenities',
    p_base_rate=>(p_body->>'baseRate')::numeric,p_active=>(p_body->>'active')::boolean,p_reason=>p_body->>'reason',
    p_expected_version=>(p_body->>'version')::int,p_actor_user_id=>p_actor,
    p_photo_urls=>case when p_body ? 'photoUrls' then array(select jsonb_array_elements_text(p_body->'photoUrls')) else null end,
    p_badge_color_key=>p_body->>'badgeColorKey');
  perform set_config('haven.catalog_amenity_review','',true);
  return result;
end $$;

create function public.catalog_save_room(p_room text,p_body jsonb,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r rooms%rowtype; result jsonb; target text; extra jsonb; excluded jsonb; before_extra jsonb; before_excluded jsonb;
begin
  perform catalog_actor(p_actor);
  if p_room is not null then
    select * into r from rooms where id=p_room for update;
    if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  end if;
  extra:=catalog_normalize_amenities(coalesce(p_body->'amenityAdditions',r.amenity_additions,'[]'));
  excluded:=catalog_normalize_amenities(coalesce(p_body->'amenityExclusions',r.amenity_exclusions,'[]'));
  before_extra:=r.amenity_additions;before_excluded:=r.amenity_exclusions;
  perform set_config('haven.catalog_amenity_review',case when p_body->>'acknowledgeAmenities'='true' then 'acknowledged' else '' end,true);
  if p_room is null then
    result:=admin_create_room(p_number=>p_body->>'number',p_type=>p_body->>'type',p_floor=>(p_body->>'floor')::int,
      p_wing=>p_body->>'wing',p_designation=>p_body->>'designation',p_active=>coalesce((p_body->>'active')::boolean,true),
      p_reason=>p_body->>'reason',p_actor_user_id=>p_actor);
    target:=result->>'id';
  else
    result:=admin_update_room_metadata(p_room_id=>p_room,p_floor=>(p_body->>'floor')::int,p_type=>p_body->>'type',
      p_wing=>p_body->>'wing',p_designation=>p_body->>'designation',p_active=>(p_body->>'active')::boolean,
      p_reason=>p_body->>'reason',p_expected_version=>(p_body->>'version')::int,p_actor_user_id=>p_actor);
    target:=p_room;
  end if;
  update rooms set amenity_additions=extra,amenity_exclusions=excluded where id=target;
  if extra is distinct from coalesce(before_extra,'[]') or excluded is distinct from coalesce(before_excluded,'[]') then
    insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
    values(p_actor,'room_amenity_overrides','room',target,jsonb_build_object('additions',before_extra,'exclusions',before_excluded),
      jsonb_build_object('additions',extra,'exclusions',excluded,'reason',p_body->>'reason',
        'reviewedUpcomingStays',p_body->>'acknowledgeAmenities'='true'));
  end if;
  perform set_config('haven.catalog_amenity_review','',true);
  return result;
end $$;

create function public.room_amenity_snapshot(p_room text,p_type text)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('roomType',t.name,'roomId',r.id,'standard',catalog_normalize_amenities(t.amenities),
    'additions',coalesce(r.amenity_additions,'[]'),'exclusions',coalesce(r.amenity_exclusions,'[]'),
    'effective',catalog_effective_amenities(t.amenities,r.amenity_additions,r.amenity_exclusions),'capturedAt',now())
  from room_types t left join rooms r on r.id=p_room and r.type=t.name where t.name=p_type;
$$;

create function public.capture_hold_amenities()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='INSERT' or new.selected_room_id is distinct from old.selected_room_id or new.room_type is distinct from old.room_type then
    new.amenity_snapshot:=room_amenity_snapshot(new.selected_room_id,new.room_type);
  end if;
  return new;
end $$;
create trigger capture_hold_amenities before insert or update of selected_room_id,room_type on public.booking_holds
for each row execute function public.capture_hold_amenities();

create function public.capture_reservation_amenities()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.amenity_snapshot:=room_amenity_snapshot(new.room_id,new.room_type);
  return new;
end $$;
create trigger capture_reservation_amenities before insert on public.reservations
for each row execute function public.capture_reservation_amenities();

create function public.copy_booked_amenities()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.reservation_id is not null and old.reservation_id is null then
    update reservations set amenity_snapshot=new.amenity_snapshot where id=new.reservation_id;
  end if;
  return new;
end $$;
create trigger copy_booked_amenities after update of reservation_id on public.booking_holds
for each row execute function public.copy_booked_amenities();

create function public.guest_room_choices_with_amenities(p_type text,p_in date,p_out date,p_hold uuid default null,p_user uuid default null)
returns table(id text,number text,floor integer,available boolean,amenities jsonb,amenity_additions jsonb,amenity_exclusions jsonb)
language sql stable security definer set search_path=public as $$
  select c.id,c.number,c.floor,c.available,catalog_effective_amenities(t.amenities,r.amenity_additions,r.amenity_exclusions),
    r.amenity_additions,r.amenity_exclusions
  from guest_room_choices(p_type,p_in,p_out,p_hold,p_user) c join rooms r on r.id=c.id join room_types t on t.name=r.type;
$$;

-- All reads and mutations remain behind the service-role server boundary.
do $$declare f record;begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
    ('catalog_normalize_amenities','catalog_effective_amenities','catalog_actor','catalog_room_has_commitment',
     'catalog_type_has_commitment','catalog_room_type_guard','catalog_room_guard','catalog_archive_room_type',
     'catalog_update_room_type','catalog_save_room','room_amenity_snapshot','capture_hold_amenities',
     'capture_reservation_amenities','copy_booked_amenities','guest_room_choices_with_amenities')
  loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);end loop;
end $$;

commit;
