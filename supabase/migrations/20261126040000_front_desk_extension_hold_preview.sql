begin;

create or replace function public.front_desk_extend_stay_preview(
  p_reservation_id text, p_new_check_out date, p_staff_user_id uuid
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  actor text;
  stay reservations%rowtype;
  assigned_room rooms%rowtype;
  invoice invoices%rowtype;
  added_amount numeric;
  nightly_rates jsonb;
  uniform_rate numeric;
  room_conflict boolean;
begin
  select role into actor from user_accounts where id = p_staff_user_id and active;
  if actor is distinct from 'front_desk' then raise exception 'EXTENSION_FORBIDDEN'; end if;

  select * into stay from reservations where id = p_reservation_id;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  if stay.status <> 'checked_in' or stay.room_id is null then raise exception 'RESERVATION_NOT_IN_HOUSE'; end if;
  if p_new_check_out <= stay.check_out then raise exception 'INVALID_EXTENSION_DATE'; end if;

  select * into assigned_room from rooms where id = stay.room_id;
  if not exists (select 1 from room_types where name = stay.room_type and active) then
    raise exception 'ROOM_TYPE_UNAVAILABLE';
  end if;
  select * into invoice from invoices where reservation_id = stay.id;
  if not found then raise exception 'FOLIO_NOT_FOUND'; end if;

  select round(coalesce(sum(rate), 0), 2),
    coalesce(jsonb_agg(jsonb_build_object('date', night, 'rate', rate) order by night), '[]'::jsonb),
    case when count(distinct rate) = 1 then min(rate) end
    into added_amount, nightly_rates, uniform_rate
    from room_nightly_rates(stay.room_type, stay.check_out, p_new_check_out);

  select exists (
    select 1 from reservation_room_assignments
    where room_id = assigned_room.id and reservation_id <> stay.id and status = 'active'
      and check_in < p_new_check_out and check_out > stay.check_out
  ) or exists (
    select 1 from reservations
    where id <> stay.id and room_id = assigned_room.id and status in ('confirmed', 'checked_in')
      and check_in < p_new_check_out and check_out > stay.check_out
  ) into room_conflict;

  return jsonb_build_object(
    'currentCheckOut', stay.check_out,
    'requestedCheckOut', p_new_check_out,
    'nights', p_new_check_out - stay.check_out,
    'rate', uniform_rate,
    'nightlyRates', nightly_rates,
    'additionalAmount', added_amount,
    'projectedTotal', round(invoice.amount + added_amount, 2),
    'balance', invoice.balance,
    'roomConflict', room_conflict,
    'roomHeld', guest_room_has_live_exact_hold(stay.room_id, stay.check_out, p_new_check_out),
    'roomNumber', assigned_room.number,
    'roomType', stay.room_type
  );
end;
$$;

commit;
