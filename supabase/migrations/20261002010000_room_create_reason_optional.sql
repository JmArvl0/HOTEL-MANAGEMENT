-- Room creation no longer requires a user-entered reason: a room that does not
-- exist yet has no prior configuration to explain. The creation itself stays
-- fully audited (action admin_create_room with before_data null); after_data
-- carries the supplied reason only when one was given — never a fabricated
-- placeholder. Updates via admin_update_room_metadata still require a reason
-- and are untouched by this migration.
CREATE OR REPLACE FUNCTION public.admin_create_room(p_number text, p_type text, p_floor integer, p_wing text, p_designation text, p_active boolean, p_reason text, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$declare actor text;v_number text;v_rate numeric(12,2);r rooms%rowtype;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin','manager')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;
 v_number:=nullif(trim(p_number),'');if v_number is null or p_floor is null or p_floor<0 or nullif(trim(p_type),'')is null then raise exception'INVALID_ROOM_CONFIGURATION';end if;
 select base_rate into v_rate from room_types where name=p_type;if not found then raise exception'ROOM_TYPE_NOT_FOUND';end if;
 if exists(select 1 from rooms where number=v_number)then raise exception'ROOM_NUMBER_TAKEN';end if;
 begin
  insert into rooms(number,floor,type,rate,wing,administrative_designation,administratively_active,configuration_version)
  values(v_number,p_floor,p_type,v_rate,nullif(trim(p_wing),''),nullif(trim(p_designation),''),coalesce(p_active,true),1)returning * into r;
 exception when unique_violation then raise exception'ROOM_NUMBER_TAKEN';end;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_create_room','room',r.id,null,to_jsonb(r)-'id'||case when nullif(trim(p_reason),'')is null then '{}'::jsonb else jsonb_build_object('reason',trim(p_reason)) end);
 return jsonb_build_object('id',r.id,'number',r.number,'version',r.configuration_version);end$function$;

revoke all on function public.admin_create_room(text, text, integer, text, text, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_create_room(text, text, integer, text, text, boolean, text, uuid) to service_role;
