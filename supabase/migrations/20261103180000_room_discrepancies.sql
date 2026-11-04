begin;

create table public.room_discrepancies(
 id uuid primary key default gen_random_uuid(),
 room_id text not null references public.rooms(id) on delete restrict,
 task_id text references public.housekeeping_tasks(id) on delete set null,
 reservation_id text references public.reservations(id) on delete set null,
 observed_occupancy text not null check(observed_occupancy in('occupied','vacant','uncertain')),
 system_snapshot jsonb not null,
 reason text not null check(char_length(trim(reason)) between 3 and 500),
 status text not null default 'open' check(status in('open','investigating','resolved')),
 reported_by uuid not null references public.user_accounts(id),
 reported_at timestamptz not null default now(),
 investigator_id uuid references public.user_accounts(id),
 investigated_at timestamptz,
 resolution_reason text,
 resolved_by uuid references public.user_accounts(id),
 resolved_at timestamptz,
 handover_id uuid not null references public.hotel_handovers(id) on delete restrict,
 version integer not null default 1 check(version>0),
 check((status='resolved')=(resolved_at is not null)),
 check(resolved_at is null or (resolved_by is not null and nullif(trim(resolution_reason),'') is not null))
);
create index room_discrepancies_active_room_idx on public.room_discrepancies(room_id,reported_at desc) where status<>'resolved';
create index room_discrepancies_queue_idx on public.room_discrepancies(status,reported_at desc);
alter table public.room_discrepancies enable row level security;
revoke all on public.room_discrepancies from public,anon,authenticated;
grant all on public.room_discrepancies to service_role;

create function public.hotel_room_discrepancy_snapshot(p_room_id text)
returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('roomStatus',room.status,'housekeeping',room.housekeeping,
  'assignmentId',assignment.id,'reservationId',reservation.id,'reservationStatus',reservation.status,
  'reservationFingerprint',case when reservation.id is null then null else md5(to_jsonb(reservation)::text) end,
  'expectedOccupancy',case when room.status='occupied' or reservation.status='checked_in' then 'occupied' else 'vacant' end)
 from rooms room
 left join lateral(select a.id,a.reservation_id from reservation_room_assignments a where a.room_id=room.id and a.status='active' order by a.assigned_at desc limit 1)assignment on true
 left join reservations reservation on reservation.id=assignment.reservation_id
 where room.id=p_room_id
$$;

