-- Portal requests and booking requests must retain the catalog's stock link.
-- Existing requests keep their recorded links for fulfillment and audit.
create or replace function public.customer_submit_guest_requests(
  p_user_id uuid, p_reservation_id text, p_request_types text[], p_description text,
  p_requested_action jsonb, p_idempotency_key uuid
)
returns table(id uuid, status text)
language plpgsql security definer set search_path=public as $$
declare
  actor text;
  stay reservations%rowtype;
  existing guest_requests%rowtype;
  department_name text;
  request_label text;
  stock_item text;
  request_text text;
  request_key uuid;
  request_type_code text;
  request_id uuid;
begin
  select role into actor from user_accounts where user_accounts.id=p_user_id and active;
  if actor is distinct from 'guest' then raise exception 'CUSTOMER_ACCESS_REQUIRED'; end if;
  if array_length(p_request_types, 1) is null or array_length(p_request_types, 1)>12
    or length(coalesce(p_description, ''))>500 or p_idempotency_key is null then
    raise exception 'INVALID_REQUEST';
  end if;
  select * into stay from reservations
    where reservations.id=p_reservation_id and user_id=p_user_id for update;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if stay.status not in ('confirmed', 'checked_in') then raise exception 'RESERVATION_NOT_REQUEST_READY'; end if;
  perform pg_advisory_xact_lock(hashtextextended('guest-request-batch:'||p_idempotency_key::text, 0));
  if exists(select 1 from guest_requests where batch_id=p_idempotency_key
    and reservation_id is distinct from stay.id) then
    raise exception 'REQUEST_IDEMPOTENCY_CONFLICT';
  end if;

  foreach request_type_code in array p_request_types loop
    request_type_code:=nullif(trim(request_type_code), '');
    if request_type_code is null then continue; end if;
    request_key:=md5(p_idempotency_key::text||'|'||request_type_code)::uuid;
    select * into existing from guest_requests where idempotency_key=request_key;
    if found then
      if existing.reservation_id is distinct from stay.id then raise exception 'REQUEST_IDEMPOTENCY_CONFLICT'; end if;
      return query select existing.id, existing.status;
      continue;
    end if;
    if request_type_code='stay_extension' and (
      coalesce(p_requested_action->>'requestedCheckOut', '')!~'^\d{4}-\d{2}-\d{2}$'
      or (p_requested_action->>'requestedCheckOut')::date<=stay.check_out
    ) then raise exception 'INVALID_EXTENSION_DATE'; end if;

    select route.department, route.label, catalog.inventory_item_id
      into department_name, request_label, stock_item
      from public.guest_request_route(request_type_code) route
      left join guest_request_catalog catalog on catalog.value=request_type_code and catalog.active;
    request_text:=case when nullif(trim(p_description), '') is null
      then request_label else request_label||': '||trim(p_description) end;
    insert into guest_requests(
      reservation_id, guest_id, request, request_type, requested_action, department,
      priority, status, batch_id, approval_status, idempotency_key, inventory_item_id
    ) values (
      stay.id, stay.guest_id, request_text, request_type_code, coalesce(p_requested_action, '{}'),
      department_name, 'normal', 'open', p_idempotency_key, 'pending', request_key, stock_item
    ) returning guest_requests.id into request_id;
    insert into audit_logs(user_id, action, entity_type, entity_id, after_data)
      values(p_user_id, 'customer_submit_guest_requests', 'guest_request', request_id::text,
        jsonb_build_object('reservationId', stay.id, 'requestType', request_type_code,
          'department', department_name, 'batchId', p_idempotency_key));
    return query select request_id, 'open'::text;
  end loop;
end$$;

revoke all on function public.customer_submit_guest_requests(uuid,text,text[],text,jsonb,uuid)
  from public, anon, authenticated;
grant execute on function public.customer_submit_guest_requests(uuid,text,text[],text,jsonb,uuid)
  to service_role;
