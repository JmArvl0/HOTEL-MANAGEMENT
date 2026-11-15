-- Local and linked migration ledgers checked before numbering.
begin;

alter table public.reservation_change_requests add column amendment_quote jsonb;

-- All three callers lock the reservation first. Try the inventory locks rather
-- than wait behind checkout, which locks the room type before the reservation.
create function public.hotel_reservation_amendment(
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

    if hotel_available_units(new_type,new_in,new_out,policy,r.id,null,now())<=0 then
      raise exception 'MODIFICATION_INVENTORY_UNAVAILABLE';
    end if;
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
    if room_choice_required and apply_change then
      if nullif(trim(replacement),'') is null then raise exception 'MODIFICATION_ROOM_SELECTION_REQUIRED'; end if;
      select * into target_room from rooms where type=new_type and (id=replacement or number=replacement)
        order by (id=replacement) desc limit 1;
      if not found or not guest_room_is_free(target_room.id,new_in,new_out,r.id) then
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

revoke all on function public.hotel_reservation_amendment(public.reservations,date,date,text,integer,text,text,uuid,text,boolean,jsonb)
  from public,anon,authenticated,service_role;

create or replace function public.customer_request_reservation_change(
  p_user_id uuid, p_reservation_id text, p_check_in date, p_check_out date, p_room_type text,
  p_guests integer, p_special_requests text, p_reason text, p_idempotency_key uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  r reservations%rowtype;
  existing reservation_change_requests%rowtype;
  policy jsonb;
  cin date;
  cout date;
  room_type_name text;
  guest_count integer;
  notes text:=nullif(trim(p_special_requests),'');
  plan jsonb;
  requires_review boolean;
  policy_days integer;
  cid uuid;
  aid uuid;
begin
  perform public.hotel_lock_operating_day();
  if not exists(select 1 from user_accounts where id=p_user_id and active and role='guest') then
    raise exception 'CUSTOMER_ACCESS_REQUIRED';
  end if;
  if p_idempotency_key is null or nullif(trim(p_reason),'') is null then raise exception 'INVALID_MODIFICATION'; end if;
  select * into r from reservations where id=p_reservation_id and user_id=p_user_id for update;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;
  select * into existing from reservation_change_requests where idempotency_key=p_idempotency_key;
  if found then
    if existing.reservation_id is distinct from r.id or existing.requested_by is distinct from p_user_id then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('id',existing.id,'status',existing.status,'executionStatus',existing.execution_status,
      'calculatedTotal',existing.calculated_total,'paymentDifference',existing.payment_difference,
      'managerApprovalId',existing.manager_approval_id);
  end if;
  if exists(select 1 from reservation_change_requests where reservation_id=r.id and status in ('pending','approved')) then
    raise exception 'CHANGE_ALREADY_OPEN';
  end if;

  policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());
  policy_days:=coalesce((policy->>'selfServiceModificationDays')::integer,3);
  cin:=coalesce(p_check_in,r.check_in);
  cout:=coalesce(p_check_out,r.check_out);
  room_type_name:=coalesce(nullif(trim(p_room_type),''),r.room_type);
  guest_count:=coalesce(p_guests,r.guests);
  plan:=hotel_reservation_amendment(r,cin,cout,room_type_name,guest_count,notes,null,p_user_id,p_reason,false,null);
  requires_review:=r.check_in-hotel_today(policy)<=policy_days or (plan->>'roomChoiceRequired')::boolean;
  if not requires_review then
    plan:=hotel_reservation_amendment(r,cin,cout,room_type_name,guest_count,notes,null,p_user_id,p_reason,true,plan->'quote');
  end if;
  insert into reservation_change_requests(reservation_id,requested_by,requested_check_in,requested_check_out,
    requested_room_type,requested_guests,requested_special_requests,reason,status,calculated_total,payment_difference,idempotency_key,execution_status,amendment_quote)
  values(r.id,p_user_id,cin,cout,room_type_name,guest_count,notes,trim(p_reason),
    case when requires_review then 'pending' else 'executed' end,(plan->>'calculatedTotal')::numeric,
    (plan->>'paymentDifference')::numeric,p_idempotency_key,case when requires_review then 'pending_review' else 'not_required' end,
    case when requires_review then plan->'quote' end)
  returning id into cid;
  if requires_review then
    insert into manager_approval_requests(request_type,related_entity_type,related_entity_id,reservation_id,department,
      severity,reason,requested_action,normal_policy_result,requested_by)
    values('reservation_modification','reservation_change_request',cid::text,r.id,'front_desk','normal',
      trim(p_reason),jsonb_build_object('checkIn',cin,'checkOut',cout,'roomType',room_type_name,
        'guests',guest_count,'specialRequests',notes,'calculatedTotal',plan->'calculatedTotal',
        'paymentDifference',plan->'paymentDifference'),
      jsonb_build_object('requiresManagerApproval',true,'policyDays',policy_days),p_user_id)
    returning id into aid;
    update reservation_change_requests set manager_approval_id=aid where id=cid;
  end if;
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
    values(p_user_id,'customer_request_reservation_change','reservation_change_request',cid::text,
      jsonb_build_object('checkIn',r.check_in,'checkOut',r.check_out,'roomType',r.room_type,'total',r.total),
      jsonb_build_object('checkIn',cin,'checkOut',cout,'roomType',room_type_name,'guests',guest_count,
        'calculatedTotal',plan->'calculatedTotal','paymentDifference',plan->'paymentDifference','managerApprovalId',aid));
  return jsonb_build_object('id',cid,'status',case when requires_review then 'pending' else 'executed' end,
    'executionStatus',case when requires_review then 'pending_review' else 'not_required' end,
    'calculatedTotal',plan->'calculatedTotal','paymentDifference',plan->'paymentDifference','managerApprovalId',aid);
end $$;

-- Replace only the modification branches in the verified manager functions.
do $migration$
declare
  body text;
  start_at integer;
  end_at integer;
begin
  select pg_get_functiondef('public.review_manager_approval(uuid,text,text,integer,uuid)'::regprocedure) into body;
  start_at:=strpos(body,'if p_decision=''approve''and a.request_type=''reservation_modification''then');
  end_at:=strpos(body,'if p_decision=''approve''and a.request_type=''early_check_in''then');
  if start_at=0 or end_at<=start_at then raise exception 'AMENDMENT_MANAGER_REVIEW_BODY_UNEXPECTED'; end if;
  execute overlay(body placing $branch$
if p_decision='approve' and a.request_type='reservation_modification' then
  perform hotel_reservation_amendment(r,(a.requested_action->>'checkIn')::date,(a.requested_action->>'checkOut')::date,
    coalesce(nullif(a.requested_action->>'roomType',''),r.room_type),
    coalesce((a.requested_action->>'guests')::int,r.guests),nullif(trim(a.requested_action->>'specialRequests'),''),
    null,p_manager_user_id,a.reason,false,(select amendment_quote from reservation_change_requests where manager_approval_id=a.id));
end if;
$branch$ from start_at for end_at-start_at);

  select pg_get_functiondef('public.front_desk_execute_manager_approval(uuid,text,uuid)'::regprocedure) into body;
  start_at:=strpos(body,'elsif a.request_type=''reservation_modification''then');
  end_at:=strpos(body,'elsif a.request_type=''early_check_in''then');
  if start_at=0 or end_at<=start_at then raise exception 'AMENDMENT_MANAGER_EXECUTION_BODY_UNEXPECTED'; end if;
  execute overlay(body placing $branch$
elsif a.request_type='reservation_modification' then
  perform hotel_reservation_amendment(r,(a.requested_action->>'checkIn')::date,(a.requested_action->>'checkOut')::date,
    coalesce(nullif(a.requested_action->>'roomType',''),r.room_type),
    coalesce((a.requested_action->>'guests')::int,r.guests),nullif(trim(a.requested_action->>'specialRequests'),''),
    p_room_id,p_staff_user_id,a.reason,true,(select amendment_quote from reservation_change_requests where manager_approval_id=a.id));
$branch$ from start_at for end_at-start_at);

  -- The amendment now applies party size and notes in the same transaction.
  -- Keep the trigger responsible for synchronizing the approval status only.
  select pg_get_functiondef('public.sync_customer_change_request_status()'::regprocedure) into body;
  start_at:=strpos(body,'if new.execution_status=''executed''and new.request_type=''reservation_modification''then');
  end_at:=strpos(body,'return new;end');
  if start_at=0 or end_at<=start_at then raise exception 'AMENDMENT_CHANGE_STATUS_BODY_UNEXPECTED'; end if;
  execute overlay(body placing '' from start_at for end_at-start_at);
end
$migration$;

notify pgrst,'reload schema';
commit;
