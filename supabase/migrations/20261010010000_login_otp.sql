-- 20261010010000_login_otp.sql
--
-- Genuine email login OTP (Nodemailer, server-side). Extends the dedicated
-- security_policies table — never hotel_operational_policies, whose columns
-- freeze into booking snapshots — and adds the challenge lifecycle table.
-- Recovery links are untouched by everything here.
--
-- OTP values never touch PostgreSQL: the app stores only an HMAC verifier
-- (OTP_HASH_SECRET, server-only) and compares it server-side. See D-022.

-- ---------------------------------------------------------------------------
-- 1. OTP policy columns (all default OFF / safe until SMTP is verified).
-- ---------------------------------------------------------------------------
alter table public.security_policies
  add column if not exists login_otp_enabled boolean not null default false;
alter table public.security_policies
  add column if not exists otp_ttl_seconds integer not null default 300;
alter table public.security_policies
  add column if not exists otp_resend_cooldown_seconds integer not null default 60;
alter table public.security_policies
  add column if not exists otp_max_attempts integer not null default 5;

do $$begin
  alter table public.security_policies add constraint security_policies_otp_ttl_set check (otp_ttl_seconds in (180, 300, 600));
exception when duplicate_object then null; end$$;
do $$begin
  alter table public.security_policies add constraint security_policies_otp_cooldown_set check (otp_resend_cooldown_seconds in (30, 60, 120));
exception when duplicate_object then null; end$$;
do $$begin
  alter table public.security_policies add constraint security_policies_otp_attempts_set check (otp_max_attempts in (3, 5, 10));
exception when duplicate_object then null; end$$;

-- ---------------------------------------------------------------------------
-- 2. Challenge lifecycle table. One active challenge per user; resend
-- rotates (invalidates the prior row). No OTP value is stored — only the
-- HMAC verifier the app recomputes from the submitted code.
-- ---------------------------------------------------------------------------
create table if not exists public.auth_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  purpose text not null default 'login' check (purpose = 'login'),
  code_verifier text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  resend_available_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint auth_otp_challenges_expiry_check check (expires_at > created_at)
);

create index if not exists auth_otp_challenges_user_idx
  on public.auth_otp_challenges (user_id, created_at desc);
-- Single-active is enforced by auth_otp_issue under a per-user advisory lock
-- (a partial unique index cannot use now(), which is not immutable).

