begin;

alter table public.reservations add column guest_phone text;

create function public.hotel_staff_booking_create(
  p_actor uuid, p_key uuid, p_guest_id text, p_guest_name text, p_email text, p_phone text,
  p_stay_phone text, p_room_type text, p_check_in date, p_check_out date, p_guest_count integer,
  p_source text, p_requests text, p_arrival text, p_quoted_total numeric, p_legacy boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  guest guests%rowtype;
  room_type room_types%rowtype;
  hotel_date date;
  booking_id text;
  reference text;
  amount numeric;
  rates jsonb;
  normalized_email text := nullif(lower(trim(p_email)), '');
  contact text;
  result jsonb;
  payload jsonb := jsonb_build_object(
    'guestId', p_guest_id, 'name', p_guest_name, 'email', p_email, 'phone', p_phone,
    'stayPhone', p_stay_phone, 'type', p_room_type, 'in', p_check_in, 'out', p_check_out,
    'guests', p_guest_count, 'source', p_source, 'requests', p_requests, 'arrival', p_arrival,
    'quote', p_quoted_total, 'legacy', p_legacy
  );
begin
  perform hotel_actor(p_actor, array['front_desk']);
  payload := jsonb_build_object('sha256', encode(sha256(convert_to(payload::text, 'UTF8')), 'hex'));
  result := hotel_request_result(p_key, 'staff_booking_create', 'reservation', p_actor, payload);
  if result is not null then return result; end if;

  -- Support same-actor replays started before this deployment.
  select r.id, r.confirmation_number, r.total into booking_id, reference, amount
  from reservations r where r.idempotency_key = p_key;
  if found then
    if p_legacy and exists (
      select 1 from audit_logs where entity_type = 'reservation' and entity_id = booking_id
        and action = 'create_staff_reservation' and user_id = p_actor
    ) then
      return jsonb_build_object('reservation_id', booking_id, 'confirmation_number', reference, 'total', amount);
    end if;
    raise exception 'IDEMPOTENCY_CONFLICT';
  end if;

  hotel_date := hotel_today();
  if p_check_in is null or p_check_out is null or p_check_in < hotel_date or p_check_out <= p_check_in
    or (not p_legacy and (p_check_in > hotel_date + 730 or p_check_out - p_check_in > 365))
    or (p_source = 'Walk-In' and not p_legacy and p_check_in <> hotel_date) then
    raise exception 'INVALID_DATES';
  end if;
  if p_guest_count is null or p_guest_count < 1 then raise exception 'INVALID_GUEST_COUNT'; end if;
  if p_source is null or p_source not in ('Front Desk', 'Walk-In', 'Phone') then
    raise exception 'INVALID_BOOKING_SOURCE';
  end if;

  -- Share the booking engine's room-type lock and availability rules.
  perform pg_advisory_xact_lock(hashtextextended(lower(p_room_type), 0));
  select * into room_type from room_types where name = p_room_type and active;
  if not found or p_guest_count > room_type.max_guests or
    hotel_available_units(p_room_type, p_check_in, p_check_out, null, null, null, now()) <= 0 then
    raise exception 'ROOM_TYPE_UNAVAILABLE';
  end if;
  select round(coalesce(sum(rate), 0), 2),
    coalesce(jsonb_agg(jsonb_build_object('date', night, 'rate', rate) order by night), '[]'::jsonb)
  into amount, rates from room_nightly_rates(p_room_type, p_check_in, p_check_out);
  if p_quoted_total is not null and amount <> p_quoted_total then raise exception 'BOOKING_QUOTE_CHANGED'; end if;

  if p_guest_id is not null then
    select * into guest from guests where id = p_guest_id for update;
    if not found or guest.merged_into_guest_id is not null then raise exception 'GUEST_PROFILE_CHANGED'; end if;
  else
    if nullif(trim(p_guest_name), '') is null or normalized_email is null or nullif(trim(p_phone), '') is null then
      raise exception 'INVALID_GUEST_DETAILS';
    end if;
    perform pg_advisory_xact_lock(hashtextextended(normalized_email, 7));
    select g.* into guest from guests g where g.id = coalesce(
      (select a.survivor_guest_id from guest_aliases a where a.alias_type = 'email' and a.normalized_value = normalized_email limit 1),
      (select g2.id from guests g2 where lower(g2.email) = normalized_email and g2.merged_into_guest_id is null limit 1)
    ) for update;
    if found then
      if not p_legacy then raise exception 'GUEST_SELECTION_REQUIRED'; end if;
      update guests set name = trim(p_guest_name), phone = trim(p_phone) where id = guest.id returning * into guest;
    else
      begin
        insert into guests (name, email, phone) values (trim(p_guest_name), normalized_email, trim(p_phone)) returning * into guest;
      exception when unique_violation then
        raise exception 'GUEST_SELECTION_REQUIRED';
      end;
    end if;
  end if;
  contact := coalesce(nullif(trim(p_stay_phone), ''), guest.phone);
  if nullif(trim(contact), '') is null or coalesce(guest.email, normalized_email) is null then
    raise exception 'INVALID_GUEST_DETAILS';
  end if;
  reference := 'HVN-' || to_char(clock_timestamp(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  insert into reservations (
    guest_id, guest_name, guest_email, guest_phone, room_type, check_in, check_out, guests,
    status, source, total, deposit, deposit_required, special_requests, expected_arrival,
    payment_status, confirmation_number, idempotency_key, nightly_rates
  ) values (
    guest.id, guest.name, case when p_legacy then normalized_email else coalesce(guest.email, normalized_email) end, contact,
    p_room_type, p_check_in, p_check_out, p_guest_count, 'confirmed', p_source, amount, 0, 0,
    nullif(trim(p_requests), ''), nullif(trim(p_arrival), ''), 'unpaid', reference, p_key, rates
  ) returning id into booking_id;
  insert into invoices (reservation_id, guest_name, amount, paid, balance, status, due_date)
    values (booking_id, guest.name, amount, 0, amount, 'unpaid', p_check_in);
  insert into audit_logs (user_id, action, entity_type, entity_id, after_data)
    values (p_actor, 'create_staff_reservation', 'reservation', booking_id,
      jsonb_build_object('source', p_source, 'roomType', p_room_type, 'checkIn', p_check_in, 'checkOut', p_check_out, 'total', amount));
  result := jsonb_build_object('reservation_id', booking_id, 'confirmation_number', reference, 'total', amount, 'guest_name', guest.name);
  insert into hotel_operation_requests (id, action, entity, actor, payload, result)
    values (p_key, 'staff_booking_create', 'reservation', p_actor, payload, result);
  return result;
end;
$$;

-- Keep existing service callers on the same booking transaction and signature.
create or replace function public.front_desk_create_reservation(
  p_guest_name text, p_email text, p_phone text, p_room_type text, p_check_in date, p_check_out date,
  p_guest_count integer, p_source text, p_special_requests text, p_expected_arrival text,
  p_idempotency_key uuid, p_staff_user_id uuid
) returns table (reservation_id text, confirmation_number text, total numeric)
language sql security definer set search_path=public as $$
  select result->>'reservation_id', result->>'confirmation_number', (result->>'total')::numeric
  from (select hotel_staff_booking_create(
    p_staff_user_id, p_idempotency_key, null, p_guest_name, p_email, p_phone, null,
    p_room_type, p_check_in, p_check_out, p_guest_count, p_source, p_special_requests, p_expected_arrival, null, true
  ) as result) booking;
$$;

create function public.hotel_staff_booking_result(p_actor uuid, p_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  perform hotel_actor(p_actor, array['front_desk']);
  select r.result into result from hotel_operation_requests r
    where r.id = p_key and r.actor = p_actor and r.action = 'staff_booking_create';
  return result;
end;
$$;

create function public.hotel_staff_booking_guests(p_actor uuid, p_query text)
returns table (id text, name text, email text, phone text)
language plpgsql security definer set search_path=public as $$
declare
  query text := lower(trim(p_query));
  digits text := regexp_replace(p_query, '[^0-9]', '', 'g');
begin
  perform hotel_actor(p_actor, array['front_desk']);
  if char_length(query) not between 2 and 120 then return; end if;
  return query
    select g.id, g.name, g.email, g.phone from guests g where g.merged_into_guest_id is null and (
      strpos(lower(g.name), query) > 0 or strpos(lower(g.email), query) > 0 or lower(g.id) = query
      or (query !~ '[[:alpha:]]' and char_length(digits) >= 4 and strpos(regexp_replace(g.phone, '[^0-9]', '', 'g'), digits) > 0)
      or exists (select 1 from guest_aliases a where a.survivor_guest_id = g.id and
        ((a.alias_type = 'email' and a.normalized_value = query)
          or (a.alias_type = 'phone' and char_length(digits) >= 7 and a.normalized_value = digits)))
    )
    order by (lower(g.email) is not distinct from query or lower(g.id) = query) desc, g.name, g.id
    limit 8;
end;
$$;

create function public.hotel_staff_edit_guest_profile(
  p_actor uuid, p_guest_id text, p_expected jsonb, p_phone text, p_address text, p_preferences text
) returns void language plpgsql security definer set search_path=public as $$
declare
  guest guests%rowtype;
  previous jsonb;
  next_profile jsonb := jsonb_build_object('phone', p_phone, 'address', p_address, 'preferences', p_preferences);
begin
  perform hotel_actor(p_actor, array['front_desk', 'manager', 'owner']);
  select * into guest from guests where id = p_guest_id for update;
  if not found then raise exception 'GUEST_NOT_FOUND'; end if;
  if guest.merged_into_guest_id is not null then raise exception 'GUEST_PROFILE_CHANGED'; end if;
  previous := jsonb_build_object('phone', guest.phone, 'address', guest.address, 'preferences', guest.preferences);
  if previous = next_profile then return; end if;
  if previous is distinct from p_expected then raise exception 'GUEST_PROFILE_CHANGED'; end if;
  update guests set phone = p_phone, address = p_address, preferences = p_preferences where id = guest.id;
  insert into audit_logs (user_id, action, entity_type, entity_id, after_data)
    values (p_actor, 'update_guest_profile', 'guest', guest.id, jsonb_build_object('fields',
      (select jsonb_agg(key order by key) from jsonb_each(previous) where value is distinct from next_profile->key)));
end;
$$;

revoke all on function public.hotel_staff_booking_create(uuid,uuid,text,text,text,text,text,text,date,date,integer,text,text,text,numeric,boolean) from public, anon, authenticated;
revoke all on function public.hotel_staff_booking_result(uuid,uuid) from public, anon, authenticated;
revoke all on function public.hotel_staff_booking_guests(uuid,text) from public, anon, authenticated;
revoke all on function public.hotel_staff_edit_guest_profile(uuid,text,jsonb,text,text,text) from public, anon, authenticated;
grant execute on function public.hotel_staff_booking_create(uuid,uuid,text,text,text,text,text,text,date,date,integer,text,text,text,numeric,boolean) to service_role;
grant execute on function public.hotel_staff_booking_result(uuid,uuid) to service_role;
grant execute on function public.hotel_staff_booking_guests(uuid,text) to service_role;
grant execute on function public.hotel_staff_edit_guest_profile(uuid,text,jsonb,text,text,text) to service_role;

create function public.hotel_staff_arrival_readiness(p_actor uuid, p_reservation_ids text[])
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  perform hotel_actor(p_actor, array['front_desk']);
  if coalesce(cardinality(p_reservation_ids), 0) > 20 then raise exception 'TOO_MANY_ARRIVALS'; end if;
  return coalesce((
    select jsonb_object_agg(r.id, hotel_reservation_readiness(r.id, p_actor))
    from reservations r where r.id = any(p_reservation_ids) and r.status = 'confirmed'
  ), '{}'::jsonb);
end;
$$;
revoke all on function public.hotel_staff_arrival_readiness(uuid,text[]) from public, anon, authenticated;
grant execute on function public.hotel_staff_arrival_readiness(uuid,text[]) to service_role;

alter table public.reservations add column cancellation_reason_code text
  check (cancellation_reason_code in (
    'change_of_plans', 'duplicate_booking', 'travel_disruption', 'payment_issue', 'hotel_initiated',
    'no_arrival', 'unable_to_contact', 'other'
  ));

create function public.hotel_staff_close_reservation(
  p_actor uuid, p_reservation_id text, p_status text, p_reason_code text, p_reason text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  result jsonb;
  previous_status text;
begin
  perform hotel_actor(p_actor, array['front_desk']);
  perform hotel_lock_operating_day();
  select status into previous_status from reservations where id = p_reservation_id for update;
  if p_status = 'cancelled' and p_reason_code in ('change_of_plans', 'duplicate_booking', 'travel_disruption', 'payment_issue', 'hotel_initiated', 'other') then
    select to_jsonb(settlement) into result from cancel_reservation(p_reservation_id, p_actor, p_reason) settlement;
  elsif p_status = 'no_show' and p_reason_code in ('no_arrival', 'unable_to_contact', 'travel_disruption', 'other') then
    perform mark_reservation_no_show(p_reservation_id, p_actor, p_reason);
    result := jsonb_build_object('status', p_status);
  else
    raise exception 'INVALID_CLOSURE_REASON';
  end if;
  if previous_status is distinct from p_status then
    update reservations set cancellation_reason_code = p_reason_code where id = p_reservation_id;
  end if;
  return result;
end;
$$;
revoke all on function public.hotel_staff_close_reservation(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.hotel_staff_close_reservation(uuid,text,text,text,text) to service_role;

-- The stay contact editor writes the reservation snapshot only.
create or replace function public.front_desk_update_guest(
  p_reservation_id text, p_phone text, p_expected_arrival text, p_operational_notes text, p_staff_user_id uuid
) returns void language plpgsql security definer set search_path=public as $$
declare stay reservations%rowtype;
begin
  perform hotel_actor(p_staff_user_id, array['front_desk', 'manager', 'owner', 'admin']);
  select * into stay from reservations where id = p_reservation_id for update;
  if not found or stay.status not in ('pending', 'confirmed', 'checked_in') then raise exception 'RESERVATION_NOT_EDITABLE'; end if;
  update reservations set guest_phone = coalesce(nullif(trim(p_phone), ''), guest_phone),
    expected_arrival = coalesce(nullif(trim(p_expected_arrival), ''), expected_arrival),
    special_requests = coalesce(nullif(trim(p_operational_notes), ''), special_requests)
  where id = stay.id;
  insert into audit_logs (user_id, action, entity_type, entity_id, after_data)
    values (p_staff_user_id, 'update_stay_contact', 'reservation', stay.id,
      jsonb_build_object('phoneEdited', nullif(trim(p_phone), '') is not null,
        'arrivalEdited', nullif(trim(p_expected_arrival), '') is not null,
        'notesEdited', nullif(trim(p_operational_notes), '') is not null));
end;
$$;

commit;
