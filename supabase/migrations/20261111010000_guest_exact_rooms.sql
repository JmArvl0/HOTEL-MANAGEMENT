begin;
alter table public.booking_holds add column selected_room_id text references public.rooms(id);
alter table public.booking_holds add column selected_room_number text;
create index booking_holds_selected_room on public.booking_holds(selected_room_id,check_in,check_out) where reservation_id is null;

create function public.guest_room_is_free(p_room text,p_in date,p_out date,p_exclude_reservation text default null,p_exclude_hold uuid default null)
returns boolean language sql stable security definer set search_path=public as $$
 select room_is_sellable(p_room,p_in,null) and not exists(
   select 1 from reservations r where r.room_id=p_room and r.id is distinct from p_exclude_reservation
   and r.check_in<p_out and r.check_out>p_in and
   (r.status in('confirmed','checked_in') or (r.status='pending' and (lower(coalesce(r.source,''))<>'website' or r.payment_due_at is null or r.payment_due_at>now()))))
 and not exists(select 1 from reservation_room_assignments a join reservations r on r.id=a.reservation_id
   where a.room_id=p_room and a.status='active' and a.reservation_id is distinct from p_exclude_reservation
   and a.check_in<p_out and a.check_out>p_in and
   (r.status in('confirmed','checked_in') or (r.status='pending' and
   (lower(coalesce(r.source,''))<>'website' or r.payment_due_at is null or r.payment_due_at>now()))))
 and not exists(select 1 from booking_holds h where h.selected_room_id=p_room and h.token is distinct from p_exclude_hold
   and h.reservation_id is null and h.status in('active','payment_submitted') and h.expires_at>now() and h.check_in<p_out and h.check_out>p_in);
$$;
create function public.guest_room_choices(p_type text,p_in date,p_out date,p_hold uuid default null,p_user uuid default null)
returns table(id text,number text,floor integer,available boolean) language sql stable security definer set search_path=public as $$
 select r.id,r.number,r.floor::integer,
 guest_room_is_free(r.id,p_in,p_out,null,case when exists(select 1 from booking_holds h where h.token=p_hold and h.user_id=p_user) then p_hold end)
 and hotel_available_units(p_type,p_in,p_out,null,null,case when exists(select 1 from booking_holds h where h.token=p_hold and h.user_id=p_user) then p_hold end)>0
 from rooms r join room_types t on t.name=r.type and t.active
 where r.type=p_type and coalesce(r.administratively_active,true)
 order by r.number;
$$;
create function public.create_exact_booking_hold(p_user_id uuid,p_room_id text,p_details jsonb,p_replace_token uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare room rooms%rowtype; v_token uuid; old booking_holds%rowtype; cin date:=(p_details->>'checkIn')::date; cout date:=(p_details->>'checkOut')::date;
begin
 select * into room from rooms where id=p_room_id;
 if not found or room.type is distinct from p_details->>'roomType' then raise exception 'EXACT_ROOM_UNAVAILABLE'; end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(room.type),0));
 if p_replace_token is not null then
   select * into old from booking_holds where token=p_replace_token and user_id=p_user_id for update;
   if not found or old.status<>'active' or old.expires_at<=now() or old.selected_room_id is distinct from room.id then raise exception 'HOLD_NOT_FOUND'; end if;
   update booking_holds set status='expired' where token=old.token;
 end if;
 if not guest_room_is_free(room.id,cin,cout) then raise exception 'EXACT_ROOM_UNAVAILABLE'; end if;
 v_token:=create_booking_hold(p_user_id=>p_user_id,p_room_type=>room.type,p_check_in=>cin,p_check_out=>cout,
 p_guest_count=>(p_details->>'guests')::integer,p_first_name=>p_details->>'firstName',p_last_name=>p_details->>'lastName',
 p_email=>p_details->>'email',p_mobile=>p_details->>'mobile',p_address=>p_details->>'address',p_nationality=>p_details->>'nationality',
 p_expected_arrival=>p_details->>'expectedArrival',p_request_options=>coalesce(p_details->'requestOptions','[]'::jsonb),
 p_transport_lines=>'[]'::jsonb,p_transportation_preferences=>nullif(p_details->'transportationPreferences','null'::jsonb),p_special_requests=>p_details->>'specialRequests');
 update booking_holds set selected_room_id=room.id,selected_room_number=room.number where booking_holds.token=v_token;
 return v_token;
end $$;
-- Both manual and gateway conversion update the hold in their existing transaction.
create function public.allocate_guest_selected_room() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.selected_room_id is not null and new.reservation_id is not null and old.reservation_id is null then
   perform pg_advisory_xact_lock(hashtextextended(lower(new.room_type),0));
   if not guest_room_is_free(new.selected_room_id,new.check_in,new.check_out,new.reservation_id,new.token) then raise exception 'EXACT_ROOM_UNAVAILABLE'; end if;
   update reservations set room_id=new.selected_room_id,room_number=new.selected_room_number where id=new.reservation_id;
   insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,reason)
   values(new.reservation_id,new.selected_room_id,new.check_in,new.check_out,'Guest selected during booking');
 end if;
 return new;
end $$;
create trigger allocate_guest_selected_room after update of reservation_id on public.booking_holds for each row execute function public.allocate_guest_selected_room();
-- Staff assignment and room moves share the same lock and honor unconverted holds.
create function public.guard_guest_room_claim() returns trigger language plpgsql security definer set search_path=public as $$
declare room_type text;
begin
 if new.status='active' then
   select type into room_type from rooms where id=new.room_id;
   perform pg_advisory_xact_lock(hashtextextended(lower(room_type),0));
   if not guest_room_is_free(new.room_id,new.check_in,new.check_out,new.reservation_id) then raise exception 'EXACT_ROOM_UNAVAILABLE'; end if;
 end if;
 return new;
end $$;
create trigger guard_guest_room_claim before insert or update of room_id,check_in,check_out,status on public.reservation_room_assignments for each row execute function public.guard_guest_room_claim();
revoke all on function public.guest_room_is_free(text,date,date,text,uuid),public.guest_room_choices(text,date,date,uuid,uuid),public.create_exact_booking_hold(uuid,text,jsonb,uuid),public.allocate_guest_selected_room(),public.guard_guest_room_claim() from public,anon,authenticated;
grant execute on function public.guest_room_is_free(text,date,date,text,uuid),public.guest_room_choices(text,date,date,uuid,uuid),public.create_exact_booking_hold(uuid,text,jsonb,uuid) to service_role;
notify pgrst,'reload schema';
commit;
