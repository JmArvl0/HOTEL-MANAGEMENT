begin;

alter table public.hotel_operational_policies
  add column day_close_primary_id uuid references public.user_accounts(id),
  add column day_close_backup_id uuid references public.user_accounts(id),
  add column day_close_coverage_version integer not null default 0,
  add constraint day_close_distinct_coverage check (
    (day_close_primary_id is null and day_close_backup_id is null)
    or (day_close_primary_id is not null and day_close_backup_id is not null and day_close_primary_id <> day_close_backup_id)
  );

create function public.hotel_can_manage_operating_day(p_actor uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from user_accounts u cross join hotel_operational_policies p
    where p.key='default' and u.id=p_actor and u.active and u.account_status='active'
      and not coalesce(u.recovery_required,false)
      and (u.role='accounting' or (u.role='manager' and u.id in (p.day_close_primary_id,p.day_close_backup_id)))
  );
$$;

create function public.hotel_operating_day_coverage(p_actor uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare policy hotel_operational_policies%rowtype;
begin
  perform hotel_actor(p_actor,array['owner']);
  select * into strict policy from hotel_operational_policies where key='default';
  return jsonb_build_object(
    'primaryId',policy.day_close_primary_id,'backupId',policy.day_close_backup_id,
    'version',policy.day_close_coverage_version,
    'candidates',coalesce((
      select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) order by u.name,u.id)
      from user_accounts u where u.role='manager' and u.active and u.account_status='active'
        and not coalesce(u.recovery_required,false)
    ),'[]'::jsonb)
  );
end;
$$;

create function public.hotel_set_operating_day_coverage(
  p_actor uuid,p_primary uuid,p_backup uuid,p_version integer,p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare policy hotel_operational_policies%rowtype; eligible integer;
begin
  perform hotel_actor(p_actor,array['owner']);
  if coalesce(length(btrim(p_reason)),0) not between 3 and 500 then raise exception 'POLICY_REASON_REQUIRED'; end if;
  if (p_primary is null) <> (p_backup is null) or (p_primary is not null and p_primary=p_backup) then
    raise exception 'INVALID_DAY_CLOSE_COVERAGE';
  end if;
  select * into strict policy from hotel_operational_policies where key='default' for update;
  if policy.day_close_coverage_version is distinct from p_version then raise exception 'STALE_VERSION'; end if;
  if policy.day_close_primary_id is not distinct from p_primary
     and policy.day_close_backup_id is not distinct from p_backup then
    return hotel_operating_day_coverage(p_actor);
  end if;
  if p_primary is not null then
    perform id from user_accounts where id in (p_primary,p_backup) and role='manager'
      and active and account_status='active' and not coalesce(recovery_required,false)
      order by id for share;
    get diagnostics eligible = row_count;
    if eligible <> 2 then raise exception 'INVALID_DAY_CLOSE_COVERAGE'; end if;
  end if;
  update hotel_operational_policies set day_close_primary_id=p_primary,day_close_backup_id=p_backup,
    day_close_coverage_version=day_close_coverage_version+1 where key='default';
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor,'operating_day_coverage_update','hotel_policy','default',
    jsonb_build_object('primaryId',policy.day_close_primary_id,'backupId',policy.day_close_backup_id),
    jsonb_build_object('primaryId',p_primary,'backupId',p_backup,'reason',btrim(p_reason)));
  return hotel_operating_day_coverage(p_actor);
end;
$$;

revoke all on function public.hotel_can_manage_operating_day(uuid),
  public.hotel_operating_day_coverage(uuid),public.hotel_set_operating_day_coverage(uuid,uuid,uuid,integer,text)
  from public,anon,authenticated;
grant execute on function public.hotel_can_manage_operating_day(uuid),
  public.hotel_operating_day_coverage(uuid),public.hotel_set_operating_day_coverage(uuid,uuid,uuid,integer,text)
  to service_role;


-- Preserve the posted-day rules in both commands; serialize authorization with coverage changes.
create or replace function public.hotel_operating_day_activate(p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 perform 1 from hotel_operational_policies where key='default' for update;
 perform 1 from user_accounts where id=p_actor for share;
 if not hotel_can_manage_operating_day(p_actor) then raise exception 'OPERATING_DAY_FORBIDDEN'; end if;
 update hotel_operational_policies set operating_date=hotel_today(),operating_version=operating_version+1,operating_activated_at=now() where key='default' and operating_date is null;
 if found then insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'operating_day_activate','hotel_policy','default',hotel_operating_day(p_actor));end if;
 return hotel_operating_day(p_actor);
end$$;

