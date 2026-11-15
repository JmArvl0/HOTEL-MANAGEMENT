-- Workforce owns official schedule/attendance. Hotel stores short-lived availability
-- evidence and reviewed employee links, never payroll or a second time clock.
-- Ledger verified 2026-11-14: 140 versions, latest 20261114020000.
begin;

create table public.workforce_integration_settings (
  key text primary key check (key = 'default'),
  source_system text not null check (length(trim(source_system)) between 1 and 120),
  property_id text not null check (length(trim(property_id)) between 1 and 120),
  auto_assign_checkout boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
insert into public.workforce_integration_settings(key,source_system,property_id) values ('default','workforce','haven');
create table public.workforce_employee_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.user_accounts(id) on delete restrict,
  source_system text not null,
  property_id text not null,
  employee_id text not null check (length(trim(employee_id)) between 1 and 120),
  mapped_by uuid not null references public.user_accounts(id) on delete restrict,
  mapped_at timestamptz not null default now(),
  unique(source_system,property_id,employee_id)
);
create table public.workforce_availability (
  link_id uuid primary key references public.workforce_employee_links(id) on delete cascade,
  source_version bigint not null check (source_version > 0),
  event_id uuid not null,
  employment_active boolean not null,
  department text not null check (department in ('manager','front_desk','housekeeping','maintenance','accounting')),
  attendance text not null check (attendance in ('clocked_in','clocked_out','on_break','on_leave')),
  shift_starts_at timestamptz,
  shift_ends_at timestamptz,
  observed_at timestamptz not null,
  valid_until timestamptz not null,
  received_at timestamptz not null default now(),
  check (valid_until > observed_at and valid_until <= observed_at + interval '15 minutes'),
  check ((shift_starts_at is null and shift_ends_at is null) or
    (shift_starts_at is not null and shift_ends_at is not null and shift_ends_at > shift_starts_at and shift_ends_at <= shift_starts_at + interval '24 hours'))
);
create table public.workforce_availability_events (
  source_system text not null,
  property_id text not null,
  event_id uuid not null,
  link_id uuid not null, -- historical identity survives an explicit unlink
  source_version bigint not null,
  payload jsonb not null,
  outcome text not null check (outcome in ('accepted','ignored_stale_version')),
  received_at timestamptz not null default now(),
  primary key(source_system,property_id,event_id)
);
create index workforce_employee_event_version_idx on public.workforce_availability_events
  (source_system,property_id,(payload->>'employeeId'),source_version desc) where outcome='accepted';
-- A system assignment has no human actor. Manual assignment routines retain
-- their actor checks. Method + audit distinguish automatic work from user actions.
alter table public.housekeeping_task_assignments alter column assigned_by drop not null;
alter table public.housekeeping_task_assignments add column assignment_method text not null default 'manual'
  check (assignment_method in ('manual','workforce_auto'));

create function public.hotel_workforce_status(p_user uuid) returns text
language sql volatile security definer set search_path=public as $$
  select coalesce((select case
    when not u.active or u.account_status <> 'active' or u.recovery_required then 'inactive'
    when l.id is null then 'unmapped'
    when a.link_id is null then 'awaiting_sync'
    when a.valid_until <= clock_timestamp() or a.observed_at < clock_timestamp()-interval '15 minutes' then 'stale'
    when not a.employment_active then 'inactive'
    when a.department <> u.role then 'department_mismatch'
    when a.attendance='on_leave' then 'on_leave'
    when a.attendance='on_break' then 'on_break'
    when a.attendance<>'clocked_in' then 'off_duty'
    when a.shift_starts_at is null or clock_timestamp()<a.shift_starts_at or clock_timestamp()>=a.shift_ends_at then 'outside_shift'
    else 'on_duty' end
  from user_accounts u
  left join workforce_employee_links l on l.user_id=u.id
  left join workforce_availability a on a.link_id=l.id
  where u.id=p_user),'inactive')
$$;

