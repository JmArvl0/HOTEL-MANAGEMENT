-- 20261023010000_cookie_policy.sql
--
-- Customizable cookie policy + 1-minute-to-hours timeouts.
-- Adds security_policies.cookie_enabled (default true = current behavior).
-- OFF means browser-session only: auth still works, cookies carry no maxAge
-- (die on browser close), Remember-Me is hidden, and live persistent sessions
-- collapse to the idle window at the next validation. It never blocks login.
-- Also relaxes idle floor 10 -> 1 minute and absolute floor 60 -> 5 minutes so
-- admins can pick 1-59 minutes plus hour options (absolute must stay >= idle).

alter table public.security_policies
  add column if not exists cookie_enabled boolean not null default true;

alter table public.security_policies drop constraint if exists security_policies_idle_range;
alter table public.security_policies
  add constraint security_policies_idle_range
  check (idle_timeout_minutes between 1 and 480);

alter table public.security_policies drop constraint if exists security_policies_absolute_range;
alter table public.security_policies
  add constraint security_policies_absolute_range
  check (absolute_session_minutes between 5 and 1440);

create or replace function public.admin_update_security_policy(
  p_persistent_session_enabled boolean,
  p_idle_timeout_minutes integer,
  p_absolute_session_minutes integer,
  p_login_otp_enabled boolean,
  p_otp_ttl_seconds integer,
  p_otp_resend_cooldown_seconds integer,
  p_otp_max_attempts integer,
  p_cookie_enabled boolean,
  p_reason text,
  p_expected_version integer,
  p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text; p public.security_policies%rowtype; begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or actor <> 'admin' then raise exception 'SECURITY_ADMIN_ONLY'; end if;
  select * into p from security_policies where key = 'default' for update;
  if not found then raise exception 'POLICY_NOT_FOUND'; end if;
  if p.version <> p_expected_version then raise exception 'POLICY_STALE'; end if;
  if p_idle_timeout_minutes is null or p_idle_timeout_minutes not between 1 and 480
    or p_absolute_session_minutes is null or p_absolute_session_minutes not between 5 and 1440
    or p_absolute_session_minutes < p_idle_timeout_minutes
    or p_persistent_session_enabled is null
    or p_cookie_enabled is null
    or p_login_otp_enabled is null
    or p_otp_ttl_seconds is null or p_otp_ttl_seconds not in (180, 300, 600)
    or p_otp_resend_cooldown_seconds is null or p_otp_resend_cooldown_seconds not in (30, 60, 120)
    or p_otp_max_attempts is null or p_otp_max_attempts not in (3, 5, 10)
    or nullif(trim(p_reason), '') is null
  then raise exception 'INVALID_SECURITY_POLICY'; end if;
  update security_policies
    set persistent_session_enabled = p_persistent_session_enabled,
        idle_timeout_minutes = p_idle_timeout_minutes,
        absolute_session_minutes = p_absolute_session_minutes,
        login_otp_enabled = p_login_otp_enabled,
        otp_ttl_seconds = p_otp_ttl_seconds,
        otp_resend_cooldown_seconds = p_otp_resend_cooldown_seconds,
        otp_max_attempts = p_otp_max_attempts,
        cookie_enabled = p_cookie_enabled,
        version = version + 1, updated_by = p_actor_user_id, updated_at = now()
    where key = 'default';
  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
    values (p_actor_user_id, 'security_policy_updated', 'security_policy', 'default', to_jsonb(p),
            jsonb_build_object('persistentSessionEnabled', p_persistent_session_enabled,
                               'idleTimeoutMinutes', p_idle_timeout_minutes,
                               'absoluteSessionMinutes', p_absolute_session_minutes,
                               'loginOtpEnabled', p_login_otp_enabled,
                               'otpTtlSeconds', p_otp_ttl_seconds,
                               'otpResendCooldownSeconds', p_otp_resend_cooldown_seconds,
                               'otpMaxAttempts', p_otp_max_attempts,
                               'cookieEnabled', p_cookie_enabled,
                               'reason', trim(p_reason), 'version', p.version + 1));
  return jsonb_build_object('version', p.version + 1);
end$$;

drop function if exists public.admin_update_security_policy(boolean,integer,integer,boolean,integer,integer,integer,text,integer,uuid);

revoke all on function public.admin_update_security_policy(boolean,integer,integer,boolean,integer,integer,integer,boolean,text,integer,uuid) from public,anon,authenticated;
revoke execute on function public.admin_update_security_policy(boolean,integer,integer,boolean,integer,integer,integer,boolean,text,integer,uuid) from anon,authenticated;
grant execute on function public.admin_update_security_policy(boolean,integer,integer,boolean,integer,integer,integer,boolean,text,integer,uuid) to service_role;
