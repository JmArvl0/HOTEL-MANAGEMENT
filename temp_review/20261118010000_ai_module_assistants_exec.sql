-- Manual SQL fallback for the pending Phase 1–2 module assistant migration.
-- Generated from the canonical migration below; verify the live ledger and a backup first.
-- Execute as one transaction in the Supabase SQL Editor only if a compatible
-- supabase db push worktree cannot be prepared. Never repair remote-only versions.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE v_feature text; v_status text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_feature FROM pg_constraint
   WHERE conrelid = 'public.ai_interactions'::regclass AND conname = 'ai_interactions_feature_check';
  SELECT pg_get_constraintdef(oid) INTO v_status FROM pg_constraint
   WHERE conrelid = 'public.ai_interactions'::regclass AND conname = 'ai_interactions_status_check';
  IF v_feature IS NULL OR v_status IS NULL OR v_feature LIKE '%module_assistant%'
     OR v_status LIKE '%provider_quota%' THEN
    RAISE EXCEPTION 'Preflight: unexpected AI interaction constraints';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'ai_interactions' AND column_name = 'module_id') THEN
    RAISE EXCEPTION 'Preflight: module_id already exists';
  END IF;
  IF to_regclass('public.ai_interactions_module_recent_idx') IS NOT NULL
     OR to_regprocedure('public.reserve_ai_module_interaction(uuid,text,text,integer,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'Preflight: module AI index or function already exists';
  END IF;
END $$;
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

DO $$
DECLARE v_feature text; v_status text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_feature FROM pg_constraint
   WHERE conrelid = 'public.ai_interactions'::regclass AND conname = 'ai_interactions_feature_check';
  SELECT pg_get_constraintdef(oid) INTO v_status FROM pg_constraint
   WHERE conrelid = 'public.ai_interactions'::regclass AND conname = 'ai_interactions_status_check';
  IF v_feature NOT LIKE '%module_assistant%' OR v_status NOT LIKE '%provider_quota%'
     OR v_status NOT LIKE '%reserved%' THEN
    RAISE EXCEPTION 'Postflight: AI interaction constraints incomplete';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public'
      AND table_name = 'ai_interactions' AND column_name = 'module_id' AND data_type = 'text' AND is_nullable = 'YES')
     OR to_regclass('public.ai_interactions_module_recent_idx') IS NULL
     OR to_regprocedure('public.reserve_ai_module_interaction(uuid,text,text,integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'Postflight: module AI column, index or function missing';
  END IF;
END $$;
COMMIT;
-- Run read-only row-count, constraint, function privilege and migration-ledger
-- verification separately before marking the migration applied.
