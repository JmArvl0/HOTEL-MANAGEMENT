-- Follow-up to 20260932010000: align the four asset-registry RPC guards with
-- the governance boundary every route under app/api/maintenance already keeps
-- (and that lib/admin-governance.test.ts / lib/owner-governance.test.ts pin):
-- departmental staff operate departmental workflows — maintenance technicians
-- and the operations Manager. Owner/Admin supervise through their executive
-- surfaces and never operate them. Same bodies, narrower actor set.

create or replace function public.maintenance_register_asset(p_actor uuid, p_name text, p_category text, p_room_id text, p_location text, p_last_serviced_at date, p_service_interval_days integer, p_notes text)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor text; asset_id uuid; room rooms%rowtype;
begin
  select role into actor from user_accounts where id=p_actor and active;
  if actor is null or actor not in('maintenance','manager') then raise exception'ASSET_REGISTRY_FORBIDDEN'; end if;
  if nullif(trim(p_name),'') is null or length(trim(p_name))>120
     or nullif(trim(p_category),'') is null or length(trim(p_category))>80
     or p_service_interval_days is null or p_service_interval_days not between 1 and 3650
     or p_last_serviced_at is not null and p_last_serviced_at > current_date then raise exception'INVALID_ASSET'; end if;
  if p_room_id is not null then
    select * into room from rooms where id=p_room_id limit 1;
    if not found then raise exception'ROOM_NOT_FOUND'; end if;
  end if;
  insert into maintenance_assets(name,category,room_id,location,last_serviced_at,service_interval_days,notes,registered_by)
  values(trim(p_name),trim(p_category),nullif(trim(p_room_id),''),nullif(trim(p_location),''),p_last_serviced_at,p_service_interval_days,nullif(trim(p_notes),''),p_actor)
  returning id into asset_id;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
  values(p_actor,'maintenance_register_asset','maintenance_asset',asset_id,
         jsonb_build_object('name',trim(p_name),'category',trim(p_category),'roomId',nullif(trim(p_room_id),''),'serviceIntervalDays',p_service_interval_days,'lastServicedAt',p_last_serviced_at,'active',true));
  return asset_id;
end$$;

create or replace function public.maintenance_record_asset_service(p_actor uuid, p_asset_id uuid, p_service_date date, p_notes text)
returns date language plpgsql security definer set search_path=public as $$
declare actor text; asset maintenance_assets%rowtype;
begin
  select role into actor from user_accounts where id=p_actor and active;
  if actor is null or actor not in('maintenance','manager') then raise exception'ASSET_REGISTRY_FORBIDDEN'; end if;
  if p_service_date is null or p_service_date > current_date then raise exception'INVALID_SERVICE_DATE'; end if;
  select * into asset from maintenance_assets where id=p_asset_id for update;
  if not found then raise exception'ASSET_NOT_FOUND'; end if;
  if not asset.active then raise exception'ASSET_INACTIVE'; end if;
  update maintenance_assets set last_serviced_at=p_service_date,updated_at=now() where id=p_asset_id;
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor,'maintenance_record_asset_service','maintenance_asset',p_asset_id,
         jsonb_build_object('lastServicedAt',asset.last_serviced_at,'nextServiceDate',asset.next_service_date),
         jsonb_build_object('lastServicedAt',p_service_date,'nextServiceDate',p_service_date+asset.service_interval_days,'note',nullif(trim(p_notes),'')));
  return p_service_date+asset.service_interval_days;
end$$;

