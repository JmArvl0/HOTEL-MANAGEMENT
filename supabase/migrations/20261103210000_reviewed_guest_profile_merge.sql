begin;

alter table public.guests add column merged_into_guest_id text references public.guests(id) on delete restrict;
alter table public.guests add column merged_at timestamptz;
alter table public.guests add constraint guests_merge_state_valid check(
 (merged_into_guest_id is null)=(merged_at is null) and (merged_into_guest_id is null or merged_into_guest_id<>id)
);

create table public.guest_aliases(
 id uuid primary key default gen_random_uuid(),
 source_guest_id text not null references public.guests(id) on delete restrict,
 survivor_guest_id text not null references public.guests(id) on delete restrict,
 alias_type text not null check(alias_type in('guest_id','email','phone','name')),
 normalized_value text not null,
 display_value text not null,
 created_by uuid not null references public.user_accounts(id),
 created_at timestamptz not null default now(),
 check(source_guest_id<>survivor_guest_id),
 check(char_length(normalized_value) between 1 and 500),
 check(char_length(display_value) between 1 and 500)
);
create unique index guest_alias_guest_id_unique on public.guest_aliases(normalized_value) where alias_type='guest_id';
create unique index guest_alias_email_unique on public.guest_aliases(normalized_value) where alias_type='email';
create unique index guest_alias_phone_unique on public.guest_aliases(normalized_value) where alias_type='phone';
create index guest_alias_survivor_idx on public.guest_aliases(survivor_guest_id,created_at desc);

create table public.guest_profile_merges(
 id uuid primary key default gen_random_uuid(),
 source_guest_id text not null unique references public.guests(id) on delete restrict,
 survivor_guest_id text not null references public.guests(id) on delete restrict,
 field_choices jsonb not null,
 reason text not null check(char_length(trim(reason)) between 3 and 1000),
 before_source jsonb not null,
 before_survivor jsonb not null,
 dependency_fingerprint text not null,
 merged_by uuid not null references public.user_accounts(id),
 merged_at timestamptz not null default now(),
 idempotency_key uuid not null unique,
 check(source_guest_id<>survivor_guest_id)
);

alter table public.guest_aliases enable row level security;
alter table public.guest_profile_merges enable row level security;
revoke all on public.guest_aliases,public.guest_profile_merges from public,anon,authenticated;
grant all on public.guest_aliases,public.guest_profile_merges to service_role;

create function public.hotel_guest_canonical_id(p_guest_id text)
returns text language sql stable security definer set search_path=public as $$
 select coalesce(g.merged_into_guest_id,g.id) from guests g where g.id=p_guest_id
$$;

create function public.hotel_guest_merge_state(p_source_id text,p_survivor_id text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare source_guest guests%rowtype;survivor_guest guests%rowtype;refs jsonb:='{}'::jsonb;flags jsonb;aliases jsonb;
 ref record;source_count bigint;survivor_count bigint;review hotel_duplicate_reviews%rowtype;v_pair_key text;
begin
 select * into source_guest from guests where id=p_source_id;
 select * into survivor_guest from guests where id=p_survivor_id;
 if source_guest.id is null or survivor_guest.id is null then raise exception 'GUEST_MERGE_GUEST_NOT_FOUND';end if;
 for ref in
  select ns.nspname schema_name,rel.relname table_name,att.attname column_name
  from pg_constraint fk join pg_class rel on rel.oid=fk.conrelid join pg_namespace ns on ns.oid=rel.relnamespace
  join pg_attribute att on att.attrelid=rel.oid and att.attnum=any(fk.conkey)
  where fk.contype='f' and fk.confrelid='public.guests'::regclass
  order by ns.nspname,rel.relname,att.attname
 loop
  execute format('select count(*) from %I.%I where %I=$1',ref.schema_name,ref.table_name,ref.column_name) into source_count using p_source_id;
  execute format('select count(*) from %I.%I where %I=$1',ref.schema_name,ref.table_name,ref.column_name) into survivor_count using p_survivor_id;
  if source_count>0 or survivor_count>0 then
   refs:=refs||jsonb_build_object(ref.schema_name||'.'||ref.table_name||'.'||ref.column_name,jsonb_build_object('source',source_count,'survivor',survivor_count));
  end if;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('flag',to_jsonb(f),'overrides',coalesce((
  select jsonb_agg(to_jsonb(o) order by o.id) from guest_flag_overrides o where o.flag_id=f.id),'[]'::jsonb)) order by f.id),'[]'::jsonb)
 into flags from guest_operational_flags f where f.guest_id in(p_source_id,p_survivor_id);
 select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) into aliases
 from guest_aliases a where a.source_guest_id in(p_source_id,p_survivor_id) or a.survivor_guest_id in(p_source_id,p_survivor_id);
 v_pair_key:=least(p_source_id,p_survivor_id)||':'||greatest(p_source_id,p_survivor_id);
 select * into review from hotel_duplicate_reviews d where d.pair_key=v_pair_key;
 return jsonb_build_object('source',to_jsonb(source_guest),'survivor',to_jsonb(survivor_guest),'references',refs,
  'flags',flags,'aliases',aliases,'review',case when review.pair_key is null then null else to_jsonb(review) end);
