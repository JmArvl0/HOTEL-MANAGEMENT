begin;

create or replace function public.hotel_reservation_amendment(
  r public.reservations, new_in date, new_out date, new_type text, new_guests integer,
  new_notes text, replacement text, change_actor uuid, change_reason text,
  apply_change boolean, reviewed_quote jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  policy jsonb := coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());
  repriced boolean := (new_in,new_out,new_type) is distinct from (r.check_in,r.check_out,r.room_type);
  party_changed boolean := new_guests is distinct from r.guests;
  invoice invoices%rowtype;
  assigned reservation_room_assignments%rowtype;
  target_room rooms%rowtype;
  target_type room_types%rowtype;
  current_room text;
  room_choice_required boolean := false;
  room_key text;
  old_rates jsonb := '[]'::jsonb;
  new_rates jsonb;
  old_lodging numeric := r.total;
  new_lodging numeric;
  delta numeric := 0;
  folio_total numeric;
  quote jsonb;
begin
  if r.status not in ('pending','confirmed') then raise exception 'RESERVATION_NOT_MODIFIABLE'; end if;
  if new_in is null or new_out is null or new_out<=new_in or new_guests<1 then
    raise exception 'INVALID_MODIFICATION';
  end if;
  quote:=jsonb_build_object('checkIn',r.check_in,'checkOut',r.check_out,'roomType',r.room_type,'guests',r.guests,
    'newCheckIn',new_in,'newCheckOut',new_out,'newRoomType',new_type,'newGuests',new_guests);
  if reviewed_quote is not null and quote is distinct from (reviewed_quote-array['lodgingDelta','nightlyRates']) then
    raise exception 'AMENDMENT_QUOTE_CHANGED';
  end if;

  if repriced or party_changed then
    if new_in<hotel_today(policy) then raise exception 'INVALID_MODIFICATION'; end if;
    if r.status='pending' and r.payment_method in ('gateway_xendit','gateway_paymongo') then
      raise exception 'MODIFICATION_PAYMENT_IN_PROGRESS';
    end if;
    if r.breakfast_snapshot is not null then raise exception 'BREAKFAST_AMENDMENT_UNAVAILABLE'; end if;
    for room_key in select distinct lower(name) from unnest(array[r.room_type,new_type]) name order by 1 loop
      if not pg_try_advisory_xact_lock(hashtextextended(room_key,0)) then raise exception 'AMENDMENT_BUSY'; end if;
    end loop;
    select * into target_type from room_types where name=new_type and active;
    if not found or new_guests>target_type.max_guests then raise exception 'ROOM_TYPE_UNAVAILABLE'; end if;
    if (select count(*) from reservation_guests where reservation_id=r.id)>new_guests then
      raise exception 'PARTY_CAPACITY';
    end if;
  end if;

  if repriced then
    if exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(r.transport_lines)='array' then r.transport_lines else '[]'::jsonb end) line
      where (line->>'price')::numeric>0
    ) or exists (
      select 1 from transportation_requests trip where trip.reservation_id=r.id
      and trip.status not in ('CANCELLED','REJECTED')
      and (trip.pickup_date not between new_in and new_out
        or trip.return_date not between new_in and new_out)
    ) then raise exception 'TRANSPORT_REQUIRES_STAFF'; end if;

    select * into assigned from reservation_room_assignments
      where reservation_id=r.id and status='active' for update;
    current_room:=coalesce(assigned.room_id,r.room_id);
    if current_room is not null then
      select * into target_room from rooms where id=current_room and type=new_type;
      if not found or not guest_room_is_free(current_room,new_in,new_out,r.id) then
        target_room:=null;
        room_choice_required:=true;
      end if;
    end if;
    if room_choice_required and apply_change and nullif(trim(replacement),'') is not null then
      select * into target_room from rooms where type=new_type and (id=replacement or number=replacement)
        order by (id=replacement) desc limit 1;
      -- A hold on the selected room is still actionable when it exhausts type inventory.
      if found and guest_room_has_live_exact_hold(target_room.id,new_in,new_out) then
        raise exception 'MODIFICATION_ROOM_HELD';
      end if;
    end if;
    if hotel_available_units(new_type,new_in,new_out,policy,r.id,null,now())<=0 then
      raise exception 'MODIFICATION_INVENTORY_UNAVAILABLE';
    end if;
    if room_choice_required and apply_change then
      if nullif(trim(replacement),'') is null then raise exception 'MODIFICATION_ROOM_SELECTION_REQUIRED'; end if;
      if target_room.id is null or not guest_room_is_free(target_room.id,new_in,new_out,r.id) then
        raise exception 'MODIFICATION_ROOM_UNAVAILABLE';
      end if;
    end if;

    select * into invoice from invoices where reservation_id=r.id for update;
    if not found then raise exception 'FOLIO_NOT_FOUND'; end if;
    if reviewed_quote is not null then
      new_rates:=reviewed_quote->'nightlyRates';
      delta:=(reviewed_quote->>'lodgingDelta')::numeric;
    else
      -- Keep the original prices on retained nights. For legacy stays without a
      -- complete breakdown, calculate the delta from their recorded booked total.
      if jsonb_typeof(r.nightly_rates)='array' then
        select sum(f.rate),r.nightly_rates into old_lodging,old_rates
          from jsonb_to_recordset(r.nightly_rates) as f(date date,rate numeric)
          having count(*)=r.check_out-r.check_in
            and count(distinct f.date)=count(*)
            and bool_and(f.date>=r.check_in and f.date<r.check_out and f.rate is not null and f.rate>=0);
        if not found then old_lodging:=r.total; old_rates:='[]'::jsonb; end if;
      end if;
      select round(sum(n.rate),2),jsonb_agg(jsonb_build_object('date',n.night,'rate',n.rate) order by n.night)
        into new_lodging,new_rates
        from (
          select live.night,coalesce(frozen.rate,live.rate) as rate
          from room_nightly_rates(new_type,new_in,new_out) live
          left join jsonb_to_recordset(old_rates) as frozen(date date,rate numeric)
            on new_type=r.room_type and frozen.date=live.night
        ) n;
      if new_lodging is null then raise exception 'ROOM_TYPE_UNAVAILABLE'; end if;
      delta:=round(new_lodging-old_lodging,2);
    end if;
    folio_total:=round(invoice.amount+delta,2);
    if folio_total<0 or r.total+delta<0 then raise exception 'FOLIO_AMENDMENT_CONFLICT'; end if;
  else
    select coalesce((select amount from invoices where reservation_id=r.id),r.total) into folio_total;
  end if;

  quote:=quote||jsonb_build_object('lodgingDelta',delta,'nightlyRates',new_rates);

  if apply_change then
    if repriced then
      update reservations set check_in=new_in,check_out=new_out,room_type=new_type,
        guests=new_guests,special_requests=coalesce(new_notes,special_requests),
        total=round(r.total+delta,2),nightly_rates=new_rates,
        room_id=target_room.id,room_number=target_room.number where id=r.id;
      if assigned.id is not null and assigned.room_id=target_room.id then
        update reservation_room_assignments set check_in=new_in,check_out=new_out,
          effective_from=case when effective_from is not null then new_in end
          where id=assigned.id and (check_in,check_out) is distinct from (new_in,new_out);
      elsif target_room.id is not null then
        if assigned.id is not null then
          update reservation_room_assignments set status='reassigned',released_at=now(),reason=change_reason
            where id=assigned.id;
        end if;
        insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason)
          values(r.id,target_room.id,new_in,new_out,change_actor,change_reason);
        if target_room.id is distinct from current_room then
          update rooms set status=case when housekeeping='clean' then 'available' else 'dirty' end
            where id=current_room and status='reserved';
          update rooms set status='reserved' where id=target_room.id and status='available';
        end if;
      end if;
      if delta<>0 then
        update invoices set amount=folio_total where id=invoice.id;
        perform sync_invoice_financials(invoice.id);
      end if;
    elsif party_changed then
      update reservations set guests=new_guests,special_requests=coalesce(new_notes,special_requests) where id=r.id;
    elsif new_notes is not null and r.special_requests is distinct from new_notes then
      update reservations set special_requests=new_notes where id=r.id;
    end if;
  end if;
  return jsonb_build_object('calculatedTotal',folio_total,'paymentDifference',delta,
    'roomChoiceRequired',room_choice_required,'quote',quote);
end $$;

commit;
