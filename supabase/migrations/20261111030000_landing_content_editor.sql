begin;

create table public.website_landing_content (
  singleton boolean primary key default true check(singleton),
  draft jsonb not null default '{}', published jsonb not null default '{}',
  version integer not null default 1, published_version integer not null default 0,
  updated_by uuid references public.user_accounts(id), updated_at timestamptz not null default now(),
  published_at timestamptz
);
-- Approved fictional profile: version zero is the migration-installed demo.
insert into public.website_landing_content(singleton,draft,published)
select true,document,document from (values($demo${"schemaVersion":1,"isDemo":true,"clientInformationReviewed":false,"identity":{"name":"Haven Hotel & Residences","shortName":"HAVEN","city":"Manila","district":"Ermita","headline":"Your Haven in {city}.","heroLead":"Calm city stays, with room to make yourself at home.","introduction":"Settle into a thoughtfully furnished room in {district}, with space for a short city break, a work trip or a longer stay. Compare four room types, choose your dates and find the stay that suits you.","metaTitle":"{name} | {city}"},"contact":{"phone":"+63 2 8000 0000","email":"hello@haven.example","frontDeskHours":"24 hours daily"},"location":{"demoAddress":"18 Haven Lane, Ermita, Manila 1000, Philippines","entranceNotes":"Sample arrival guide: use the main lobby entrance and present your reservation details at Front Desk. Contact the hotel before arrival if you need assistance.","localGuide":"Use the Manila city guide to plan your visit. The map pin is a public landmark for this demo, not a real Haven property. Distances from the fictional hotel are not asserted."},"amenities":[{"id":"wifi","name":"Wi-Fi","description":"Complimentary Wi-Fi in guest rooms and shared areas.","enabled":true},{"id":"parking","name":"Parking","description":"Complimentary self-parking for registered guests, subject to space. Parking is not reserved automatically.","enabled":true},{"id":"pool","name":"Swimming pool","description":"Outdoor pool for registered guests, open 7:00 AM–9:00 PM. Children require adult supervision.","enabled":true},{"id":"fitness","name":"Fitness room","description":"Fitness room for registered guests, open 6:00 AM–10:00 PM.","enabled":true},{"id":"transfers","name":"Airport transfers","description":"Airport transfers on request. Fare, pickup time and vehicle are confirmed separately before travel.","enabled":true},{"id":"laundry","name":"Laundry","description":"Laundry service on request. The itemised price and collection schedule are confirmed before service.","enabled":true}],"dining":{"name":"The Haven Table","description":"A relaxed all-day dining space serving breakfast and simple comfort dishes.","breakfastIncluded":false,"breakfastPrice":450,"breakfastStart":"06:30","breakfastEnd":"10:00","breakfastChargeBasis":"per person, per breakfast","roomRateBasis":"Room-only base rate; breakfast is charged separately unless the selected offer explicitly includes it."},"family":{"summary":"Children are welcome and count toward the room’s stated maximum occupancy. Choose a room with enough sleeping space for everyone; no automatic child discount is applied in this demo.","extraBeds":"Extra beds are not offered in the sample room rates. Ask Front Desk about cot availability and any applicable charge before booking; requests do not increase room capacity."},"accessibility":{"summary":"Sample facilities include a step-free lobby entrance and lift access to guest floors. Contact Front Desk to confirm bathroom layout, doorway clearance and any assistance required before choosing a room."},"media":{"heroImageKey":"room","contactBackgroundImageKey":"rizal","gallery":[{"key":"room","label":"Room layouts","alt":"Illustrative Deluxe King room concept"},{"key":"bathroom","label":"Bathrooms","alt":"Illustrative guest bathroom concept"},{"key":"ocean","label":"Suite living spaces","alt":"Illustrative suite interior"},{"key":"executive","label":"A closer look inside","alt":"Illustrative hotel room interior"}]},"legal":{"privacyDraft":"This fictional hotel preview illustrates the information a hotel may request for account access, reservations and guest support. It does not create accounts, send messages or collect payments. A real client must provide the approved data-handling notice, retention details and privacy contact before launch.","termsDraft":"These are sample booking terms for the fictional {name} property. Dates, occupancy, the selected room and applicable rate must be reviewed before submission. A room is held only after guest details are submitted. Confirmation follows verification of the required deposit. Special requests, transfers and early or late arrival arrangements require separate approval."},"customFaq":[{"question":"Can I ask for help before arrival?","answer":"Contact Front Desk with your reservation details and any arrival requirements."}],"pageVisibility":{"introduction":true,"gallery":true,"amenities":true,"nearby":true,"faq":true}}$demo$::jsonb)) seed(document);
create table public.website_landing_images (
  id uuid primary key, storage_key text not null unique,
  alt text not null check(length(alt) between 1 and 150),
  image_kind text not null check(image_kind in ('property','area')),
  bytes integer not null check(bytes between 1 and 5242880),
  width integer not null check(width between 1 and 6000), height integer not null check(height between 1 and 6000),
  deleting boolean not null default false,
  created_by uuid not null references public.user_accounts(id), created_at timestamptz not null default now()
);
alter table public.website_landing_content enable row level security;
alter table public.website_landing_images enable row level security;
revoke all on public.website_landing_content,public.website_landing_images from public,anon,authenticated;
grant all on public.website_landing_content,public.website_landing_images to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('website-images','website-images',false,5242880,array['image/webp']) on conflict(id) do nothing;

