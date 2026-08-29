-- Enforce reservation deposits only for bookings carrying the new policy snapshot; preserve historical website reservations.
create or replace function public.front_desk_check_in(p_reservation_id text,p_room_id text)returns void language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;room rooms%rowtype;begin perform expire_booking_holds();select * into r from reservations where id=p_reservation_id for update;if not found then raise exception'RESERVATION_NOT_CHECKIN_READY';end if;
 if lower(coalesce(r.source,''))='website'and coalesce(r.deposit_required,0)>0 then if r.status<>'confirmed'or coalesce(r.deposit,0)<r.deposit_required or r.payment_status not in('partial','paid')then raise exception'RESERVATION_DEPOSIT_REQUIRED';end if;
 elsif r.status not in('pending','confirmed')then raise exception'RESERVATION_NOT_CHECKIN_READY';end if;
 if current_date<r.check_in or current_date>=r.check_out then raise exception'OUTSIDE_CHECKIN_WINDOW';end if;
 select * into room from rooms where id=p_room_id or number=p_room_id limit 1 for update;if not found or room.type<>r.room_type then raise exception'ROOM_TYPE_MISMATCH';end if;
 if room.status<>'available'or room.housekeeping<>'clean'then raise exception'ROOM_NOT_READY';end if;
 if exists(select 1 from maintenance_orders m where m.room_id=room.id and m.status in('open','in_progress'))then raise exception'ROOM_UNDER_MAINTENANCE';end if;
 if exists(select 1 from reservations x where x.id<>r.id and x.room_id=room.id and x.status in('confirmed','checked_in')and x.check_in<r.check_out and x.check_out>r.check_in)then raise exception'ROOM_ALREADY_ASSIGNED';end if;
 update reservations set room_id=room.id,room_number=room.number,status='checked_in'where id=r.id;update rooms set status='occupied'where id=room.id;end$$;