create function public.hotel_room_discrepancy_report(
 p_room_id text,p_observed_occupancy text,p_reason text,p_task_id text,p_key uuid,p_actor uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor_role text;room rooms%rowtype;snapshot jsonb;result jsonb;discrepancy room_discrepancies%rowtype;handover_id uuid;payload jsonb;
begin
 actor_role:=hotel_actor(p_actor,array['housekeeping','front_desk','manager','owner']);
 if p_observed_occupancy not in('occupied','vacant','uncertain') then raise exception 'INVALID_OBSERVED_OCCUPANCY';end if;
 if char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'DISCREPANCY_REASON_REQUIRED';end if;
 payload:=jsonb_build_object('roomId',p_room_id,'observedOccupancy',p_observed_occupancy,'reason',trim(p_reason),'taskId',p_task_id);
 result:=hotel_request_result(p_key,'room_discrepancy_report',p_room_id,p_actor,payload);
 if result is not null then return result;end if;
 select * into room from rooms where id=p_room_id for update;
 if not found then raise exception 'ROOM_NOT_FOUND';end if;
 if p_task_id is not null and not exists(select 1 from housekeeping_tasks where id=p_task_id and room_id=room.id) then raise exception 'TASK_ROOM_MISMATCH';end if;
 snapshot:=hotel_room_discrepancy_snapshot(room.id);
 if p_observed_occupancy<>'uncertain' and p_observed_occupancy=(snapshot->>'expectedOccupancy') then raise exception 'NO_ROOM_DISCREPANCY';end if;
 insert into hotel_handovers(text,assigned_role,created_by,updated_by,room_id,task_id,status)
 values('Room occupancy discrepancy: '||room.number||' reported '||p_observed_occupancy||'. '||trim(p_reason),'front_desk',p_actor,p_actor,room.id,p_task_id,'open') returning id into handover_id;
 insert into room_discrepancies(room_id,task_id,reservation_id,observed_occupancy,system_snapshot,reason,reported_by,handover_id)
 values(room.id,p_task_id,nullif(snapshot->>'reservationId',''),p_observed_occupancy,snapshot,trim(p_reason),p_actor,handover_id) returning * into discrepancy;
 result:=jsonb_build_object('id',discrepancy.id,'roomId',room.id,'roomNumber',room.number,'observedOccupancy',discrepancy.observed_occupancy,
  'systemSnapshot',discrepancy.system_snapshot,'reason',discrepancy.reason,'status',discrepancy.status,'version',discrepancy.version,'reportedAt',discrepancy.reported_at);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
 values(p_actor,'room_discrepancy_report','room_discrepancy',discrepancy.id::text,result||jsonb_build_object('taskId',p_task_id,'handoverId',handover_id));
 insert into hotel_operation_requests values(p_key,'room_discrepancy_report',room.id,p_actor,payload,result,now());
 return result;
end$$;

create function public.hotel_room_discrepancy_list(p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 perform hotel_actor(p_actor,array['front_desk','manager','owner']);
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'roomId',d.room_id,'roomNumber',r.number,'taskId',d.task_id,
  'reservationId',d.reservation_id,'observedOccupancy',d.observed_occupancy,'systemSnapshot',d.system_snapshot,
  'reason',d.reason,'status',d.status,'reportedAt',d.reported_at,'reporter',u.name,'investigatorId',d.investigator_id,
  'investigatedAt',d.investigated_at,'resolutionReason',d.resolution_reason,'resolvedAt',d.resolved_at,
  'handoverId',d.handover_id,'version',d.version) order by d.reported_at desc),'[]'::jsonb) into result
 from room_discrepancies d join rooms r on r.id=d.room_id left join user_accounts u on u.id=d.reported_by
 where d.status<>'resolved';
 return jsonb_build_object('assessedAt',now(),'items',result);
end$$;

