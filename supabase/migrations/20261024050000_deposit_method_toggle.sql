-- Exclusive deposit-method toggle: exactly one of PayMongo instant auto-pay or
-- manual GCash verification is offered for new reservation deposits (plus an
-- off state). Pending payments on the previous path finish honestly — both
-- verification paths stay functional regardless of the current mode.
alter table public.hotel_operational_policies
  add column if not exists deposit_method text not null default 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'hotel_operational_policies_deposit_method_check'
  ) then
    alter table public.hotel_operational_policies
      add constraint hotel_operational_policies_deposit_method_check
      check (deposit_method in ('paymongo', 'manual', 'off'));
  end if;
end $$;

-- Owner + Admin can switch the deposit method. Destination details stay on the
-- Owner-only RPC; this only flips the mode with its own audited action.
create or replace function public.admin_update_deposit_method(
  p_deposit_method text, p_reason text, p_expected_version integer, p_actor_user_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor text;
  p hotel_operational_policies%rowtype;
begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or (actor <> 'owner' and actor <> 'admin') then
    raise exception 'DEPOSIT_METHOD_FORBIDDEN';
  end if;
  if p_deposit_method not in ('paymongo', 'manual', 'off') then
    raise exception 'INVALID_DEPOSIT_METHOD';
  end if;
  if nullif(trim(p_reason), '') is null then raise exception 'INVALID_DEPOSIT_METHOD'; end if;
  select * into p from hotel_operational_policies where key = 'default' for update;
  if not found then raise exception 'POLICY_NOT_FOUND'; end if;
  if p.version <> p_expected_version then raise exception 'POLICY_STALE'; end if;
  update hotel_operational_policies
    set deposit_method = p_deposit_method, version = version + 1, updated_at = now()
    where key = 'default';
  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
    values (p_actor_user_id, 'admin_update_deposit_method', 'hotel_payment_destination', 'default',
      jsonb_build_object('depositMethod', p.deposit_method, 'version', p.version),
      jsonb_build_object('depositMethod', p_deposit_method, 'reason', trim(p_reason), 'version', p.version + 1));
  return jsonb_build_object('version', p.version + 1, 'depositMethod', p_deposit_method);
end $$;

revoke all on function public.admin_update_deposit_method(text, text, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_update_deposit_method(text, text, integer, uuid)
  to service_role;
