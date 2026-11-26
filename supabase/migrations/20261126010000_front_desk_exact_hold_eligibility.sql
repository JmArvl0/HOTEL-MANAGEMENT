begin;

create function public.guest_room_has_live_exact_hold(
  p_room text, p_in date, p_out date, p_exclude_hold uuid default null
) returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1
    from booking_holds h
    where h.selected_room_id=p_room
      and h.token is distinct from p_exclude_hold
      and h.reservation_id is null
      and h.status in ('active','payment_submitted')
      and h.expires_at>now()
      and h.check_in<p_out and h.check_out>p_in
  );
$$;
revoke all on function public.guest_room_has_live_exact_hold(text,date,date,uuid)
  from public,anon,authenticated;

create or replace function public.guest_room_is_free(
  p_room text, p_in date, p_out date, p_exclude_reservation text default null, p_exclude_hold uuid default null
) returns boolean
language sql stable security definer set search_path=public
as $$
  select room_is_sellable(p_room,p_in,null)
    and not exists (
      select 1 from reservations r
      where r.room_id=p_room and r.id is distinct from p_exclude_reservation
        and r.check_in<p_out and r.check_out>p_in
        and (r.status in ('confirmed','checked_in') or (r.status='pending' and
          (lower(coalesce(r.source,''))<>'website' or r.payment_due_at is null or r.payment_due_at>now())))
    )
    and not exists (
      select 1 from reservation_room_assignments a join reservations r on r.id=a.reservation_id
      where a.room_id=p_room and a.status='active' and a.reservation_id is distinct from p_exclude_reservation
        and a.check_in<p_out and a.check_out>p_in
        and (r.status in ('confirmed','checked_in') or (r.status='pending' and
          (lower(coalesce(r.source,''))<>'website' or r.payment_due_at is null or r.payment_due_at>now())))
    )
    and not guest_room_has_live_exact_hold(p_room,p_in,p_out,p_exclude_hold);
$$;

create or replace function public.front_desk_room_is_eligible(p_room_id text, p_reservation_id text)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists (
    select 1
    from rooms x
    join reservations r on r.id=p_reservation_id
    join room_types t on t.name=x.type and t.active
    cross join lateral (
      select case when r.status='checked_in'
        then greatest(r.check_in,hotel_today(r.operational_policy_snapshot))
        else r.check_in end as starts_on
    ) stay
    where x.id=p_room_id
      and r.status in ('confirmed','checked_in')
      and coalesce(x.administratively_active,true)
      and x.status='available'
      and x.housekeeping='clean'
      and not maintenance_room_is_blocked(x.id)
      and not exists (select 1 from room_discrepancies d where d.room_id=x.id and d.status<>'resolved')
      and not exists (
        select 1 from reservation_room_assignments ra
        where ra.room_id=x.id
          and ra.status='active'
          and ra.reservation_id<>r.id
          and ra.check_in<r.check_out and ra.check_out>stay.starts_on
      )
      and not guest_room_has_live_exact_hold(x.id,stay.starts_on,r.check_out)
  );
$$;

create or replace function public.guard_guest_room_claim()
returns trigger
language plpgsql security definer set search_path=public
as $$
declare room_type text;
begin
  if new.status='active' then
    select type into room_type from rooms where id=new.room_id;
    perform pg_advisory_xact_lock(hashtextextended(lower(room_type),0));
    if not guest_room_is_free(new.room_id,new.check_in,new.check_out,new.reservation_id) then
      if guest_room_has_live_exact_hold(new.room_id,new.check_in,new.check_out) then
        -- Preserve the existing failure identifier for other assignment writers.
        raise exception 'EXACT_ROOM_UNAVAILABLE' using detail='ROOM_HELD_FOR_GUEST';
      end if;
      raise exception 'EXACT_ROOM_UNAVAILABLE';
    end if;
  end if;
  return new;
end;
$$;

commit;
