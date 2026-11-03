-- I-01: minimum nightly free capacity, shared by every type-inventory gate.
-- Callers retain their type advisory lock, authorization, rates and idempotency.
-- Hold conversion excludes its token; confirmation/modification excludes its stay.
begin;

create or replace function public.hotel_available_units(
  p_room_type text, p_check_in date, p_check_out date,
  p_policy jsonb default null, p_exclude_reservation text default null,
  p_exclude_hold uuid default null, p_evaluated_at timestamptz default now())
returns integer language sql stable security definer set search_path=public as $$
  with inventory as (
    select count(*) units from rooms r
    where r.type=p_room_type and room_is_sellable(r.id,p_check_in,p_policy)
  ), claims as (
    select greatest(r.check_in,p_check_in) starts, least(r.check_out,p_check_out) ends
    from reservations r
    where r.room_type=p_room_type and r.id is distinct from p_exclude_reservation
      and r.check_in<p_check_out and r.check_out>p_check_in
      and (r.status in('confirmed','checked_in') or (r.status='pending' and
        (lower(coalesce(r.source,''))<>'website' or r.payment_due_at is null or r.payment_due_at>p_evaluated_at)))
    union all
    select greatest(h.check_in,p_check_in),least(h.check_out,p_check_out)
    from booking_holds h
    where h.room_type=p_room_type and h.token is distinct from p_exclude_hold
      and h.reservation_id is null and h.status in('active','payment_submitted')
      and h.expires_at>p_evaluated_at and h.check_in<p_check_out and h.check_out>p_check_in
  ), events as (
    select starts night,1 delta from claims union all select ends,-1 from claims
  ), demand as (
    select sum(sum(delta)) over(order by night) units from events group by night
  )
  select case when p_check_out<=p_check_in then 0
    else greatest(0,(select units from inventory)-coalesce(max(units),0))::integer end
  from demand;
$$;
revoke all on function public.hotel_available_units(text,date,date,jsonb,text,uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.hotel_available_units(text,date,date,jsonb,text,uuid,timestamptz) to service_role;

-- Patch only the verified inventory-count block. Fail on unexpected bodies
-- rather than replacing a live RPC with an older full definition. This preserves
-- deployed guards, financial snapshots, proof binding and newer workflow branches.
do $patch$
declare
  spec record; fn record; definition text; patched text; replacement text;
  count_block constant text := 'select[[:space:]]+count\(\*\)[[:space:]]*into[[:space:]]+inventory[[:space:]]+from[[:space:]]+rooms[[:space:]][^;]*;[[:space:]]*select[[:space:]]+count\(\*\)[[:space:]]*into[[:space:]]+reserved[^;]*;([[:space:]]*select[[:space:]]+count\(\*\)[[:space:]]*into[[:space:]]+held[^;]*;)?';
  matches integer;
begin
  for spec in select * from (values
    ('create_booking_hold','p_room_type,p_check_in,p_check_out,null,null,null,now()'),
    ('front_desk_create_reservation','p_room_type,p_check_in,p_check_out,null,null,null,now()'),
    ('submit_reservation_deposit','h.room_type,h.check_in,h.check_out,h.operational_policy_snapshot,null,h.token,now()'),
    ('submit_gateway_deposit','h.room_type,h.check_in,h.check_out,h.operational_policy_snapshot,null,h.token,now()'),
    ('verify_reservation_deposit','r.room_type,r.check_in,r.check_out,r.operational_policy_snapshot,r.id,null,now()'),
    ('confirm_gateway_payment','r.room_type,r.check_in,r.check_out,r.operational_policy_snapshot,r.id,null,now()'),
    ('customer_request_reservation_change','t.name,cin,cout,policy,r.id,null,now()'),
    ('review_manager_approval','target_type,(a.requested_action->>''checkIn'')::date,(a.requested_action->>''checkOut'')::date,null,r.id,null,now()'),
    ('front_desk_execute_manager_approval','t.name,(a.requested_action->>''checkIn'')::date,(a.requested_action->>''checkOut'')::date,null,r.id,null,now()')
  ) as targets(name,args)
  loop
    select p.oid,pg_get_functiondef(p.oid) body into strict fn
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=spec.name;
    definition:=fn.body;
    if position('hotel_available_units(' in definition)>0 then continue; end if;
    select count(*) into matches from regexp_matches(definition,count_block,'gi');
    if matches<>1 then raise exception 'NIGHTLY_INVENTORY_BODY_UNEXPECTED: % (% blocks)',spec.name,matches; end if;
    replacement:='select public.hotel_available_units('||spec.args||') into inventory; reserved:=0;';
    if definition ~* 'into[[:space:]]+held' then replacement:=replacement||' held:=0;'; end if;
    patched:=regexp_replace(definition,count_block,replacement,'i');
    -- Every inventory writer must use the same key, including modification
    -- request/review/execute, which previously omitted case normalization.
    patched:=replace(patched,'hashtextextended(t.name,0)','hashtextextended(lower(t.name),0)');
    patched:=replace(patched,'hashtextextended(target_type,0)','hashtextextended(lower(target_type),0)');
    execute patched;
  end loop;
end $patch$;

commit;
