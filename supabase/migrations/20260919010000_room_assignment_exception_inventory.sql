-- Controlled Front Desk room-assignment exceptions.
-- Additive helper RPCs and validation triggers only; no data rewrite.

create or replace function public.front_desk_room_is_eligible(p_room_id text, p_reservation_id text)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from rooms x
    join reservations r on r.id=p_reservation_id
    join room_types t on t.name=x.type and t.active
    where x.id=p_room_id
      and r.status='confirmed'
      and coalesce(x.administratively_active,true)
      and x.status='available'
      and x.housekeeping='clean'
      and not maintenance_room_is_blocked(x.id)
      and not exists(
        select 1
        from reservation_room_assignments ra
        where ra.room_id=x.id
          and ra.status='active'
          and ra.reservation_id<>r.id
          and ra.check_in<r.check_out and ra.check_out>r.check_in
      )
  )
$$;

create or replace function public.front_desk_eligible_room_inventory(p_reservation_id text)
returns table(room_type_id uuid, room_type_name text, room_id text, room_number text, floor integer)
language sql
stable
security definer
set search_path=public
as $$
  select t.id,t.name,x.id,x.number,x.floor
  from reservations r
  join room_types t on t.active
  join rooms x on x.type=t.name
  where r.id=p_reservation_id
    and public.front_desk_room_is_eligible(x.id,r.id)
  order by t.base_rate,t.name,x.number
$$;

revoke all on function public.front_desk_room_is_eligible(text,text) from public;
revoke all on function public.front_desk_eligible_room_inventory(text) from public;
grant execute on function public.front_desk_room_is_eligible(text,text) to service_role;
grant execute on function public.front_desk_eligible_room_inventory(text) to service_role;

-- Manager approval is still performed by review_manager_approval. This trigger
-- adds exact-ID and exact-room validation immediately before that RPC can mark a
-- room-type exception approved.
create or replace function public.validate_room_type_exception_approval()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  r reservations%rowtype;
  t room_types%rowtype;
  requested_room rooms%rowtype;
  target_id uuid;
begin
  if new.request_type<>'room_type_exception' or old.status<>'pending' or new.status<>'approved' then return new;end if;
  select * into r from reservations where id=new.reservation_id for update;
  if not found or r.status<>'confirmed' then raise exception'APPROVAL_STALE';end if;
  if coalesce(new.requested_action->>'requestedRoomTypeId','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
  target_id:=(new.requested_action->>'requestedRoomTypeId')::uuid;
  select * into t from room_types where id=target_id and active;
  if not found or t.name=r.room_type then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
  select * into requested_room from rooms where id=new.requested_action->>'requestedRoomId' for update;
  if not found then raise exception'ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE';end if;
  if requested_room.type<>t.name then raise exception'ROOM_TYPE_EXCEPTION_ROOM_TYPE_MISMATCH';end if;
  if exists(select 1 from rooms x where x.type=r.room_type and public.front_desk_room_is_eligible(x.id,r.id)) then raise exception'ROOM_TYPE_EXCEPTION_NOT_NEEDED';end if;
  if not public.front_desk_room_is_eligible(requested_room.id,r.id) then raise exception'ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE';end if;
  return new;
end$$;

drop trigger if exists manager_approval_validate_room_type_exception on public.manager_approval_requests;
create trigger manager_approval_validate_room_type_exception
before update of status on public.manager_approval_requests
for each row execute function public.validate_room_type_exception_approval();

-- Front Desk submits room-type exceptions with exact room-type/room IDs chosen from the
-- eligible-inventory endpoint. This insert-time guard rejects fabricated or stale IDs
-- immediately, instead of letting an invalid request sit pending until a Manager tries to
-- approve it. roomType (the display name) is kept consistent with the ID it must match.
create or replace function public.validate_room_type_exception_request()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  r reservations%rowtype;
  t room_types%rowtype;
  requested_room rooms%rowtype;
  target_id uuid;
begin
  if new.request_type<>'room_type_exception' then return new;end if;
  select * into r from reservations where id=new.reservation_id;
  if not found then raise exception'APPROVAL_STALE';end if;
  if coalesce(new.requested_action->>'requestedRoomTypeId','')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
  target_id:=(new.requested_action->>'requestedRoomTypeId')::uuid;
  select * into t from room_types where id=target_id and active;
  if not found or t.name=r.room_type then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
  if nullif(new.requested_action->>'roomType','') is distinct from t.name then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
  select * into requested_room from rooms where id=new.requested_action->>'requestedRoomId';
  if not found then raise exception'ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE';end if;
  if requested_room.type<>t.name then raise exception'ROOM_TYPE_EXCEPTION_ROOM_TYPE_MISMATCH';end if;
  if not public.front_desk_room_is_eligible(requested_room.id,r.id) then raise exception'ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE';end if;
  return new;
end$$;

drop trigger if exists manager_approval_validate_room_type_exception_request on public.manager_approval_requests;
create trigger manager_approval_validate_room_type_exception_request
before insert on public.manager_approval_requests
for each row execute function public.validate_room_type_exception_request();

-- The existing front_desk_check_in RPC remains the atomic assignment authority.
-- This trigger ensures a type-changing check-in can consume only the exact room
-- and real room-type IDs approved by the Manager, then rechecks live inventory.
create or replace function public.validate_room_type_exception_check_in()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  approval manager_approval_requests%rowtype;
  target_id uuid;
begin
  if new.status<>'checked_in' or old.room_type=new.room_type then return new;end if;
  select t.id into target_id from room_types t where t.name=new.room_type and t.active;
  if target_id is null then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
  select * into approval
  from manager_approval_requests a
  where a.reservation_id=old.id
    and a.request_type='room_type_exception'
    and a.status='approved'
    and a.execution_status='awaiting_execution'
    and a.requested_action->>'requestedRoomTypeId'=target_id::text
    and a.requested_action->>'requestedRoomId'=new.room_id
  order by a.requested_at desc limit 1;
  if not found then raise exception'ROOM_TYPE_EXCEPTION_ROOM_CHANGED';end if;
  if not public.front_desk_room_is_eligible(new.room_id,old.id) then raise exception'ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE';end if;
  return new;
end$$;

drop trigger if exists reservation_validate_room_type_exception_check_in on public.reservations;
create trigger reservation_validate_room_type_exception_check_in
before update of status,room_type,room_id on public.reservations
for each row execute function public.validate_room_type_exception_check_in();

revoke all on function public.validate_room_type_exception_approval() from public;
revoke all on function public.validate_room_type_exception_check_in() from public;
revoke all on function public.validate_room_type_exception_request() from public;