create function public.hotel_room_discrepancy_update(
 p_discrepancy_id uuid,p_action text,p_reason text,p_version integer,p_key uuid,p_actor uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare d room_discrepancies%rowtype;room rooms%rowtype;snapshot jsonb;handover hotel_handovers%rowtype;result jsonb;payload jsonb;
begin
 perform hotel_actor(p_actor,array['front_desk']);
 if p_action not in('investigate','resolve') then raise exception 'INVALID_DISCREPANCY_ACTION';end if;
 if char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'DISCREPANCY_REASON_REQUIRED';end if;
 payload:=jsonb_build_object('action',p_action,'reason',nullif(trim(p_reason),''),'version',p_version);
 result:=hotel_request_result(p_key,'room_discrepancy_update',p_discrepancy_id::text,p_actor,payload);
 if result is not null then return result;end if;
 select * into d from room_discrepancies where id=p_discrepancy_id for update;
 if not found or d.status='resolved' then raise exception 'DISCREPANCY_NOT_OPEN';end if;
 if d.version<>p_version then raise exception 'STALE_VERSION';end if;
 select * into room from rooms where id=d.room_id for update;
 snapshot:=hotel_room_discrepancy_snapshot(room.id);
 select * into handover from hotel_handovers where id=d.handover_id for update;
 if p_action='investigate' then
  update room_discrepancies set status='investigating',investigator_id=p_actor,investigated_at=now(),system_snapshot=snapshot,
   reservation_id=nullif(snapshot->>'reservationId',''),version=version+1 where id=d.id returning * into d;
  if found and handover.status<>'resolved' then update hotel_handovers set status='in_progress',updated_by=p_actor,updated_at=now(),version=version+1 where id=handover.id;end if;
 else
  if d.status<>'investigating' then raise exception 'DISCREPANCY_INVESTIGATION_REQUIRED';end if;
  if snapshot is distinct from d.system_snapshot then raise exception 'DISCREPANCY_STALE';end if;
  update room_discrepancies set status='resolved',resolution_reason=trim(p_reason),resolved_by=p_actor,resolved_at=now(),version=version+1 where id=d.id returning * into d;
  update hotel_handovers set status='resolved',updated_by=p_actor,updated_at=now(),version=version+1 where id=handover.id and status<>'resolved';
 end if;
 result:=jsonb_build_object('id',d.id,'status',d.status,'systemSnapshot',d.system_snapshot,'version',d.version,'resolutionReason',d.resolution_reason);
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
 values(p_actor,'room_discrepancy_'||p_action,'room_discrepancy',d.id::text,to_jsonb(handover),result||jsonb_build_object('reason',nullif(trim(p_reason),'')));
 insert into hotel_operation_requests values(p_key,'room_discrepancy_update',d.id::text,p_actor,payload,result,now());
 return result;
end$$;

-- Lock the room before checking assignment/readiness so reports and arrivals serialize.
create function public.hotel_room_discrepancy_assignment_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='active' and exists(select 1 from room_discrepancies where room_id=new.room_id and status<>'resolved') then
  raise exception 'ROOM_DISCREPANCY_OPEN';
 end if;
 return new;
end$$;
create trigger hotel_room_discrepancy_assignment_guard before insert or update of room_id,status on public.reservation_room_assignments
 for each row execute function public.hotel_room_discrepancy_assignment_guard();

create function public.hotel_room_discrepancy_checkin_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.status is distinct from 'checked_in' and new.status='checked_in' and new.room_id is not null
  and exists(select 1 from room_discrepancies where room_id=new.room_id and status<>'resolved') then
  raise exception 'ROOM_DISCREPANCY_OPEN';
 end if;
 return new;
end$$;
create trigger hotel_room_discrepancy_checkin_guard before update of status on public.reservations
 for each row when(new.status='checked_in') execute function public.hotel_room_discrepancy_checkin_guard();

do $$declare body text;patched text;begin
 select pg_get_functiondef('public.front_desk_room_is_eligible(text,text)'::regprocedure) into body;
 patched:=replace(body,'and not maintenance_room_is_blocked(x.id)',E'and not maintenance_room_is_blocked(x.id)\n      and not exists(select 1 from room_discrepancies d where d.room_id=x.id and d.status<>''resolved'')');
 if patched=body then raise exception 'ROOM_DISCREPANCY_ELIGIBILITY_BODY_UNEXPECTED';end if;
 execute patched;
end$$;

do $$declare body text;patched text;old_clause text:='or maintenance_room_is_blocked(room.id) then ci:=array_append(ci,''ROOM_NOT_READY'');end if;';begin
 select pg_get_functiondef('public.hotel_reservation_readiness(text,uuid,text)'::regprocedure) into body;
 patched:=replace(body,old_clause,old_clause||'if exists(select 1 from room_discrepancies d where d.room_id=room.id and d.status<>''resolved'') then ci:=array_append(ci,''ROOM_DISCREPANCY_OPEN'');end if;');
 if patched=body then raise exception 'ROOM_DISCREPANCY_READINESS_BODY_UNEXPECTED';end if;
 execute patched;
end$$;

do $$declare name text;fn record;begin
 foreach name in array array['hotel_room_discrepancy_snapshot','hotel_room_discrepancy_report','hotel_room_discrepancy_list',
  'hotel_room_discrepancy_update','hotel_room_discrepancy_assignment_guard','hotel_room_discrepancy_checkin_guard'] loop
  for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=name loop
   execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
   execute format('grant execute on function %s to service_role',fn.signature);
  end loop;
 end loop;
end$$;

commit;
