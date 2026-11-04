begin;

create table public.reservation_service_conditions(
 id uuid primary key default gen_random_uuid(),
 reservation_id text not null references public.reservations(id) on delete restrict,
 condition_type text not null check(condition_type='dnd'),
 status text not null default 'active' check(status in('active','cleared')),
 reason text not null check(char_length(trim(reason)) between 3 and 500),
 set_by uuid not null references public.user_accounts(id),
 set_at timestamptz not null default now(),
 cleared_by uuid references public.user_accounts(id),
 cleared_at timestamptz,
 clear_reason text,
 version integer not null default 1 check(version>0),
 check((status='cleared')=(cleared_at is not null)),
 check(cleared_at is null or nullif(trim(clear_reason),'') is not null)
);
create unique index reservation_one_active_dnd on public.reservation_service_conditions(reservation_id,condition_type) where status='active';
create index reservation_service_conditions_history_idx on public.reservation_service_conditions(reservation_id,set_at desc);
alter table public.reservation_service_conditions enable row level security;
revoke all on public.reservation_service_conditions from public,anon,authenticated;
grant all on public.reservation_service_conditions to service_role;

alter table public.housekeeping_tasks add column service_outcome text;
alter table public.housekeeping_tasks add column service_outcome_note text;
alter table public.housekeeping_tasks add column service_outcome_at timestamptz;
alter table public.housekeeping_tasks add column service_outcome_by uuid references public.user_accounts(id);
alter table public.housekeeping_tasks add column service_due_at timestamptz;
alter table public.housekeeping_tasks add constraint housekeeping_service_outcome_valid check(service_outcome is null or service_outcome in('service_declined','late_service','other'));

