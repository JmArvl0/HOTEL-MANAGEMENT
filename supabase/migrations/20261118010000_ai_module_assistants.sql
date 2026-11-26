-- AI module assistants: allow the feature, record the module, and distinguish
-- Gemini provider quota failures from HAVEN application rate limits.
--
-- Prerequisite for Phase 1 and 2 module routes. Until it is applied, calls
-- fail closed when rate-limit/audit storage cannot reserve a slot.

alter table public.ai_interactions drop constraint if exists ai_interactions_feature_check;
alter table public.ai_interactions add constraint ai_interactions_feature_check
  check (feature in ('brief','ask','explain','report_summary','executive_shift_summary','guest_concierge','guest_smart_request','module_assistant'));

alter table public.ai_interactions drop constraint if exists ai_interactions_status_check;
alter table public.ai_interactions add constraint ai_interactions_status_check
  check (status in ('ok','unavailable','invalid','rate_limited','error','provider_quota','reserved'));

alter table public.ai_interactions add column if not exists module_id text;

create index if not exists ai_interactions_module_recent_idx
  on public.ai_interactions(user_id, feature, module_id, created_at desc);

-- Reserve a provider call under one per-user/module transaction lock. Denied
-- requests do not create rows and therefore cannot prolong the rolling window.
create or replace function public.reserve_ai_module_interaction(
  p_user_id uuid, p_role text, p_module_id text, p_limit integer, p_window_minutes integer
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_id uuid;
begin
  if p_user_id is null or p_role is null or p_module_id !~ '^[a-z_]+$'
    or p_limit not between 1 and 100 or p_window_minutes not between 1 and 1440 then
    raise exception 'Invalid module reservation arguments';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':module_assistant:' || p_module_id, 0));
  select count(*) into v_count
    from public.ai_interactions
   where user_id = p_user_id and feature = 'module_assistant' and module_id = p_module_id
     and status <> 'rate_limited'
     and created_at >= now() - make_interval(mins => p_window_minutes);

  if v_count >= p_limit then
    return jsonb_build_object('status', 'limited');
  end if;

  insert into public.ai_interactions(user_id, role, feature, module_id, tool_calls_used, status)
  values (p_user_id, p_role, 'module_assistant', p_module_id, '[]'::jsonb, 'reserved')
  returning id into v_id;
  return jsonb_build_object('status', 'allowed', 'id', v_id);
end;
$$;

revoke all on function public.reserve_ai_module_interaction(uuid,text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_module_interaction(uuid,text,text,integer,integer) to service_role;
