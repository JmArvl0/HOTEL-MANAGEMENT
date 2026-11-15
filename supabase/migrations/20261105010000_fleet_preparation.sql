-- Local preparation only. No network, automatic dispatch, status transition or fare posting.
-- Fleet contract/sign-off and sandbox verification are still required before activation.
begin;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('transport-pickup-photos','transport-pickup-photos',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create table public.transport_pickup_profiles(
 request_id uuid primary key references public.transportation_requests(id) on delete restrict,
 traveler_reference uuid not null default gen_random_uuid() unique,
 traveler_name text not null check(length(traveler_name) between 2 and 120),
 phone text not null check(phone ~ '^\+[1-9][0-9]{7,14}$'),
 email text check(email is null or length(email)<=254),
 photo_path text, photo_reference uuid, photo_version integer not null default 0 check(photo_version>=0),
 sharing_enabled boolean not null default false, consented_at timestamptz,
 version integer not null default 1 check(version>0),
 updated_by uuid not null references public.user_accounts(id), updated_at timestamptz not null default now(),
 check((photo_path is null)=(photo_reference is null)),
 check(not sharing_enabled or consented_at is not null)
);

create table public.fleet_transport_links(
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.transportation_requests(id) on delete restrict,
 leg text not null check(leg in('OUTBOUND','RETURN')),
 external_request_id text not null unique,
 fleet_reference text, partner_status text, partner_version bigint not null default 0 check(partner_version>=0),
 assignment_active boolean not null default false,
 needs_review boolean not null default false, reconciliation_note text, reviewed_at timestamptz,
 reviewed_by uuid references public.user_accounts(id),
 updated_at timestamptz not null default now(), unique(request_id,leg)
);
create table public.fleet_transport_outbox(
 id uuid primary key default gen_random_uuid(),
 link_id uuid not null unique references public.fleet_transport_links(id) on delete restrict,
 request_version integer not null, profile_version integer not null,
 payload jsonb not null,
 state text not null default 'PREPARED' check(state in('PREPARED','SENDING','SENT','FAILED','NEEDS_REVIEW')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 lease_id uuid, lease_until timestamptz, last_error text,
 created_by uuid not null references public.user_accounts(id),
 created_at timestamptz not null default now(), sent_at timestamptz
);
create index fleet_transport_outbox_due on public.fleet_transport_outbox(state,next_attempt_at);
create table public.fleet_transport_inbox(
 event_id text primary key check(length(event_id) between 1 and 200),
 link_id uuid not null references public.fleet_transport_links(id) on delete restrict,
 payload jsonb not null,
 outcome text not null check(outcome in('APPLIED','STALE','NEEDS_REVIEW')),
 received_at timestamptz not null default now()
);

-- A changed pickup profile or local trip invalidates any prepared snapshot. Sent
-- creates are retained for reconciliation; an unsupported update is never sent.
create function public.fleet_invalidate_preparation() returns trigger
language plpgsql security definer set search_path=public as $$
declare rid uuid;
begin
 if tg_table_name='transportation_requests' then rid:=new.id; else rid:=new.request_id; end if;
 update fleet_transport_outbox o set state='NEEDS_REVIEW',last_error='LOCAL_DETAILS_CHANGED'
 from fleet_transport_links l where o.link_id=l.id and l.request_id=rid and o.state<>'NEEDS_REVIEW';
 update fleet_transport_links set needs_review=true,assignment_active=false,updated_at=now() where request_id=rid;
 return new;
end $$;
create trigger fleet_trip_changed after update on public.transportation_requests
for each row when(old is distinct from new) execute function public.fleet_invalidate_preparation();
create trigger fleet_profile_changed after update on public.transport_pickup_profiles
for each row when(old is distinct from new) execute function public.fleet_invalidate_preparation();

create function public.fleet_invalidate_stay_preparation() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 update fleet_transport_outbox ob set state='NEEDS_REVIEW',last_error='LOCAL_STAY_CHANGED'
 from fleet_transport_links fl join transportation_requests tr on tr.id=fl.request_id
 where ob.link_id=fl.id and tr.reservation_id=new.id;
 update fleet_transport_links fl set needs_review=true,assignment_active=false,updated_at=now()
 from transportation_requests tr where tr.id=fl.request_id and tr.reservation_id=new.id;
 return new;
end $$;
create trigger fleet_stay_changed after update of status,check_in,check_out on public.reservations
for each row when(old.status is distinct from new.status or old.check_in is distinct from new.check_in or old.check_out is distinct from new.check_out)
execute function public.fleet_invalidate_stay_preparation();

create function public.save_transport_pickup_profile(p_actor uuid,p_request uuid,p_expected_version integer,p_details jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t transportation_requests%rowtype; old transport_pickup_profiles%rowtype; saved transport_pickup_profiles%rowtype;
 actor text; path text; sharing boolean;
begin
 select role into actor from user_accounts where id=p_actor and active and account_status='active';
 if actor is null or actor not in('guest','front_desk') then raise exception 'PICKUP_PROFILE_FORBIDDEN'; end if;
 select tr.* into t from transportation_requests tr join reservations r on r.id=tr.reservation_id
 where tr.id=p_request and (actor='front_desk' or r.user_id=p_actor) for update of tr;
 if not found then raise exception 'PICKUP_PROFILE_NOT_FOUND'; end if;
 select * into old from transport_pickup_profiles where request_id=p_request for update;
 if coalesce(old.version,0) is distinct from p_expected_version then raise exception 'PICKUP_PROFILE_STALE'; end if;
 path:=nullif(p_details->>'photoPath',''); sharing:=coalesce((p_details->>'sharingEnabled')::boolean,false);
 if path is not null and path !~ ('^'||p_request::text||'/[0-9a-f-]{36}\.(jpg|png|webp)$') then raise exception 'PICKUP_PHOTO_INVALID'; end if;
 insert into transport_pickup_profiles(request_id,traveler_name,phone,email,photo_path,photo_reference,photo_version,sharing_enabled,consented_at,updated_by)
 values(p_request,trim(p_details->>'travelerName'),p_details->>'phone',nullif(trim(p_details->>'email'),''),path,
 case when path is null then null else gen_random_uuid() end,case when path is null then 0 else 1 end,sharing,case when sharing then now() end,p_actor)
 on conflict(request_id) do update set traveler_name=excluded.traveler_name,phone=excluded.phone,email=excluded.email,
 photo_path=excluded.photo_path,photo_reference=case when old.photo_path is not distinct from path then old.photo_reference else excluded.photo_reference end,
 photo_version=old.photo_version+case when old.photo_path is not distinct from path then 0 else 1 end,
 sharing_enabled=sharing,consented_at=case when sharing then coalesce(old.consented_at,now()) end,
 version=old.version+1,updated_by=p_actor,updated_at=now() returning * into saved;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'transport_pickup_profile_saved','transportation_request',p_request::text,
 jsonb_build_object('version',saved.version,'sharingEnabled',sharing,'hasPhoto',path is not null));
 return jsonb_build_object('version',saved.version);
end $$;

create function public.prepare_fleet_transport(p_actor uuid,p_request uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare t transportation_requests%rowtype; p transport_pickup_profiles%rowtype; l fleet_transport_links%rowtype;
 r reservations%rowtype; v_leg text; eid uuid; body jsonb; n integer:=0;
begin
 if not exists(select 1 from user_accounts where id=p_actor and role='front_desk' and active and account_status='active') then raise exception 'FLEET_FORBIDDEN'; end if;
 select * into t from transportation_requests where id=p_request for update;
 if not found then raise exception 'FLEET_REQUEST_NOT_FOUND'; end if;
 if t.version is distinct from p_expected_version then raise exception 'FLEET_REQUEST_STALE'; end if;
 if t.status not in('REVIEWED','SCHEDULED') then raise exception 'FLEET_REVIEW_REQUEST_FIRST'; end if;
 select * into p from transport_pickup_profiles where request_id=t.id;
 if not found or not p.sharing_enabled then raise exception 'FLEET_PICKUP_CONSENT_REQUIRED'; end if;
 select * into r from reservations where id=t.reservation_id;
 if r.status not in('confirmed','checked_in') then raise exception 'FLEET_STAY_NOT_ACTIVE'; end if;
 foreach v_leg in array case when t.service_type='ROUND_TRIP' then array['OUTBOUND','RETURN'] else array['OUTBOUND'] end loop
  insert into fleet_transport_links(request_id,leg,external_request_id) values(t.id,v_leg,'haven:'||t.id::text||':'||lower(v_leg)) on conflict(request_id,leg) do nothing;
  select * into l from fleet_transport_links where request_id=t.id and fleet_transport_links.leg=v_leg for update;
  if exists(select 1 from fleet_transport_outbox where link_id=l.id and attempts>0) then raise exception 'FLEET_RECONCILIATION_REQUIRED'; end if;
  select id into eid from fleet_transport_outbox where link_id=l.id;
  eid:=coalesce(eid,gen_random_uuid());
  body:=jsonb_build_object('contract_version',2,'external_request_id',l.external_request_id,'external_revision',1,'event_id',eid,'event_kind','create',
   'request',jsonb_build_object('booking_reference',coalesce(r.confirmation_number,r.id),'guest_name',p.traveler_name,
    'pickup_location',case when v_leg='RETURN' then t.dropoff_location else t.pickup_location end,
    'dropoff_location',case when v_leg='RETURN' then t.return_location else t.dropoff_location end,
    'pickup_datetime',to_char(case when v_leg='RETURN' then t.return_date else t.pickup_date end,'YYYY-MM-DD')||'T'||case when v_leg='RETURN' then t.return_time else t.pickup_time end||':00+08:00',
    'passenger_count',t.passenger_count,'load_type','Passenger','service_code','GUEST_TRANSPORT','priority','Normal','special_requests',t.special_instructions,
    'traveler',jsonb_build_object('guest_reference',p.traveler_reference,'display_name',p.traveler_name,'phone',p.phone,'email',p.email,'photo_reference',p.photo_reference,'photo_version',p.photo_version),
    'journey_reference',t.id,'leg',v_leg));
  insert into fleet_transport_outbox(id,link_id,request_version,profile_version,payload,created_by) values(eid,l.id,t.version,p.version,body,p_actor)
  on conflict(link_id) do update set request_version=t.version,profile_version=p.version,payload=body,state='PREPARED',last_error=null;
  update fleet_transport_links set needs_review=false,updated_at=now() where id=l.id;
  n:=n+1;
 end loop;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'fleet_transport_prepared','transportation_request',t.id::text,jsonb_build_object('legs',n));
 return jsonb_build_object('legs',n);
end $$;

-- Claim by ID, never concurrently send one event twice. Crash recovery reuses its
-- immutable event ID. Requests changed during a send require reconciliation.
create function public.claim_fleet_transport(p_id uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare o fleet_transport_outbox%rowtype; t transportation_requests%rowtype; l fleet_transport_links%rowtype;
begin
 select tr.* into t from transportation_requests tr join fleet_transport_links fl on fl.request_id=tr.id join fleet_transport_outbox ob on ob.link_id=fl.id where ob.id=p_id for update of tr;
 select * into o from fleet_transport_outbox where id=p_id for update;
 if not found then return null; end if;
 if o.state not in('PREPARED','FAILED','SENDING') or (o.state='SENDING' and o.lease_until>now()) or o.next_attempt_at>now() or o.attempts>=8 then return null; end if;
 select * into l from fleet_transport_links where id=o.link_id;
 if t.version<>o.request_version or t.status not in('REVIEWED','SCHEDULED')
  or not exists(select 1 from reservations r where r.id=t.reservation_id and r.status in('confirmed','checked_in') and t.pickup_date between r.check_in and r.check_out and (t.return_date is null or t.return_date between r.check_in and r.check_out))
  or not exists(select 1 from transport_pickup_profiles where request_id=t.id and sharing_enabled and version=o.profile_version) then
  update fleet_transport_outbox set state='NEEDS_REVIEW',last_error='LOCAL_DETAILS_CHANGED' where id=o.id; return null;
 end if;
 update fleet_transport_outbox set state='SENDING',attempts=attempts+1,lease_id=p_lease,lease_until=now()+interval '30 seconds' where id=o.id;
 return jsonb_build_object('id',o.id,'payload',o.payload,'attempt',o.attempts+1);
end $$;
create function public.finish_fleet_transport(p_id uuid,p_lease uuid,p_reference text,p_error text,p_review boolean) returns boolean
language plpgsql security definer set search_path=public as $$
declare o fleet_transport_outbox%rowtype;
begin
 select * into o from fleet_transport_outbox where id=p_id for update;
 if not found or o.lease_id is null or o.lease_id is distinct from p_lease then return false; end if;
 if o.state='NEEDS_REVIEW' then
  update fleet_transport_links set fleet_reference=coalesce(p_reference,fleet_reference),needs_review=true,updated_at=now() where id=o.link_id;
  update fleet_transport_outbox set lease_id=null,lease_until=null where id=o.id;
  return false;
 end if;
 if o.state<>'SENDING' then return false; end if;
 update fleet_transport_outbox set state=case when p_review then 'NEEDS_REVIEW' when p_error is not null then 'FAILED' else 'SENT' end,
 last_error=p_error,lease_id=null,lease_until=null,sent_at=case when p_error is null then now() end,
 next_attempt_at=now()+make_interval(secs=>least(3600,(30*power(2,least(o.attempts,7)))::integer)) where id=o.id;
 update fleet_transport_links set fleet_reference=coalesce(p_reference,fleet_reference),needs_review=p_review,updated_at=now() where id=o.link_id;
 return true;
end $$;

create function public.receive_fleet_transport_status(p_event jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare l fleet_transport_links%rowtype; old fleet_transport_inbox%rowtype; eid text:=p_event->>'event_id'; v bigint; outcome text;
 status text:=p_event->>'status';
begin
 if eid is null or length(eid) not between 1 and 200 or p_event->>'source_system'<>'PMS'
  or status not in('RECEIVED','ACCEPTED','SCHEDULED','ASSIGNED','IN_TRANSIT','COMPLETED','CANCELLED','REJECTED') then raise exception 'FLEET_EVENT_INVALID'; end if;
 perform pg_advisory_xact_lock(hashtextextended(eid,0));
 select * into l from fleet_transport_links where external_request_id=coalesce(p_event->>'external_request_id',p_event->>'external_booking_id') for update;
 if not found then raise exception 'FLEET_REQUEST_NOT_FOUND'; end if;
 if not exists(select 1 from fleet_transport_outbox where link_id=l.id and attempts>0) then raise exception 'FLEET_NOT_DISPATCHED'; end if;
 select * into old from fleet_transport_inbox where event_id=eid;
 if found then
  if old.payload<>p_event or old.link_id<>l.id then raise exception 'FLEET_EVENT_CONFLICT'; end if;
  return jsonb_build_object('delivered',true,'duplicate',true,'outcome',old.outcome);
 end if;
 if l.fleet_reference is not null and p_event->>'fleet_reference' is distinct from l.fleet_reference then raise exception 'FLEET_REFERENCE_CONFLICT'; end if;
 v:=(p_event->>'request_version')::bigint;
 if v is not null and v<1 then raise exception 'FLEET_EVENT_INVALID'; end if;
 outcome:=case when v is null then 'NEEDS_REVIEW' when v<=l.partner_version then 'STALE'
  when l.partner_status in('COMPLETED','CANCELLED','REJECTED') and status<>l.partner_status then 'NEEDS_REVIEW'
  when status not in('CANCELLED','REJECTED') and array_position(array['RECEIVED','ACCEPTED','SCHEDULED','ASSIGNED','IN_TRANSIT','COMPLETED'],status)
   <array_position(array['RECEIVED','ACCEPTED','SCHEDULED','ASSIGNED','IN_TRANSIT','COMPLETED'],l.partner_status) then 'NEEDS_REVIEW'
  when l.needs_review then 'NEEDS_REVIEW' else 'APPLIED' end;
 insert into fleet_transport_inbox(event_id,link_id,payload,outcome) values(eid,l.id,p_event,outcome);
 if outcome='APPLIED' then
  update fleet_transport_links set partner_status=status,partner_version=v,
   fleet_reference=coalesce(fleet_reference,p_event->>'fleet_reference'),
   assignment_active=coalesce((p_event->>'assignment_active')::boolean,false) and status in('ASSIGNED','IN_TRANSIT'),updated_at=now() where id=l.id;
 elsif outcome='NEEDS_REVIEW' then
  update fleet_transport_links set needs_review=true,assignment_active=false,updated_at=now() where id=l.id;
 end if;
 return jsonb_build_object('delivered',true,'duplicate',false,'outcome',outcome);
end $$;

create function public.record_fleet_coordination(p_actor uuid,p_request uuid,p_note text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from user_accounts where id=p_actor and role='front_desk' and active and account_status='active') then raise exception 'FLEET_FORBIDDEN'; end if;
 if length(trim(p_note)) not between 5 and 500 then raise exception 'FLEET_NOTE_REQUIRED'; end if;
 update fleet_transport_links set reconciliation_note=trim(p_note),reviewed_at=now(),reviewed_by=p_actor where request_id=p_request;
 if not found then raise exception 'FLEET_REQUEST_NOT_FOUND'; end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'fleet_coordination_recorded','transportation_request',p_request::text,jsonb_build_object('note',trim(p_note)));
end $$;

alter table public.transport_pickup_profiles enable row level security;
alter table public.fleet_transport_links enable row level security;
alter table public.fleet_transport_outbox enable row level security;
alter table public.fleet_transport_inbox enable row level security;
revoke all on public.transport_pickup_profiles,public.fleet_transport_links,public.fleet_transport_outbox,public.fleet_transport_inbox from public,anon,authenticated;
grant select,insert,update on public.transport_pickup_profiles,public.fleet_transport_links,public.fleet_transport_outbox,public.fleet_transport_inbox to service_role;
revoke all on function public.fleet_invalidate_preparation(),public.fleet_invalidate_stay_preparation(),public.save_transport_pickup_profile(uuid,uuid,integer,jsonb),public.prepare_fleet_transport(uuid,uuid,integer),public.claim_fleet_transport(uuid,uuid),public.finish_fleet_transport(uuid,uuid,text,text,boolean),public.receive_fleet_transport_status(jsonb) from public,anon,authenticated;
grant execute on function public.save_transport_pickup_profile(uuid,uuid,integer,jsonb),public.prepare_fleet_transport(uuid,uuid,integer),public.claim_fleet_transport(uuid,uuid),public.finish_fleet_transport(uuid,uuid,text,text,boolean),public.receive_fleet_transport_status(jsonb) to service_role;
revoke all on function public.record_fleet_coordination(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_fleet_coordination(uuid,uuid,text) to service_role;
commit;
