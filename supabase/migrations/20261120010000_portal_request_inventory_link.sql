-- Capture the active catalog's stock link when a guest files a portal request.
-- Keep the existing retry fingerprint, reservation lock, and historical links.
begin;

create or replace function public.customer_submit_guest_requests(
  p_user_id uuid, p_reservation_id text, p_request_types text[], p_description text,
  p_requested_action jsonb, p_idempotency_key uuid
)
returns table(id uuid, status text)
language plpgsql security definer set search_path = public as $$
declare
  actor text;
  stay public.reservations%rowtype;
  existing public.guest_requests%rowtype;
  department_name text;
  request_label text;
  stock_item text;
  request_text text;
  request_key uuid;
  request_type_code text;
  request_id uuid;
  requested_action_value jsonb := coalesce(p_requested_action, '{}'::jsonb);
  description_value text := trim(coalesce(p_description, ''));
  fingerprint text := md5(jsonb_build_array(to_jsonb(p_request_types), description_value, requested_action_value)::text);
begin
  select ua.role into actor from public.user_accounts ua where ua.id = p_user_id and ua.active;
  if actor is distinct from 'guest' then raise exception 'CUSTOMER_ACCESS_REQUIRED'; end if;
  if array_length(p_request_types, 1) is null or array_length(p_request_types, 1) > 12
    or length(coalesce(p_description, '')) > 500 or p_idempotency_key is null then
    raise exception 'INVALID_REQUEST';
  end if;
  select * into stay from public.reservations r
    where r.id = p_reservation_id and r.user_id = p_user_id for update;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if stay.status not in ('confirmed', 'checked_in') then raise exception 'RESERVATION_NOT_REQUEST_READY'; end if;

  perform pg_advisory_xact_lock(hashtextextended('guest-request:' || p_idempotency_key, 0));
  if exists (select 1 from public.guest_requests gr where gr.batch_id = p_idempotency_key and
    (gr.reservation_id is distinct from stay.id or gr.request_fingerprint is not null and gr.request_fingerprint <> fingerprint)) then
    raise exception 'RETRY_PAYLOAD_CONFLICT';
  end if;

  foreach request_type_code in array p_request_types loop
    request_type_code := nullif(trim(request_type_code), '');
    if request_type_code is null then continue; end if;
    request_key := md5(p_idempotency_key::text || '|' || request_type_code)::uuid;
    select * into existing from public.guest_requests gr where gr.idempotency_key = request_key;
    if request_type_code = 'stay_extension' and (
      coalesce(p_requested_action->>'requestedCheckOut', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or (p_requested_action->>'requestedCheckOut')::date <= stay.check_out
    ) then raise exception 'INVALID_EXTENSION_DATE'; end if;

    select route.department, route.label, catalog.inventory_item_id
      into department_name, request_label, stock_item
      from public.guest_request_route(request_type_code) route
      left join public.guest_request_catalog catalog on catalog.value = request_type_code and catalog.active;
    request_text := case when description_value = '' then request_label else request_label || ': ' || description_value end;
    if existing.id is not null then
      if existing.reservation_id is distinct from stay.id or existing.request is distinct from request_text
        or existing.requested_action is distinct from requested_action_value then
        raise exception 'RETRY_PAYLOAD_CONFLICT';
      end if;
      return query select existing.id, existing.status;
      continue;
    end if;

    insert into public.guest_requests(
      reservation_id, guest_id, request, request_type, requested_action, department,
      priority, status, batch_id, approval_status, idempotency_key, request_fingerprint, inventory_item_id
    ) values (
      stay.id, stay.guest_id, request_text, request_type_code, requested_action_value, department_name,
      'normal', 'open', p_idempotency_key, 'pending', request_key, fingerprint, stock_item
    ) returning guest_requests.id into request_id;
    insert into public.audit_logs(user_id, action, entity_type, entity_id, after_data)
      values (p_user_id, 'customer_submit_guest_requests', 'guest_request', request_id::text,
        jsonb_build_object('reservationId', stay.id, 'requestType', request_type_code,
          'department', department_name, 'batchId', p_idempotency_key));
    return query select request_id, 'open'::text;
  end loop;
end $$;

revoke all on function public.customer_submit_guest_requests(uuid,text,text[],text,jsonb,uuid) from public, anon, authenticated;
grant execute on function public.customer_submit_guest_requests(uuid,text,text[],text,jsonb,uuid) to service_role;

commit;
