begin;

create table public.auth_session_activity (
  session_id text primary key,
  user_id uuid not null references public.user_accounts(id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
create index auth_session_activity_expiry on public.auth_session_activity(last_seen_at);
alter table public.auth_session_activity enable row level security;
revoke all on public.auth_session_activity from public,anon,authenticated;
grant select,insert,update on public.auth_session_activity to service_role;

create or replace function public.cleanup_auth_request_budgets()
returns void language sql security definer set search_path=public as $$
  delete from auth_request_budgets where window_start < now()-interval '48 hours';
  delete from auth_session_activity where last_seen_at < now()-interval '48 hours';
$$;

create or replace function public.auth_otp_issue_for_purpose(
  p_purpose text,
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
  if p_purpose is null or p_purpose not in ('login','password_reset') or p_user_id is null or p_challenge_id is null or nullif(trim(p_code_verifier), '') is null
    or p_ttl_seconds is null or p_ttl_seconds not in (180, 300, 600)
    or p_cooldown_seconds is null or p_cooldown_seconds not in (30, 60, 120)
  then raise exception 'INVALID_OTP_ISSUE'; end if;

  perform pg_advisory_xact_lock(hashtext('otp:' || p_user_id::text));

  select * into prior from auth_otp_challenges
    where user_id = p_user_id and purpose=p_purpose and consumed_at is null and invalidated_at is null
    order by created_at desc limit 1 for update;
  if found and prior.resend_available_at > now() then raise exception 'OTP_RESEND_COOLDOWN'; end if;

  select count(*) into recent from audit_logs
    where action = 'otp_challenge_created' and user_id = p_user_id
      and created_at > now() - interval '1 hour';
  if recent >= 10 then raise exception 'OTP_RATE_LIMITED'; end if;

  update auth_otp_challenges set invalidated_at = now()
    where user_id = p_user_id and purpose=p_purpose and consumed_at is null and invalidated_at is null;

  insert into auth_otp_challenges (id, user_id, purpose, code_verifier, expires_at, resend_available_at)
    values (p_challenge_id, p_user_id, p_purpose, trim(p_code_verifier),
            now() + make_interval(secs => p_ttl_seconds),
            now() + make_interval(secs => p_cooldown_seconds))
    returning * into challenge;

  insert into audit_logs (user_id, action, entity_type, entity_id, after_data)
    values (p_user_id, 'otp_challenge_created', 'otp_challenge', challenge.id::text,
            jsonb_build_object('expiresAt', challenge.expires_at));

  return jsonb_build_object('challengeId', challenge.id, 'expiresAt', challenge.expires_at,
                            'resendAvailableAt', challenge.resend_available_at);
end$$;

create or replace function public.auth_otp_issue(p_user_id uuid,p_challenge_id uuid,p_code_verifier text,
  p_ttl_seconds integer,p_cooldown_seconds integer)
returns jsonb language sql security definer set search_path=public as $$
  select auth_otp_issue_for_purpose('login',p_user_id,p_challenge_id,p_code_verifier,p_ttl_seconds,p_cooldown_seconds);
$$;

create function public.auth_otp_verify_for_purpose(p_purpose text,p_challenge_id uuid,p_code_verifier text,p_max_attempts integer)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from auth_otp_challenges where id=p_challenge_id and purpose=p_purpose for update) then
    return jsonb_build_object('error','OTP_NOT_FOUND');
  end if;
  return auth_otp_verify(p_challenge_id,p_code_verifier,p_max_attempts);
end $$;

revoke execute on function public.auth_otp_issue_for_purpose(text,uuid,uuid,text,integer,integer),
  public.auth_otp_verify_for_purpose(text,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.auth_otp_issue_for_purpose(text,uuid,uuid,text,integer,integer),
  public.auth_otp_verify_for_purpose(text,uuid,text,integer) to service_role;

commit;