create function public.hotel_assign_workforce_checkout(p_task text) returns boolean
language plpgsql security definer set search_path=public as $$
declare t housekeeping_tasks%rowtype; chosen record; basis workforce_availability%rowtype;
begin
  -- Serializes automatic selections and source updates across concurrent checkouts.
  perform pg_advisory_xact_lock(hashtextextended('haven:workforce:housekeeping',0));
  if not (select auto_assign_checkout from workforce_integration_settings where key='default') then return false; end if;
  select * into t from housekeeping_tasks where id=p_task for update;
  if not found or t.source_type<>'checkout' or t.task_type<>'checkout_cleaning'
    or t.status<>'pending' or t.assigned_user_id is not null or nullif(trim(t.assignee),'') is not null then return false; end if;
  select u.id,u.name,l.id link_id,
    (select count(*) from housekeeping_tasks h where h.assigned_user_id=u.id and h.status in ('pending','assigned','in_progress','deferred')) as load
  into chosen
  from user_accounts u join workforce_employee_links l on l.user_id=u.id
  join workforce_integration_settings c on c.key='default' and c.source_system=l.source_system and c.property_id=l.property_id
  where u.role='housekeeping' and hotel_workforce_status(u.id)='on_duty'
  order by load, random() limit 1 for update of u;
  if not found then return false; end if;
  select * into basis from workforce_availability where link_id=chosen.link_id;
  insert into housekeeping_task_assignments(task_id,assigned_user_id,assigned_by,reason,assignment_method)
    values(t.id,chosen.id,null,'Automatic assignment: verified Workforce duty, least unfinished tasks, random tie-break','workforce_auto');
  update housekeeping_tasks set assigned_user_id=chosen.id,assignee=chosen.name,assigned_by=null,
    assigned_at=now(),status='assigned',version=version+1,updated_at=now() where id=t.id;
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
    values(null,'housekeeping_workforce_auto_assign','housekeeping_task',t.id,
      jsonb_build_object('status',t.status,'assignedUserId',null),
      jsonb_build_object('status','assigned','assignedUserId',chosen.id,'workloadBefore',chosen.load,
        'workforceLinkId',chosen.link_id,'eventId',basis.event_id,'sourceVersion',basis.source_version,
        'validUntil',basis.valid_until,'method','least_workload_random_tie'));
  return true;
end $$;

create function public.hotel_drain_workforce_checkout_queue() returns integer
language plpgsql security definer set search_path=public as $$
declare t record; assigned integer:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended('haven:workforce:housekeeping',0));
  if not (select auto_assign_checkout from workforce_integration_settings where key='default') then return 0; end if;
  -- SKIP LOCKED keeps a source update from waiting on a task already being worked.
  for t in select id from housekeeping_tasks where source_type='checkout' and task_type='checkout_cleaning'
    and status='pending' and assigned_user_id is null and nullif(trim(assignee),'') is null
    order by case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 else 3 end,created_at,id
    limit 200 for update skip locked
  loop
    if hotel_assign_workforce_checkout(t.id) then assigned:=assigned+1; end if;
  end loop;
  return assigned;
end $$;

create function public.hotel_workforce_checkout_created() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform hotel_assign_workforce_checkout(new.id);
  return new;
end $$;
create trigger workforce_checkout_auto_assignment after insert on public.housekeeping_tasks
  for each row when(new.source_type='checkout' and new.task_type='checkout_cleaning' and new.status='pending' and new.assigned_user_id is null)
  execute function public.hotel_workforce_checkout_created();

