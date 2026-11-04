create table public.lost_found_items (
 id uuid primary key, description text not null check(length(description) between 3 and 500),
 found_location text not null, found_at timestamptz not null, storage_location text,
 found_by uuid not null references public.user_accounts(id), custodian_id uuid not null references public.user_accounts(id),
 status text not null default 'found' check(status in('found','secured','claim_pending','release_authorized','released','disposed')),
 claimant_note text, authorized_by uuid references public.user_accounts(id),
 version integer not null default 1, created_at timestamptz not null default now()
);
create table public.lost_found_events (
 id uuid primary key default gen_random_uuid(), item_id uuid not null references public.lost_found_items(id),
 actor_id uuid not null references public.user_accounts(id), action text not null, note text not null,
 created_at timestamptz not null default now(), version integer not null, unique(item_id,version)
);
alter table public.lost_found_items enable row level security;
alter table public.lost_found_events enable row level security;
revoke all on public.lost_found_items,public.lost_found_events from public,anon,authenticated;
grant select on public.lost_found_items,public.lost_found_events to service_role;

create function public.record_found_item(p_actor uuid,p_id uuid,p_description text,p_location text,p_found_at timestamptz)
returns uuid language plpgsql security definer set search_path=public as $$
declare item lost_found_items%rowtype;
begin
 if not exists(select 1 from user_accounts where id=p_actor and active and role='housekeeping') then raise exception 'LOST_FOUND_FORBIDDEN'; end if;
 if length(trim(coalesce(p_description,''))) not between 3 and 500 or length(trim(coalesce(p_location,''))) not between 2 and 120 or p_found_at is null or p_found_at>now() then raise exception 'INVALID_FOUND_ITEM'; end if;
 perform pg_advisory_xact_lock(hashtextextended('found:'||p_id::text,0));
 select * into item from lost_found_items where id=p_id;
 if found then
  if item.found_by<>p_actor or item.description<>trim(p_description) or item.found_location<>trim(p_location) or item.found_at<>p_found_at then raise exception 'FOUND_ITEM_CONFLICT'; end if;
  return item.id;
 end if;
 insert into lost_found_items(id,description,found_location,found_at,found_by,custodian_id) values(p_id,trim(p_description),trim(p_location),p_found_at,p_actor,p_actor);
 insert into lost_found_events(item_id,actor_id,action,note,version) values(p_id,p_actor,'found',trim(p_location),1);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'lost_found_recorded','lost_found_item',p_id::text,jsonb_build_object('status','found'));
 return p_id;
end$$;
create function public.act_found_item(p_actor uuid,p_id uuid,p_version integer,p_action text,p_note text,p_identity_verified boolean default false)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text; item lost_found_items%rowtype; next_status text;
begin
 select role into actor from user_accounts where id=p_actor and active;
 if actor is null or actor not in('manager','front_desk','housekeeping') then raise exception 'LOST_FOUND_FORBIDDEN'; end if;
 select * into item from lost_found_items where id=p_id for update;
 if not found then raise exception 'FOUND_ITEM_NOT_FOUND'; end if;
 if item.version<>p_version then raise exception 'FOUND_ITEM_STALE'; end if;
 if length(trim(coalesce(p_note,''))) not between 3 and 500 then raise exception 'REASON_REQUIRED'; end if;
 if p_action='secure' and actor='housekeeping' and item.status='found' then next_status:='secured';
 elsif p_action='claim' and actor='front_desk' and item.status='secured' then next_status:='claim_pending';
 elsif p_action='authorize_release' and actor='manager' and item.status='claim_pending' then next_status:='release_authorized';
 elsif p_action='reject_claim' and actor='manager' and item.status='claim_pending' then next_status:='secured';
 elsif p_action='release' and actor='front_desk' and item.status='release_authorized' and p_identity_verified then next_status:='released';
 elsif p_action='dispose' and actor='manager' and item.status='secured' and p_identity_verified then next_status:='disposed';
 elsif p_action='take_custody' and item.status in('secured','claim_pending','release_authorized') then next_status:=item.status;
 else raise exception 'INVALID_FOUND_TRANSITION'; end if;
 update lost_found_items set status=next_status,version=version+1,
  storage_location=case when p_action='secure' then trim(p_note) else storage_location end,
  claimant_note=case when p_action='claim' then trim(p_note) when p_action='reject_claim' then null else claimant_note end,
  authorized_by=case when p_action='authorize_release' then p_actor when p_action='reject_claim' then null else authorized_by end,
  custodian_id=case when p_action in('secure','take_custody','release','dispose') then p_actor else custodian_id end where id=p_id;
 insert into lost_found_events(item_id,actor_id,action,note,version) values(p_id,p_actor,p_action,trim(p_note),item.version+1);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'lost_found_'||p_action,'lost_found_item',p_id::text,jsonb_build_object('status',next_status,'version',item.version+1));
 return jsonb_build_object('status',next_status,'version',item.version+1);
end$$;
revoke all on function public.record_found_item(uuid,uuid,text,text,timestamptz),public.act_found_item(uuid,uuid,integer,text,text,boolean) from public,anon,authenticated;
grant execute on function public.record_found_item(uuid,uuid,text,text,timestamptz),public.act_found_item(uuid,uuid,integer,text,text,boolean) to service_role;
