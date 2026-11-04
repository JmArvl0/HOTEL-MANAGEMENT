begin;

create table public.guest_operational_flags(
 id uuid primary key default gen_random_uuid(),
 guest_id text not null references public.guests(id) on delete restrict,
 flag_type text not null check(flag_type in('vip','do_not_rent','security_alert','accessibility','special_handling')),
 instructions text,
 restricted_note text,
 expires_at timestamptz,
 created_by uuid not null references public.user_accounts(id),
 created_at timestamptz not null default now(),
 updated_by uuid not null references public.user_accounts(id),
 updated_at timestamptz not null default now(),
 revoked_by uuid references public.user_accounts(id),
 revoked_at timestamptz,
 version integer not null default 1 check(version>0),
 check(revoked_at is null or revoked_by is not null),
 check(instructions is null or char_length(trim(instructions)) between 3 and 500),
 check(restricted_note is null or char_length(trim(restricted_note)) between 3 and 1000)
);
create unique index guest_operational_one_dnr on public.guest_operational_flags(guest_id)
 where flag_type='do_not_rent' and revoked_at is null;
create index guest_operational_flags_lookup_idx on public.guest_operational_flags(guest_id,flag_type,expires_at)
 where revoked_at is null;
alter table public.guest_operational_flags enable row level security;
revoke all on public.guest_operational_flags from public,anon,authenticated;
grant all on public.guest_operational_flags to service_role;

create table public.guest_flag_overrides(
 id uuid primary key default gen_random_uuid(),
 flag_id uuid not null references public.guest_operational_flags(id) on delete restrict,
 reservation_id text not null references public.reservations(id) on delete restrict,
 purpose text not null check(purpose in('booking','check_in')),
 flag_version integer not null,
 reason text not null check(char_length(trim(reason)) between 3 and 500),
 approved_by uuid not null references public.user_accounts(id),
 approved_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_by uuid references public.user_accounts(id),
 revoked_at timestamptz,
 version integer not null default 1 check(version>0),
 check(expires_at>approved_at),
 check(revoked_at is null or revoked_by is not null)
);
create index guest_flag_overrides_lookup_idx on public.guest_flag_overrides(flag_id,reservation_id,purpose,flag_version,expires_at desc)
 where revoked_at is null;
alter table public.guest_flag_overrides enable row level security;
revoke all on public.guest_flag_overrides from public,anon,authenticated;
grant all on public.guest_flag_overrides to service_role;

create function public.hotel_guest_flags_read(p_guest_id text,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;result jsonb;
begin
 actor:=hotel_actor(p_actor,array['front_desk','manager','owner']);
 if not exists(select 1 from guests where id=p_guest_id) then raise exception 'GUEST_NOT_FOUND';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'flagType',f.flag_type,'instructions',f.instructions,
  'restrictedNote',case when actor in('manager','owner') then f.restricted_note else null end,
  'expiresAt',f.expires_at,'createdAt',f.created_at,'createdBy',f.created_by,'version',f.version)
  order by case f.flag_type when 'do_not_rent' then 0 when 'security_alert' then 1 when 'vip' then 2 else 3 end,f.created_at desc),'[]'::jsonb)
 into result from guest_operational_flags f where f.guest_id=p_guest_id and f.revoked_at is null and (f.expires_at is null or f.expires_at>now());
 return jsonb_build_object('guestId',p_guest_id,'items',result,'mayManage',actor in('manager','owner'));
end$$;

