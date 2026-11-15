begin;

alter table public.payments add constraint payment_amount_positive_cents
  check (amount is not null and amount::text not in ('NaN','Infinity','-Infinity') and amount > 0 and amount = round(amount,2)) not valid;
alter table public.reservations add constraint reservation_positive_party check (guests is not null and guests > 0) not valid;

create table public.auth_request_budgets (
  operation text not null,
  dimension text not null check (dimension in ('email','ip')),
  subject text not null,
  window_start timestamptz not null,
  attempts integer not null,
  primary key (operation,dimension,subject,window_start)
);
create index auth_request_budgets_expiry on public.auth_request_budgets(window_start);
alter table public.auth_request_budgets enable row level security;
revoke all on public.auth_request_budgets from public,anon,authenticated,service_role;

create function public.consume_auth_request_budget(p_operation text,p_subject text,p_network text)
returns boolean language plpgsql security definer set search_path=public as $$
declare window_start_at timestamptz; item record; attempts_after int; allowed boolean:=true;
begin
  if p_operation is null or p_operation not in ('login','register','password_reset') or
     p_subject is null or p_subject !~ '^[a-f0-9]{64}$' or (p_network is not null and p_network !~ '^[a-f0-9]{64}$') then
    raise exception 'INVALID_AUTH_BUDGET';
  end if;
  window_start_at:=date_bin(case when p_operation='login' then interval '15 minutes' else interval '1 hour' end,
    clock_timestamp(),'2000-01-01T00:00:00Z');
  for item in select * from (values
    ('email',p_subject,case p_operation when 'login' then 10 when 'register' then 4 else 5 end),
    ('ip',p_network,case p_operation when 'login' then 60 when 'register' then 20 else 30 end)
  ) limits(dimension,subject,budget) where limits.subject is not null loop
    insert into auth_request_budgets(operation,dimension,subject,window_start,attempts)
      values(p_operation,item.dimension,item.subject,window_start_at,1)
      on conflict(operation,dimension,subject,window_start) do update
      set attempts=least(auth_request_budgets.attempts+1,item.budget+1)
      returning attempts into attempts_after;
    allowed:=allowed and attempts_after<=item.budget;
  end loop;
  return allowed;
end $$;

create function public.cleanup_auth_request_budgets()
returns void language sql security definer set search_path=public as $$
  delete from auth_request_budgets where window_start < now()-interval '48 hours';
$$;

-- A newly registered account gets a distinct profile. Historic CRM contacts and links
-- stay with their original records until the existing reviewed merge is used.
alter table public.guests add column unverified_contact_email text;

create or replace function public.register_guest_account(p_first_name text,p_last_name text,p_email text,p_phone text,p_password_hash text)
returns uuid language plpgsql security definer set search_path=public as $$
declare uid uuid; gid text; email_value text:=lower(trim(p_email)); full_name text:=trim(p_first_name||' '||p_last_name);
begin
  if nullif(trim(p_first_name),'') is null or nullif(trim(p_last_name),'') is null or
    email_value is null or email_value !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or
    coalesce(p_phone,'') !~ '^\+[1-9][0-9]{7,14}$' or length(coalesce(p_password_hash,''))<>60 then
    raise exception 'INVALID_REGISTRATION';
  end if;
  begin
    insert into user_accounts(email,name,role,password_hash,active)
      values(email_value,full_name,'guest',p_password_hash,true) returning id into uid;
  exception when unique_violation then raise exception 'ACCOUNT_EXISTS';
  end;
  begin
    insert into guests(name,first_name,last_name,email,unverified_contact_email,phone,user_account_id)
      values(full_name,trim(p_first_name),trim(p_last_name),email_value,email_value,p_phone,uid) returning id into gid;
  exception when unique_violation then
    insert into guests(name,first_name,last_name,unverified_contact_email,phone,user_account_id)
      values(full_name,trim(p_first_name),trim(p_last_name),email_value,p_phone,uid) returning id into gid;
  end;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
    values(uid,'register_guest_account','user_account',uid::text,jsonb_build_object('guestId',gid,'role','guest'));
  return uid;
end $$;