create or replace function public.maintenance_update_asset(p_actor uuid, p_asset_id uuid, p_name text, p_category text, p_room_id text, p_location text, p_service_interval_days integer, p_notes text)
returns void language plpgsql security definer set search_path=public as $$
declare actor text; asset maintenance_assets%rowtype;
begin
  select role into actor from user_accounts where id=p_actor and active;
  if actor is null or actor not in('maintenance','manager') then raise exception'ASSET_REGISTRY_FORBIDDEN'; end if;
  if (p_name is not null and (nullif(trim(p_name),'') is null or length(trim(p_name))>120))
     or (p_category is not null and (nullif(trim(p_category),'') is null or length(trim(p_category))>80))
     or (p_service_interval_days is not null and p_service_interval_days not between 1 and 3650) then raise exception'INVALID_ASSET'; end if;
  if p_room_id is not null and not exists(select 1 from rooms where id=p_room_id) then raise exception'ROOM_NOT_FOUND'; end if;
  select * into asset from maintenance_assets where id=p_asset_id for update;
  if not found then raise exception'ASSET_NOT_FOUND'; end if;
  if not asset.active then raise exception'ASSET_INACTIVE'; end if;
  update maintenance_assets set
    name=coalesce(nullif(trim(p_name),''),name),
    category=coalesce(nullif(trim(p_category),''),category),
    room_id=coalesce(nullif(trim(p_room_id),''),room_id),
    location=coalesce(nullif(trim(p_location),''),location),
    service_interval_days=coalesce(p_service_interval_days,service_interval_days),
    notes=case when nullif(trim(p_notes),'') is not null then trim(p_notes) else notes end,
    updated_at=now()
  where id=p_asset_id;
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor,'maintenance_update_asset','maintenance_asset',p_asset_id,
         to_jsonb(asset),
         jsonb_build_object('name',coalesce(nullif(trim(p_name),''),asset.name),'category',coalesce(nullif(trim(p_category),''),asset.category),'roomId',coalesce(nullif(trim(p_room_id),''),asset.room_id),'location',coalesce(nullif(trim(p_location),''),asset.location),'serviceIntervalDays',coalesce(p_service_interval_days,asset.service_interval_days)));
end$$;

create or replace function public.maintenance_deactivate_asset(p_actor uuid, p_asset_id uuid, p_reason text)
returns void language plpgsql security definer set search_path=public as $$
declare actor text; asset maintenance_assets%rowtype;
begin
  select role into actor from user_accounts where id=p_actor and active;
  if actor is null or actor not in('maintenance','manager') then raise exception'ASSET_REGISTRY_FORBIDDEN'; end if;
  if nullif(trim(p_reason),'') is null then raise exception'INVALID_ASSET'; end if;
  select * into asset from maintenance_assets where id=p_asset_id for update;
  if not found then raise exception'ASSET_NOT_FOUND'; end if;
  if not asset.active then raise exception'ASSET_INACTIVE'; end if;
  update maintenance_assets set active=false,updated_at=now() where id=p_asset_id;
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor,'maintenance_deactivate_asset','maintenance_asset',p_asset_id,
         to_jsonb(asset),jsonb_build_object('active',false,'reason',trim(p_reason)));
end$$;

revoke all on function public.maintenance_register_asset(uuid,text,text,text,text,date,integer,text) from public,anon,authenticated;
revoke all on function public.maintenance_record_asset_service(uuid,uuid,date,text) from public,anon,authenticated;
revoke all on function public.maintenance_update_asset(uuid,uuid,text,text,text,text,integer,text) from public,anon,authenticated;
revoke all on function public.maintenance_deactivate_asset(uuid,uuid,text) from public,anon,authenticated;
revoke execute on function public.maintenance_register_asset(uuid,text,text,text,text,date,integer,text) from anon,authenticated;
revoke execute on function public.maintenance_record_asset_service(uuid,uuid,date,text) from anon,authenticated;
revoke execute on function public.maintenance_update_asset(uuid,uuid,text,text,text,text,integer,text) from anon,authenticated;
revoke execute on function public.maintenance_deactivate_asset(uuid,uuid,text) from anon,authenticated;
grant execute on function public.maintenance_register_asset(uuid,text,text,text,text,date,integer,text),
  public.maintenance_record_asset_service(uuid,uuid,date,text),
  public.maintenance_update_asset(uuid,uuid,text,text,text,text,integer,text),
  public.maintenance_deactivate_asset(uuid,uuid,text) to service_role;
