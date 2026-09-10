-- Keep every guest transportation leg inside its owning reservation dates.
-- Additive guard only: existing rows are not rewritten, deleted, or reseeded.
create or replace function public.enforce_transportation_stay_window()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check_in date;
  v_check_out date;
begin
  select check_in, check_out
    into v_check_in, v_check_out
    from public.reservations
   where id = new.reservation_id;

  if not found then
    raise exception 'RESERVATION_NOT_FOUND';
  end if;

  if new.pickup_date < v_check_in
     or new.pickup_date > v_check_out
     or (new.return_date is not null and (
       new.return_date < v_check_in or new.return_date > v_check_out
     )) then
    raise exception 'TRANSPORTATION_OUTSIDE_STAY_WINDOW';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_transportation_stay_window() from public, anon, authenticated;

create trigger enforce_transportation_stay_window
before insert or update of reservation_id, pickup_date, return_date
on public.transportation_requests
for each row execute function public.enforce_transportation_stay_window();