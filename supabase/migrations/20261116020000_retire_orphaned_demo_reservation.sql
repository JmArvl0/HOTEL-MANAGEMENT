-- Correct the owner-confirmed orphaned demo booking while preserving its
-- immutable loyalty history and the reservation referenced by that history.
do $$
declare
  target public.reservations%rowtype;
  guest_record public.guests%rowtype;
  earned_entry public.guest_loyalty_ledger%rowtype;
  dependency record;
  has_link boolean;
  retirement_reason constant text := 'Retired orphaned demo booking RSV-1046: no check-in, room assignment, folio, or payment';
begin
  select * into target from public.reservations
    where id = 'RSV-1046' for update;
  if not found then return; end if;
  if target.status = 'cancelled' and target.cancellation_reason = retirement_reason then return; end if;

  if target.guest_id is distinct from 'GST-2039'
    or target.status is distinct from 'checked_out'
    or target.source is distinct from 'Phone'
    or target.check_in is distinct from '2026-08-26'::date
    or target.check_out is distinct from '2026-08-29'::date
    or target.total is distinct from 17400::numeric
    or target.deposit is distinct from 0::numeric
    or target.deposit_required is distinct from 0::numeric
    or target.payment_status is distinct from 'unpaid'
    or target.room_id is not null or target.room_number is not null
    or target.checked_in_at is not null
    or target.checked_out_at is distinct from '2026-09-27T14:33:19.782+00:00'::timestamptz
    or target.created_at is distinct from '2026-08-25T16:13:45.455004+00:00'::timestamptz
    or target.confirmation_number is not null
    or target.idempotency_key is not null
    or target.nightly_rates is not null
    or target.cancellation_reason is not null
  then
    raise exception 'DEMO_RESERVATION_STATE_CHANGED';
  end if;

  select * into guest_record from public.guests
    where id = target.guest_id for update;
  if not found or guest_record.loyalty_points is distinct from 174
    or guest_record.lifetime_spend is distinct from 17400::numeric
    or guest_record.loyalty_tier is distinct from 'gold'
  then
    raise exception 'DEMO_GUEST_LOYALTY_CHANGED';
  end if;

  if (select count(*) from public.guest_loyalty_ledger
      where guest_id = guest_record.id) <> 1 then
    raise exception 'DEMO_GUEST_LOYALTY_LINKED';
  end if;
  select * into strict earned_entry from public.guest_loyalty_ledger
    where guest_id = guest_record.id for update;
  if earned_entry.id is distinct from '48afcafe-4de7-4169-bef1-4228dd36182e'::uuid
    or earned_entry.reservation_id is distinct from target.id
    or earned_entry.points is distinct from 174
    or earned_entry.transaction_type is distinct from 'earned'
    or earned_entry.notes is distinct from 'Stay RSV-1046 x1'
    or earned_entry.created_at is distinct from '2026-09-27T14:33:21.999363+00:00'::timestamptz
  then
    raise exception 'DEMO_LOYALTY_ENTRY_CHANGED';
  end if;

  -- A primary occupant row was backfilled in November. Keep it as history;
  -- any other linked record needs separate review before retirement.
  for dependency in
    select constraint_row.conrelid::regclass as relation_name,
      column_row.attname as column_name
    from pg_constraint constraint_row
    join pg_attribute column_row
      on column_row.attrelid = constraint_row.conrelid
      and column_row.attnum = constraint_row.conkey[1]
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.reservations'::regclass
      and array_length(constraint_row.conkey, 1) = 1
    order by constraint_row.conrelid::regclass::text
  loop
    execute format('lock table %s in share mode', dependency.relation_name);
    if dependency.relation_name in ('public.reservation_guests'::regclass,
        'public.guest_loyalty_ledger'::regclass) then continue; end if;
    execute format('select exists (select 1 from %s where %I = $1)',
      dependency.relation_name, dependency.column_name)
      into has_link using target.id;
    if has_link then
      raise exception 'DEMO_RESERVATION_LINKED: %', dependency.relation_name;
    end if;
  end loop;

  if (select count(*) from public.reservation_guests
      where reservation_id = target.id and guest_id = target.guest_id
        and role = 'primary' and occupant_type = 'unknown'
        and attendance_status = 'departed' and id_verified = false
        and id_verified_at is null and age_verified_at is null
        and removed_at is null) <> 1
    or (select count(*) from public.reservation_guests
      where reservation_id = target.id) <> 1 then
    raise exception 'DEMO_RESERVATION_OCCUPANT_CHANGED';
  end if;

  update public.reservations
    set status = 'cancelled', cancellation_reason = retirement_reason,
      checked_out_at = null
    where id = target.id;
  update public.guests
    set loyalty_points = 0, lifetime_spend = 0
    where id = guest_record.id;
  insert into public.guest_loyalty_ledger
    (guest_id, reservation_id, points, transaction_type, notes)
    values (guest_record.id, target.id, -earned_entry.points, 'adjusted',
      'Reverse demo-only award for retired booking RSV-1046');
  insert into public.audit_logs
    (action, entity_type, entity_id, before_data, after_data)
    values ('retire_orphaned_demo_reservation', 'reservation', target.id,
      jsonb_build_object('status', target.status, 'total', target.total,
        'checkedOutAt', target.checked_out_at,
        'loyaltyPoints', guest_record.loyalty_points,
        'lifetimeSpend', guest_record.lifetime_spend,
        'earnedLedgerId', earned_entry.id),
      jsonb_build_object('status', 'cancelled', 'reason', retirement_reason,
        'loyaltyPoints', 0, 'lifetimeSpend', 0,
        'pointsReversed', earned_entry.points,
        'loyaltyTierRetained', guest_record.loyalty_tier));
end $$;