create or replace function public.catalog_effective_amenities(p_standard jsonb,p_additions jsonb,p_exclusions jsonb)
returns jsonb language sql immutable set search_path=public as $$
  with combined as (
    select distinct on (lower(a.value#>>'{}')) a.value,a.ordinal
    from jsonb_array_elements(catalog_normalize_amenities(p_standard)||catalog_normalize_amenities(p_additions))
      with ordinality a(value,ordinal)
    order by lower(a.value#>>'{}'),a.ordinal
  )
  select coalesce(jsonb_agg(a.value order by a.ordinal),'[]')
  from combined a
  where not exists(select 1 from jsonb_array_elements(catalog_normalize_amenities(p_exclusions)) x
    where lower(x.value#>>'{}')=lower(a.value#>>'{}'));
$$;

create table public.catalog_room_photo_uploads (
  object_path text primary key,
  uploader uuid references public.user_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  deletion_requested_at timestamptz
);
alter table public.catalog_room_photo_uploads enable row level security;
revoke all on public.catalog_room_photo_uploads from public,anon,authenticated,service_role;

create function public.catalog_photo_key(p_url text)
returns text language sql immutable set search_path=public as $$
  select substring(p_url from '/storage/v1/object/public/room-photos/([0-9a-f-]{36}\.(?:webp|jpg|png))(?:$|[?#])');
$$;

create function public.catalog_stage_room_photo(p_actor uuid,p_path text)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform catalog_actor(p_actor);
  if p_path is null or p_path !~ '^[0-9a-f-]{36}\.webp$' then raise exception 'INVALID_ROOM_PHOTO'; end if;
  insert into catalog_room_photo_uploads(object_path,uploader) values(p_path,p_actor);
end $$;

create function public.catalog_request_room_photo_deletion(p_actor uuid,p_path text)
returns void language plpgsql security definer set search_path=public as $$
declare staged catalog_room_photo_uploads%rowtype;
begin
  perform catalog_actor(p_actor);
  perform pg_advisory_xact_lock(hashtextextended('catalog-photo:'||p_path,0));
  select * into staged from catalog_room_photo_uploads where object_path=p_path;
  if not found or staged.uploader is distinct from p_actor then raise exception 'ROOM_PHOTO_NOT_FOUND'; end if;
  if exists(select 1 from room_types t,unnest(t.photo_urls) u where catalog_photo_key(u)=p_path) then
    raise exception 'ROOM_PHOTO_IN_USE';
  end if;
  update catalog_room_photo_uploads set deletion_requested_at=coalesce(deletion_requested_at,now()) where object_path=p_path;
end $$;

create function public.catalog_guard_type_commitments()
returns trigger language plpgsql security definer set search_path=public as $$
declare photo_key text; today date;
begin
  if tg_op='UPDATE' then
    if new.max_guests<old.max_guests or new.amenities is distinct from old.amenities then
      perform catalog_lock_room_types(array[old.name,new.name]);
    end if;
    if new.max_guests<old.max_guests then
      today:=hotel_today(current_operational_policy_snapshot());
      if exists(select 1 from booking_holds h where h.room_type=old.name and h.status in ('active','payment_submitted')
          and h.expires_at>now() and h.guest_count>new.max_guests)
        or exists(select 1 from reservations r where r.room_type=old.name and r.guests>new.max_guests and
          (r.status='checked_in' or (r.status in ('confirmed','pending') and r.check_out>=today and
            (r.status='confirmed' or lower(coalesce(r.source,''))<>'website' or r.payment_due_at is null or r.payment_due_at>now())))) then
        raise exception 'ROOM_TYPE_CAPACITY_COMMITMENT';
      end if;
    end if;
    if new.amenities is distinct from old.amenities and exists(select 1 from rooms r where r.type=old.name
        and jsonb_array_length(catalog_effective_amenities(new.amenities,r.amenity_additions,r.amenity_exclusions))>100) then
      raise exception 'ROOM_AMENITY_EFFECTIVE_LIMIT';
    end if;
    if new.photo_urls is not distinct from old.photo_urls then return new; end if;
  end if;
  for photo_key in select distinct catalog_photo_key(u) from unnest(new.photo_urls) u
    where catalog_photo_key(u) is not null order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended('catalog-photo:'||photo_key,0));
    if exists(select 1 from catalog_room_photo_uploads where object_path=photo_key and deletion_requested_at is not null) then
      raise exception 'ROOM_PHOTO_REMOVED';
    end if;
  end loop;
  return new;
end $$;

create trigger zz_audit_room_type_catalog_guard before insert or update of max_guests,amenities,photo_urls
  on public.room_types for each row execute function public.catalog_guard_type_commitments();

create function public.catalog_guard_effective_room_amenities()
returns trigger language plpgsql security definer set search_path=public as $$
declare standard jsonb;
begin
  perform catalog_lock_room_types(array[new.type]);
  select amenities into standard from room_types where name=new.type;
  if jsonb_array_length(catalog_effective_amenities(standard,new.amenity_additions,new.amenity_exclusions))>100 then
    raise exception 'ROOM_AMENITY_EFFECTIVE_LIMIT';
  end if;
  return new;
end $$;

create trigger zz_audit_room_effective_amenity_guard before insert or update of type,amenity_additions,amenity_exclusions
  on public.rooms for each row execute function public.catalog_guard_effective_room_amenities();

revoke all on function public.consume_auth_request_budget(text,text,text),public.cleanup_auth_request_budgets(),
  public.catalog_stage_room_photo(uuid,text),public.catalog_request_room_photo_deletion(uuid,text) from public,anon,authenticated;
grant execute on function public.consume_auth_request_budget(text,text,text),public.cleanup_auth_request_budgets(),
  public.catalog_stage_room_photo(uuid,text),public.catalog_request_room_photo_deletion(uuid,text) to service_role;

revoke all on function public.catalog_guard_type_commitments(),public.catalog_guard_effective_room_amenities()
  from public,anon,authenticated,service_role;

create or replace function public.maintenance_update_asset(p_actor uuid, p_asset_id uuid, p_name text, p_category text, p_room_id text, p_location text, p_service_interval_days integer, p_notes text)
returns void language plpgsql security definer set search_path=public as $$
declare actor text; asset maintenance_assets%rowtype;
begin
  select role into actor from user_accounts where id=p_actor and active;
  if actor is null or actor not in('maintenance','manager') then raise exception'ASSET_REGISTRY_FORBIDDEN'; end if;
  if (p_name is not null and (nullif(trim(p_name),'') is null or length(trim(p_name))>120))
     or (p_category is not null and (nullif(trim(p_category),'') is null or length(trim(p_category))>80))
     or (p_service_interval_days is not null and p_service_interval_days not between 1 and 3650) then raise exception'INVALID_ASSET'; end if;
  if nullif(trim(p_room_id),'') is not null and not exists(select 1 from rooms where id=p_room_id) then raise exception'ROOM_NOT_FOUND'; end if;
  select * into asset from maintenance_assets where id=p_asset_id for update;
  if not found then raise exception'ASSET_NOT_FOUND'; end if;
  if not asset.active then raise exception'ASSET_INACTIVE'; end if;
  update maintenance_assets set
    name=coalesce(nullif(trim(p_name),''),name),
    category=coalesce(nullif(trim(p_category),''),category),
    room_id=case when p_room_id is null then room_id else nullif(trim(p_room_id),'') end,
    location=coalesce(nullif(trim(p_location),''),location),
    service_interval_days=coalesce(p_service_interval_days,service_interval_days),
    notes=case when nullif(trim(p_notes),'') is not null then trim(p_notes) else notes end,
    updated_at=now()
  where id=p_asset_id;
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor,'maintenance_update_asset','maintenance_asset',p_asset_id,
         to_jsonb(asset),
         jsonb_build_object('name',coalesce(nullif(trim(p_name),''),asset.name),'category',coalesce(nullif(trim(p_category),''),asset.category),'roomId',case when p_room_id is null then asset.room_id else nullif(trim(p_room_id),'') end,'location',coalesce(nullif(trim(p_location),''),asset.location),'serviceIntervalDays',coalesce(p_service_interval_days,asset.service_interval_days)));
end$$;

commit;
