-- Live ledger checked through 20261111040000. Serialize configuration and booking claims.
begin;
create function public.catalog_lock_room_types(p_names text[]) returns void language plpgsql security definer set search_path=public as $$
declare item text;begin
 for item in select distinct lower(name) from unnest(p_names) name where name is not null order by lower(name) loop
  perform pg_advisory_xact_lock(hashtextextended(item,0));
 end loop;
end $$;
revoke all on function public.catalog_lock_room_types(text[]) from public,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_create_room(p_number text, p_type text, p_floor integer, p_wing text, p_designation text, p_active boolean, p_reason text, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$declare actor text;v_number text;v_rate numeric(12,2);r rooms%rowtype;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin','manager')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;
 perform catalog_actor(p_actor_user_id);
 perform catalog_lock_room_types(array[p_type]);
 v_number:=nullif(trim(p_number),'');if v_number is null or p_floor is null or p_floor<0 or nullif(trim(p_type),'')is null then raise exception'INVALID_ROOM_CONFIGURATION';end if;
 select base_rate into v_rate from room_types where name=p_type;if not found then raise exception'ROOM_TYPE_NOT_FOUND';end if;
 if exists(select 1 from rooms where number=v_number)then raise exception'ROOM_NUMBER_TAKEN';end if;
 begin
  insert into rooms(number,floor,type,rate,wing,administrative_designation,administratively_active,configuration_version)
  values(v_number,p_floor,p_type,v_rate,nullif(trim(p_wing),''),nullif(trim(p_designation),''),coalesce(p_active,true),1)returning * into r;
 exception when unique_violation then raise exception'ROOM_NUMBER_TAKEN';end;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_create_room','room',r.id,null,to_jsonb(r)-'id'||case when nullif(trim(p_reason),'')is null then '{}'::jsonb else jsonb_build_object('reason',trim(p_reason)) end);
 return jsonb_build_object('id',r.id,'number',r.number,'version',r.configuration_version);end$function$;

CREATE OR REPLACE FUNCTION public.admin_update_room_metadata(p_room_id text, p_floor integer, p_type text, p_wing text, p_designation text, p_active boolean, p_reason text, p_expected_version integer, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$declare actor text;r rooms%rowtype;observed_type text;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin','manager')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;perform catalog_actor(p_actor_user_id);select type into observed_type from rooms where id=p_room_id;perform catalog_lock_room_types(array[observed_type,p_type]);if p_floor<0 or nullif(trim(p_type),'')is null or nullif(trim(p_reason),'')is null or not exists(select 1 from room_types where name=p_type)then raise exception'INVALID_ROOM_CONFIGURATION';end if;select * into r from rooms where id=p_room_id for update;if not found then raise exception'ROOM_NOT_FOUND';end if;if r.configuration_version is distinct from p_expected_version then raise exception'ROOM_CONFIGURATION_STALE';end if;
 if p_type is distinct from r.type and(exists(select 1 from reservation_room_assignments a where a.room_id=r.id and a.status='active')or exists(select 1 from reservations x where x.room_id=r.id and x.status in('pending','confirmed','checked_in')))then raise exception'ROOM_HAS_FUTURE_COMMITMENT';end if;
 if not p_active and(r.status in('occupied','reserved')or exists(select 1 from reservation_room_assignments a where a.room_id=r.id and a.status='active')or exists(select 1 from reservations x where x.room_id=r.id and x.status in('pending','confirmed','checked_in')))then raise exception'ROOM_HAS_ACTIVE_ASSIGNMENT';end if;
 update rooms set floor=p_floor,type=p_type,wing=nullif(trim(p_wing),''),administrative_designation=nullif(trim(p_designation),''),administratively_active=p_active,deactivated_at=case when p_active then null when r.administratively_active then now() else r.deactivated_at end,deactivation_reason=case when p_active then null else trim(p_reason) end,configuration_version=configuration_version+1,updated_at=now()where id=r.id;insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_update_room_metadata','room',r.id,jsonb_build_object('floor',r.floor,'type',r.type,'active',r.administratively_active),jsonb_build_object('floor',p_floor,'type',p_type,'active',p_active,'wing',nullif(trim(p_wing),''),'designation',nullif(trim(p_designation),''),'reason',trim(p_reason)));return jsonb_build_object('id',r.id,'version',r.configuration_version+1);end$function$;

create or replace function public.catalog_save_room(p_room text,p_body jsonb,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r rooms%rowtype; result jsonb; target text; extra jsonb; excluded jsonb; before_extra jsonb; before_excluded jsonb;
begin
  perform catalog_actor(p_actor);
  if p_room is not null then
    select * into r from rooms where id=p_room;
    if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  end if;
  perform catalog_lock_room_types(array[r.type,p_body->>'type']);
  if p_room is not null then select * into r from rooms where id=p_room for update; end if;
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

create or replace function public.catalog_update_room_type(p_type uuid,p_body jsonb,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;type_name text;
begin
  perform catalog_actor(p_actor);
  select name into type_name from room_types where id=p_type;
  perform catalog_lock_room_types(array[type_name]);
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

create or replace function public.create_exact_booking_hold(p_user_id uuid,p_room_id text,p_details jsonb,p_replace_token uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare room rooms%rowtype; v_token uuid; old booking_holds%rowtype; cin date:=(p_details->>'checkIn')::date; cout date:=(p_details->>'checkOut')::date;
begin
 select * into room from rooms where id=p_room_id;
 if not found or room.type is distinct from p_details->>'roomType' then raise exception 'EXACT_ROOM_UNAVAILABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(room.type),0));
 -- Metadata may have committed while this request waited for the type mutex.
 select * into room from rooms where id=p_room_id;
 if not found or room.type is distinct from p_details->>'roomType' then raise exception 'EXACT_ROOM_UNAVAILABLE'; end if;
 if p_replace_token is not null then
   select * into old from booking_holds where token=p_replace_token and user_id=p_user_id for update;
   if not found or old.status<>'active' or old.expires_at<=now() or old.selected_room_id is distinct from room.id then raise exception 'HOLD_NOT_FOUND'; end if;
   update booking_holds set status='expired' where token=old.token;
 end if;
 if not guest_room_is_free(room.id,cin,cout) then raise exception 'EXACT_ROOM_UNAVAILABLE'; end if;
 v_token:=create_booking_hold(p_user_id=>p_user_id,p_room_type=>room.type,p_check_in=>cin,p_check_out=>cout,
 p_guest_count=>(p_details->>'guests')::integer,p_first_name=>p_details->>'firstName',p_last_name=>p_details->>'lastName',
 p_email=>p_details->>'email',p_mobile=>p_details->>'mobile',p_address=>p_details->>'address',p_nationality=>p_details->>'nationality',
 p_expected_arrival=>p_details->>'expectedArrival',p_request_options=>coalesce(p_details->'requestOptions','[]'::jsonb),
 p_transport_lines=>'[]'::jsonb,p_transportation_preferences=>nullif(p_details->'transportationPreferences','null'::jsonb),p_special_requests=>p_details->>'specialRequests');
 update booking_holds set selected_room_id=room.id,selected_room_number=room.number where booking_holds.token=v_token;
 return v_token;
end $$;
notify pgrst,'reload schema';
commit;
