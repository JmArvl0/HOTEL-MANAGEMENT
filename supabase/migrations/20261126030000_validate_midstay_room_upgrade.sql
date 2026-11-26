create or replace function public.validate_room_type_exception_check_in()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  approval manager_approval_requests%rowtype;
  target_id uuid;
begin
  if new.status <> 'checked_in' or old.room_type = new.room_type then
    return new;
  end if;

  select id into target_id from room_types where name = new.room_type and active;
  if target_id is null then
    raise exception 'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';
  end if;

  if old.status = 'checked_in' then
    -- The execution RPC locks the upgrade approval and creates its authorized
    -- assignment before updating the in-house reservation.
    select a.* into approval
    from manager_approval_requests a
    join reservation_room_assignments ra on ra.reservation_id = old.id
      and ra.room_id = new.room_id and ra.status = 'active'
      and ra.is_upgrade and ra.authorized_by = a.reviewed_by and ra.reason = a.reason
    join rooms x on x.id = new.room_id and x.type = new.room_type
    where a.reservation_id = old.id
      and a.request_type = 'room_upgrade'
      and a.status = 'approved'
      and a.execution_status = 'awaiting_execution'
      and a.requested_action->>'requestedRoomType' = new.room_type
      and a.requested_action->'financials' is not null
    order by (
      a.guest_accepted_at is not null
      or a.requested_action->'financials'->>'responsibility' <> 'guest'
      or (a.requested_action->'financials'->>'difference')::numeric <= 0
    ) desc nulls last, a.requested_at desc
    limit 1;
    if not found then
      raise exception 'APPROVAL_STALE';
    end if;
    if approval.requested_action->'financials'->>'responsibility' = 'guest'
      and (approval.requested_action->'financials'->>'difference')::numeric > 0
      and approval.guest_accepted_at is null then
      raise exception 'ROOM_TYPE_EXCEPTION_ACCEPTANCE_REQUIRED';
    end if;
    if not public.front_desk_room_is_eligible(new.room_id, old.id) then
      raise exception 'UPGRADE_ROOM_UNAVAILABLE';
    end if;
    return new;
  end if;

  select * into approval
  from manager_approval_requests a
  where a.reservation_id = old.id
    and a.request_type = 'room_type_exception'
    and a.status = 'approved'
    and a.execution_status = 'awaiting_execution'
    and a.requested_action->>'requestedRoomTypeId' = target_id::text
    and a.requested_action->>'requestedRoomId' = new.room_id
  order by a.requested_at desc limit 1;
  if not found then
    raise exception 'ROOM_TYPE_EXCEPTION_ROOM_CHANGED';
  end if;
  if not public.front_desk_room_is_eligible(new.room_id, old.id) then
    raise exception 'ROOM_TYPE_EXCEPTION_ROOM_UNAVAILABLE';
  end if;
  return new;
end;
$$;
