-- Room-type badge colors. Each room type carries one semantic color key
-- (room_types.badge_color_key) rendered as its badge everywhere staff see a
-- room-type pill; the key never changes with room status and unknown/legacy
-- values fall back to a neutral badge client-side.
--
-- Invariants enforced server-side:
--  * the key must be one of the eight curated HAVEN palette keys (CHECK);
--  * a color is held by at most one ACTIVE room type (partial unique index —
--    inactive types' colors are reusable, and the index itself is the
--    race-proof backstop for concurrent claims, on top of the RPC pre-checks
--    that raise ROOM_TYPE_COLOR_TAKEN with a friendly message).

alter table public.room_types
  add column if not exists badge_color_key text
  constraint room_types_badge_color_key check (
    badge_color_key is null
    or badge_color_key in ('sage', 'gold', 'ocean', 'plum', 'terracotta', 'slate', 'sand', 'lavender')
  );

create unique index if not exists room_types_badge_color_active
  on public.room_types (badge_color_key)
  where active and badge_color_key is not null;

-- Backfill by name (never by id or array order): the four seeded guest-facing
-- types. Any other type stays null → neutral fallback badge.
update public.room_types set badge_color_key = 'sage'   where name = 'Garden Twin'      and badge_color_key is null;
update public.room_types set badge_color_key = 'gold'   where name = 'Deluxe King'     and badge_color_key is null;
update public.room_types set badge_color_key = 'ocean'  where name = 'Ocean Suite'     and badge_color_key is null;
update public.room_types set badge_color_key = 'plum'   where name = 'Executive Suite' and badge_color_key is null;

-- admin_create_room_type / admin_update_room_type: + p_badge_color_key.
-- (Live bodies verified identical to 20260915010000 before this replace.)
-- create or replace with a changed argument list would ADD an overload, leaving
-- the old signature callable — drop it first.
drop function if exists public.admin_create_room_type(text, text, integer, text, integer, jsonb, numeric, boolean, text, text[], uuid);
drop function if exists public.admin_update_room_type(uuid, text, integer, text, integer, jsonb, numeric, boolean, text, integer, uuid, text[]);

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
  -- Checked against ACTIVE types regardless of this type's own active flag: an
  -- inactive type holding an active type's color could never be activated.
  if p_badge_color_key is not null
     and exists (select 1 from room_types where badge_color_key = p_badge_color_key and active)
    then raise exception 'ROOM_TYPE_COLOR_TAKEN'; end if;
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
  -- Uniqueness among ACTIVE types; the type's own current color always stays valid.
  if p_badge_color_key is not null
     and exists (select 1 from room_types where badge_color_key = p_badge_color_key and active and id <> t.id)
    then raise exception 'ROOM_TYPE_COLOR_TAKEN'; end if;
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

-- Only the service role may call the SECURITY DEFINER functions (new signatures).
revoke all on function public.admin_create_room_type(text, text, integer, text, integer, jsonb, numeric, boolean, text, text[], uuid, text) from public, anon, authenticated;
grant execute on function public.admin_create_room_type(text, text, integer, text, integer, jsonb, numeric, boolean, text, text[], uuid, text) to service_role;
revoke all on function public.admin_update_room_type(uuid, text, integer, text, integer, jsonb, numeric, boolean, text, integer, uuid, text[], text) from public, anon, authenticated;
grant execute on function public.admin_update_room_type(uuid, text, integer, text, integer, jsonb, numeric, boolean, text, integer, uuid, text[], text) to service_role;