create function public.website_landing_photo_keys(p_data jsonb)
returns setof text language sql immutable set search_path=public as $$
  select key from (select p_data#>>'{media,heroImageKey}' key union select p_data#>>'{media,contactBackgroundImageKey}'
    union select a->>'key' from jsonb_array_elements(case when jsonb_typeof(p_data#>'{media,gallery}')='array' then p_data#>'{media,gallery}' else '[]' end) a) keys
  where key is not null;
$$;

create function public.website_landing_public()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('content',c.published,'version',c.published_version,'publishedAt',c.published_at,
    'images',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'alt',i.alt,'image_kind',i.image_kind,'width',i.width,'height',i.height,'bytes',i.bytes))
      from website_landing_images i where not i.deleting and i.id::text in(select website_landing_photo_keys(c.published))),'[]'))
  from website_landing_content c where singleton;
$$;

create function public.website_landing_admin(p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare result jsonb;
begin
  perform catalog_actor(p_actor,true);
  select to_jsonb(c)-'singleton' into result from website_landing_content c where singleton;
  return result||jsonb_build_object('images',coalesce((select jsonb_agg(to_jsonb(i)-'storage_key' order by i.created_at desc) from website_landing_images i),'[]'));
end $$;

create function public.website_landing_write(p_actor uuid,p_action text,p_version integer,p_document jsonb,p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c website_landing_content%rowtype; candidate jsonb; key text; location jsonb;
begin
  perform catalog_actor(p_actor,true);
  select * into c from website_landing_content where singleton for update;
  if c.version is distinct from p_version then raise exception 'WEBSITE_STALE'; end if;
  if p_action is null or p_action not in ('save','publish','discard') then raise exception 'WEBSITE_INVALID'; end if;
  candidate:=case p_action when 'save' then p_document when 'discard' then c.published else c.draft end;
  if p_action<>'discard' then
    if jsonb_typeof(candidate) is distinct from 'object' or octet_length(candidate::text)>48000
      or candidate->>'schemaVersion' is distinct from '1' or coalesce(candidate->>'isDemo','') not in ('true','false')
      or nullif(trim(candidate#>>'{identity,name}'),'') is null or jsonb_typeof(candidate#>'{media,gallery}') is distinct from 'array'
      then raise exception 'WEBSITE_INVALID'; end if;
    for key in select website_landing_photo_keys(candidate) loop
      if key not in ('room','bathroom','ocean','executive','rizal','museum','transport') then
        if key !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' then raise exception 'WEBSITE_IMAGE_UNAVAILABLE'; end if;
        perform 1 from website_landing_images where id=key::uuid and not deleting for key share;
        if not found then raise exception 'WEBSITE_IMAGE_UNAVAILABLE'; end if;
      end if;
    end loop;
  end if;
  if p_action='publish' then
    if length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'WEBSITE_REASON_REQUIRED'; end if;
    if candidate->>'isDemo'='false' then
      if candidate->>'clientInformationReviewed' is distinct from 'true' then raise exception 'WEBSITE_CLIENT_REVIEW_REQUIRED'; end if;
      location:=website_location_public()->'hotel';
      if location is null or coalesce(location->>'is_demo','true')<>'false' or location->>'status' is distinct from 'published'
        or location->>'verified_at' is null or location->>'latitude' is null or location->>'longitude' is null
        then raise exception 'WEBSITE_VERIFICATION_REQUIRED'; end if;
      for key in select candidate#>>'{media,heroImageKey}' union select a->>'key' from jsonb_array_elements(candidate#>'{media,gallery}') a loop
        if not exists(select 1 from website_landing_images where id::text=key and image_kind='property' and not deleting)
          then raise exception 'WEBSITE_REAL_PHOTOS_REQUIRED'; end if;
      end loop;
    end if;
    update website_landing_content set published=candidate,version=version+1,published_version=version+1,
      published_at=now(),updated_at=now(),updated_by=p_actor where singleton;
  else
    update website_landing_content set draft=candidate,version=version+1,updated_at=now(),updated_by=p_actor where singleton;
  end if;
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_actor,'website_landing_'||p_action,'website_content','landing',
    jsonb_build_object('version',c.version,'draft',c.draft,'publishedVersion',c.published_version),
    jsonb_build_object('version',c.version+1,'document',candidate,'reason',trim(p_reason)));
  return website_landing_admin(p_actor);
end $$;

create function public.website_landing_image_write(p_actor uuid,p_action text,p_id uuid,p_details jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare c website_landing_content%rowtype; i website_landing_images%rowtype;
begin
  perform catalog_actor(p_actor,true);
  select * into c from website_landing_content where singleton for update;
  if p_action='register' then
    insert into website_landing_images(id,storage_key,alt,image_kind,bytes,width,height,created_by)
    values(p_id,p_actor::text||'/'||p_id::text||'.webp',trim(p_details->>'alt'),p_details->>'imageKind',
      (p_details->>'bytes')::int,(p_details->>'width')::int,(p_details->>'height')::int,p_actor) returning * into i;
  else
    select * into i from website_landing_images where id=p_id for update;
    if not found then raise exception 'WEBSITE_IMAGE_UNAVAILABLE'; end if;
    if p_id::text in(select website_landing_photo_keys(c.draft) union select website_landing_photo_keys(c.published))
      then raise exception 'WEBSITE_IMAGE_IN_USE'; end if;
    if p_action='delete' then update website_landing_images set deleting=true where id=p_id;
    elsif p_action='finish_delete' and i.deleting then delete from website_landing_images where id=p_id;
    else raise exception 'WEBSITE_INVALID'; end if;
  end if;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
  values(p_actor,'website_landing_image_'||p_action,'website_image',p_id::text,jsonb_build_object('imageKind',i.image_kind,'alt',i.alt));
  return to_jsonb(i);
end $$;

create function public.website_landing_image_read(p_id uuid,p_actor uuid default null)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare i website_landing_images%rowtype;
begin
  select * into i from website_landing_images where id=p_id and not deleting;
  if not found then return null; end if;
  if p_actor is not null then perform catalog_actor(p_actor,true);
  elsif not exists(select 1 from website_landing_content where p_id::text in(select website_landing_photo_keys(published))) then return null;
  end if;
  return to_jsonb(i);
end $$;

do $$declare f record;begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in
    ('website_landing_photo_keys','website_landing_public','website_landing_admin','website_landing_write','website_landing_image_write','website_landing_image_read')
  loop execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);end loop;
end $$;

commit;