create function public.hotel_configure_workforce(p_actor uuid,p_source text,p_property text,p_auto boolean,p_version integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c workforce_integration_settings%rowtype; n integer:=0;
begin
  if not exists(select 1 from user_accounts where id=p_actor and active and account_status='active' and role in ('owner','admin')) then raise exception 'WORKFORCE_FORBIDDEN'; end if;
  if p_source is null or length(trim(p_source)) not between 1 and 120 or p_property is null or length(trim(p_property)) not between 1 and 120
    or p_auto is null or p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'WORKFORCE_INVALID_SETTINGS'; end if;
  perform pg_advisory_xact_lock(hashtextextended('haven:workforce:housekeeping',0));
  select * into c from workforce_integration_settings where key='default' for update;
  if c.version is distinct from p_version then raise exception 'WORKFORCE_SETTINGS_CONFLICT'; end if;
  if (c.source_system<>trim(p_source) or c.property_id<>trim(p_property)) and exists(select 1 from workforce_employee_links) then raise exception 'WORKFORCE_MAPPING_CONFLICT'; end if;
  update workforce_integration_settings set source_system=trim(p_source),property_id=trim(p_property),auto_assign_checkout=p_auto,
    version=version+1,updated_at=now() where key='default';
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(p_actor,'workforce_configure','workforce_integration','default',to_jsonb(c),
    jsonb_build_object('sourceSystem',trim(p_source),'propertyId',trim(p_property),'autoAssignCheckout',p_auto,'reason',trim(p_reason)));
  if p_auto then n:=hotel_drain_workforce_checkout_queue(); end if;
  return jsonb_build_object('saved',true,'assigned',n);
end $$;

create function public.hotel_link_workforce_employee(p_actor uuid,p_user uuid,p_employee text,p_link uuid,p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c workforce_integration_settings%rowtype; l workforce_employee_links%rowtype;
begin
  if not exists(select 1 from user_accounts where id=p_actor and active and account_status='active' and role in ('owner','admin')) then raise exception 'WORKFORCE_FORBIDDEN'; end if;
  if p_reason is null or length(trim(p_reason)) not between 3 and 500 then raise exception 'WORKFORCE_INVALID_REASON'; end if;
  perform pg_advisory_xact_lock(hashtextextended('haven:workforce:housekeeping',0));
  select * into c from workforce_integration_settings where key='default';
  if not exists(select 1 from user_accounts where id=p_user and role in ('manager','front_desk','housekeeping','maintenance','accounting')) then raise exception 'WORKFORCE_INVALID_ACCOUNT'; end if;
  if p_employee is null then
    delete from workforce_employee_links where user_id=p_user and id=p_link returning * into l;
    if not found then raise exception 'WORKFORCE_MAPPING_CONFLICT'; end if;
  else
    if p_link is not null or length(trim(p_employee)) not between 1 and 120 then raise exception 'WORKFORCE_INVALID_EMPLOYEE'; end if;
    insert into workforce_employee_links(user_id,source_system,property_id,employee_id,mapped_by)
      values(p_user,c.source_system,c.property_id,trim(p_employee),p_actor) returning * into l;
  end if;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,
    case when p_employee is null then 'workforce_employee_unlink' else 'workforce_employee_link' end,'workforce_employee_link',l.id::text,
    jsonb_build_object('userId',p_user,'employeeId',l.employee_id,'sourceSystem',l.source_system,'propertyId',l.property_id,'reason',trim(p_reason)));
  return jsonb_build_object('saved',true);
end $$;

create function public.hotel_receive_workforce_availability(p_event jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare c workforce_integration_settings%rowtype; l workforce_employee_links%rowtype;
  receipt workforce_availability_events%rowtype;
  v_event_id uuid; v_source_version bigint; last_version bigint; last_observed timestamptz; observed timestamptz; expires timestamptz; start_at timestamptz; end_at timestamptz;
  result_outcome text:='accepted'; n integer:=0;
begin
  perform pg_advisory_xact_lock(hashtextextended('haven:workforce:housekeeping',0));
  select * into c from workforce_integration_settings where key='default';
  if p_event->>'sourceSystem' is distinct from c.source_system or p_event->>'propertyId' is distinct from c.property_id then raise exception 'WORKFORCE_SOURCE_MISMATCH'; end if;
  if p_event->>'contract' is distinct from 'haven-workforce-v1' then raise exception 'WORKFORCE_INVALID_CONTRACT'; end if;
  v_event_id:=(p_event->>'eventId')::uuid;
  select * into receipt from workforce_availability_events where source_system=c.source_system and property_id=c.property_id and event_id=v_event_id;
  if found then
    if receipt.payload<>p_event then raise exception 'WORKFORCE_EVENT_CONFLICT'; end if;
    return jsonb_build_object('outcome',receipt.outcome,'replayed',true,'assigned',0);
  end if;
  v_source_version:=(p_event->>'version')::bigint;
  observed:=(p_event->>'observedAt')::timestamptz; expires:=(p_event->>'validUntil')::timestamptz;
  start_at:=(p_event->'shift'->>'startsAt')::timestamptz; end_at:=(p_event->'shift'->>'endsAt')::timestamptz;
  if v_event_id is null or v_source_version is null or v_source_version<1 or v_source_version>9007199254740991
    or observed is null or expires is null or observed>now()+interval '1 minute'
    or expires<=observed or expires>observed+interval '15 minutes'
    or jsonb_typeof(p_event->'employmentActive') is distinct from 'boolean'
    or coalesce(p_event->>'attendance','') not in ('clocked_in','clocked_out','on_break','on_leave')
    or coalesce(p_event->>'department','') not in ('manager','front_desk','housekeeping','maintenance','accounting')
    or ((start_at is null)<>(end_at is null)) or end_at<=start_at or end_at>start_at+interval '24 hours'
    then raise exception 'WORKFORCE_INVALID_EVENT'; end if;
  select * into l from workforce_employee_links where source_system=c.source_system and property_id=c.property_id and employee_id=p_event->>'employeeId';
  if not found then raise exception 'WORKFORCE_MAPPING_NOT_FOUND'; end if;
  select source_version,(payload->>'observedAt')::timestamptz into last_version,last_observed from workforce_availability_events
    where source_system=c.source_system and property_id=c.property_id and payload->>'employeeId'=l.employee_id and outcome='accepted'
    order by source_version desc limit 1;
  if v_source_version<=last_version then
    if v_source_version=last_version then raise exception 'WORKFORCE_VERSION_CONFLICT'; end if;
    result_outcome:='ignored_stale_version';
  elsif observed<last_observed then
    raise exception 'WORKFORCE_INVALID_OBSERVATION_ORDER';
  else
    insert into workforce_availability(link_id,source_version,event_id,employment_active,department,attendance,shift_starts_at,shift_ends_at,observed_at,valid_until)
    values(l.id,v_source_version,v_event_id,(p_event->>'employmentActive')::boolean,p_event->>'department',p_event->>'attendance',start_at,end_at,observed,expires)
    on conflict(link_id) do update set source_version=excluded.source_version,event_id=excluded.event_id,
      employment_active=excluded.employment_active,department=excluded.department,attendance=excluded.attendance,
      shift_starts_at=excluded.shift_starts_at,shift_ends_at=excluded.shift_ends_at,observed_at=excluded.observed_at,valid_until=excluded.valid_until,received_at=now();
  end if;
  insert into workforce_availability_events(source_system,property_id,event_id,link_id,source_version,payload,outcome)
    values(c.source_system,c.property_id,v_event_id,l.id,v_source_version,p_event,result_outcome);
  if result_outcome='accepted' then n:=hotel_drain_workforce_checkout_queue(); end if;
  return jsonb_build_object('outcome',result_outcome,'replayed',false,'assigned',n);
end $$;

create function public.hotel_workforce_snapshot(p_actor uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare actor text; result jsonb;
begin
  select role into actor from user_accounts where id=p_actor and active and account_status='active';
  if actor is null or actor not in ('owner','admin','manager','front_desk','housekeeping','maintenance','accounting') then raise exception 'WORKFORCE_FORBIDDEN'; end if;
  select jsonb_build_object('generatedAt',now(),'scope',case when actor in ('owner','admin','manager') then 'team' else 'self' end,'canManage',actor in ('owner','admin'),
    'settings',jsonb_build_object('sourceSystem',c.source_system,'propertyId',c.property_id,'autoAssignCheckout',c.auto_assign_checkout,'version',c.version),
    'unassignedCheckoutTasks',case when actor in ('owner','admin','manager','housekeeping') then
      (select count(*) from housekeeping_tasks where source_type='checkout' and status='pending' and assigned_user_id is null) else 0 end,
    'staff',coalesce((select jsonb_agg(jsonb_build_object('userId',u.id,'name',u.name,'role',u.role,'linkId',l.id,'employeeId',l.employee_id,
      'status',hotel_workforce_status(u.id),'shiftStartsAt',a.shift_starts_at,'shiftEndsAt',a.shift_ends_at,
      'observedAt',a.observed_at,'receivedAt',a.received_at,'validUntil',a.valid_until,
      'openTasks',(select count(*) from housekeeping_tasks h where h.assigned_user_id=u.id and h.status in ('pending','assigned','in_progress','deferred'))
    ) order by u.name,u.id) from user_accounts u left join workforce_employee_links l on l.user_id=u.id
      left join workforce_availability a on a.link_id=l.id
      where u.role in ('manager','front_desk','housekeeping','maintenance','accounting') and
        (actor in ('owner','admin','manager') or u.id=p_actor)), '[]'::jsonb)) into result
    from workforce_integration_settings c where c.key='default';
  return result;
end $$;

do $$ declare t text; f record; begin
  foreach t in array array['workforce_integration_settings','workforce_employee_links','workforce_availability','workforce_availability_events'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on public.%I to service_role',t);
  end loop;
  for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('hotel_workforce_status','hotel_assign_workforce_checkout','hotel_drain_workforce_checkout_queue',
      'hotel_workforce_checkout_created','hotel_configure_workforce','hotel_link_workforce_employee','hotel_receive_workforce_availability','hotel_workforce_snapshot') loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
    if f.proname in ('hotel_configure_workforce','hotel_link_workforce_employee','hotel_receive_workforce_availability','hotel_workforce_snapshot') then
      execute format('grant execute on function %s to service_role',f.signature);
    end if;
  end loop;
end $$;
commit;
