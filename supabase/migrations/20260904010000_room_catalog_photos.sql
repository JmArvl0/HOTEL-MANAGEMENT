-- Room-catalog photos. Adds a DB-backed photo gallery to room_types, a public
-- Supabase Storage bucket for uploads, and widens the room-type editor so the
-- Manager (with Owner/Admin) can maintain customer-facing room info + photos.
-- Name stays immutable: physical rooms.type / reservations.room_type reference
-- room_types.name loosely as text.

alter table public.room_types add column if not exists photo_urls text[] not null default '{}';

-- Public bucket for room photos. Uploads happen server-side with the service
-- role (bypasses RLS); the public-read policy lets <img> tags load them.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('room-photos', 'room-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists room_photos_public_read on storage.objects;
create policy room_photos_public_read on storage.objects
  for select using (bucket_id = 'room-photos');

-- Drop the previous signature (owner/admin only, no photos) so named-argument
-- callers cannot silently bind to a stale, narrower function.
drop function if exists public.admin_update_room_type(uuid,text,integer,text,integer,jsonb,numeric,boolean,text,integer,uuid);

create or replace function public.admin_update_room_type(
  p_room_type_id uuid, p_description text, p_max_guests integer, p_beds text,
  p_size_sqm integer, p_amenities jsonb, p_base_rate numeric, p_active boolean,
  p_reason text, p_expected_version integer, p_actor_user_id uuid,
  p_photo_urls text[] default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;t room_types%rowtype;photos text[];
begin
 select role into actor from user_accounts where id=p_actor_user_id and active;
 if actor is null or actor not in('owner','admin','manager')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;
 if nullif(trim(p_description),'')is null or p_max_guests<=0 or nullif(trim(p_beds),'')is null
    or(p_size_sqm is not null and p_size_sqm<=0)or p_base_rate<0
    or jsonb_typeof(coalesce(p_amenities,'[]'))<>'array' or nullif(trim(p_reason),'')is null
    or(p_photo_urls is not null and array_length(p_photo_urls,1)>24)
    or(p_photo_urls is not null and exists(select 1 from unnest(p_photo_urls) u where length(coalesce(u,''))>500))
   then raise exception'INVALID_ROOM_TYPE_CONFIGURATION';end if;
 photos:=coalesce(p_photo_urls, (select photo_urls from room_types where id=p_room_type_id));
 select * into t from room_types where id=p_room_type_id for update;
 if not found then raise exception'ROOM_TYPE_NOT_FOUND';end if;
 if t.version<>p_expected_version then raise exception'ROOM_TYPE_STALE';end if;
 update room_types set description=trim(p_description),max_guests=p_max_guests,beds=trim(p_beds),
   size_sqm=p_size_sqm,amenities=coalesce(p_amenities,'[]'),base_rate=round(p_base_rate,2),
   active=p_active,photo_urls=photos,version=version+1,updated_at=now()where id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
 values(p_actor_user_id,'admin_update_room_type','room_type',t.id::text,to_jsonb(t)-'id',
   jsonb_build_object('name',t.name,'description',trim(p_description),'maxGuests',p_max_guests,
     'beds',trim(p_beds),'sizeSqm',p_size_sqm,'amenities',coalesce(p_amenities,'[]'),
     'baseRate',round(p_base_rate,2),'active',p_active,'photoUrls',photos,
     'reason',trim(p_reason)));
 return jsonb_build_object('id',t.id,'version',t.version+1);
end$$;

revoke all on function public.admin_update_room_type(uuid,text,integer,text,integer,jsonb,numeric,boolean,text,integer,uuid,text[])from public,anon,authenticated;
grant execute on function public.admin_update_room_type(uuid,text,integer,text,integer,jsonb,numeric,boolean,text,integer,uuid,text[])to service_role;