create or replace function public.hotel_night_audit_preview(p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;p hotel_operational_policies%rowtype;metrics jsonb;blockers jsonb:='[]';warnings jsonb:='[]';item record;begin
 actor:=hotel_actor(p_actor,array['front_desk','accounting','manager','owner']);select * into p from hotel_operational_policies where key='default';
 if p.operating_date is null then return jsonb_build_object('active',false,'canManage',hotel_can_manage_operating_day(p_actor),'calendarDate',hotel_today(),'blockers',jsonb_build_array(jsonb_build_object('code','OPERATING_DAY_NOT_ACTIVE')),'warnings','[]'::jsonb);end if;
 for item in select id,status,check_in,check_out from reservations where
  (status in('pending','confirmed') and check_in<=p.operating_date and (status<>'pending' or lower(coalesce(source,''))<>'website' or payment_due_at is null or payment_due_at>now())) or
  (status='checked_in' and check_out<=p.operating_date)
 loop blockers:=blockers||jsonb_build_array(jsonb_build_object('code',case when item.status='checked_in' then 'UNRESOLVED_DEPARTURE' else 'UNRESOLVED_ARRIVAL' end,'reservationId',item.id));end loop;
 if exists(select 1 from cash_shifts where status='open') then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','OPEN_CASH_SHIFT'));end if;
 if exists(select 1 from cash_shifts where status='closed' and reconciled_at is null) then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','UNRECONCILED_CASH_SHIFT'));end if;
 metrics:=hotel_daily_metrics(p.operating_date);
 if p.operating_date>=hotel_today() then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','CALENDAR_DAY_STILL_OPEN'));end if;
 if (now() at time zone p.hotel_timezone)<(p.operating_date+coalesce(p.no_show_cutoff_time,'23:59'::time)) then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','CLOSE_CUTOFF_NOT_REACHED'));end if;
 if jsonb_array_length(metrics->'unreconciledInvoices')>0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','LEDGER_RECONCILIATION_REQUIRED'));end if;
 if jsonb_array_length(metrics->'missingRates')>0 then blockers:=blockers||jsonb_build_array(jsonb_build_object('code','FROZEN_RATES_REQUIRED'));end if;
 if exists(select 1 from housekeeping_tasks where inspection_status='pending') then warnings:=warnings||jsonb_build_array(jsonb_build_object('code','PENDING_INSPECTIONS'));end if;
 if exists(select 1 from hotel_handovers where not archived and status<>'resolved') then warnings:=warnings||jsonb_build_array(jsonb_build_object('code','OPEN_HANDOVER_WORK'));end if;
 return jsonb_build_object('active',true,'canManage',hotel_can_manage_operating_day(p_actor),'businessDate',p.operating_date,'calendarDate',hotel_today(),'timezone',p.hotel_timezone,'version',p.operating_version,'assessedAt',clock_timestamp(),
 'blockers',blockers,'warnings',warnings,'metrics',case when actor in('accounting','manager','owner') then metrics else null end,
 'recentCloses',case when actor in('accounting','manager','owner') then coalesce((select jsonb_agg(to_jsonb(c)) from (select * from hotel_night_audits order by business_date desc limit 30)c),'[]'::jsonb) else '[]'::jsonb end);
end$$;

create or replace function public.hotel_night_audit_close(p_date date,p_version integer,p_key uuid,p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare p hotel_operational_policies%rowtype;preview jsonb;result jsonb;previous hotel_night_audits%rowtype;begin
 select * into p from hotel_operational_policies where key='default' for update;
 perform 1 from user_accounts where id=p_actor for share;
 if not hotel_can_manage_operating_day(p_actor) then raise exception 'OPERATING_DAY_FORBIDDEN'; end if;
 select * into previous from hotel_night_audits where idempotency_key=p_key;
 if found then if previous.business_date<>p_date or previous.closed_by<>p_actor then raise exception 'IDEMPOTENCY_CONFLICT';end if;return to_jsonb(previous);end if;
 if p.operating_date is null or p.operating_date<>p_date or p.operating_version<>p_version then raise exception 'STALE_OPERATING_DAY';end if;
 if p_date>=hotel_today() then raise exception 'CALENDAR_DAY_STILL_OPEN';end if;
 -- Today's day cannot be closed before its no-show cutoff; a lagging day may.
 if (now() at time zone p.hotel_timezone)<(p_date+coalesce(p.no_show_cutoff_time,'23:59'::time)) then raise exception 'CLOSE_CUTOFF_NOT_REACHED';end if;
 -- Freeze operational assessment inputs too. Never wait while holding the date
 -- lock: an existing writer may already be waiting for that lock. A busy table
 -- means retry the close after that operation finishes, with no partial snapshot.
 begin
  lock table reservations,rooms,cash_shifts,maintenance_orders,housekeeping_tasks,hotel_handovers in share mode nowait;
 exception when lock_not_available then raise exception 'OPERATIONS_CHANGED_RETRY';
 end;
 preview:=hotel_night_audit_preview(p_actor);
 if jsonb_array_length(preview->'blockers')>0 then raise exception 'NIGHT_AUDIT_BLOCKERS';end if;
 insert into hotel_night_audits(business_date,snapshot,closed_by,idempotency_key) values(p_date,preview->'metrics',p_actor,p_key) returning to_jsonb(hotel_night_audits.*) into result;
 update hotel_operational_policies set operating_date=operating_date+1,operating_version=operating_version+1 where key='default';
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'night_audit_close','operating_day',p_date::text,result);
 return result;
end$$;

commit;
