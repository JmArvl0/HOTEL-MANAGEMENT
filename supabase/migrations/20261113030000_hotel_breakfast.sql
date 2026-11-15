begin;

create table public.hotel_breakfast_offers (
  id uuid primary key default gen_random_uuid(),
  room_type_id uuid not null references public.room_types(id),
  mode text not null check (mode in ('optional', 'included', 'off')),
  price_minor integer not null check (price_minor between 0 and 10000000),
  first_day date not null,
  last_day date not null check (last_day >= first_day),
  service_start time not null,
  service_end time not null check (service_end > service_start and service_end < time '24:00'),
  venue text not null check (char_length(trim(venue)) between 1 and 100),
  status text not null default 'pending' check (status in ('pending','published','retired','declined')),
  proposed_by uuid not null references public.user_accounts(id),
  decided_by uuid references public.user_accounts(id),
  created_at timestamptz not null default now(),
  check ((mode = 'optional' and price_minor > 0) or (mode <> 'optional' and price_minor = 0))
);
create unique index hotel_breakfast_one_offer_per_state on public.hotel_breakfast_offers(room_type_id,status)
  where status in ('published','pending');

alter table public.booking_holds add column breakfast_snapshot jsonb;
alter table public.reservations add column breakfast_snapshot jsonb;

