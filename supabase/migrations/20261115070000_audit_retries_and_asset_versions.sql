begin;

create function public.read_booking_hold_attempt(p_user uuid,p_attempt uuid,p_details jsonb)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare prior booking_hold_attempts%rowtype; hold booking_holds%rowtype;
begin
  if not exists(select 1 from user_accounts where id=p_user and active and role='guest' and not recovery_required) then
    raise exception 'CUSTOMER_ACCESS_REQUIRED';
  end if;
  select * into prior from booking_hold_attempts where user_id=p_user and attempt_id=p_attempt;
  if not found then return null; end if;
  if prior.fingerprint is distinct from md5(p_details::text) then raise exception 'RETRY_PAYLOAD_CONFLICT'; end if;
  select * into hold from booking_holds where token=prior.hold_token and user_id=p_user;
  if not found or hold.status in ('cancelled','expired') or (hold.reservation_id is null and hold.expires_at<=now()) then
    raise exception 'HOLD_ATTEMPT_EXPIRED';
  end if;
  return jsonb_build_object('token',hold.token,'expiresAt',hold.expires_at,'replayed',true,'roomType',hold.room_type);
end $$;

create function public.maintenance_apply_asset_change(p_actor uuid,p_asset_id uuid,p_expected_updated timestamptz,p_action text,p_details jsonb)
returns void language plpgsql security definer set search_path=public as $$
declare asset maintenance_assets%rowtype;
begin
  if not exists(select 1 from user_accounts where id=p_actor and active and not recovery_required and role in ('maintenance','manager')) then
    raise exception 'ASSET_REGISTRY_FORBIDDEN';
  end if;
  select * into asset from maintenance_assets where id=p_asset_id for update;
  if not found then raise exception 'ASSET_NOT_FOUND'; end if;
  if asset.updated_at is distinct from p_expected_updated then raise exception 'ASSET_STALE'; end if;
  if p_action='update' then
    perform maintenance_update_asset(p_actor,p_asset_id,p_details->>'name',p_details->>'category',p_details->>'roomId',
      p_details->>'location',(p_details->>'serviceIntervalDays')::integer,p_details->>'notes');
  elsif p_action='deactivate' then
    perform maintenance_deactivate_asset(p_actor,p_asset_id,p_details->>'reason');
  else
    raise exception 'INVALID_ASSET_ACTION';
  end if;
end $$;

revoke all on function public.read_booking_hold_attempt(uuid,uuid,jsonb),
  public.maintenance_apply_asset_change(uuid,uuid,timestamptz,text,jsonb) from public,anon,authenticated;
grant execute on function public.read_booking_hold_attempt(uuid,uuid,jsonb),
  public.maintenance_apply_asset_change(uuid,uuid,timestamptz,text,jsonb) to service_role;

commit;
