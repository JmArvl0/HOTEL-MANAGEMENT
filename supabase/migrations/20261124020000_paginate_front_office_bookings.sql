begin;

create function public.hotel_front_office_booking_page(
  p_actor uuid,p_scope text,p_from date,p_through date,p_queue text,p_closed text,p_search text,p_page integer
) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb; today date := hotel_today();
begin
  perform hotel_actor(p_actor,array['front_desk','manager','owner']);
  if p_scope not in ('window','history','board') or p_queue not in ('all','arrivals','upcoming','in_house','departures','closed')
    or p_closed not in ('all','checked_out','cancelled','no_show') or p_page < 1 or p_page > 1000000 or length(p_search)>120
    or (p_scope='window' and (p_from is null or p_through is null or p_through-p_from not between 0 and 13))
  then raise exception 'INVALID_BOOKING_QUEUE'; end if;

  with base as materialized (
    select r.id,r.confirmation_number,r.guest_name,r.room_type,r.room_id,r.room_number,r.check_in,r.check_out,
      r.payment_status,r.identity_status,r.status,r.created_at,
      r.status in ('pending','confirmed') and r.check_in=today as arrival,
      r.status in ('pending','confirmed') and r.check_in>today as upcoming,
      r.status='checked_in' as in_house,
      r.status='checked_in' and r.check_out=today as departure,
      r.status in ('checked_out','cancelled','no_show') as closed
    from reservations r
    where p_scope='history' or (p_scope='window' and r.check_in<=p_through and r.check_out>p_from)
  ), filtered as (
    select * from base r
    where (case p_queue when 'arrivals' then arrival when 'upcoming' then upcoming when 'in_house' then in_house
      when 'departures' then departure when 'closed' then closed and (p_closed='all' or status=p_closed) else true end)
      and (p_search='' or strpos(lower(concat_ws(' ',coalesce(guest_name,''),coalesce(confirmation_number,''),
        coalesce(room_number,''),id)),lower(p_search))>0)
  ), totals as (
    select count(*) total,least(p_page,greatest(1,(count(*)+9)/10)) page from filtered
  ), list as (
    select id,confirmation_number,guest_name,room_type,room_id,room_number,check_in,check_out,payment_status,identity_status,status,created_at
    from filtered order by created_at desc,id
    limit 10 offset (select (page-1)*10 from totals)
  ), daily as (
    select id,confirmation_number,guest_name,room_type,room_id,room_number,check_in,check_out,payment_status,identity_status,status,created_at
    from reservations where status='checked_in' or (status in ('pending','confirmed') and check_in<=today)
  )
  select jsonb_build_object(
    'page',totals.page,'total',totals.total,
    'counts',(select jsonb_build_object('all',count(*),'arrivals',count(*) filter(where arrival),
      'upcoming',count(*) filter(where upcoming),'in_house',count(*) filter(where in_house),
      'departures',count(*) filter(where departure),'closed',count(*) filter(where closed)) from base),
    'rows',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('folio_balance',i.balance) order by r.created_at desc,r.id)
      from list r left join lateral (select balance from invoices where reservation_id=r.id order by id limit 1)i on true),'[]'),
    'daily',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('folio_balance',i.balance) order by r.created_at desc,r.id)
      from daily r left join lateral (select balance from invoices where reservation_id=r.id order by id limit 1)i on true),'[]')
  ) into result from totals;
  return result;
end;
$$;

revoke all on function public.hotel_front_office_booking_page(uuid,text,date,date,text,text,text,integer) from public,anon,authenticated;
grant execute on function public.hotel_front_office_booking_page(uuid,text,date,date,text,text,text,integer) to service_role;

commit;