create table public.hotel_breakfast_days (
  id uuid primary key default gen_random_uuid(),
  reservation_id text not null references public.reservations(id),
  service_date date not null,
  allowance integer not null check (allowance between 1 and 8),
  used integer not null default 0 check (used between 0 and allowance),
  -- Only the service-role server can read this stable lookup key. It cannot authorize a redemption.
  pass_code text not null unique default ('HBF1.' || replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
  unique (reservation_id,service_date)
);

create table public.hotel_breakfast_redemptions (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.hotel_breakfast_days(id),
  actor text not null,
  request_id uuid not null,
  quantity integer not null check (quantity between 1 and 8),
  used_after integer not null check (used_after between quantity and 8),
  created_at timestamptz not null default now(),
  unique (actor,request_id)
);

alter table public.hotel_breakfast_offers enable row level security;
alter table public.hotel_breakfast_days enable row level security;
alter table public.hotel_breakfast_redemptions enable row level security;
revoke all on public.hotel_breakfast_offers, public.hotel_breakfast_days, public.hotel_breakfast_redemptions from public,anon,authenticated,service_role;
grant select on public.hotel_breakfast_offers, public.hotel_breakfast_days to service_role;

create function public.hotel_propose_breakfast(p_actor uuid,p_room_type uuid,p_offer jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare offer_id uuid;
begin
  if not exists(select 1 from user_accounts where id=p_actor and active and account_status='active' and role in ('manager','owner','admin')) then
    raise exception 'BREAKFAST_FORBIDDEN';
  end if;
  perform 1 from room_types where id=p_room_type and archived_at is null for update;
  if not found then raise exception 'BREAKFAST_ROOM_TYPE_NOT_FOUND'; end if;
  if exists(select 1 from hotel_breakfast_offers where room_type_id=p_room_type and status='pending') then
    raise exception 'BREAKFAST_PROPOSAL_PENDING';
  end if;
  insert into hotel_breakfast_offers(room_type_id,mode,price_minor,first_day,last_day,service_start,service_end,venue,proposed_by)
  values(p_room_type,p_offer->>'mode',(p_offer->>'priceMinor')::int,(p_offer->>'firstDay')::date,(p_offer->>'lastDay')::date,
    (p_offer->>'start')::time,(p_offer->>'end')::time,trim(p_offer->>'venue'),p_actor)
  returning id into offer_id;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
  values(p_actor,'propose_breakfast_offer','room_type',p_room_type::text,jsonb_build_object('offerId',offer_id));
  return offer_id;
end $$;

create function public.hotel_decide_breakfast(p_actor uuid,p_offer uuid,p_publish boolean)
returns void language plpgsql security definer set search_path=public as $$
declare offer hotel_breakfast_offers%rowtype;
begin
  if not exists(select 1 from user_accounts where id=p_actor and active and account_status='active' and role in ('owner','admin')) then
    raise exception 'BREAKFAST_FORBIDDEN';
  end if;
  select * into offer from hotel_breakfast_offers where id=p_offer;
  if not found then raise exception 'BREAKFAST_PROPOSAL_NOT_FOUND'; end if;
  perform 1 from room_types where id=offer.room_type_id and archived_at is null for update;
  if not found then raise exception 'BREAKFAST_ROOM_TYPE_NOT_FOUND'; end if;
  select * into offer from hotel_breakfast_offers where id=p_offer for update;
  if offer.status<>'pending' then raise exception 'BREAKFAST_PROPOSAL_CHANGED'; end if;
  if p_publish then
    update hotel_breakfast_offers set status='retired' where room_type_id=offer.room_type_id and status='published';
  end if;
  update hotel_breakfast_offers set status=case when p_publish then 'published' else 'declined' end,decided_by=p_actor where id=p_offer;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
  values(p_actor,'decide_breakfast_offer','room_type',offer.room_type_id::text,jsonb_build_object('offerId',p_offer,'published',p_publish));
end $$;

-- This wrapper keeps the exact-room lock, original room subtotal and replacement
-- logic. A failure rolls back both the new hold and any replacement of the old one.
create function public.hotel_create_breakfast_booking_hold(p_user uuid,p_room text,p_details jsonb,p_offer uuid,p_replace uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  token_id uuid;
  h booking_holds%rowtype;
  previous booking_holds%rowtype;
  offer hotel_breakfast_offers%rowtype;
  snapshot jsonb;
  meal_price numeric(12,2);
  combined numeric(12,2);
  required numeric(12,2);
begin
  if not exists(select 1 from user_accounts where id=p_user and active and account_status='active' and role='guest') then
    raise exception 'BREAKFAST_FORBIDDEN';
  end if;
  if p_room is null then
    if p_offer is not null or p_replace is not null then raise exception 'BREAKFAST_EXACT_ROOM_REQUIRED'; end if;
    token_id:=create_booking_hold(p_user_id=>p_user,p_room_type=>p_details->>'roomType',
      p_check_in=>(p_details->>'checkIn')::date,p_check_out=>(p_details->>'checkOut')::date,
      p_guest_count=>(p_details->>'guests')::int,p_first_name=>p_details->>'firstName',p_last_name=>p_details->>'lastName',
      p_email=>p_details->>'email',p_mobile=>p_details->>'mobile',p_address=>p_details->>'address',
      p_nationality=>p_details->>'nationality',p_expected_arrival=>p_details->>'expectedArrival',
      p_special_requests=>p_details->>'specialRequests',p_request_options=>coalesce(p_details->'requestOptions','[]'::jsonb),
      p_transportation_preferences=>nullif(p_details->'transportationPreferences','null'::jsonb));
  else
    token_id:=create_exact_booking_hold(p_user,p_room,p_details,p_replace);
  end if;
  select * into h from booking_holds where token=token_id;
  if p_replace is not null then
    select * into previous from booking_holds where token=p_replace and user_id=p_user;
  end if;
  if p_offer is null and previous.breakfast_snapshot->>'mode'='included' then raise exception 'BREAKFAST_OFFER_CHANGED'; end if;
  if p_offer is not null and previous.breakfast_snapshot->>'offerId'=p_offer::text
      and previous.check_in=h.check_in and previous.check_out=h.check_out and previous.guest_count=h.guest_count then
    snapshot:=previous.breakfast_snapshot;
  else
    select b.* into offer from hotel_breakfast_offers b join room_types t on t.id=b.room_type_id
    where t.name=h.room_type and b.status='published' and b.mode<>'off'
      and b.first_day<=h.check_in+1 and b.last_day>=h.check_out for share of b;
    if p_offer is null and offer.mode is distinct from 'included' then return token_id; end if;
    if p_room is null then raise exception 'BREAKFAST_EXACT_ROOM_REQUIRED'; end if;
    if p_offer is null or offer.id is distinct from p_offer then raise exception 'BREAKFAST_OFFER_CHANGED'; end if;
    snapshot:=jsonb_build_object('offerId',offer.id,'mode',offer.mode,'unitMinor',offer.price_minor,
      'guests',h.guest_count,'mornings',h.check_out-h.check_in,'firstDate',h.check_in+1,'lastDate',h.check_out,
      'start',to_char(offer.service_start,'HH24:MI'),'end',to_char(offer.service_end,'HH24:MI'),
      'venue',offer.venue,'timezone',coalesce(h.operational_policy_snapshot->>'hotelTimezone',current_operational_policy_snapshot()->>'hotelTimezone','Asia/Manila'));
  end if;
  meal_price:=(snapshot->>'unitMinor')::numeric*h.guest_count*(h.check_out-h.check_in)/100;
  combined:=h.total+meal_price;
  required:=case h.deposit_policy_snapshot->>'calculationType'
    when 'fixed' then least(combined,(h.deposit_policy_snapshot->>'fixedAmount')::numeric)
    else round(combined*(h.deposit_policy_snapshot->>'percentageBasisPoints')::numeric/10000,2) end;
  update booking_holds set breakfast_snapshot=snapshot,total=combined,deposit_required=required where token=token_id;
  return token_id;
end $$;

-- Both payment conversion paths link the hold inside their existing transaction.
create function public.hotel_copy_breakfast_booking() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.reservation_id is null and new.reservation_id is not null and new.breakfast_snapshot is not null then
    update reservations set breakfast_snapshot=new.breakfast_snapshot where id=new.reservation_id;
    insert into hotel_breakfast_days(reservation_id,service_date,allowance)
    select new.reservation_id,new.check_in+day_number,new.guest_count
    from generate_series(1,new.check_out-new.check_in) day_number;
  end if;
  return new;
end $$;
create trigger hotel_copy_breakfast_booking after update of reservation_id on public.booking_holds
for each row execute function public.hotel_copy_breakfast_booking();

-- Legacy amendment functions reprice room nights alone. Guard them until a
-- breakfast-aware amendment can update dates, financials and entitlement together.
create function public.hotel_guard_breakfast_amendment() returns trigger language plpgsql set search_path=public as $$
begin
  if old.breakfast_snapshot is not null and (new.check_in,new.check_out,new.guests,new.room_type,new.total)
    is distinct from (old.check_in,old.check_out,old.guests,old.room_type,old.total) then
    raise exception 'BREAKFAST_AMENDMENT_UNAVAILABLE';
  end if;
  return new;
end $$;
create trigger hotel_guard_breakfast_amendment before update of check_in,check_out,guests,room_type,total on public.reservations
for each row execute function public.hotel_guard_breakfast_amendment();

create function public.hotel_breakfast_service(p_code text,p_staff uuid,p_outlet text,p_quantity int default null,p_request uuid default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  day hotel_breakfast_days%rowtype;
  stay reservations%rowtype;
  previous hotel_breakfast_redemptions%rowtype;
  principal text;
  local_time timestamp;
  result jsonb;
  redemption uuid;
begin
  if p_staff is not null then
    if p_outlet is not null or not exists(select 1 from user_accounts where id=p_staff and active and account_status='active' and role in ('front_desk','manager')) then
      raise exception 'BREAKFAST_FORBIDDEN';
    end if;
    principal:='staff:'||p_staff::text;
  elsif p_outlet ~ '^[a-z0-9-]{1,40}$' then
    principal:='outlet:'||p_outlet;
  else raise exception 'BREAKFAST_FORBIDDEN';
  end if;
  if p_code is null or p_code !~ '^HBF1\.[0-9a-f]{64}$'
    or (p_quantity is null) <> (p_request is null) or coalesce(p_quantity not between 1 and 8,false) then
    return jsonb_build_object('status','invalid');
  end if;

  if p_request is not null then
    perform pg_advisory_xact_lock(hashtextextended('breakfast:'||principal||':'||p_request::text,0));
  end if;
  select * into day from hotel_breakfast_days where pass_code=p_code;
  if not found then return jsonb_build_object('status','invalid'); end if;
  if p_request is not null then
    select * into previous from hotel_breakfast_redemptions where actor=principal and request_id=p_request;
    if found then
      if previous.day_id<>day.id or previous.quantity<>p_quantity then return jsonb_build_object('status','conflict'); end if;
      return jsonb_build_object('status','recorded','redemptionId',previous.id,'serviceDate',day.service_date,
        'allowance',day.allowance,'used',previous.used_after,'remaining',day.allowance-previous.used_after,'replayed',true);
    end if;
    -- Same lock order as reservation lifecycle updates. Re-read after waiting.
    select * into stay from reservations where id=day.reservation_id for update;
    select * into day from hotel_breakfast_days where id=day.id for update;
  else
    select * into stay from reservations where id=day.reservation_id;
  end if;
  if stay.breakfast_snapshot is null or (stay.status not in ('confirmed','checked_in')
      and not (stay.status='checked_out' and day.service_date=stay.check_out
        and coalesce((stay.checked_out_at at time zone (stay.breakfast_snapshot->>'timezone'))::date=day.service_date,false))) then
    return jsonb_build_object('status','ineligible');
  end if;
  local_time:=clock_timestamp() at time zone (stay.breakfast_snapshot->>'timezone');
  if local_time::date<>day.service_date or local_time::time<(stay.breakfast_snapshot->>'start')::time
      or local_time::time>=(stay.breakfast_snapshot->>'end')::time then
    return jsonb_build_object('status','outside_service','serviceDate',day.service_date);
  end if;
  result:=jsonb_build_object('serviceDate',day.service_date,'allowance',day.allowance,'roomNumber',stay.room_number,
    'used',day.used,'remaining',day.allowance-day.used);
  if day.used>=day.allowance then return result||jsonb_build_object('status','used'); end if;
  if p_quantity is null then return result||jsonb_build_object('status','valid'); end if;
  if p_quantity>day.allowance-day.used then return result||jsonb_build_object('status','insufficient'); end if;
  update hotel_breakfast_days set used=used+p_quantity where id=day.id returning used into day.used;
  insert into hotel_breakfast_redemptions(day_id,actor,request_id,quantity,used_after)
  values(day.id,principal,p_request,p_quantity,day.used) returning id into redemption;
  return jsonb_build_object('status','recorded','redemptionId',redemption,'serviceDate',day.service_date,
    'allowance',day.allowance,'used',day.used,'remaining',day.allowance-day.used,'replayed',false);
end $$;

revoke all on function public.hotel_propose_breakfast(uuid,uuid,jsonb),public.hotel_decide_breakfast(uuid,uuid,boolean),
  public.hotel_create_breakfast_booking_hold(uuid,text,jsonb,uuid,uuid),public.hotel_copy_breakfast_booking(),
  public.hotel_guard_breakfast_amendment(),public.hotel_breakfast_service(text,uuid,text,int,uuid) from public,anon,authenticated;
grant execute on function public.hotel_propose_breakfast(uuid,uuid,jsonb),public.hotel_decide_breakfast(uuid,uuid,boolean),
  public.hotel_create_breakfast_booking_hold(uuid,text,jsonb,uuid,uuid),public.hotel_breakfast_service(text,uuid,text,int,uuid) to service_role;
notify pgrst,'reload schema';
commit;
