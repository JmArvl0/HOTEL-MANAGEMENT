-- Badge-color governance: reservation through the approval workflow.
-- Extends 20260925010000 (column, palette CHECK, active-unique index, backfill).
--
-- New invariants, enforced in the RPCs:
--  * RESERVATION SCOPE — a color is held by active types AND inactive types
--    with a pending rate proposal (a pending proposal is a room type on its
--    way live). Rejection frees the color automatically: the scope is derived
--    from live rows, nothing is stored on the proposal.
--  * APPROVE = ACTIVATE — approving a rate proposal on a still-inactive type
--    sets the rate AND publishes the type in one decision (color included);
--    the color is revalidated first as stale-form protection.
--  * ACTIVE-TYPE RECOLORS ARE OWNER/ADMIN-ONLY — a Manager editing an active
--    type re-sends its current color (the form shows it read-only).
--
-- All four functions are recreated from the LIVE pg_get_functiondef bodies
-- (create/update verified byte-equivalent to the 20260925010000 file; propose/
-- review carry no drift). Signatures are unchanged, so the existing
-- service_role-only EXECUTE grants survive.
--
-- The partial unique index from 20260925010000 stays: it remains the
-- race-proof backstop for the ACTIVE scope. The pending scope cannot be an
-- index (it spans room_rate_proposals), so every writer takes a per-color
-- transaction advisory lock before its existence check — all claim paths
-- (create, update, propose, review-approve) serialize on the same lock key.

create or replace function public.admin_create_room_type(
  p_name text, p_description text, p_max_guests integer, p_beds text, p_size_sqm integer,
  p_amenities jsonb, p_base_rate numeric, p_active boolean, p_reason text,
  p_photo_urls text[] default null, p_actor_user_id uuid default null,
  p_badge_color_key text default null)
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
  if p_badge_color_key is not null
     and p_badge_color_key not in ('sage', 'gold', 'ocean', 'plum', 'terracotta', 'slate', 'sand', 'lavender')
    then raise exception 'INVALID_ROOM_TYPE_COLOR'; end if;
  -- Reserve the color: active types + types with a pending rate proposal.
  if p_badge_color_key is not null then
    perform pg_advisory_xact_lock(hashtext('rt-badge:' || p_badge_color_key));
    if exists (
      select 1 from room_types rt
      where rt.badge_color_key = p_badge_color_key
        and (rt.active
             or exists (select 1 from room_rate_proposals q
                        where q.room_type_id = rt.id and q.status = 'pending'))
    ) then raise exception 'ROOM_TYPE_COLOR_TAKEN'; end if;
  end if;
  if exists (select 1 from room_types where lower(name) = lower(trim(p_name))) then raise exception 'ROOM_TYPE_NAME_TAKEN'; end if;
  is_manager := actor = 'manager';
  desired_rate := round(p_base_rate, 2);
  photos := coalesce(p_photo_urls, '{}');
  if not is_manager and coalesce(p_active, false) and desired_rate <= 0 then raise exception 'ROOM_TYPE_RATE_REQUIRED'; end if;
  begin
    insert into room_types (name, description, max_guests, beds, size_sqm, amenities, base_rate, active, photo_urls, version, badge_color_key)
    values (trim(p_name), trim(p_description), p_max_guests, trim(p_beds), p_size_sqm, coalesce(p_amenities, '[]'),
      case when is_manager then 0 else desired_rate end,
      case when is_manager then false else coalesce(p_active, false) end,
      photos, 1, p_badge_color_key)
    returning id into new_id;
  exception when unique_violation then
    raise exception 'ROOM_TYPE_COLOR_TAKEN';
  end;
  if is_manager then
    insert into room_rate_proposals (room_type_id, proposed_rate, reason, status, proposed_by)
    values (new_id, desired_rate, trim(p_reason), 'pending', p_actor_user_id);
  end if;
  insert into audit_logs (user_id, action, entity_type, entity_id, after_data)
    values (p_actor_user_id, 'admin_create_room_type', 'room_type', new_id::text,
      jsonb_build_object('name', trim(p_name), 'maxGuests', p_max_guests, 'beds', trim(p_beds),
        'sizeSqm', p_size_sqm, 'baseRate', case when is_manager then 0 else desired_rate end,
        'active', case when is_manager then false else coalesce(p_active, false) end,
        'rateProposal', is_manager, 'photoUrls', photos, 'badgeColorKey', p_badge_color_key, 'reason', trim(p_reason)));
  return new_id;
