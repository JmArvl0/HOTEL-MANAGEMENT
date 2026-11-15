-- Existing-host joint testing only; network activation remains disabled.
begin;
create table public.fleet_tracking_revocations(
 link_id uuid primary key references public.fleet_transport_links(id) on delete restrict,
 expected_version integer check(expected_version>0), conflict_version integer check(conflict_version>0),
 state text not null default 'PENDING' check(state in('PENDING','SENDING','FAILED','CONFLICT','SUCCEEDED','NEEDS_REVIEW')),
 attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
 lease_id uuid,lease_until timestamptz,last_error text,
 created_by uuid references public.user_accounts(id),created_at timestamptz not null default now(),finished_at timestamptz
);
alter table public.fleet_tracking_revocations enable row level security;
revoke all on public.fleet_tracking_revocations from public,anon,authenticated;
grant select,insert,update on public.fleet_tracking_revocations to service_role;

-- A durable local withdrawal is never silently undone by re-consent/callbacks.
create function public.fleet_queue_sharing_withdrawal() returns trigger
language plpgsql security definer set search_path=public as $$
declare l fleet_transport_links%rowtype;
begin
 for l in select fl.* from fleet_transport_links fl where fl.request_id=new.request_id
  and exists(select 1 from fleet_transport_outbox o where o.link_id=fl.id and o.attempts>0)
  order by fl.id for update of fl loop
  insert into fleet_tracking_revocations(link_id,expected_version,created_by)
   values(l.id,case when l.partner_version between 1 and 2147483647 then l.partner_version::integer end,new.updated_by)
   on conflict(link_id) do nothing;
 end loop;
 return new;
end $$;
create trigger fleet_sharing_withdrawal after update of sharing_enabled on public.transport_pickup_profiles
 for each row when(old.sharing_enabled and not new.sharing_enabled) execute function public.fleet_queue_sharing_withdrawal();

create function public.fleet_hide_revoked_tracking() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.guest_safety is not null and exists(select 1 from fleet_tracking_revocations where link_id=new.id) then
  new.guest_safety:=jsonb_set(new.guest_safety,'{tracking}','null'::jsonb);
 end if;
 return new;
end $$;
-- Runs after fleet_guest_safety_snapshot, including a late higher-version callback.
create trigger fleet_z_hide_revoked_tracking before update of partner_version,assignment_active,needs_review on public.fleet_transport_links
 for each row execute function public.fleet_hide_revoked_tracking();

create function public.fleet_prevent_revoked_renewal() returns trigger
language plpgsql security definer set search_path=public as $$
begin
 if new.state in('PENDING','SENDING') and exists(select 1 from fleet_tracking_revocations where link_id=new.link_id) then raise exception 'FLEET_SHARING_REVOKED'; end if;
 return new;
end $$;
create trigger fleet_revoked_renewal before insert or update of state on public.fleet_tracking_renewals
 for each row execute function public.fleet_prevent_revoked_renewal();

create function public.queue_fleet_tracking_revocation(p_actor uuid,p_link uuid,p_expected integer,p_confirm_conflict boolean default false) returns uuid
language plpgsql security definer set search_path=public as $$
declare l fleet_transport_links%rowtype; c fleet_tracking_revocations%rowtype;
begin
 if not exists(select 1 from user_accounts where id=p_actor and role='front_desk' and active and account_status='active') then raise exception 'FLEET_FORBIDDEN'; end if;
 select * into l from fleet_transport_links where id=p_link for update;
 if not found or not exists(select 1 from fleet_transport_outbox where link_id=p_link and attempts>0) then raise exception 'FLEET_REQUEST_NOT_FOUND'; end if;
 select * into c from fleet_tracking_revocations where link_id=p_link for update;
 if found then
  if c.state='CONFLICT' then
   if not p_confirm_conflict or p_expected is distinct from c.conflict_version then raise exception 'FLEET_REVOCATION_REVIEW_REQUIRED'; end if;
   update fleet_tracking_revocations set expected_version=p_expected,conflict_version=null,state='PENDING',attempts=0,next_attempt_at=now(),last_error=null where link_id=p_link;
  elsif p_confirm_conflict then raise exception 'FLEET_REVOCATION_REVIEW_REQUIRED';
  end if;
 else
  if p_expected is distinct from (case when l.partner_version between 1 and 2147483647 then l.partner_version::integer end) then raise exception 'FLEET_REQUEST_STALE'; end if;
  insert into fleet_tracking_revocations(link_id,expected_version,created_by) values(p_link,p_expected,p_actor);
 end if;
 update fleet_transport_links set guest_safety=case when guest_safety is null then null else jsonb_set(guest_safety,'{tracking}','null'::jsonb) end where id=p_link;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'fleet_tracking_revocation_requested','transportation_request',l.request_id::text,jsonb_build_object('leg',l.leg,'reviewedConflict',p_confirm_conflict));
 return p_link;
end $$;

