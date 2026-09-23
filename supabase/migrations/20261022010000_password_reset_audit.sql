-- 20261022010000_password_reset_audit.sql
--
-- Selfie-gated password reset audit. Recovery links stay one-time and
-- unauthenticated by design; this adds a blocking identity-proof step (a
-- staged selfie) plus a dedicated audit table recording every reset attempt
-- with IP, OTP state, and the selfie storage path (never the image bytes).
-- Selfies live in a private bucket, served to admins only via short-lived
-- signed URLs minted server-side.

-- ---------------------------------------------------------------------------
-- 1. Reset-attempt ledger. user_id stays nullable: a request may name an
-- unknown address (enumeration-safe generic responses), and only a resolved
-- account links a row to user_accounts.
-- ---------------------------------------------------------------------------
create table if not exists public.password_reset_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.user_accounts(id) on delete cascade,
  token_id uuid references public.account_recovery_tokens(id) on delete set null,
  challenge_id uuid references public.auth_otp_challenges(id) on delete set null,
  email text not null,
  ip_address text,
  user_agent text,
  otp_verified boolean not null default false,
  selfie_url text,
  status text not null default 'requested'
    check (status in ('requested', 'otp_verified', 'completed', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists password_reset_logs_email_idx
  on public.password_reset_logs (email, created_at desc);
create index if not exists password_reset_logs_status_idx
  on public.password_reset_logs (status, created_at desc);

alter table public.password_reset_logs enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Private `recovery-selfies` bucket. No public policy, no RLS policy:
-- service-role only, same pattern as `payment-proofs` (20260921010000).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recovery-selfies', 'recovery-selfies', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. complete_account_recovery gains the blocking selfie proof. New overload
-- replaces the old two-arg signature — exactly one signature lives. The
-- selfie path must be one this flow minted (recovery-selfies/<uuid>.<ext>).
-- ---------------------------------------------------------------------------
create or replace function public.complete_account_recovery(
  p_token_hash text,
  p_password_hash text,
  p_selfie_path text)
returns uuid language plpgsql security definer set search_path=public as $$
declare tok account_recovery_tokens%rowtype; begin
  select * into tok from account_recovery_tokens
    where token_hash = p_token_hash and used_at is null and expires_at > now() for update;
  if not found then raise exception 'RECOVERY_TOKEN_INVALID'; end if;
  if length(p_password_hash) < 50 then raise exception 'INVALID_PASSWORD_HASH'; end if;
  if nullif(trim(coalesce(p_selfie_path, '')), '') is null
    or p_selfie_path !~ '^recovery-selfies/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  then raise exception 'SELFIE_REQUIRED'; end if;
  update account_recovery_tokens set used_at = now() where id = tok.id;
  update user_accounts set password_hash = p_password_hash, recovery_required = false,
    account_status = 'active', active = true, auth_version = auth_version + 1, updated_at = now()
    where id = tok.user_id;
  insert into audit_logs (user_id, action, entity_type, entity_id, after_data)
    values (tok.user_id, 'account_recovery_completed', 'user_account', tok.user_id::text,
            jsonb_build_object('recoveryTokenId', tok.id, 'selfiePath', p_selfie_path));
  update public.password_reset_logs set status = 'completed', completed_at = now(), selfie_url = p_selfie_path
    where token_id = tok.id and status <> 'completed';
  return tok.user_id;
end$$;

drop function if exists public.complete_account_recovery(text, text);

-- ---------------------------------------------------------------------------
-- 4. Reset challenges share the OTP lifecycle table under their own purpose.
-- ---------------------------------------------------------------------------
alter table public.auth_otp_challenges drop constraint if exists auth_otp_challenges_purpose_check;
alter table public.auth_otp_challenges
  add constraint auth_otp_challenges_purpose_check check (purpose in ('login', 'password_reset'));

revoke all on table public.password_reset_logs from public, anon, authenticated;
grant all on table public.password_reset_logs to service_role;
revoke all on function public.complete_account_recovery(text, text, text) from public, anon, authenticated;
grant execute on function public.complete_account_recovery(text, text, text) to service_role;