alter table public.auth_otp_challenges enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Issue / rotate. Called only from the login flow after bcrypt succeeds
-- (service_role). Enforces resend cooldown and an hourly per-user issue cap
-- counted from the audit trail — no new tables, no in-memory counters.
-- ---------------------------------------------------------------------------
create or replace function public.auth_otp_issue(
  p_user_id uuid,
  p_challenge_id uuid,
  p_code_verifier text,
  p_ttl_seconds integer,
  p_cooldown_seconds integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  prior public.auth_otp_challenges%rowtype;
  recent integer;
  challenge public.auth_otp_challenges%rowtype;
begin
  if p_user_id is null or p_challenge_id is null or nullif(trim(p_code_verifier), '') is null
    or p_ttl_seconds is null or p_ttl_seconds not in (180, 300, 600)
    or p_cooldown_seconds is null or p_cooldown_seconds not in (30, 60, 120)
  then raise exception 'INVALID_OTP_ISSUE'; end if;

  perform pg_advisory_xact_lock(hashtext('otp:' || p_user_id::text));

  select * into prior from auth_otp_challenges
    where user_id = p_user_id and consumed_at is null and invalidated_at is null
    order by created_at desc limit 1 for update;
  if found and prior.resend_available_at > now() then raise exception 'OTP_RESEND_COOLDOWN'; end if;

  select count(*) into recent from audit_logs
    where action = 'otp_challenge_created' and user_id = p_user_id
      and created_at > now() - interval '1 hour';
  if recent >= 10 then raise exception 'OTP_RATE_LIMITED'; end if;

  update auth_otp_challenges set invalidated_at = now()
    where user_id = p_user_id and consumed_at is null and invalidated_at is null;

  insert into auth_otp_challenges (id, user_id, code_verifier, expires_at, resend_available_at)
    values (p_challenge_id, p_user_id, trim(p_code_verifier),
            now() + make_interval(secs => p_ttl_seconds),
            now() + make_interval(secs => p_cooldown_seconds))
    returning * into challenge;

  insert into audit_logs (user_id, action, entity_type, entity_id, after_data)
    values (p_user_id, 'otp_challenge_created', 'otp_challenge', challenge.id::text,
            jsonb_build_object('expiresAt', challenge.expires_at));

  return jsonb_build_object('challengeId', challenge.id, 'expiresAt', challenge.expires_at,
                            'resendAvailableAt', challenge.resend_available_at);
end$$;

-- ---------------------------------------------------------------------------
-- 4. Verify. Atomic compare-and-set under a row lock: concurrent submissions
-- cannot consume the same challenge twice. Every outcome is audited without
-- the code or verifier.
-- ---------------------------------------------------------------------------
create or replace function public.auth_otp_verify(
  p_challenge_id uuid,
  p_code_verifier text,
  p_max_attempts integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  challenge public.auth_otp_challenges%rowtype;
begin
  if p_challenge_id is null or nullif(trim(p_code_verifier), '') is null
    or p_max_attempts is null or p_max_attempts not in (3, 5, 10)
  then raise exception 'INVALID_OTP_VERIFY'; end if;

  select * into challenge from auth_otp_challenges where id = p_challenge_id for update;
  if not found then raise exception 'OTP_CHALLENGE_INVALID'; end if;
  if challenge.consumed_at is not null then raise exception 'OTP_ALREADY_USED'; end if;
  if challenge.invalidated_at is not null then raise exception 'OTP_INVALIDATED'; end if;
  if challenge.expires_at <= now() then
    insert into audit_logs (user_id, action, entity_type, entity_id)
      values (challenge.user_id, 'otp_challenge_expired', 'otp_challenge', challenge.id::text);
    raise exception 'OTP_EXPIRED';
  end if;
  if challenge.attempt_count >= p_max_attempts then
    update auth_otp_challenges set invalidated_at = now() where id = challenge.id;
    insert into audit_logs (user_id, action, entity_type, entity_id, after_data)
      values (challenge.user_id, 'otp_verification_failed', 'otp_challenge', challenge.id::text,
              jsonb_build_object('reason', 'too_many_attempts'));
    raise exception 'OTP_TOO_MANY_ATTEMPTS';
  end if;

  if challenge.code_verifier <> trim(p_code_verifier) then
    update auth_otp_challenges
      set attempt_count = attempt_count + 1,
          invalidated_at = case when attempt_count + 1 >= p_max_attempts then now() else invalidated_at end
      where id = challenge.id;
    insert into audit_logs (user_id, action, entity_type, entity_id, after_data)
      values (challenge.user_id, 'otp_verification_failed', 'otp_challenge', challenge.id::text,
              jsonb_build_object('reason', 'incorrect',
                                 'attemptsLeft', greatest(p_max_attempts - (challenge.attempt_count + 1), 0)));
    raise exception 'OTP_INCORRECT';
  end if;

  update auth_otp_challenges set consumed_at = now() where id = challenge.id;
  insert into audit_logs (user_id, action, entity_type, entity_id)
    values (challenge.user_id, 'otp_verification_succeeded', 'otp_challenge', challenge.id::text);

  return jsonb_build_object('userId', challenge.user_id);
end$$;

-- ---------------------------------------------------------------------------
-- 5. Policy update gains the four OTP fields (same version/reason/audit
-- contract). New overload replaces the old one — exactly one signature lives.
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_security_policy(
  p_persistent_session_enabled boolean,
  p_idle_timeout_minutes integer,
  p_absolute_session_minutes integer,
  p_login_otp_enabled boolean,
  p_otp_ttl_seconds integer,
  p_otp_resend_cooldown_seconds integer,
  p_otp_max_attempts integer,
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
  if p_idle_timeout_minutes is null or p_idle_timeout_minutes not between 10 and 480
    or p_absolute_session_minutes is null or p_absolute_session_minutes not between 60 and 1440
    or p_absolute_session_minutes < p_idle_timeout_minutes
    or p_persistent_session_enabled is null
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
                               'reason', trim(p_reason), 'version', p.version + 1));
  return jsonb_build_object('version', p.version + 1);
end$$;

drop function if exists public.admin_update_security_policy(boolean,integer,integer,text,integer,uuid);

revoke all on table public.auth_otp_challenges from public,anon,authenticated;
grant all on table public.auth_otp_challenges to service_role;
revoke all on function public.auth_otp_issue(uuid,uuid,text,integer,integer) from public,anon,authenticated;
revoke execute on function public.auth_otp_issue(uuid,uuid,text,integer,integer) from anon,authenticated;
grant execute on function public.auth_otp_issue(uuid,uuid,text,integer,integer) to service_role;
revoke all on function public.auth_otp_verify(uuid,text,integer) from public,anon,authenticated;
revoke execute on function public.auth_otp_verify(uuid,text,integer) from anon,authenticated;
grant execute on function public.auth_otp_verify(uuid,text,integer) to service_role;
revoke all on function public.admin_update_security_policy(boolean,integer,integer,boolean,integer,integer,integer,text,integer,uuid) from public,anon,authenticated;
revoke execute on function public.admin_update_security_policy(boolean,integer,integer,boolean,integer,integer,integer,text,integer,uuid) from anon,authenticated;
grant execute on function public.admin_update_security_policy(boolean,integer,integer,boolean,integer,integer,integer,text,integer,uuid) to service_role;