end $$;

create or replace function public.admin_update_room_type(
  p_room_type_id uuid, p_description text, p_max_guests integer, p_beds text,
  p_size_sqm integer, p_amenities jsonb, p_base_rate numeric, p_active boolean,
  p_reason text, p_expected_version integer, p_actor_user_id uuid,
  p_photo_urls text[] default null, p_badge_color_key text default null)
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
  if p_badge_color_key is not null
     and p_badge_color_key not in ('sage', 'gold', 'ocean', 'plum', 'terracotta', 'slate', 'sand', 'lavender')
    then raise exception 'INVALID_ROOM_TYPE_COLOR'; end if;
  photos := coalesce(p_photo_urls, (select photo_urls from room_types where id = p_room_type_id));
  select * into t from room_types where id = p_room_type_id for update;
  if not found then raise exception 'ROOM_TYPE_NOT_FOUND'; end if;
  if t.version <> p_expected_version then raise exception 'ROOM_TYPE_STALE'; end if;
  -- Recoloring an active type is an Owner/Admin decision; a Manager's edit
  -- form shows the field read-only and re-sends the current color.
  if actor = 'manager' and t.active and p_badge_color_key is distinct from t.badge_color_key
    then raise exception 'BADGE_COLOR_CHANGE_APPROVAL_REQUIRED'; end if;
  -- Reservation scope: active types + types with a pending rate proposal,
  -- excluding this type (its own color always stays valid for itself).
  if p_badge_color_key is not null then
    perform pg_advisory_xact_lock(hashtext('rt-badge:' || p_badge_color_key));
    if exists (
      select 1 from room_types rt
      where rt.badge_color_key = p_badge_color_key and rt.id <> t.id
        and (rt.active
             or exists (select 1 from room_rate_proposals q
                        where q.room_type_id = rt.id and q.status = 'pending'))
    ) then raise exception 'ROOM_TYPE_COLOR_TAKEN'; end if;
  end if;
  new_rate := case when actor = 'manager' then t.base_rate else round(p_base_rate, 2) end;
  if actor = 'manager' and round(p_base_rate, 2) <> t.base_rate then raise exception 'RATE_CHANGE_APPROVAL_REQUIRED'; end if;
  if coalesce(p_active, t.active) and new_rate <= 0 then raise exception 'ROOM_TYPE_RATE_REQUIRED'; end if;
  if actor = 'manager' and p_active and exists (select 1 from room_rate_proposals where room_type_id = t.id and status = 'pending')
    then raise exception 'RATE_APPROVAL_PENDING'; end if;
  begin
    update room_types set description = trim(p_description), max_guests = p_max_guests, beds = trim(p_beds),
      size_sqm = p_size_sqm, amenities = coalesce(p_amenities, '[]'), base_rate = new_rate,
      active = p_active, photo_urls = photos, badge_color_key = p_badge_color_key,
      version = version + 1, updated_at = now() where id = t.id;
  exception when unique_violation then
    raise exception 'ROOM_TYPE_COLOR_TAKEN';
  end;
  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
    values (p_actor_user_id, 'admin_update_room_type', 'room_type', t.id::text, to_jsonb(t) - 'id',
      jsonb_build_object('name', t.name, 'description', trim(p_description), 'maxGuests', p_max_guests,
        'beds', trim(p_beds), 'sizeSqm', p_size_sqm, 'amenities', coalesce(p_amenities, '[]'),
        'baseRate', new_rate, 'active', p_active, 'photoUrls', photos, 'badgeColorKey', p_badge_color_key,
        'reason', trim(p_reason)));
  return jsonb_build_object('id', t.id, 'version', t.version + 1);
