-- Independent public website content. No reservation, fare or hotel-operation data changes.
-- Live ledger checked: 112 applied through 20261103150000; unrelated pending files are not prerequisites.
begin;
create table public.website_location_images(
 id uuid primary key default gen_random_uuid(), storage_key text not null unique,
 bytes integer not null check(bytes between 1 and 5242880), width integer not null check(width between 1 and 1600), height integer not null check(height between 1 and 1600),
 deleting boolean not null default false, created_by uuid not null references user_accounts(id), created_at timestamptz not null default now()
);
create table public.website_hotel_location(
 id uuid primary key default '00000000-0000-4000-8000-000000000001' check(id='00000000-0000-4000-8000-000000000001'),
 name text not null default 'Haven Hotel & Residences' check(length(trim(name)) between 1 and 120),
 address text not null default '' check(length(address)<=500), entrance_notes text not null default '' check(length(entrance_notes)<=1000),
 latitude double precision check(latitude between -90 and 90), longitude double precision check(longitude between -180 and 180),
 maps_label text not null default '' check(length(maps_label)<=200), google_place_id text not null default '' check(google_place_id ~ '^[A-Za-z0-9_-]{0,200}$'),
 embed_url text not null default '' check(embed_url='' or (length(embed_url)<=8192 and embed_url ~ '^https://www\.google\.com/maps/embed\?pb=.+$' and embed_url !~ '&' and embed_url !~ '[[:space:]#<>"\\]')),
 verification_source text not null default '' check(verification_source='' or (length(verification_source)<=1000 and verification_source ~ '^https://[^[:space:]<>]+$')), verified_at date,
 directions_title text not null default 'Find your way here.' check(length(trim(directions_title)) between 1 and 100), directions_description text not null default 'Our location and your route, together. For a calmer start to your stay.' check(length(directions_description)<=400),
 nearby_title text not null default 'A little beyond Haven.' check(length(trim(nearby_title)) between 1 and 100), nearby_description text not null default 'A good meal. A local discovery. The useful things, all close at hand.' check(length(nearby_description)<=400),
 status text not null default 'draft' check(status in('draft','published')), is_demo boolean not null default false,
 location_revision integer not null default 1 check(location_revision>=0), version integer not null default 0, updated_at timestamptz not null default now(),
 check((latitude is null)=(longitude is null))
);
create table public.website_place_categories(
 id uuid primary key default gen_random_uuid(), name text not null default 'New category' check(length(trim(name)) between 1 and 60),
 slug text not null unique default gen_random_uuid()::text check(length(slug)<=64 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 status text not null default 'draft' check(status in('draft','published')), sort_order integer not null default 0 check(sort_order between 0 and 10000), version integer not null default 0, updated_at timestamptz not null default now()
);
create table public.website_nearby_places(
 id uuid primary key default gen_random_uuid(), category_id uuid references website_place_categories(id) on delete restrict,
 name text not null default 'New place' check(length(trim(name)) between 1 and 120), description text not null default '' check(length(description)<=1500),
 latitude double precision check(latitude between -90 and 90), longitude double precision check(longitude between -180 and 180),
 maps_label text not null default '' check(length(maps_label)<=200), maps_search text not null default '' check(length(maps_search)<=200), google_place_id text not null default '' check(google_place_id ~ '^[A-Za-z0-9_-]{0,200}$'),
 verification_source text not null default '' check(verification_source='' or (length(verification_source)<=1000 and verification_source ~ '^https://[^[:space:]<>]+$')), verified_at date,
 distance_m numeric check(distance_m between 0 and 2000000), distance_basis text not null default 'walking' check(distance_basis in('walking','driving','straight_line')), distance_reviewed_at date,
 image_id uuid references website_location_images(id) on delete restrict, sample_image text check(sample_image in('cafe','shopping','garden','transport','airport','city')), image_alt text not null default '' check(length(image_alt)<=180),
 featured boolean not null default false, location_revision integer not null default 1 check(location_revision>=0),
 status text not null default 'draft' check(status in('draft','published')), sort_order integer not null default 0 check(sort_order between 0 and 10000), version integer not null default 0, updated_at timestamptz not null default now(),
 check((latitude is null)=(longitude is null)), check(image_id is null or sample_image is null),
 check(status<>'published' or distance_m is null or distance_reviewed_at is not null), check(status<>'published' or (image_id is null and sample_image is null) or length(trim(image_alt))>=3)
);
create unique index website_one_featured_destination on website_nearby_places(featured) where featured;
create index website_places_public_order on website_nearby_places(status,sort_order,id);
create table public.website_route_guides(
 id uuid primary key default gen_random_uuid(), origin_name text not null default 'New route' check(length(trim(origin_name)) between 1 and 120), description text not null default '' check(length(description)<=1500),
 latitude double precision check(latitude between -90 and 90), longitude double precision check(longitude between -180 and 180),
 maps_label text not null default '' check(length(maps_label)<=200), google_place_id text not null default '' check(google_place_id ~ '^[A-Za-z0-9_-]{0,200}$'),
 verification_source text not null default '' check(verification_source='' or (length(verification_source)<=1000 and verification_source ~ '^https://[^[:space:]<>]+$')), verified_at date,
 travel_mode text not null default 'driving' check(travel_mode in('driving','walking','transit','bicycling')),
 distance_m numeric check(distance_m between 0 and 2000000), distance_basis text not null default 'driving' check(distance_basis in('walking','driving','straight_line')), distance_reviewed_at date,
 image_id uuid references website_location_images(id) on delete restrict, sample_image text check(sample_image in('cafe','shopping','garden','transport','airport','city')), image_alt text not null default '' check(length(image_alt)<=180),
 location_revision integer not null default 1 check(location_revision>=0), status text not null default 'draft' check(status in('draft','published')), sort_order integer not null default 0 check(sort_order between 0 and 10000), version integer not null default 0, updated_at timestamptz not null default now(),
 check((latitude is null)=(longitude is null)), check(image_id is null or sample_image is null),
 check(status<>'published' or distance_m is null or distance_reviewed_at is not null), check(status<>'published' or (image_id is null and sample_image is null) or length(trim(image_alt))>=3)
);

create function public.website_content_actor(p_actor uuid) returns void language plpgsql security definer set search_path=public as $$
declare actor user_accounts%rowtype;
begin
 select * into actor from user_accounts where id=p_actor for share;
 if actor.id is null or not actor.active or actor.recovery_required or actor.role not in('owner','admin') then raise exception 'WEBSITE_FORBIDDEN'; end if;
end $$;

create function public.website_content_write(p_actor uuid,p_kind text,p_action text,p_id uuid,p_version integer,p_body jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare tab text; fields text[]; columns text; before_row jsonb; after_row jsonb; target uuid:=p_id; h website_hotel_location%rowtype; image uuid;
begin
 perform website_content_actor(p_actor);
 perform pg_advisory_xact_lock(hashtextextended('website_location_content',0));
 if p_action not in('save','delete') or p_version is null or p_version<0 or jsonb_typeof(p_body)<>'object' then raise exception 'WEBSITE_INVALID'; end if;
 case p_kind
 when 'hotel' then tab:='website_hotel_location'; fields:=array['name','address','entrance_notes','latitude','longitude','maps_label','google_place_id','embed_url','verification_source','verified_at','directions_title','directions_description','nearby_title','nearby_description','status','is_demo'];
 when 'category' then tab:='website_place_categories'; fields:=array['name','slug','status','sort_order'];
 when 'place' then tab:='website_nearby_places'; fields:=array['name','description','category_id','latitude','longitude','maps_label','maps_search','google_place_id','verification_source','verified_at','distance_m','distance_basis','distance_reviewed_at','image_id','sample_image','image_alt','featured','location_revision','status','sort_order'];
 when 'route' then tab:='website_route_guides'; fields:=array['origin_name','description','latitude','longitude','maps_label','google_place_id','verification_source','verified_at','distance_m','distance_basis','distance_reviewed_at','image_id','sample_image','image_alt','travel_mode','location_revision','status','sort_order'];
 else raise exception 'WEBSITE_INVALID'; end case;
 if exists(select 1 from jsonb_object_keys(p_body) key where not key=any(fields)) then raise exception 'WEBSITE_INVALID'; end if;
 if target is null then
  if p_action<>'save' or p_version<>0 or p_kind='hotel' then raise exception 'WEBSITE_INVALID'; end if;
  execute format('insert into %I default values returning id',tab) into target;
  before_row:='{}';
 else
  execute format('select to_jsonb(t) from %I t where id=$1 for update',tab) into before_row using target;
  if before_row is null then raise exception 'WEBSITE_NOT_FOUND'; end if;
  if (before_row->>'version')::integer<>p_version then raise exception 'WEBSITE_STALE'; end if;
 end if;
 if p_action='delete' then
  if p_kind='hotel' then
   update website_hotel_location set address='',entrance_notes='',latitude=null,longitude=null,maps_label='',google_place_id='',embed_url='',verification_source='',verified_at=null,status='draft',is_demo=false,location_revision=location_revision+1,version=version+1,updated_at=now() where id=target returning to_jsonb(website_hotel_location) into after_row;
   update website_nearby_places set status='draft',version=version+1,updated_at=now();
   update website_route_guides set status='draft',version=version+1,updated_at=now();
  else
   if p_kind='category' and exists(select 1 from website_nearby_places where category_id=target) then raise exception 'WEBSITE_CATEGORY_IN_USE'; end if;
   execute format('delete from %I where id=$1',tab) using target; after_row:='{}';
  end if;
 else
  if p_kind='place' and p_body->>'featured'='true' then update website_nearby_places set featured=false,version=version+1,updated_at=now() where featured and id<>target; end if;
  select string_agg(quote_ident(key),',') into columns from jsonb_object_keys(p_body) key;
  if columns is null then raise exception 'WEBSITE_INVALID'; end if;
  execute format('update %I t set (%s)=(select %s from jsonb_populate_record(null::%I,$1) r),version=version+1,updated_at=now() where id=$2 returning to_jsonb(t)',tab,columns,columns,tab) into after_row using p_body,target;
  select * into h from website_hotel_location;
  if p_kind='hotel' then
   if (before_row->'latitude',before_row->'longitude',before_row->'address',before_row->'maps_label',before_row->'google_place_id',before_row->'embed_url',before_row->'is_demo') is distinct from (after_row->'latitude',after_row->'longitude',after_row->'address',after_row->'maps_label',after_row->'google_place_id',after_row->'embed_url',after_row->'is_demo') then
    update website_hotel_location set location_revision=location_revision+1 where id=target returning * into h;
    update website_nearby_places set status='draft',version=version+1,updated_at=now();
    update website_route_guides set status='draft',version=version+1,updated_at=now();
   end if;
   if h.status='published' and (h.latitude is null or h.longitude is null or length(trim(h.address))=0 or (not h.is_demo and (h.verified_at is null or h.verification_source=''))) then raise exception 'WEBSITE_VERIFICATION_REQUIRED'; end if;
   after_row:=to_jsonb(h);
  elsif p_kind in('place','route') then
   image:=(after_row->>'image_id')::uuid;
   if image is not null and not exists(select 1 from website_location_images where id=image and not deleting) then raise exception 'WEBSITE_IMAGE_UNAVAILABLE'; end if;
   if after_row->>'status'='published' then
    if (after_row->>'location_revision')::integer<>h.location_revision then raise exception 'WEBSITE_LOCATION_CHANGED'; end if;
    if not h.is_demo and (after_row->>'latitude' is null or after_row->>'verified_at' is null or after_row->>'verification_source'='' or after_row->>'sample_image' is not null or coalesce(after_row->>'maps_search','')<>'') then raise exception 'WEBSITE_VERIFICATION_REQUIRED'; end if;
    if p_kind='route' and after_row->>'latitude' is null then raise exception 'WEBSITE_VERIFICATION_REQUIRED'; end if;
    if p_kind='place' then
     if not exists(select 1 from website_place_categories where id=(after_row->>'category_id')::uuid and status='published') then raise exception 'WEBSITE_CATEGORY_REQUIRED'; end if;
     if after_row->>'latitude' is null and coalesce(after_row->>'maps_search','')='' then raise exception 'WEBSITE_VERIFICATION_REQUIRED'; end if;
    end if;
   end if;
  end if;
 end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(p_actor,'website_'||p_action,p_kind,target::text,before_row,after_row);
 return after_row;
end $$;

create function public.website_location_admin(p_actor uuid) returns jsonb language plpgsql security definer set search_path=public as $$
begin
 perform website_content_actor(p_actor);
 return jsonb_build_object('hotel',(select to_jsonb(h) from website_hotel_location h),'categories',coalesce((select jsonb_agg(c order by sort_order,id) from website_place_categories c),'[]'::jsonb),'places',coalesce((select jsonb_agg(p order by sort_order,id) from website_nearby_places p),'[]'::jsonb),'routes',coalesce((select jsonb_agg(r order by sort_order,id) from website_route_guides r),'[]'::jsonb),'images',coalesce((select jsonb_agg(i order by created_at desc,id) from website_location_images i),'[]'::jsonb));
end $$;

-- Explicit public projection in one statement/snapshot; no drafts, audit actors or storage paths.
create function public.website_location_public() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object(
 'hotel',(select to_jsonb(h) from(select id,name,address,entrance_notes,latitude,longitude,maps_label,google_place_id,embed_url,''::text as verification_source,verified_at,directions_title,directions_description,nearby_title,nearby_description,status,is_demo,location_revision,version,updated_at from website_hotel_location where status='published')h),
 'categories',coalesce((select jsonb_agg(c order by sort_order,id) from(select id,name,slug,status,sort_order,version,updated_at from website_place_categories where status='published' and exists(select 1 from website_hotel_location where status='published'))c),'[]'::jsonb),
 'places',coalesce((select jsonb_agg(p order by sort_order,id) from(select p.id,p.category_id,p.name,p.description,p.latitude,p.longitude,p.maps_label,p.maps_search,p.google_place_id,''::text as verification_source,p.verified_at,p.distance_m,p.distance_basis,p.distance_reviewed_at,p.image_id,p.sample_image,p.image_alt,p.featured,p.location_revision,p.status,p.sort_order,p.version,p.updated_at from website_nearby_places p join website_place_categories c on c.id=p.category_id join website_hotel_location h on h.status='published' and h.location_revision=p.location_revision where p.status='published' and c.status='published')p),'[]'::jsonb),
 'routes',coalesce((select jsonb_agg(r order by sort_order,id) from(select r.id,r.origin_name,r.description,r.latitude,r.longitude,r.maps_label,r.google_place_id,''::text as verification_source,r.verified_at,r.travel_mode,r.distance_m,r.distance_basis,r.distance_reviewed_at,r.image_id,r.sample_image,r.image_alt,r.location_revision,r.status,r.sort_order,r.version,r.updated_at from website_route_guides r join website_hotel_location h on h.status='published' and h.location_revision=r.location_revision where r.status='published')r),'[]'::jsonb)
 );
$$;

create function public.website_image_write(p_actor uuid,p_action text,p_id uuid,p_details jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public as $$
declare item website_location_images%rowtype;
begin
 perform website_content_actor(p_actor); perform pg_advisory_xact_lock(hashtextextended('website_location_content',0));
 if p_action='register' then
  insert into website_location_images(id,storage_key,bytes,width,height,created_by) values(p_id,p_actor::text||'/'||p_id::text||'.webp',(p_details->>'bytes')::integer,(p_details->>'width')::integer,(p_details->>'height')::integer,p_actor) returning * into item;
 elsif p_action in('delete','finish_delete') then
  select * into item from website_location_images where id=p_id for update;
  if item.id is null then raise exception 'WEBSITE_NOT_FOUND'; end if;
  if exists(select 1 from website_nearby_places where image_id=p_id) or exists(select 1 from website_route_guides where image_id=p_id) then raise exception 'WEBSITE_IMAGE_IN_USE'; end if;
  if p_action='finish_delete' then
   if not item.deleting then raise exception 'WEBSITE_INVALID'; end if;
   delete from website_location_images where id=p_id;
  else update website_location_images set deleting=true where id=p_id returning * into item; end if;
 else raise exception 'WEBSITE_INVALID'; end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'website_image_'||p_action,'website_image',p_id::text,jsonb_build_object('id',p_id));
 return to_jsonb(item);
end $$;
create function public.website_image_read(p_id uuid,p_actor uuid default null) returns jsonb language plpgsql security definer set search_path=public as $$
declare published jsonb;
begin
 if p_actor is not null then perform website_content_actor(p_actor);
 else
  published:=website_location_public();
  if not exists(select 1 from jsonb_array_elements((published->'places')||(published->'routes')) item where item->>'image_id'=p_id::text) then return null; end if;
 end if;
 return(select to_jsonb(i) from website_location_images i where id=p_id and not deleting);
end $$;

alter table website_hotel_location enable row level security;
alter table website_place_categories enable row level security;
alter table website_nearby_places enable row level security;
alter table website_route_guides enable row level security;
alter table website_location_images enable row level security;
revoke all on website_hotel_location,website_place_categories,website_nearby_places,website_route_guides,website_location_images from public,anon,authenticated,service_role;
grant select on website_hotel_location,website_place_categories,website_nearby_places,website_route_guides,website_location_images to service_role;
revoke all on function website_content_actor(uuid),website_content_write(uuid,text,text,uuid,integer,jsonb),website_location_admin(uuid),website_location_public(),website_image_write(uuid,text,uuid,jsonb),website_image_read(uuid,uuid) from public,anon,authenticated;
revoke all on function website_content_actor(uuid) from service_role;
grant execute on function website_content_write(uuid,text,text,uuid,integer,jsonb),website_location_admin(uuid),website_location_public(),website_image_write(uuid,text,uuid,jsonb),website_image_read(uuid,uuid) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('location-images','location-images',false,5242880,array['image/webp']);

-- Explicitly approved fictional-site demo. All distances/images are labeled samples.
insert into website_hotel_location(name,address,entrance_notes,latitude,longitude,maps_label,embed_url,verification_source,verified_at,status,is_demo)
values('Haven Hotel & Residences','Demo pin: Rizal Park, Ermita, Manila, Philippines','Temporary public-landmark pin for this demonstration. Replace it with your client’s hotel location during setup.',14.5826446,120.9786887,'Rizal Park, Ermita, Manila, Philippines','https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3861.2882387869095!2d120.97868869999999!3d14.582644600000002!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3397ca255e7e133f%3A0xb72a3487b6759a32!2sRizal%20Park!5e0!3m2!1sen!2sph!4v1793966839884!5m2!1sen!2sph','https://www.google.com/maps/search/?api=1&query=Rizal+Park+Manila','2026-11-06','published',true);
insert into website_place_categories(name,slug,status,sort_order) values('Dining','dining','published',0),('Shopping','shopping','published',1),('Landmarks','landmarks','published',2),('Transport','transport','published',3);
insert into website_nearby_places(category_id,name,description,maps_search,distance_m,distance_reviewed_at,sample_image,image_alt,featured,status,sort_order)
select c.id,v.name,v.description,v.query,v.distance,'2026-11-06',v.photo,'AI-generated '||v.photo||' concept; not a photo of a real nearby business or destination',v.featured,'published',c.sort_order from website_place_categories c join(values
 ('dining','A local café','Coffee, fresh pastries, and a sunlit corner to start your day.','cafes near Rizal Park Manila',400,'cafe',false),
 ('shopping','A shopping destination','A relaxed afternoon of browsing, with everyday essentials close by.','shopping near Rizal Park Manila',1200,'shopping',false),
 ('landmarks','A quiet garden escape.','A leafy path, soft afternoon light, and a moment to slow down.','parks near Rizal Park Manila',800,'garden',true),
 ('transport','A transport hub','A convenient connection for your next stop in the city.','public transport near Rizal Park Manila',600,'transport',false)
)v(slug,name,description,query,distance,photo,featured) on v.slug=c.slug;
insert into website_route_guides(origin_name,description,latitude,longitude,maps_label,verification_source,verified_at,distance_m,distance_reviewed_at,sample_image,image_alt,status,sort_order) values
 ('From the airport','NAIA Terminal 3 to the Rizal Park demo pin. Open Google Maps for the current route; the image and displayed distance are illustrative.',14.5195456,121.013799,'NAIA Terminal 3, Pasay, Philippines','https://www.google.com/maps/search/?api=1&query=NAIA+Terminal+3','2026-11-06',11500,'2026-11-06','airport','AI-generated airport arrival concept; not a photo of NAIA','published',0),
 ('From the city','Manila City Hall to the Rizal Park demo pin. Open Google Maps for the current route; the image and displayed distance are illustrative.',14.5892497,120.9819476,'Manila City Hall, Manila, Philippines','https://www.google.com/maps/search/?api=1&query=Manila+City+Hall','2026-11-06',1200,'2026-11-06','city','AI-generated city arrival concept; not a photo of Manila City Hall','published',1);
commit;
