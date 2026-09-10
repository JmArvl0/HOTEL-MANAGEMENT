-- Room-type governance. Managers may create room types and maintain their guest-facing
-- content, but pricing is propose-then-approve: manager rate changes land in
-- room_rate_proposals and only apply when an owner/admin reviews them.
--
-- Invariants enforced server-side (RPCs, security definer, service-role only):
--  * a manager's write never lands on room_types.base_rate;
--  * a room type cannot be activated while a rate proposal is pending or its rate is 0;
--  * room types are never deleted -- deactivate only (rooms.type / reservations.room_type
--    reference the name loosely as text, and history must resolve).

-- Pending/approved/rejected rate proposals, one pending per room type.
create table if not exists public.room_rate_proposals (
  id uuid primary key default gen_random_uuid(),
  room_type_id uuid not null references public.room_types (id),
  proposed_rate numeric(12,2) not null check (proposed_rate >= 0),
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  proposed_by uuid references public.user_accounts (id),
  decided_by uuid references public.user_accounts (id),
  decision_reason text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create unique index if not exists room_rate_proposals_one_pending
  on public.room_rate_proposals (room_type_id) where status = 'pending';
alter table public.room_rate_proposals enable row level security;
revoke all on table public.room_rate_proposals from public, anon, authenticated;

-- Create a room type (owner/admin/manager). Manager creations start inactive with
-- base_rate 0 and the desired rate filed as a pending proposal; owner/admin creations
-- apply the rate directly and may activate immediately.
create or replace function public.admin_create_room_type(
  p_name text, p_description text, p_max_guests integer, p_beds text, p_size_sqm integer,
  p_amenities jsonb, p_base_rate numeric, p_active boolean, p_reason text,
  p_photo_urls text[] default null, p_actor_user_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare actor text; new_id uuid; is_manager boolean; photos text[]; desired_rate numeric;
begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or actor not in ('owner', 'admin', 'manager') then raise exception 'ADMIN_AUTHORITY_REQUIRED'; end if;
  if nullif(trim(p_name), '') is null or length(trim(p_name)) > 120
     or nullif(trim(p_description), '') is null or p_max_guests is null or p_max_guests <= 0
     or nullif(trim(p_beds), '') is null or (p_size_sqm is not null and p_size_sqm <= 0)
     or p_base_rate is null or p_base_rate < 0
     or jsonb_typeof(coalesce(p_amenities, '[]')) <> 'array'
     or nullif(trim(p_reason), '') is null
     or (p_photo_urls is not null and array_length(p_photo_urls, 1) > 24)
     or (p_photo_urls is not null and exists (select 1 from unnest(p_photo_urls) u where length(coalesce(u, '')) > 500))
    then raise exception 'INVALID_ROOM_TYPE_CONFIGURATION'; end if;
  if exists (select 1 from room_types where lower(name) = lower(trim(p_name))) then raise exception 'ROOM_TYPE_NAME_TAKEN'; end if;
  is_manager := actor = 'manager';
  desired_rate := round(p_base_rate, 2);
  photos := coalesce(p_photo_urls, '{}');
  if not is_manager and coalesce(p_active, false) and desired_rate <= 0 then raise exception 'ROOM_TYPE_RATE_REQUIRED'; end if;
  insert into room_types (name, description, max_guests, beds, size_sqm, amenities, base_rate, active, photo_urls, version)
  values (trim(p_name), trim(p_description), p_max_guests, trim(p_beds), p_size_sqm, coalesce(p_amenities, '[]'),
    case when is_manager then 0 else desired_rate end,
    case when is_manager then false else coalesce(p_active, false) end,
    photos, 1)
  returning id into new_id;
  if is_manager then
    insert into room_rate_proposals (room_type_id, proposed_rate, reason, status, proposed_by)
    values (new_id, desired_rate, trim(p_reason), 'pending', p_actor_user_id);
  end if;
  insert into audit_logs (user_id, action, entity_type, entity_id, after_data)
  values (p_actor_user_id, 'admin_create_room_type', 'room_type', new_id::text,
    jsonb_build_object('name', trim(p_name), 'maxGuests', p_max_guests, 'beds', trim(p_beds),
      'sizeSqm', p_size_sqm, 'baseRate', case when is_manager then 0 else desired_rate end,
      'active', case when is_manager then false else coalesce(p_active, false) end,
      'rateProposal', is_manager, 'photoUrls', photos, 'reason', trim(p_reason)));
  return new_id;
end $$;

-- Manager proposes a new base rate for an existing room type. Bumps the room-type
-- version so concurrent editors hit ROOM_TYPE_STALE instead of silently racing.
create or replace function public.admin_propose_room_type_rate(
  p_room_type_id uuid, p_rate numeric, p_reason text, p_expected_version integer, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text; t room_types%rowtype; new_version integer;
begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or actor <> 'manager' then raise exception 'MANAGER_AUTHORITY_REQUIRED'; end if;
  if p_rate is null or p_rate < 0 or nullif(trim(p_reason), '') is null then raise exception 'INVALID_ROOM_TYPE_CONFIGURATION'; end if;
  select * into t from room_types where id = p_room_type_id for update;
  if not found then raise exception 'ROOM_TYPE_NOT_FOUND'; end if;
  if t.version <> p_expected_version then raise exception 'ROOM_TYPE_STALE'; end if;
  if round(p_rate, 2) = t.base_rate then raise exception 'RATE_PROPOSAL_SAME_AS_CURRENT'; end if;
  if exists (select 1 from room_rate_proposals where room_type_id = t.id and status = 'pending') then raise exception 'RATE_PROPOSAL_ALREADY_PENDING'; end if;
  update room_types set version = version + 1, updated_at = now() where id = t.id returning version into new_version;
  insert into room_rate_proposals (room_type_id, proposed_rate, reason, status, proposed_by)
  values (t.id, round(p_rate, 2), trim(p_reason), 'pending', p_actor_user_id);
  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_user_id, 'propose_room_type_rate', 'room_type', t.id::text,
    jsonb_build_object('baseRate', t.base_rate, 'version', t.version),
    jsonb_build_object('proposedRate', round(p_rate, 2), 'reason', trim(p_reason), 'version', new_version));
  return jsonb_build_object('id', t.id, 'version', new_version);
end $$;

-- Owner/admin decide a pending rate proposal. Approve writes the rate onto the room
-- type (version bump); both decisions close the proposal and are audited.
create or replace function public.admin_review_room_type_rate_proposal(
  p_proposal_id uuid, p_decision text, p_reason text, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text; p room_rate_proposals%rowtype; t room_types%rowtype; new_version integer;
begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or actor not in ('owner', 'admin') then raise exception 'ADMIN_AUTHORITY_REQUIRED'; end if;
  if p_decision not in ('approve', 'reject') or nullif(trim(p_reason), '') is null then raise exception 'INVALID_ROOM_TYPE_CONFIGURATION'; end if;
  select * into p from room_rate_proposals where id = p_proposal_id for update;
  if not found then raise exception 'RATE_PROPOSAL_NOT_FOUND'; end if;
  if p.status <> 'pending' then raise exception 'RATE_PROPOSAL_ALREADY_REVIEWED'; end if;
  select * into t from room_types where id = p.room_type_id for update;
  if not found then raise exception 'ROOM_TYPE_NOT_FOUND'; end if;
  if p_decision = 'approve' then
    update room_types set base_rate = p.proposed_rate, version = version + 1, updated_at = now()
      where id = t.id returning version into new_version;
  else
    update room_types set version = version + 1, updated_at = now() where id = t.id returning version into new_version;
  end if;
  update room_rate_proposals set status = p_decision, decided_by = p_actor_user_id,
    decided_at = now(), decision_reason = trim(p_reason) where id = p.id;
  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_user_id, 'review_room_type_rate_proposal', 'room_type', t.id::text,
    jsonb_build_object('baseRate', t.base_rate, 'proposedRate', p.proposed_rate, 'status', 'pending', 'version', t.version),
    jsonb_build_object('decision', p_decision, 'baseRate', case when p_decision = 'approve' then p.proposed_rate else t.base_rate end,
      'reason', trim(p_reason), 'version', new_version));
  return jsonb_build_object('id', t.id, 'version', new_version, 'status', p_decision);
end $$;

-- admin_update_room_type: same signature, two manager guards added. A manager can no
-- longer change the base rate directly or activate a type whose rate is still pending;
-- anyone activating a rate-0 type is refused. (Live body verified identical to
-- 20260904010000 before this replace.)
create or replace function public.admin_update_room_type(
  p_room_type_id uuid, p_description text, p_max_guests integer, p_beds text,
  p_size_sqm integer, p_amenities jsonb, p_base_rate numeric, p_active boolean,
  p_reason text, p_expected_version integer, p_actor_user_id uuid,
  p_photo_urls text[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text; t room_types%rowtype; photos text[]; new_rate numeric;
begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or actor not in ('owner', 'admin', 'manager') then raise exception 'ADMIN_AUTHORITY_REQUIRED'; end if;
  if nullif(trim(p_description), '') is null or p_max_guests <= 0 or nullif(trim(p_beds), '') is null
     or (p_size_sqm is not null and p_size_sqm <= 0) or p_base_rate < 0
     or jsonb_typeof(coalesce(p_amenities, '[]')) <> 'array' or nullif(trim(p_reason), '') is null
     or (p_photo_urls is not null and array_length(p_photo_urls, 1) > 24)
     or (p_photo_urls is not null and exists (select 1 from unnest(p_photo_urls) u where length(coalesce(u, '')) > 500))
    then raise exception 'INVALID_ROOM_TYPE_CONFIGURATION'; end if;
  photos := coalesce(p_photo_urls, (select photo_urls from room_types where id = p_room_type_id));
  select * into t from room_types where id = p_room_type_id for update;
  if not found then raise exception 'ROOM_TYPE_NOT_FOUND'; end if;
  if t.version <> p_expected_version then raise exception 'ROOM_TYPE_STALE'; end if;
  new_rate := case when actor = 'manager' then t.base_rate else round(p_base_rate, 2) end;
  if actor = 'manager' and round(p_base_rate, 2) <> t.base_rate then raise exception 'RATE_CHANGE_APPROVAL_REQUIRED'; end if;
  if coalesce(p_active, t.active) and new_rate <= 0 then raise exception 'ROOM_TYPE_RATE_REQUIRED'; end if;
  if actor = 'manager' and p_active and exists (select 1 from room_rate_proposals where room_type_id = t.id and status = 'pending')
    then raise exception 'RATE_APPROVAL_PENDING'; end if;
  update room_types set description = trim(p_description), max_guests = p_max_guests, beds = trim(p_beds),
    size_sqm = p_size_sqm, amenities = coalesce(p_amenities, '[]'), base_rate = new_rate,
    active = p_active, photo_urls = photos, version = version + 1, updated_at = now() where id = t.id;
  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
  values (p_actor_user_id, 'admin_update_room_type', 'room_type', t.id::text, to_jsonb(t) - 'id',
    jsonb_build_object('name', t.name, 'description', trim(p_description), 'maxGuests', p_max_guests,
      'beds', trim(p_beds), 'sizeSqm', p_size_sqm, 'amenities', coalesce(p_amenities, '[]'),
      'baseRate', new_rate, 'active', p_active, 'photoUrls', photos,
      'reason', trim(p_reason)));
  return jsonb_build_object('id', t.id, 'version', t.version + 1);
end $$;

-- Only the service role may call the SECURITY DEFINER functions.
revoke all on function public.admin_create_room_type(text, text, integer, text, integer, jsonb, numeric, boolean, text, text[], uuid) from public, anon, authenticated;
grant execute on function public.admin_create_room_type(text, text, integer, text, integer, jsonb, numeric, boolean, text, text[], uuid) to service_role;
revoke all on function public.admin_propose_room_type_rate(uuid, numeric, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.admin_propose_room_type_rate(uuid, numeric, text, integer, uuid) to service_role;
revoke all on function public.admin_review_room_type_rate_proposal(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_review_room_type_rate_proposal(uuid, text, text, uuid) to service_role;
revoke all on function public.admin_update_room_type(uuid, text, integer, text, integer, jsonb, numeric, boolean, text, integer, uuid, text[]) from public, anon, authenticated;
grant execute on function public.admin_update_room_type(uuid, text, integer, text, integer, jsonb, numeric, boolean, text, integer, uuid, text[]) to service_role;