create function public.claim_fleet_tracking_revocation(p_link uuid,p_lease uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare l fleet_transport_links%rowtype; c fleet_tracking_revocations%rowtype;
begin
 select * into l from fleet_transport_links where id=p_link for update;
 select * into c from fleet_tracking_revocations where link_id=p_link for update;
 if not found or p_lease is null or c.state not in('PENDING','FAILED','SENDING') or c.attempts>=8 or c.next_attempt_at>now()
  or (c.state='SENDING' and c.lease_until>now()) then return null; end if;
 update fleet_tracking_revocations set state='SENDING',attempts=attempts+1,lease_id=p_lease,lease_until=now()+interval '30 seconds' where link_id=p_link;
 return jsonb_build_object('externalRequestId',l.external_request_id,'fleetReference',l.fleet_reference,'expectedVersion',c.expected_version);
end $$;

-- Version discovery is allowed only before the first DELETE payload is known.
-- A409 conflict can never silently update that saved payload.
create function public.resolve_fleet_revocation_version(p_link uuid,p_lease uuid,p_snapshot jsonb,p_event jsonb) returns integer
language plpgsql security definer set search_path=public as $$
declare l fleet_transport_links%rowtype; c fleet_tracking_revocations%rowtype; v integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_event->>'event_id',0));
 select * into l from fleet_transport_links where id=p_link for update;
 select * into c from fleet_tracking_revocations where link_id=p_link for update;
 if not found or c.state<>'SENDING' or c.lease_id is distinct from p_lease or p_lease is null then raise exception 'FLEET_REVOCATION_LEASE_LOST'; end if;
 if p_snapshot->>'external_request_id' is distinct from l.external_request_id or (l.fleet_reference is not null and p_snapshot->>'fleet_reference' is distinct from l.fleet_reference) then raise exception 'FLEET_EVENT_CONFLICT'; end if;
 v:=(p_snapshot->>'request_version')::integer;
 if v is null or v<1 then raise exception 'FLEET_EVENT_INVALID'; end if;
 perform receive_haven_fleet_snapshot(p_snapshot,p_event);
 if c.expected_version is null then update fleet_tracking_revocations set expected_version=v where link_id=p_link; else v:=c.expected_version; end if;
 return v;
end $$;

create function public.finish_fleet_tracking_revocation(p_link uuid,p_lease uuid,p_state text,p_snapshot jsonb,p_event jsonb,p_error text,p_retry_after timestamptz default null) returns text
language plpgsql security definer set search_path=public as $$
declare l fleet_transport_links%rowtype; c fleet_tracking_revocations%rowtype; final_state text:=p_state; v integer;
begin
 if p_state not in('SUCCEEDED','CONFLICT','FAILED','NEEDS_REVIEW') then raise exception 'FLEET_EVENT_INVALID'; end if;
 if p_event is not null then perform pg_advisory_xact_lock(hashtextextended(p_event->>'event_id',0)); end if;
 select * into l from fleet_transport_links where id=p_link for update;
 select * into c from fleet_tracking_revocations where link_id=p_link for update;
 if not found or c.state<>'SENDING' or c.lease_id is distinct from p_lease or p_lease is null then return 'NEEDS_REVIEW'; end if;
 if p_state in('SUCCEEDED','CONFLICT') and p_snapshot is null then raise exception 'FLEET_EVENT_INVALID'; end if;
 if p_snapshot is not null then
  v:=(p_snapshot->>'request_version')::integer;
  if v is null or v<1 or p_snapshot->>'external_request_id' is distinct from l.external_request_id
   or (l.fleet_reference is not null and p_snapshot->>'fleet_reference' is distinct from l.fleet_reference)
   or (p_state='SUCCEEDED' and (p_snapshot->'tracking' is distinct from 'null'::jsonb or v<c.expected_version)) then raise exception 'FLEET_EVENT_CONFLICT'; end if;
  perform receive_haven_fleet_snapshot(p_snapshot,p_event);
 end if;
 if final_state='FAILED' and c.attempts>=8 then final_state:='NEEDS_REVIEW'; end if;
 update fleet_tracking_revocations set state=final_state,conflict_version=case when final_state='CONFLICT' then v end,
  last_error=p_error,lease_id=null,lease_until=null,
  next_attempt_at=greatest(now()+make_interval(secs=>least(3600,(30*power(2,least(c.attempts,7)))::integer)),p_retry_after),
  finished_at=case when final_state='SUCCEEDED' then now() end where link_id=p_link;
 update fleet_transport_links set guest_safety=case when guest_safety is null then null else jsonb_set(guest_safety,'{tracking}','null'::jsonb) end where id=p_link;
 return final_state;
end $$;

revoke all on function public.fleet_queue_sharing_withdrawal(),public.fleet_hide_revoked_tracking(),public.fleet_prevent_revoked_renewal(),
 public.queue_fleet_tracking_revocation(uuid,uuid,integer,boolean),public.claim_fleet_tracking_revocation(uuid,uuid),public.resolve_fleet_revocation_version(uuid,uuid,jsonb,jsonb),
 public.finish_fleet_tracking_revocation(uuid,uuid,text,jsonb,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.queue_fleet_tracking_revocation(uuid,uuid,integer,boolean),public.claim_fleet_tracking_revocation(uuid,uuid),
 public.resolve_fleet_revocation_version(uuid,uuid,jsonb,jsonb),public.finish_fleet_tracking_revocation(uuid,uuid,text,jsonb,jsonb,text,timestamptz) to service_role;
commit;
