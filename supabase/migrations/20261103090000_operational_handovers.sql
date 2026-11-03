-- Independent HMS handover; intentionally no staff_roster dependency.
create table if not exists public.shift_handovers (
 id uuid primary key default gen_random_uuid(), department text not null,
 summary text not null check(length(summary) between 3 and 1000),
 source_type text not null check(source_type in('reservation','guest_request','housekeeping','maintenance','cash_shift')),
 source_id text not null, follow_up_user_id uuid not null references public.user_accounts(id),
 submitted_by uuid not null references public.user_accounts(id), submitted_at timestamptz not null default now(),
 acknowledged_by uuid references public.user_accounts(id), acknowledged_at timestamptz,
 resolved_at timestamptz, resolution text, version integer not null default 1,
 check(department in('manager','front_desk','housekeeping','maintenance','accounting'))
);
alter table public.shift_handovers enable row level security;
revoke all on public.shift_handovers from public,anon,authenticated;
grant select on public.shift_handovers to service_role;
create or replace function public.submit_shift_handover(p_actor uuid,p_id uuid,p_summary text,p_source_type text,p_source_id text,p_follow_up uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor text; dept text; target text; previous shift_handovers%rowtype;
begin
 select role into actor from user_accounts where id=p_actor and active;
 if actor is null or actor not in('manager','front_desk','housekeeping','maintenance','accounting') then raise exception 'HANDOVER_FORBIDDEN'; end if;
 select role into target from user_accounts where id=p_follow_up and active;
 if target is null or target not in('manager','front_desk','housekeeping','maintenance','accounting') then raise exception 'STAFF_UNAVAILABLE'; end if;
 dept:=case when actor='manager' then target else actor end;
 if actor<>'manager' and target<>actor then raise exception 'HANDOVER_FORBIDDEN'; end if;
 if length(trim(coalesce(p_summary,'')))<3 or length(p_summary)>1000 then raise exception 'INVALID_HANDOVER'; end if;
 if not (
  (p_source_type='reservation' and dept in('front_desk','manager','accounting') and exists(select 1 from reservations where id=p_source_id)) or
  (p_source_type='guest_request' and exists(select 1 from guest_requests where id::text=p_source_id and (dept in('manager','front_desk') or department=dept))) or
  (p_source_type='housekeeping' and dept in('housekeeping','manager','front_desk') and exists(select 1 from housekeeping_tasks where id=p_source_id)) or
  (p_source_type='maintenance' and dept in('maintenance','manager','front_desk') and exists(select 1 from maintenance_orders where id=p_source_id)) or
  (p_source_type='cash_shift' and actor in('front_desk','accounting') and dept in('front_desk','accounting') and exists(select 1 from cash_shifts where id::text=p_source_id))
 ) then raise exception 'INVALID_HANDOVER_SOURCE'; end if;
 perform pg_advisory_xact_lock(hashtextextended('handover:'||p_id::text,0));
 select * into previous from shift_handovers where id=p_id;
 if found then
  if previous.submitted_by<>p_actor or previous.summary<>trim(p_summary) or previous.source_type<>p_source_type or previous.source_id<>p_source_id or previous.follow_up_user_id<>p_follow_up then raise exception 'HANDOVER_CONFLICT'; end if;
  return previous.id;
 end if;
 insert into shift_handovers(id,department,summary,source_type,source_id,follow_up_user_id,submitted_by) values(p_id,dept,trim(p_summary),p_source_type,p_source_id,p_follow_up,p_actor);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'handover_submitted','shift_handover',p_id::text,jsonb_build_object('department',dept,'sourceType',p_source_type,'sourceId',p_source_id));
 return p_id;
end$$;
create or replace function public.act_shift_handover(p_actor uuid,p_id uuid,p_version integer,p_action text,p_resolution text)
returns void language plpgsql security definer set search_path=public as $$
declare h shift_handovers%rowtype; actor text;
begin
 select role into actor from user_accounts where id=p_actor and active;
 select * into h from shift_handovers where id=p_id for update;
 if not found then raise exception 'HANDOVER_NOT_FOUND'; end if;
 if actor is null or (h.follow_up_user_id<>p_actor and actor<>'manager') or actor not in('manager','front_desk','housekeeping','maintenance','accounting') then raise exception 'HANDOVER_FORBIDDEN'; end if;
 if h.version<>p_version then raise exception 'HANDOVER_STALE'; end if;
 if p_action='acknowledge' and h.acknowledged_at is null then
  update shift_handovers set acknowledged_at=now(),acknowledged_by=p_actor,version=version+1 where id=p_id;
 elsif p_action='resolve' and h.acknowledged_at is not null and h.resolved_at is null and length(trim(coalesce(p_resolution,''))) between 3 and 500 then
  update shift_handovers set resolved_at=now(),resolution=trim(p_resolution),version=version+1 where id=p_id;
 else raise exception 'INVALID_HANDOVER_TRANSITION'; end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'handover_'||p_action,'shift_handover',p_id::text,jsonb_build_object('resolution',p_resolution));
end$$;
revoke all on function public.submit_shift_handover(uuid,uuid,text,text,text,uuid),public.act_shift_handover(uuid,uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.submit_shift_handover(uuid,uuid,text,text,text,uuid),public.act_shift_handover(uuid,uuid,integer,text,text) to service_role;
