begin;

-- A committed command keeps its original result even after another stay or folio update.
create table public.front_desk_extension_receipts (
  charge_id uuid primary key references public.folio_charges(id) on delete restrict,
  requested_check_out date not null,
  reason_digest bytea not null,
  balance_after numeric not null
);
alter table public.front_desk_extension_receipts enable row level security;
revoke all on public.front_desk_extension_receipts from public, anon, authenticated;

create or replace function public.front_desk_extend_stay(
  p_reservation_id text, p_new_check_out date, p_reason text,
  p_idempotency_key uuid, p_staff_user_id uuid
)
returns table(new_check_out date, additional_amount numeric, new_balance numeric)
language plpgsql security definer set search_path = public as $$
declare
  actor text;
  stay reservations%rowtype;
  assigned_room rooms%rowtype;
  assignment reservation_room_assignments%rowtype;
  invoice invoices%rowtype;
  charge folio_charges%rowtype;
  receipt front_desk_extension_receipts%rowtype;
  added numeric;
  rates jsonb;
  normalized_reason text := trim(p_reason);
  requested_reason_digest bytea := sha256(convert_to(normalized_reason, 'UTF8'));
begin
  select role into actor from user_accounts where id = p_staff_user_id and active;
  if actor is distinct from 'front_desk' then
    raise exception 'EXTENSION_FORBIDDEN';
  end if;
  if nullif(normalized_reason, '') is null then
    raise exception 'EXTENSION_REASON_REQUIRED';
  end if;
  if p_idempotency_key is null then
    raise exception 'EXTENSION_KEY_REQUIRED';
  end if;

  -- The stay lock serializes competing writes to this reservation. A known key
  -- must be reconciled before checking the current stay dates or status.
  select * into stay from reservations where id = p_reservation_id for update;
  if not found then raise exception 'RESERVATION_NOT_IN_HOUSE'; end if;

  select * into charge from folio_charges where idempotency_key = p_idempotency_key;
  if found then
    select * into receipt from front_desk_extension_receipts where charge_id = charge.id;
    if not found or charge.reservation_id is distinct from stay.id
      or charge.posted_by is distinct from p_staff_user_id
      or receipt.requested_check_out is distinct from p_new_check_out
      or receipt.reason_digest is distinct from requested_reason_digest then
      raise exception 'EXTENSION_IDEMPOTENCY_CONFLICT';
    end if;
    return query select receipt.requested_check_out, charge.amount, receipt.balance_after;
    return;
  end if;

  if stay.status is distinct from 'checked_in' or stay.room_id is null then
    raise exception 'RESERVATION_NOT_IN_HOUSE';
  end if;
  if p_new_check_out is null or p_new_check_out <= stay.check_out then
    raise exception 'INVALID_EXTENSION_DATE';
  end if;

  select * into assigned_room from rooms where id = stay.room_id for update;
  select * into assignment from reservation_room_assignments
    where reservation_id = stay.id and status = 'active' for update;
  if not found then raise exception 'ACTIVE_ASSIGNMENT_NOT_FOUND'; end if;

  if exists(
    select 1 from reservation_room_assignments
    where room_id = assigned_room.id and reservation_id <> stay.id and status = 'active'
      and check_in < p_new_check_out and check_out > stay.check_out
  ) or exists(
    select 1 from reservations
    where id <> stay.id and room_id = assigned_room.id and status in ('confirmed', 'checked_in')
      and check_in < p_new_check_out and check_out > stay.check_out
  ) then raise exception 'EXTENSION_REQUIRES_ROOM_CHANGE'; end if;

  if not exists (select 1 from room_types where name = stay.room_type and active) then
    raise exception 'ROOM_TYPE_UNAVAILABLE';
  end if;
  select round(coalesce(sum(rate), 0), 2),
    coalesce(jsonb_agg(jsonb_build_object('date', night, 'rate', rate) order by night), '[]'::jsonb)
    into added, rates from room_nightly_rates(stay.room_type, stay.check_out, p_new_check_out);
  select * into invoice from invoices where reservation_id = stay.id for update;
  if not found then raise exception 'FOLIO_NOT_FOUND'; end if;

  -- The unique key also arbitrates simultaneous requests against different stays.
  insert into folio_charges(invoice_id, reservation_id, description, category, amount, posted_by, idempotency_key, source, source_record_id)
    values (invoice.id, stay.id, 'Stay extension through ' || p_new_check_out, 'extension',
      added, p_staff_user_id, p_idempotency_key, 'hotel_operations', stay.id)
    on conflict (idempotency_key) where idempotency_key is not null do nothing
    returning * into charge;
  if not found then raise exception 'EXTENSION_IDEMPOTENCY_CONFLICT'; end if;

  update invoices set amount = round(amount + added, 2) where id = invoice.id;
  update reservations set check_out = p_new_check_out, total = round(total + added, 2),
    nightly_rates = coalesce(nightly_rates, '[]'::jsonb) || rates where id = stay.id;
  update reservation_room_assignments set check_out = p_new_check_out where id = assignment.id;
  select * into invoice from sync_invoice_financials(invoice.id);

  insert into front_desk_extension_receipts(charge_id, requested_check_out, reason_digest, balance_after)
    values (charge.id, p_new_check_out, requested_reason_digest, invoice.balance);
  insert into audit_logs(user_id, action, entity_type, entity_id, before_data, after_data)
    values (p_staff_user_id, 'extend_stay', 'reservation', stay.id,
      jsonb_build_object('checkOut', stay.check_out, 'total', stay.total),
      jsonb_build_object('checkOut', p_new_check_out, 'additionalAmount', added, 'reason', normalized_reason));
  return query select p_new_check_out, added, invoice.balance;
end
$$;

revoke all on function public.front_desk_extend_stay(text, date, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.front_desk_extend_stay(text, date, text, uuid, uuid) to service_role;

commit;