end$$;

create function public.hotel_guest_merge_preview(p_source_id text,p_survivor_id text,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;state jsonb;source_guest jsonb;survivor_guest jsonb;blocks jsonb:='[]'::jsonb;field_data jsonb:='{}'::jsonb;
 field_name text;v_pair_key text;review_decision text;fingerprint text;source_id text;survivor_id text;
begin
 actor:=hotel_actor(p_actor,array['manager','owner']);
 if p_source_id is null or p_survivor_id is null or p_source_id=p_survivor_id then raise exception 'GUEST_MERGE_INVALID_PAIR';end if;
 state:=hotel_guest_merge_state(p_source_id,p_survivor_id);source_guest:=state->'source';survivor_guest:=state->'survivor';
 perform pg_advisory_xact_lock(hashtextextended('guest-email:'||least(coalesce(lower(trim(source_guest->>'email')),''),coalesce(lower(trim(survivor_guest->>'email')),'')),7));
 if coalesce(lower(trim(source_guest->>'email')),'')<>coalesce(lower(trim(survivor_guest->>'email')),'') then perform pg_advisory_xact_lock(hashtextextended('guest-email:'||greatest(coalesce(lower(trim(source_guest->>'email')),''),coalesce(lower(trim(survivor_guest->>'email')),'')),7));end if;
 source_id:=source_guest->>'id';survivor_id:=survivor_guest->>'id';
 if source_guest->>'merged_into_guest_id' is not null then blocks:=blocks||jsonb_build_array('The source profile has already been merged.');end if;
 if survivor_guest->>'merged_into_guest_id' is not null then blocks:=blocks||jsonb_build_array('The selected survivor has already been merged.');end if;
 if coalesce((source_guest->>'user_account_id') is not null,false) or coalesce((survivor_guest->>'user_account_id') is not null,false) then
  blocks:=blocks||jsonb_build_array('Profiles linked to login accounts cannot be merged.');
 end if;
 if coalesce((source_guest->>'loyalty_points')::integer,0)<>0 or coalesce((survivor_guest->>'loyalty_points')::integer,0)<>0
  or coalesce((source_guest->>'lifetime_spend')::numeric,0)<>0 or coalesce((survivor_guest->>'lifetime_spend')::numeric,0)<>0
  or exists(select 1 from guest_loyalty_ledger where guest_id in(p_source_id,p_survivor_id)) then
  blocks:=blocks||jsonb_build_array('Profiles with loyalty balances, spend or ledger entries cannot be merged.');
 end if;
 if exists(select 1 from guest_profile_merges where survivor_guest_id=p_source_id or source_guest_id=p_source_id)
  or exists(select 1 from guest_profile_merges where survivor_guest_id=p_survivor_id or source_guest_id=p_survivor_id) then
  blocks:=blocks||jsonb_build_array('Profiles with prior merge history cannot participate in another merge.');
 end if;
 if exists(select 1 from user_accounts ua where lower(ua.email) in(lower(coalesce(source_guest->>'email','')),lower(coalesce(survivor_guest->>'email','')))
   and ua.email is not null) then blocks:=blocks||jsonb_build_array('An email is already associated with a login account; resolve account ownership first.');end if;
 if exists(select 1 from guests g where g.id not in(p_source_id,p_survivor_id) and g.merged_into_guest_id is null
   and source_guest->>'email' is not null and lower(g.email)=lower(source_guest->>'email')) then
  blocks:=blocks||jsonb_build_array('The source email is also used by another active guest profile.');
 end if;
 if exists(select 1 from guest_aliases a where a.alias_type in('email','phone') and a.survivor_guest_id not in(p_source_id,p_survivor_id)
   and ((a.alias_type='email' and source_guest->>'email' is not null and a.normalized_value=lower(source_guest->>'email'))
    or (a.alias_type='phone' and source_guest->>'phone' is not null and a.normalized_value=regexp_replace(source_guest->>'phone','[^0-9]','','g')))) then
  blocks:=blocks||jsonb_build_array('A source contact alias is already associated with another merged profile.');
 end if;
 v_pair_key:=least(p_source_id,p_survivor_id)||':'||greatest(p_source_id,p_survivor_id);
 select d.decision into review_decision from hotel_duplicate_reviews d where d.pair_key=v_pair_key;
 if review_decision in('dismissed','do_not_merge') then blocks:=blocks||jsonb_build_array('This pair was previously protected. Record a fresh identity-review decision before merging.');end if;
 foreach field_name in array array['name','first_name','last_name','email','phone','nationality','address','preferences','special_requests'] loop
  field_data:=field_data||jsonb_build_object(field_name,jsonb_build_object('source',source_guest->field_name,'survivor',survivor_guest->field_name));
 end loop;
 fingerprint:=encode(digest(convert_to(state::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('source',jsonb_build_object('id',source_id,'name',source_guest->>'name','email',source_guest->>'email','phone',source_guest->>'phone'),
  'survivor',jsonb_build_object('id',survivor_id,'name',survivor_guest->>'name','email',survivor_guest->>'email','phone',survivor_guest->>'phone'),
  'fields',field_data,'referenceCounts',state->'references','activeFlags',jsonb_build_object(
   'source',(select count(*) from guest_operational_flags f where f.guest_id=p_source_id and f.revoked_at is null and (f.expires_at is null or f.expires_at>now())),
   'survivor',(select count(*) from guest_operational_flags f where f.guest_id=p_survivor_id and f.revoked_at is null and (f.expires_at is null or f.expires_at>now()))),
  'canMerge',jsonb_array_length(blocks)=0,'blockingReasons',blocks,'fingerprint',fingerprint,'reviewDecision',review_decision,
  'sourceId',p_source_id,'survivorId',p_survivor_id);
end$$;

create function public.hotel_guest_profile_merge(
 p_source_id text,p_survivor_id text,p_field_choices jsonb,p_reason text,p_fingerprint text,p_key uuid,p_actor uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;cached jsonb;state jsonb;preview jsonb;source_guest guests%rowtype;survivor_guest guests%rowtype;
 fields text[]:=array['name','first_name','last_name','email','phone','nationality','address','preferences','special_requests'];
 field_name text;new_values jsonb:='{}'::jsonb;before_source jsonb;before_survivor jsonb;result jsonb;fingerprint text;
begin
 actor:=hotel_actor(p_actor,array['manager','owner']);
 if p_reason is null or char_length(trim(p_reason)) not between 3 and 1000 then raise exception 'GUEST_MERGE_REASON_REQUIRED';end if;
 if jsonb_typeof(p_field_choices)<>'object' or (select count(*) from jsonb_object_keys(p_field_choices))<>array_length(fields,1) then raise exception 'GUEST_MERGE_FIELDS_REQUIRED';end if;
 foreach field_name in array fields loop
  if coalesce(p_field_choices->>field_name,'') not in('source','survivor') then raise exception 'GUEST_MERGE_FIELDS_REQUIRED';end if;
 end loop;
 if p_source_id=p_survivor_id then raise exception 'GUEST_MERGE_INVALID_PAIR';end if;
 cached:=hotel_request_result(p_key,'guest_profile_merge',p_source_id,p_actor,
  jsonb_build_object('sourceId',p_source_id,'survivorId',p_survivor_id,'choices',p_field_choices,'reason',trim(p_reason),'fingerprint',p_fingerprint));
 if cached is not null then return cached;end if;
 perform pg_advisory_xact_lock(hashtextextended(least(p_source_id,p_survivor_id)||':'||greatest(p_source_id,p_survivor_id),5));
 perform pg_advisory_xact_lock(hashtextextended('guest-review:'||least(p_source_id,p_survivor_id)||':'||greatest(p_source_id,p_survivor_id),6));
 perform 1 from guests where id in(p_source_id,p_survivor_id) order by id for update;
 perform 1 from guest_operational_flags f where f.guest_id in(p_source_id,p_survivor_id) order by f.guest_id,f.id for update;
 perform 1 from guest_flag_overrides o join guest_operational_flags f on f.id=o.flag_id
  where f.guest_id in(p_source_id,p_survivor_id) order by o.id for update of o;
 select * into source_guest from guests where id=p_source_id;
 select * into survivor_guest from guests where id=p_survivor_id;
 if source_guest.id is null or survivor_guest.id is null then raise exception 'GUEST_MERGE_GUEST_NOT_FOUND';end if;
 perform pg_advisory_xact_lock(hashtextextended('guest-email:'||least(coalesce(lower(trim(source_guest.email)),''),coalesce(lower(trim(survivor_guest.email)),'')),7));
 if coalesce(lower(trim(source_guest.email)),'')<>coalesce(lower(trim(survivor_guest.email)),'') then perform pg_advisory_xact_lock(hashtextextended('guest-email:'||greatest(coalesce(lower(trim(source_guest.email)),''),coalesce(lower(trim(survivor_guest.email)),'')),7));end if;
 state:=hotel_guest_merge_state(p_source_id,p_survivor_id);
 fingerprint:=encode(digest(convert_to(state::text,'UTF8'),'sha256'),'hex');
 if fingerprint<>p_fingerprint then raise exception 'GUEST_MERGE_STALE_PREVIEW';end if;
 preview:=hotel_guest_merge_preview(p_source_id,p_survivor_id,p_actor);
 if not coalesce((preview->>'canMerge')::boolean,false) then raise exception 'GUEST_MERGE_BLOCKED';end if;
 before_source:=to_jsonb(source_guest);before_survivor:=to_jsonb(survivor_guest);
 foreach field_name in array fields loop
  if p_field_choices->>field_name='source' then new_values:=new_values||jsonb_build_object(field_name,to_jsonb(source_guest)->field_name);
  else new_values:=new_values||jsonb_build_object(field_name,to_jsonb(survivor_guest)->field_name);end if;
 end loop;
 insert into guest_aliases(source_guest_id,survivor_guest_id,alias_type,normalized_value,display_value,created_by)
  values(p_source_id,p_survivor_id,'guest_id',p_source_id,p_source_id,p_actor);
 if nullif(trim(source_guest.email),'') is not null then
  insert into guest_aliases(source_guest_id,survivor_guest_id,alias_type,normalized_value,display_value,created_by)
   values(p_source_id,p_survivor_id,'email',lower(trim(source_guest.email)),source_guest.email,p_actor);
 end if;
 if nullif(regexp_replace(coalesce(source_guest.phone,''),'[^0-9]','','g'),'') is not null then
  insert into guest_aliases(source_guest_id,survivor_guest_id,alias_type,normalized_value,display_value,created_by)
   values(p_source_id,p_survivor_id,'phone',regexp_replace(source_guest.phone,'[^0-9]','','g'),source_guest.phone,p_actor);
 end if;
 if nullif(trim(source_guest.name),'') is not null then
  insert into guest_aliases(source_guest_id,survivor_guest_id,alias_type,normalized_value,display_value,created_by)
   values(p_source_id,p_survivor_id,'name',lower(trim(source_guest.name)),source_guest.name,p_actor);
 end if;
 update guests set email=null,phone=null,merged_into_guest_id=p_survivor_id,merged_at=now() where id=p_source_id;
 update guests set name=new_values->>'name',first_name=new_values->>'first_name',last_name=new_values->>'last_name',
  email=new_values->>'email',phone=new_values->>'phone',nationality=new_values->>'nationality',address=new_values->>'address',
  preferences=new_values->>'preferences',special_requests=new_values->>'special_requests' where id=p_survivor_id;
 insert into guest_profile_merges(source_guest_id,survivor_guest_id,field_choices,reason,before_source,before_survivor,
  dependency_fingerprint,merged_by,idempotency_key)
 values(p_source_id,p_survivor_id,p_field_choices,trim(p_reason),before_source,before_survivor,p_fingerprint,p_actor,p_key);
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
 values(p_actor,'guest_profile_merge','guest_profile',p_source_id,
  jsonb_build_object('source',before_source,'survivor',before_survivor),
  jsonb_build_object('sourceId',p_source_id,'survivorId',p_survivor_id,'fieldChoices',p_field_choices,'reason',trim(p_reason),'mergeId',(select id from guest_profile_merges where idempotency_key=p_key)));
 result:=jsonb_build_object('sourceId',p_source_id,'survivorId',p_survivor_id,'mergedAt',now(),'mergeId',(select id from guest_profile_merges where idempotency_key=p_key));
 insert into hotel_operation_requests values(p_key,'guest_profile_merge',p_source_id,p_actor,
  jsonb_build_object('sourceId',p_source_id,'survivorId',p_survivor_id,'choices',p_field_choices,'reason',trim(p_reason),'fingerprint',p_fingerprint),result,now());
 return result;
exception when unique_violation then raise exception 'GUEST_MERGE_ALIAS_CONFLICT';
end$$;

create function public.hotel_guest_merge_guard_identity()
returns trigger language plpgsql security definer set search_path=public as $$
declare alias_target text;normalized_email text;
begin
 if new.email is not null then
  normalized_email:=lower(trim(new.email));
  perform pg_advisory_xact_lock(hashtextextended('guest-email:'||normalized_email,7));
  select survivor_guest_id into alias_target from guest_aliases where alias_type='email' and normalized_value=normalized_email limit 1;
  if alias_target is not null and new.id is distinct from alias_target then raise exception 'GUEST_ALIAS_REQUIRES_CANONICAL';end if;
  if new.user_account_id is not null and alias_target is not null then raise exception 'GUEST_ALIAS_ACCOUNT_REVIEW_REQUIRED';end if;
 end if;
 if tg_op='UPDATE' and old.merged_into_guest_id is not null and new.user_account_id is distinct from old.user_account_id then
  raise exception 'GUEST_PROFILE_MERGED';
 end if;
 return new;
end$$;
create trigger guest_merge_guard_identity before insert or update on public.guests
 for each row execute function public.hotel_guest_merge_guard_identity();

create function public.hotel_guest_canonicalize_reference()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.guest_id is not null and (tg_op='INSERT' or new.guest_id is distinct from old.guest_id) then
  new.guest_id:=hotel_guest_canonical_id(new.guest_id);
 end if;
 return new;
end$$;
create trigger reservations_guest_canonicalize before insert or update of guest_id on public.reservations
 for each row execute function public.hotel_guest_canonicalize_reference();
create trigger reservation_guests_guest_canonicalize before insert or update of guest_id on public.reservation_guests
 for each row execute function public.hotel_guest_canonicalize_reference();

create or replace function public.hotel_guest_dnr_blocked(p_reservation_id text,p_guest_id text,p_purpose text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from guest_operational_flags f where hotel_guest_canonical_id(f.guest_id)=hotel_guest_canonical_id(p_guest_id)
  and f.flag_type='do_not_rent' and f.revoked_at is null and (f.expires_at is null or f.expires_at>now())
  and not exists(select 1 from guest_flag_overrides o where o.flag_id=f.id and o.reservation_id=p_reservation_id
   and o.purpose=p_purpose and o.flag_version=f.version and o.revoked_at is null and o.expires_at>now()))
$$;

do $$declare body text;patched text;marker text;replacement text;begin
 select pg_get_functiondef('public.hotel_guest_flags_read(text,uuid)'::regprocedure) into body;
 marker:='f.guest_id=p_guest_id';replacement:='hotel_guest_canonical_id(f.guest_id)=hotel_guest_canonical_id(p_guest_id)';
 patched:=replace(body,marker,replacement);if patched=body then raise exception 'GUEST_FLAGS_READ_MERGE_PATCH_UNEXPECTED';end if;execute patched;
 select pg_get_functiondef('public.front_desk_create_reservation(text,text,text,text,date,date,integer,text,text,text,uuid,uuid)'::regprocedure) into body;
 marker:='select id into guest from guests where lower(email)=lower(trim(p_email))limit 1 for update;';
 replacement:='select coalesce((select a.survivor_guest_id from guest_aliases a where a.alias_type=''email'' and a.normalized_value=lower(trim(p_email))limit 1),(select g.id from guests g where lower(g.email)=lower(trim(p_email))and g.merged_into_guest_id is null limit 1))into guest;if guest is not null then perform 1 from guests where id=guest for update;end if;';
 patched:=replace(body,marker,replacement);if patched=body then raise exception 'FRONT_DESK_GUEST_ALIAS_PATCH_UNEXPECTED';end if;execute patched;
end$$;

do $$declare body text;patched text;marker text;replacement text;begin
 select pg_get_functiondef('public.hotel_guest_dnr_reservation_guard()'::regprocedure) into body;
 marker:='(f.guest_id=new.guest_id or exists(select 1 from reservation_guests m where m.reservation_id=new.id and m.guest_id=f.guest_id and m.removed_at is null))';
 replacement:='(hotel_guest_canonical_id(f.guest_id)=hotel_guest_canonical_id(new.guest_id) or exists(select 1 from reservation_guests m where m.reservation_id=new.id and m.guest_id is not null and m.removed_at is null and hotel_guest_canonical_id(m.guest_id)=hotel_guest_canonical_id(f.guest_id)))';
 patched:=replace(body,marker,replacement);if patched=body then raise exception 'GUEST_DNR_GUARD_MERGE_PATCH_UNEXPECTED';end if;execute patched;
end$$;

do $$declare body text;patched text;marker text;replacement text;begin
 select pg_get_functiondef('public.hotel_reservation_dnr_flags(text,uuid)'::regprocedure) into body;
 marker:='f.guest_id=(select r.guest_id from reservations r where r.id=p_reservation_id)';
 replacement:='hotel_guest_canonical_id(f.guest_id)=hotel_guest_canonical_id((select r.guest_id from reservations r where r.id=p_reservation_id))';
 patched:=replace(body,marker,replacement);if patched=body then raise exception 'GUEST_DNR_REVIEW_PRIMARY_PATCH_UNEXPECTED';end if;
 marker:='m.guest_id=f.guest_id';replacement:='hotel_guest_canonical_id(m.guest_id)=hotel_guest_canonical_id(f.guest_id)';
 patched:=replace(patched,marker,replacement);if patched=body then raise exception 'GUEST_DNR_REVIEW_OCCUPANT_PATCH_UNEXPECTED';end if;execute patched;

 select pg_get_functiondef('public.hotel_guest_flag_override_create(text,uuid,text,integer,text,timestamptz,uuid)'::regprocedure) into body;
 marker:='(r.guest_id=f.guest_id or exists(select 1 from reservation_guests m where m.reservation_id=r.id and m.guest_id=f.guest_id and m.removed_at is null))';
 replacement:='(hotel_guest_canonical_id(r.guest_id)=hotel_guest_canonical_id(f.guest_id) or exists(select 1 from reservation_guests m where m.reservation_id=r.id and m.guest_id is not null and m.removed_at is null and hotel_guest_canonical_id(m.guest_id)=hotel_guest_canonical_id(f.guest_id)))';
 patched:=replace(body,marker,replacement);if patched=body then raise exception 'GUEST_DNR_OVERRIDE_MERGE_PATCH_UNEXPECTED';end if;execute patched;

 select pg_get_functiondef('public.hotel_guest_flag_save(uuid,text,text,text,text,timestamptz,integer,text,uuid)'::regprocedure) into body;
 marker:='if not found then raise exception ''GUEST_NOT_FOUND'';end if;';
 replacement:=marker||'if g.merged_into_guest_id is not null then raise exception ''GUEST_PROFILE_MERGED'';end if;';
 patched:=replace(body,marker,replacement);if patched=body then raise exception 'GUEST_FLAG_SAVE_MERGE_PATCH_UNEXPECTED';end if;execute patched;

 select pg_get_functiondef('public.create_booking_hold(uuid,text,date,date,integer,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb)'::regprocedure) into body;
 marker:='if exists(select 1 from guests g join guest_operational_flags f on f.guest_id=g.id where (g.user_account_id=p_user_id or lower(g.email)=lower(trim(p_email))) and f.flag_type=''do_not_rent'' and f.revoked_at is null and (f.expires_at is null or f.expires_at>now())) then raise exception ''GUEST_DO_NOT_RENT'';end if;';
 replacement:='if exists(select 1 from guests g where (g.user_account_id=p_user_id or lower(g.email)=lower(trim(p_email)) or exists(select 1 from guest_aliases a where a.alias_type=''email'' and a.normalized_value=lower(trim(p_email)) and a.survivor_guest_id=g.id)) and hotel_guest_dnr_blocked(null,g.id,''booking'')) then raise exception ''GUEST_DO_NOT_RENT'';end if;';
 patched:=replace(body,marker,replacement);if patched=body then raise exception 'GUEST_DNR_HOLD_MERGE_PATCH_UNEXPECTED';end if;execute patched;

 select pg_get_functiondef('public.submit_gateway_deposit(uuid,uuid,text)'::regprocedure) into body;
 marker:='if exists(select 1 from guests g join guest_operational_flags f on f.guest_id=g.id where (g.user_account_id=p_user_id or lower(g.email)=lower(h.email)) and f.flag_type=''do_not_rent'' and f.revoked_at is null and (f.expires_at is null or f.expires_at>now())) then raise exception ''GUEST_DO_NOT_RENT'';end if;';
 replacement:='if exists(select 1 from guests g where (g.user_account_id=p_user_id or lower(g.email)=lower(h.email) or exists(select 1 from guest_aliases a where a.alias_type=''email'' and a.normalized_value=lower(h.email) and a.survivor_guest_id=g.id)) and hotel_guest_dnr_blocked(null,g.id,''booking'')) then raise exception ''GUEST_DO_NOT_RENT'';end if;';
 patched:=replace(body,marker,replacement);if patched=body then raise exception 'GUEST_DNR_GATEWAY_MERGE_PATCH_UNEXPECTED';end if;execute patched;
end$$;

do $$declare fn record;begin
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('hotel_guest_canonical_id','hotel_guest_merge_state','hotel_guest_merge_preview','hotel_guest_profile_merge','hotel_guest_merge_guard_identity','hotel_guest_canonicalize_reference') loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
  execute format('grant execute on function %s to service_role',fn.signature);
 end loop;
 revoke all on function public.hotel_guest_dnr_blocked(text,text,text) from public,anon,authenticated;
 grant execute on function public.hotel_guest_dnr_blocked(text,text,text) to service_role;
end$$;

do $$declare body text;patched text;marker text;replacement text;begin
 select pg_get_functiondef('public.hotel_duplicate_review(text,text,text,uuid)'::regprocedure) into body;
 marker:='perform hotel_actor(p_actor,array[''manager'',''owner'']);';
 replacement:=marker||'perform pg_advisory_xact_lock(hashtextextended(''guest-review:''||p_pair_key,6));';
 patched:=replace(body,marker,replacement);if patched=body then raise exception 'GUEST_DUPLICATE_REVIEW_LOCK_PATCH_UNEXPECTED';end if;execute patched;
 select pg_get_functiondef('public.award_stay_loyalty_points(text)'::regprocedure) into body;
 marker:='select * into g from guests where id=r.guest_id for update;';
 replacement:='select * into g from guests where id=hotel_guest_canonical_id(r.guest_id) for update;';
 patched:=replace(body,marker,replacement);if patched=body then raise exception 'GUEST_LOYALTY_CANONICAL_PATCH_UNEXPECTED';end if;execute patched;
end$$;

commit;