end $$;

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
  -- A pending proposal reserves the type's badge color, so proposing must not
  -- be able to double-book a color another active or pending type holds. The
  -- manager recolors the (still-inactive) type first if this fires.
  if t.badge_color_key is not null then
    perform pg_advisory_xact_lock(hashtext('rt-badge:' || t.badge_color_key));
    if exists (
      select 1 from room_types rt
      where rt.badge_color_key = t.badge_color_key and rt.id <> t.id
        and (rt.active
             or exists (select 1 from room_rate_proposals q
                        where q.room_type_id = rt.id and q.status = 'pending'))
    ) then raise exception 'ROOM_TYPE_COLOR_TAKEN'; end if;
  end if;
  update room_types set version = version + 1, updated_at = now() where id = t.id returning version into new_version;
  insert into room_rate_proposals (room_type_id, proposed_rate, reason, status, proposed_by)
    values (t.id, round(p_rate, 2), trim(p_reason), 'pending', p_actor_user_id);
  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
    values (p_actor_user_id, 'propose_room_type_rate', 'room_type', t.id::text,
      jsonb_build_object('baseRate', t.base_rate, 'version', t.version),
      jsonb_build_object('proposedRate', round(p_rate, 2), 'reason', trim(p_reason), 'version', new_version));
  return jsonb_build_object('id', t.id, 'version', new_version);
end $$;

create or replace function public.admin_review_room_type_rate_proposal(
  p_proposal_id uuid, p_decision text, p_reason text, p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare actor text; p room_rate_proposals%rowtype; t room_types%rowtype; new_version integer; new_status text;
begin
  select role into actor from user_accounts where id = p_actor_user_id and active;
  if actor is null or actor not in ('owner', 'admin') then raise exception 'ADMIN_AUTHORITY_REQUIRED'; end if;
  if p_decision not in ('approve', 'reject') or nullif(trim(p_reason), '') is null then raise exception 'INVALID_ROOM_TYPE_CONFIGURATION'; end if;
  select * into p from room_rate_proposals where id = p_proposal_id for update;
  if not found then raise exception 'RATE_PROPOSAL_NOT_FOUND'; end if;
  if p.status <> 'pending' then raise exception 'RATE_PROPOSAL_ALREADY_REVIEWED'; end if;
  select * into t from room_types where id = p.room_type_id for update;
  if not found then raise exception 'ROOM_TYPE_NOT_FOUND'; end if;
  new_status := case when p_decision = 'approve' then 'approved' else 'rejected' end;
  if p_decision = 'approve' then
    if not t.active then
      -- Approve = activate for still-inactive types: one decision sets the
      -- rate and publishes the type (badge color included). The color check
      -- here is the stale-form protection at approval time.
      if p.proposed_rate <= 0 then raise exception 'ROOM_TYPE_RATE_REQUIRED'; end if;
      if t.badge_color_key is not null then
        perform pg_advisory_xact_lock(hashtext('rt-badge:' || t.badge_color_key));
        if exists (
          select 1 from room_types rt
          where rt.badge_color_key = t.badge_color_key and rt.id <> t.id
            and (rt.active
                 or exists (select 1 from room_rate_proposals q
                            where q.room_type_id = rt.id and q.status = 'pending'))
        ) then raise exception 'ROOM_TYPE_COLOR_TAKEN'; end if;
      end if;
      update room_types set base_rate = p.proposed_rate, active = true, version = version + 1, updated_at = now()
        where id = t.id returning version into new_version;
    else
      update room_types set base_rate = p.proposed_rate, version = version + 1, updated_at = now()
        where id = t.id returning version into new_version;
    end if;
  else
    update room_types set version = version + 1, updated_at = now() where id = t.id returning version into new_version;
  end if;
  update room_rate_proposals set status = new_status, decided_by = p_actor_user_id,
    decided_at = now(), decision_reason = trim(p_reason) where id = p.id;
  insert into audit_logs (user_id, action, entity_type, entity_id, before_data, after_data)
    values (p_actor_user_id, 'review_room_type_rate_proposal', 'room_type', t.id::text,
      jsonb_build_object('baseRate', t.base_rate, 'proposedRate', p.proposed_rate, 'status', 'pending', 'version', t.version, 'active', t.active),
      jsonb_build_object('decision', p_decision, 'baseRate', case when p_decision = 'approve' then p.proposed_rate else t.base_rate end,
        'active', case when p_decision = 'approve' then true else t.active end,
        'badgeColorKey', t.badge_color_key,
        'reason', trim(p_reason), 'version', new_version));
  return jsonb_build_object('id', t.id, 'version', new_version, 'status', new_status);
end $$;
