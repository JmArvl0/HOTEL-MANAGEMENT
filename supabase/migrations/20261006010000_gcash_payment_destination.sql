-- GCash payment destination: the Owner controls WHERE customer reservation
-- deposits go; System Administration keeps read-only visibility plus technical
-- health. Accounting verification and every booking/pricing/hold rule are
-- untouched — this only adds the destination configuration surface.
--
-- Storage: a PRIVATE `payment-qr` bucket (same pattern as `payment-proofs`).
-- The official QR is customer-visible by design, but it is served through
-- server-minted content (never a permanent public URL), so a replaced QR
-- stops rendering as soon as the policy row points elsewhere.

alter table public.hotel_operational_policies
  add column if not exists gcash_account_name text,
  add column if not exists gcash_mobile_number text,
  add column if not exists gcash_qr_storage_path text,
  add column if not exists gcash_enabled boolean not null default false;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-qr', 'payment-qr', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

-- Owner-only destination update. The general policy RPC is deliberately NOT
-- extended: destination changes get their own audited action, their own
-- optimistic-concurrency version check (shared counter), and a guard the
-- System Administrator role can never satisfy. The mobile number is stored in
-- canonical 09XXXXXXXXX form and masked in the audit trail.
create or replace function public.owner_update_payment_destination(
  p_account_name text, p_mobile_number text, p_qr_storage_path text,
  p_enabled boolean, p_reason text, p_expected_version integer, p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor text;
  p hotel_operational_policies%rowtype;
  masked text;
begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or actor <> 'owner' then raise exception 'PAYMENT_DESTINATION_OWNER_ONLY'; end if;
  select * into p from hotel_operational_policies where key = 'default' for update;
  if not found then raise exception 'POLICY_NOT_FOUND'; end if;
  if p.version <> p_expected_version then raise exception 'POLICY_STALE'; end if;
  if p_enabled
    and (nullif(trim(p_account_name), '') is null
      or nullif(trim(p_mobile_number), '') is null
      or nullif(trim(p_qr_storage_path), '') is null
      or trim(p_mobile_number) !~ '^09[0-9]{9}$'
      or trim(p_qr_storage_path) !~ '^gcash/[0-9a-f-]{36}\.(jpg|png|webp)$'
      or nullif(trim(p_reason), '') is null) then
    raise exception 'INVALID_PAYMENT_DESTINATION';
  end if;
  if nullif(trim(p_reason), '') is null then raise exception 'INVALID_PAYMENT_DESTINATION'; end if;
  if nullif(trim(p_qr_storage_path), '') is not null
    and trim(p_qr_storage_path) !~ '^gcash/[0-9a-f-]{36}\.(jpg|png|webp)$' then
    raise exception 'INVALID_PAYMENT_DESTINATION';
  end if;
  masked := case when nullif(trim(p_mobile_number), '') is null then null
    else '09******' || right(trim(p_mobile_number), 4) end;
  update hotel_operational_policies
    set gcash_account_name = nullif(trim(p_account_name), ''),
      gcash_mobile_number = nullif(trim(p_mobile_number), ''),
      gcash_qr_storage_path = nullif(trim(p_qr_storage_path), ''),
      gcash_enabled = p_enabled,
      version = version + 1, updated_at = now()
    where key = 'default';
  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
    values (p_actor_user_id, 'owner_update_payment_destination', 'hotel_payment_destination', 'default',
      jsonb_build_object('accountName', p.gcash_account_name,
        'mobileNumber', case when p.gcash_mobile_number is null then null
          else '09******' || right(p.gcash_mobile_number, 4) end,
        'qrConfigured', p.gcash_qr_storage_path is not null,
        'enabled', p.gcash_enabled, 'version', p.version),
      jsonb_build_object('accountName', nullif(trim(p_account_name), ''),
        'mobileNumber', masked,
        'qrConfigured', nullif(trim(p_qr_storage_path), '') is not null,
        'enabled', p_enabled, 'reason', trim(p_reason), 'version', p.version + 1));
  return jsonb_build_object('version', p.version + 1);
end $$;

revoke all on function public.owner_update_payment_destination(text, text, text, boolean, text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.owner_update_payment_destination(text, text, text, boolean, text, integer, uuid)
  to service_role;