create function public.hotel_guest_flag_save(
 p_flag_id uuid,p_guest_id text,p_flag_type text,p_instructions text,p_restricted_note text,
 p_expires_at timestamptz,p_version integer,p_reason text,p_actor uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;g guests%rowtype;f guest_operational_flags%rowtype;before_data jsonb;result jsonb;
begin
 actor:=hotel_actor(p_actor,array['manager','owner']);
 if p_flag_type not in('vip','do_not_rent','security_alert','accessibility','special_handling') then raise exception 'INVALID_GUEST_FLAG';end if;
 if nullif(trim(coalesce(p_reason,'')),'') is null or char_length(trim(p_reason))>500 then raise exception 'GUEST_FLAG_REASON_REQUIRED';end if;
 if p_expires_at is not null and p_expires_at<=now() then raise exception 'INVALID_FLAG_EXPIRY';end if;
 if p_instructions is not null and char_length(trim(p_instructions)) not between 3 and 500 then raise exception 'INVALID_FLAG_INSTRUCTIONS';end if;
 if p_restricted_note is not null and char_length(trim(p_restricted_note)) not between 3 and 1000 then raise exception 'INVALID_FLAG_RESTRICTED_NOTE';end if;
 if p_flag_type='do_not_rent' and nullif(trim(coalesce(p_restricted_note,'')),'') is null then raise exception 'DNR_RESTRICTED_REASON_REQUIRED';end if;
 select * into g from guests where id=p_guest_id for update;
 if not found then raise exception 'GUEST_NOT_FOUND';end if;
 if p_flag_id is null then
  if p_version<>0 then raise exception 'STALE_VERSION';end if;
  insert into guest_operational_flags(guest_id,flag_type,instructions,restricted_note,expires_at,created_by,updated_by)
   values(p_guest_id,p_flag_type,nullif(trim(p_instructions),''),nullif(trim(p_restricted_note),''),p_expires_at,p_actor,p_actor) returning * into f;
  before_data:=null;
 else
  select * into f from guest_operational_flags where id=p_flag_id and guest_id=p_guest_id and revoked_at is null for update;
  if not found then raise exception 'GUEST_FLAG_NOT_FOUND';end if;
  if f.version<>p_version then raise exception 'STALE_VERSION';end if;
  before_data:=to_jsonb(f);
  update guest_operational_flags set flag_type=p_flag_type,instructions=nullif(trim(p_instructions),''),
   restricted_note=nullif(trim(p_restricted_note),''),expires_at=p_expires_at,updated_by=p_actor,updated_at=now(),version=version+1
   where id=f.id returning * into f;
 end if;
 result:=jsonb_build_object('id',f.id,'guestId',f.guest_id,'flagType',f.flag_type,'instructions',f.instructions,
  'restrictedNote',f.restricted_note,'expiresAt',f.expires_at,'version',f.version);
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
 values(p_actor,'guest_flag_save','guest_flag',f.id::text,before_data,result||jsonb_build_object('reason',trim(p_reason)));
 if f.flag_type='do_not_rent' and f.revoked_at is null then
  insert into hotel_handovers(text,assigned_role,created_by,updated_by,reservation_id,room_id,guest_id,status)
  select 'Do Not Rent flag added for an in-house guest. Front Desk must review the stay and escalate according to property policy.','front_desk',p_actor,p_actor,r.id,r.room_id,f.guest_id,'open'
  from reservations r where r.status='checked_in' and (r.guest_id=f.guest_id or exists(select 1 from reservation_guests m where m.reservation_id=r.id and m.guest_id=f.guest_id and m.removed_at is null))
   and not exists(select 1 from hotel_handovers h where h.reservation_id=r.id and h.status<>'resolved' and h.text like 'Do Not Rent flag added for an in-house guest.%');
 end if;
 return result;
end$$;

create function public.hotel_guest_flag_revoke(p_flag_id uuid,p_version integer,p_reason text,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;f guest_operational_flags%rowtype;result jsonb;before_data jsonb;
begin
 actor:=hotel_actor(p_actor,array['manager','owner']);
 if nullif(trim(coalesce(p_reason,'')),'') is null or char_length(trim(p_reason))>500 then raise exception 'GUEST_FLAG_REASON_REQUIRED';end if;
 select * into f from guest_operational_flags where id=p_flag_id for update;
 if not found or f.revoked_at is not null then raise exception 'GUEST_FLAG_NOT_FOUND';end if;
 if f.version<>p_version then raise exception 'STALE_VERSION';end if;
 before_data:=to_jsonb(f);
 update guest_operational_flags set revoked_by=p_actor,revoked_at=now(),updated_by=p_actor,updated_at=now(),version=version+1 where id=f.id returning * into f;
 result:=jsonb_build_object('id',f.id,'guestId',f.guest_id,'revokedAt',f.revoked_at,'version',f.version);
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
 values(p_actor,'guest_flag_revoke','guest_flag',f.id::text,before_data,result||jsonb_build_object('reason',trim(p_reason)));
 return result;
end$$;

create function public.hotel_guest_flag_override_create(
 p_reservation_id text,p_flag_id uuid,p_purpose text,p_flag_version integer,p_reason text,p_expires_at timestamptz,p_actor uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;f guest_operational_flags%rowtype;override_id uuid;result jsonb;
begin
 actor:=hotel_actor(p_actor,array['manager','owner']);
 if p_purpose not in('booking','check_in') then raise exception 'INVALID_OVERRIDE_PURPOSE';end if;
 if nullif(trim(coalesce(p_reason,'')),'') is null or char_length(trim(p_reason))>500 then raise exception 'FLAG_OVERRIDE_REASON_REQUIRED';end if;
 if p_expires_at is null or p_expires_at<=now() then raise exception 'INVALID_OVERRIDE_EXPIRY';end if;
 select * into r from reservations where id=p_reservation_id for update;
 if not found then raise exception 'RESERVATION_NOT_FOUND';end if;
 select * into f from guest_operational_flags where id=p_flag_id for update;
 if not found or f.flag_type<>'do_not_rent' or f.revoked_at is not null or (f.expires_at is not null and f.expires_at<=now()) then raise exception 'GUEST_FLAG_NOT_ACTIVE';end if;
 if f.version<>p_flag_version then raise exception 'STALE_VERSION';end if;
 if not (r.guest_id=f.guest_id or exists(select 1 from reservation_guests m where m.reservation_id=r.id and m.guest_id=f.guest_id and m.removed_at is null)) then raise exception 'FLAG_RESERVATION_MISMATCH';end if;
 if p_purpose='booking' and r.status not in('pending','confirmed') or p_purpose='check_in' and r.status not in('confirmed','checked_in') then raise exception 'FLAG_OVERRIDE_PURPOSE_MISMATCH';end if;
 insert into guest_flag_overrides(flag_id,reservation_id,purpose,flag_version,reason,approved_by,expires_at)
 values(f.id,r.id,p_purpose,f.version,trim(p_reason),p_actor,p_expires_at) returning id into override_id;
 result:=jsonb_build_object('id',override_id,'flagId',f.id,'reservationId',r.id,'purpose',p_purpose,'flagVersion',f.version,'expiresAt',p_expires_at);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
 values(p_actor,'guest_flag_override_create','guest_flag_override',override_id::text,result||jsonb_build_object('reason',trim(p_reason)));
 return result;
end$$;

create function public.hotel_reservation_dnr_flags(p_reservation_id text,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 perform hotel_actor(p_actor,array['manager','owner']);
 if not exists(select 1 from reservations where id=p_reservation_id) then raise exception 'RESERVATION_NOT_FOUND';end if;
 select coalesce(jsonb_agg(jsonb_build_object('flagId',f.id,'guestId',f.guest_id,'guestName',g.name,
  'flagVersion',f.version,'restrictedNote',f.restricted_note,'instructions',f.instructions,
  'overrides',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'purpose',o.purpose,'expiresAt',o.expires_at,'version',o.version)
   order by o.approved_at desc) from guest_flag_overrides o where o.flag_id=f.id and o.reservation_id=p_reservation_id
    and o.revoked_at is null and o.expires_at>now() and o.flag_version=f.version),'[]'::jsonb))),'[]'::jsonb)
 into result from guest_operational_flags f join guests g on g.id=f.guest_id
 where f.flag_type='do_not_rent' and f.revoked_at is null and (f.expires_at is null or f.expires_at>now())
  and (f.guest_id=(select r.guest_id from reservations r where r.id=p_reservation_id)
   or exists(select 1 from reservation_guests m where m.reservation_id=p_reservation_id and m.guest_id=f.guest_id and m.removed_at is null));
 return jsonb_build_object('items',result);
