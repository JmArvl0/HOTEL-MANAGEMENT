-- 20261009010000_security_policy.sql
--
-- System Administration → Security Configuration: session-persistence and
-- session-timeout policy. ONE authoritative server-side source, kept apart
-- from the booking-policy table on purpose — operational columns freeze into
-- every booking's operational_policy_snapshot, and authentication values must
-- never be frozen into a reservation.
--
-- Scope (audited 2026-10-09): HAVEN has no one-time-passcode/MFA flow —
-- only one-time hashed recovery links — so this table governs SESSION policy
-- only. No passcode columns exist by design; see D-021.
--
-- Columns:
--   persistent_session_enabled — Remember Me. OFF preserves current behavior
--     (ordinary non-persistent session); ON lets eligible users opt into the
--     extended session at sign-in.
--   idle_timeout_minutes       — inactivity limit, 10–480 (default 30).
--   absolute_session_minutes   — maximum lifetime even when active; must be
--     >= idle timeout (default 480 = 8h).
-- Enforcement lives in the NextAuth jwt callback (lib/auth.ts), which reads
-- this row live: new policy bites at the next authoritative validation, and
-- existing sessions are grandfathered (unstamped sessions are recorded once,
-- never invalidated) so a policy edit cannot silently log everyone out.

create table if not exists public.security_policies (
  key text primary key,
  persistent_session_enabled boolean not null default false,
  idle_timeout_minutes integer not null default 30,
  absolute_session_minutes integer not null default 480,
  version integer not null default 1,
  updated_by uuid references public.user_accounts(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint security_policies_idle_range
    check (idle_timeout_minutes between 10 and 480),
  constraint security_policies_absolute_range
    check (absolute_session_minutes between 60 and 1440),
  constraint security_policies_absolute_gte_idle
    check (absolute_session_minutes >= idle_timeout_minutes),
  constraint security_policies_version_check check (version > 0)
);

alter table public.security_policies enable row level security;

-- Server-side last-activity stamp for idle-timeout enforcement. Nullable =
-- never seen under the new regime: the session callback stamps it and allows
-- the request once (grandfathering), so a policy deploy can never silently
-- log everyone out. Written at sign-in and at most once per minute of
-- activity; read on every authenticated request. Authentication material is
-- never written here.
alter table public.user_accounts
  add column if not exists last_seen_at timestamptz;

insert into public.security_policies (key)
values ('default')
on conflict (key) do nothing;

-- System Administrator (admin role) ONLY — Owner holds read-only visibility
-- and never maintains low-level authentication configuration.
create or replace function public.admin_update_security_policy(
  p_persistent_session_enabled boolean,
  p_idle_timeout_minutes integer,
  p_absolute_session_minutes integer,
  p_reason text,
  p_expected_version integer,
  p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$declare actor text;p public.security_policies%rowtype;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor<>'admin'then raise exception'SECURITY_ADMIN_ONLY';end if;select * into p from security_policies where key='default'for update;if not found then raise exception'POLICY_NOT_FOUND';end if;if p.version<>p_expected_version then raise exception'POLICY_STALE';end if;if p_idle_timeout_minutes is null or p_idle_timeout_minutes not between 10 and 480 or p_absolute_session_minutes is null or p_absolute_session_minutes not between 60 and 1440 or p_absolute_session_minutes<p_idle_timeout_minutes or p_persistent_session_enabled is null or nullif(trim(p_reason),'')is null then raise exception'INVALID_SECURITY_POLICY';end if;
 update security_policies set persistent_session_enabled=p_persistent_session_enabled,idle_timeout_minutes=p_idle_timeout_minutes,absolute_session_minutes=p_absolute_session_minutes,version=version+1,updated_by=p_actor_user_id,updated_at=now()where key='default';insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'security_policy_updated','security_policy','default',to_jsonb(p),jsonb_build_object('persistentSessionEnabled',p_persistent_session_enabled,'idleTimeoutMinutes',p_idle_timeout_minutes,'absoluteSessionMinutes',p_absolute_session_minutes,'reason',trim(p_reason),'version',p.version+1));return jsonb_build_object('version',p.version+1);end$$;

revoke all on table public.security_policies from public,anon,authenticated;
grant all on table public.security_policies to service_role;
revoke all on function public.admin_update_security_policy(boolean,integer,integer,text,integer,uuid)from public,anon,authenticated;
revoke execute on function public.admin_update_security_policy(boolean,integer,integer,text,integer,uuid)from anon,authenticated;
grant execute on function public.admin_update_security_policy(boolean,integer,integer,text,integer,uuid)to service_role;
