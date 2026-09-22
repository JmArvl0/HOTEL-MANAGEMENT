-- Predictive dynamic pricing provenance and governed proposal wrapper.
-- Additive only: recommendations remain advisory and the existing Owner/Admin
-- review function is still the only path that can activate a rate overlay.

alter table public.room_types
  add column if not exists dynamic_rate_floor numeric(12,2)
    generated always as (round(base_rate * 0.80, 2)) stored,
  add column if not exists dynamic_rate_ceiling numeric(12,2)
    generated always as (round(base_rate * 1.35, 2)) stored;

alter table public.room_rate_plans
  add column if not exists created_from_analytics boolean not null default false,
  add column if not exists analytics_model_run_id uuid references public.analytics_model_runs(id) on delete restrict;

create index if not exists room_rate_plans_analytics_run_idx
  on public.room_rate_plans (analytics_model_run_id)
  where created_from_analytics = true;

create or replace function public.manager_propose_analytics_rate_plans(
  p_recommendations jsonb,
  p_model_run_id uuid,
  p_actor_user_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor text;
  model_run public.analytics_model_runs%rowtype;
  item jsonb;
  room_type public.room_types%rowtype;
  plan_id uuid;
  plan_ids jsonb := '[]'::jsonb;
  target_date date;
  nightly_rate numeric(12,2);
  reason text;
  day_mask integer;
  plan_name text;
  hotel_today date;
begin
  select role into actor from public.user_accounts
   where id = p_actor_user_id and active and not recovery_required;
  if actor is null or actor <> 'manager' then raise exception 'MANAGER_AUTHORITY_REQUIRED'; end if;
  if jsonb_typeof(p_recommendations) <> 'array'
     or jsonb_array_length(p_recommendations) < 1
     or jsonb_array_length(p_recommendations) > 50 then
    raise exception 'INVALID_ANALYTICS_RATE_PROPOSAL';
  end if;

  select * into model_run from public.analytics_model_runs
   where id = p_model_run_id and status = 'completed' and model_type = 'occupancy';
  if not found then raise exception 'ANALYTICS_MODEL_RUN_NOT_FOUND'; end if;
  select (now() at time zone coalesce(hotel_timezone, 'Asia/Manila'))::date
    into hotel_today from public.hotel_operational_policies where key = 'default';
  hotel_today := coalesce(hotel_today, (now() at time zone 'Asia/Manila')::date);

  for item in select value from jsonb_array_elements(p_recommendations)
  loop
    if jsonb_typeof(item) <> 'object' then raise exception 'INVALID_ANALYTICS_RATE_PROPOSAL'; end if;
    begin
      target_date := (item->>'targetDate')::date;
      nightly_rate := round((item->>'nightlyRate')::numeric, 2);
    exception when others then
      raise exception 'INVALID_ANALYTICS_RATE_PROPOSAL';
    end;
    reason := nullif(trim(coalesce(item->>'reason', '')), '');
    select * into room_type from public.room_types
     where id = (item->>'roomTypeId')::uuid and active for share;
    if not found or target_date < hotel_today or target_date > hotel_today + 6
       or nightly_rate < room_type.dynamic_rate_floor
       or nightly_rate > room_type.dynamic_rate_ceiling
       or reason is null or char_length(reason) > 500 then
      raise exception 'INVALID_ANALYTICS_RATE_PROPOSAL';
    end if;

    day_mask := 1 << (extract(isodow from target_date)::integer - 1);
    plan_name := left('Predictive ' || target_date::text || ' ' || left(p_model_run_id::text, 8), 80);
    plan_id := public.manager_propose_room_rate_plan(
      room_type.id, plan_name, target_date, target_date, day_mask,
      nightly_rate, reason, p_actor_user_id
    );
    update public.room_rate_plans
       set created_from_analytics = true,
           analytics_model_run_id = p_model_run_id
     where id = plan_id and status = 'pending';

    insert into public.audit_logs (user_id, action, entity_type, entity_id, after_data)
    values (p_actor_user_id, 'propose_analytics_room_rate_plan', 'room_rate_plan', plan_id::text,
      jsonb_build_object(
        'createdFromAnalytics', true,
        'modelRunId', p_model_run_id,
        'roomTypeId', room_type.id,
        'targetDate', target_date,
        'nightlyRate', nightly_rate,
        'status', 'pending'
      ));
    plan_ids := plan_ids || to_jsonb(plan_id);
  end loop;

  return jsonb_build_object('proposalIds', plan_ids, 'submitted', jsonb_array_length(plan_ids), 'status', 'pending_approval');
end $$;

revoke all on function public.manager_propose_analytics_rate_plans(jsonb, uuid, uuid) from public, anon, authenticated;
grant execute on function public.manager_propose_analytics_rate_plans(jsonb, uuid, uuid) to service_role;