end$$;

create function public.hotel_guest_flag_override_revoke(p_override_id uuid,p_version integer,p_reason text,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare o guest_flag_overrides%rowtype;before_data jsonb;result jsonb;
begin
 perform hotel_actor(p_actor,array['manager','owner']);
 if nullif(trim(coalesce(p_reason,'')),'') is null or char_length(trim(p_reason))>500 then raise exception 'FLAG_OVERRIDE_REASON_REQUIRED';end if;
 select * into o from guest_flag_overrides where id=p_override_id for update;
 if not found or o.revoked_at is not null then raise exception 'FLAG_OVERRIDE_NOT_ACTIVE';end if;
 if o.version<>p_version then raise exception 'STALE_VERSION';end if;
 before_data:=to_jsonb(o);
 update guest_flag_overrides set revoked_by=p_actor,revoked_at=now(),version=version+1 where id=o.id returning * into o;
 result:=jsonb_build_object('id',o.id,'reservationId',o.reservation_id,'flagId',o.flag_id,'revokedAt',o.revoked_at,'version',o.version);
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
 values(p_actor,'guest_flag_override_revoke','guest_flag_override',o.id::text,before_data,result||jsonb_build_object('reason',trim(p_reason)));
 return result;
end$$;

create function public.hotel_guest_dnr_blocked(p_reservation_id text,p_guest_id text,p_purpose text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from guest_operational_flags f where f.guest_id=p_guest_id and f.flag_type='do_not_rent'
  and f.revoked_at is null and (f.expires_at is null or f.expires_at>now())
  and not exists(select 1 from guest_flag_overrides o where o.flag_id=f.id and o.reservation_id=p_reservation_id
   and o.purpose=p_purpose and o.flag_version=f.version and o.revoked_at is null and o.expires_at>now()))
$$;

create function public.hotel_guest_dnr_reservation_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare purpose text;member record;paid_gateway boolean;
begin
 if new.status not in('confirmed','checked_in') then return new;end if;
 if tg_op='UPDATE' then
  if old.status=new.status and old.guest_id is not distinct from new.guest_id then return new;end if;
 end if;
 purpose:=case when new.status='checked_in' then 'check_in' else 'booking' end;
 if new.guest_id is not null then perform 1 from guests where id=new.guest_id for share;end if;
 for member in select distinct m.guest_id from reservation_guests m where m.reservation_id=new.id and m.guest_id is not null and m.removed_at is null order by m.guest_id loop
  perform 1 from guests where id=member.guest_id for share;
 end loop;
 for member in select f.id,f.guest_id from guest_operational_flags f
  where f.flag_type='do_not_rent' and f.revoked_at is null and (f.expires_at is null or f.expires_at>now())
   and (f.guest_id=new.guest_id or exists(select 1 from reservation_guests m where m.reservation_id=new.id and m.guest_id=f.guest_id and m.removed_at is null))
  order by f.guest_id,f.id for share of f loop
  if hotel_guest_dnr_blocked(new.id,member.guest_id,purpose) then
   select exists(select 1 from payments p where p.reservation_id=new.id and p.status='paid' and p.purpose='reservation_deposit') into paid_gateway;
   if new.status='confirmed' and paid_gateway then
    insert into hotel_handovers(text,assigned_role,created_by,updated_by,room_id,reservation_id,guest_id,status)
    select 'A verified deposit belongs to a reservation that needs Do Not Rent review. Retain the payment record and review using the approved refund controls.','front_desk',coalesce(auth.uid(),new.user_id),coalesce(auth.uid(),new.user_id),new.room_id,new.id,member.guest_id,'open'
    where coalesce(auth.uid(),new.user_id) is not null and not exists(select 1 from hotel_handovers h where h.reservation_id=new.id and h.status<>'resolved' and h.text like 'A verified deposit belongs to a reservation that needs Do Not Rent review.%');
   else
    raise exception 'GUEST_DO_NOT_RENT';
   end if;
  end if;
 end loop;
 return new;
end$$;
create trigger hotel_guest_dnr_reservation_guard before insert or update of status,guest_id on public.reservations
 for each row execute function public.hotel_guest_dnr_reservation_guard();

do $$declare body text;patched text;marker text:='perform expire_booking_holds();';guard text;begin
 select pg_get_functiondef('public.create_booking_hold(uuid,text,date,date,integer,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb)'::regprocedure) into body;
 guard:=marker||E'\n if exists(select 1 from guests g join guest_operational_flags f on f.guest_id=g.id where (g.user_account_id=p_user_id or lower(g.email)=lower(trim(p_email))) and f.flag_type=''do_not_rent'' and f.revoked_at is null and (f.expires_at is null or f.expires_at>now())) then raise exception ''GUEST_DO_NOT_RENT'';end if;';
 patched:=replace(body,marker,guard);
 if patched=body then raise exception 'GUEST_DNR_HOLD_BODY_UNEXPECTED';end if;
 execute patched;
end$$;

do $$declare body text;patched text;marker text:='if h.deposit_required <= 0 then raise exception ''INVALID_DEPOSIT_AMOUNT''; end if;';extra text;begin
 select pg_get_functiondef('public.submit_gateway_deposit(uuid,uuid,text)'::regprocedure) into body;
 extra:=marker||E'\n  if exists(select 1 from guests g join guest_operational_flags f on f.guest_id=g.id where (g.user_account_id=p_user_id or lower(g.email)=lower(h.email)) and f.flag_type=''do_not_rent'' and f.revoked_at is null and (f.expires_at is null or f.expires_at>now())) then raise exception ''GUEST_DO_NOT_RENT'';end if;';
 patched:=replace(body,marker,extra);
 if patched=body then raise exception 'GUEST_DNR_GATEWAY_BODY_UNEXPECTED';end if;
 execute patched;
end$$;

do $$declare body text;patched text;marker text:='arrival:=r.expected_arrival;';begin
 select pg_get_functiondef('public.hotel_reservation_readiness(text,uuid,text)'::regprocedure) into body;
 patched:=replace(body,marker,
  'if hotel_guest_dnr_blocked(r.id,r.guest_id,''check_in'') or exists(select 1 from reservation_guests m where m.reservation_id=r.id and m.guest_id is not null and m.removed_at is null and hotel_guest_dnr_blocked(r.id,m.guest_id,''check_in'')) then ci:=array_append(ci,''GUEST_DO_NOT_RENT'');end if;'||marker);
 if patched=body then raise exception 'GUEST_DNR_READINESS_BODY_UNEXPECTED';end if;
 execute patched;
end$$;

do $$declare name text;fn record;begin
 foreach name in array array['guest_operational_flags','guest_flag_overrides'] loop
  execute format('alter table public.%I enable row level security',name);
  execute format('revoke all on public.%I from public,anon,authenticated',name);
  execute format('grant all on public.%I to service_role',name);
 end loop;
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('hotel_guest_flags_read','hotel_guest_flag_save','hotel_guest_flag_revoke',
   'hotel_guest_flag_override_create','hotel_reservation_dnr_flags','hotel_guest_flag_override_revoke',
   'hotel_guest_dnr_blocked','hotel_guest_dnr_reservation_guard') loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
  execute format('grant execute on function %s to service_role',fn.signature);
 end loop;
end$$;

commit;