create function public.hotel_reservation_service_condition_read(p_reservation_id text,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;condition reservation_service_conditions%rowtype;
begin
 actor:=hotel_actor(p_actor,array['front_desk','manager','owner']);
 select * into r from reservations where id=p_reservation_id;
 if not found then raise exception 'RESERVATION_NOT_FOUND';end if;
 select * into condition from reservation_service_conditions where reservation_id=r.id and condition_type='dnd' and status='active';
 return jsonb_build_object('reservationId',r.id,'dndActive',found,'setAt',condition.set_at,'reason',condition.reason,'version',condition.version);
end$$;

create function public.hotel_reservation_service_condition_update(
 p_reservation_id text,p_action text,p_reason text,p_key uuid,p_actor uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;condition reservation_service_conditions%rowtype;result jsonb;payload jsonb;before_data jsonb;
begin
 if p_action not in('set','clear') then raise exception 'INVALID_SERVICE_CONDITION_ACTION';end if;
 if char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'SERVICE_CONDITION_REASON_REQUIRED';end if;
 if p_action='set' then actor:=hotel_actor(p_actor,array['front_desk','housekeeping']);
 else actor:=hotel_actor(p_actor,array['front_desk','manager','owner']);end if;
 payload:=jsonb_build_object('action',p_action,'reservationId',p_reservation_id,'reason',trim(p_reason));
 result:=hotel_request_result(p_key,'reservation_service_condition',p_reservation_id,p_actor,payload);
 if result is not null then return result;end if;
 perform pg_advisory_xact_lock(hashtextextended('reservation-service:'||p_reservation_id,3));
 select * into r from reservations where id=p_reservation_id for update;
 if not found or r.status<>'checked_in' then raise exception 'SERVICE_CONDITION_REQUIRES_IN_HOUSE';end if;
 if p_action='set' then
  insert into reservation_service_conditions(reservation_id,condition_type,reason,set_by)
   values(r.id,'dnd',trim(p_reason),p_actor) returning * into condition;
 else
  select * into condition from reservation_service_conditions where reservation_id=r.id and condition_type='dnd' and status='active' for update;
  if not found then raise exception 'SERVICE_CONDITION_NOT_ACTIVE';end if;
  before_data:=to_jsonb(condition);
  update reservation_service_conditions set status='cleared',cleared_by=p_actor,cleared_at=now(),clear_reason=trim(p_reason),version=version+1
   where id=condition.id returning * into condition;
 end if;
 result:=jsonb_build_object('reservationId',r.id,'dndActive',condition.status='active','setAt',condition.set_at,
  'updatedAt',case when p_action='set' then condition.set_at else condition.cleared_at end,'version',condition.version);
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
 values(p_actor,'reservation_dnd_'||p_action,'reservation_service_condition',condition.id::text,
  before_data,result||jsonb_build_object('reason',trim(p_reason)));
 insert into hotel_operation_requests values(p_key,'reservation_service_condition',r.id,p_actor,payload,result,now());
 return result;
end$$;

create function public.hotel_reservation_service_checkout_clear()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.status is distinct from 'checked_out' and new.status='checked_out' then
  with cleared as (update reservation_service_conditions set status='cleared',cleared_at=now(),clear_reason='Automatically cleared at checkout',version=version+1
   where reservation_id=new.id and condition_type='dnd' and status='active' returning id,version,cleared_at)
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
   select null,'reservation_dnd_checkout_clear','reservation_service_condition',id::text,
    jsonb_build_object('reservationId',new.id,'version',version,'clearedAt',cleared_at,'reason','Automatically cleared at checkout') from cleared;
 end if;
 return new;
end$$;
create trigger hotel_reservation_service_checkout_clear after update of status on public.reservations
 for each row when(new.status='checked_out') execute function public.hotel_reservation_service_checkout_clear();

create function public.hotel_housekeeping_service_outcome(
 p_task_id text,p_outcome text,p_note text,p_version integer,p_key uuid,p_actor uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;t housekeeping_tasks%rowtype;result jsonb;payload jsonb;before_data jsonb;
begin
 actor:=hotel_actor(p_actor,array['housekeeping']);
 if p_outcome not in('service_declined','late_service') then raise exception 'INVALID_SERVICE_OUTCOME';end if;
 if char_length(trim(coalesce(p_note,''))) not between 3 and 500 then raise exception 'SERVICE_OUTCOME_NOTE_REQUIRED';end if;
 payload:=jsonb_build_object('outcome',p_outcome,'note',trim(p_note),'version',p_version);
 result:=hotel_request_result(p_key,'housekeeping_service_outcome',p_task_id,p_actor,payload);
 if result is not null then return result;end if;
 select * into t from housekeeping_tasks where id=p_task_id for update;
 if not found or t.task_type not in('stayover_cleaning','guest_request') or t.status not in('pending','assigned','deferred') then raise exception 'SERVICE_OUTCOME_NOT_AVAILABLE';end if;
 if t.version<>p_version then raise exception 'STALE_VERSION';end if;
 if t.assigned_user_id is not null and t.assigned_user_id<>p_actor then raise exception 'TASK_ASSIGNED_TO_ANOTHER_WORKER';end if;
 before_data:=jsonb_build_object('status',t.status,'priority',t.priority,'serviceOutcome',t.service_outcome);
 if p_outcome='service_declined' then
  update housekeeping_tasks set status='deferred',deferred_by=p_actor,deferred_at=now(),deferred_reason=trim(p_note),
   service_outcome='service_declined',service_outcome_note=trim(p_note),service_outcome_at=now(),service_outcome_by=p_actor,
   version=version+1,updated_at=now() where id=t.id returning * into t;
 else
  update housekeeping_tasks set priority='high',service_outcome='late_service',service_outcome_note=trim(p_note),
   service_outcome_at=now(),service_outcome_by=p_actor,service_due_at=now(),version=version+1,updated_at=now()
   where id=t.id returning * into t;
 end if;
 result:=jsonb_build_object('taskId',t.id,'status',t.status,'priority',t.priority,'serviceOutcome',t.service_outcome,'serviceOutcomeAt',t.service_outcome_at,'version',t.version);
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
 values(p_actor,'housekeeping_service_'||p_outcome,'housekeeping_task',t.id,before_data,result||jsonb_build_object('note',trim(p_note)));
 insert into hotel_operation_requests values(p_key,'housekeeping_service_outcome',t.id,p_actor,payload,result,now());
 return result;
end$$;

-- A DND notice applies to a stay, so room moves carry it automatically. Routine
-- stayover service cannot start while an active notice exists; checkout cleaning
-- and inspections continue through their existing guarded workflows.
do $$declare body text;patched text;marker text;replacement text;begin
 select pg_get_functiondef('public.housekeeping_start_task(text,uuid)'::regprocedure) into body;
 marker:='if t.room_id is null then raise exception''TASK_ROOM_REQUIRED'';end if;perform pg_advisory_xact_lock(hashtextextended(t.room_id,0));';
 replacement:='if t.room_id is null then raise exception''TASK_ROOM_REQUIRED'';end if;if t.task_type=''stayover_cleaning'' then perform pg_advisory_xact_lock(hashtextextended(''reservation-service:''||coalesce(t.reservation_id,(select a.reservation_id from reservation_room_assignments a where a.room_id=t.room_id and a.status=''active'' order by a.assigned_at desc limit 1),t.id),3));if exists(select 1 from reservation_service_conditions d where d.reservation_id=coalesce(t.reservation_id,(select a.reservation_id from reservation_room_assignments a where a.room_id=t.room_id and a.status=''active'' order by a.assigned_at desc limit 1)) and d.condition_type=''dnd'' and d.status=''active'') then raise exception''ROOM_SERVICE_DND'';end if;end if;perform pg_advisory_xact_lock(hashtextextended(t.room_id,0));';
 patched:=replace(body,marker,replacement);
 if patched=body then raise exception 'HOUSEKEEPING_DND_START_BODY_UNEXPECTED';end if;
 execute patched;
end$$;

do $$declare fn record;begin
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('hotel_reservation_service_condition_read','hotel_reservation_service_condition_update',
   'hotel_reservation_service_checkout_clear','hotel_housekeeping_service_outcome') loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
  execute format('grant execute on function %s to service_role',fn.signature);
 end loop;
end$$;

commit;
