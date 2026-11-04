begin;

-- Keep staying people on the reservation. A companion does not need a CRM row.
alter table public.reservation_guests drop constraint reservation_guests_pkey;
alter table public.reservation_guests alter column guest_id drop not null;
alter table public.reservation_guests add column id uuid default gen_random_uuid();
update public.reservation_guests set id=gen_random_uuid() where id is null;
alter table public.reservation_guests alter column id set not null;
alter table public.reservation_guests add constraint reservation_guests_pkey primary key(id);
drop index public.reservation_party_one_primary;

alter table public.reservation_guests
 add column full_name text,
 add column occupant_type text not null default 'unknown',
 add column date_of_birth date,
 add column nationality text,
 add column id_verified boolean not null default false,
 add column id_verified_by uuid references public.user_accounts(id),
 add column id_verified_at timestamptz,
 add column age_verified_by uuid references public.user_accounts(id),
 add column age_verified_at timestamptz,
 add column age_verified_for_date date,
 add column verified_age_years integer,
 add column attendance_status text not null default 'unknown',
 add column removed_at timestamptz,
 add column removed_by uuid references public.user_accounts(id),
 add column updated_at timestamptz not null default now(),
 add constraint reservation_guest_name_valid check(full_name is null or char_length(trim(full_name)) between 2 and 160),
 add constraint reservation_guest_type_valid check(occupant_type in('adult','child','infant','unknown')),
 add constraint reservation_guest_nationality_valid check(nationality is null or char_length(trim(nationality)) between 2 and 100),
 add constraint reservation_guest_age_valid check(verified_age_years is null or verified_age_years between 0 and 120),
 add constraint reservation_guest_attendance_valid check(attendance_status in('expected','present','departed','unknown')),
 add constraint reservation_guest_identity_evidence_valid check(
   (id_verified=(id_verified_by is not null and id_verified_at is not null))
   and (id_verified_by is null)=(id_verified_at is null)
   and (age_verified_by is null)=(age_verified_at is null)
   and ((age_verified_by is null and age_verified_for_date is null and verified_age_years is null)
     or (age_verified_by is not null and age_verified_for_date is not null and verified_age_years is not null))
 );

update public.reservation_guests member set
 full_name=coalesce(nullif(trim((select g.name from public.guests g where g.id=member.guest_id)),''),nullif(trim(r.guest_name),'')),
 nationality=(select g.nationality from public.guests g where g.id=member.guest_id),
 attendance_status=case when r.status='checked_out' then 'departed' when r.status='checked_in' then 'unknown' else 'expected' end,
 id_verified=(member.role='primary' and r.identity_status='verified' and r.identity_verified_by is not null and r.identity_verified_at is not null),
 id_verified_by=case when member.role='primary' and r.identity_status='verified' and r.identity_verified_by is not null and r.identity_verified_at is not null then r.identity_verified_by end,
 id_verified_at=case when member.role='primary' and r.identity_status='verified' and r.identity_verified_by is not null and r.identity_verified_at is not null then r.identity_verified_at end
from public.reservations r
where r.id=member.reservation_id;
alter table public.reservation_guests alter column full_name drop default;
alter table public.reservation_guests alter column attendance_status set default 'expected';
create unique index reservation_party_one_primary on public.reservation_guests(reservation_id)
 where role='primary' and removed_at is null;
create unique index reservation_party_linked_guest_unique on public.reservation_guests(reservation_id,guest_id)
 where guest_id is not null and removed_at is null;
create index reservation_guests_active_party_idx on public.reservation_guests(reservation_id,role)
 where removed_at is null;

alter table public.reservations
 add column if not exists party_completed_at timestamptz,
 add column if not exists party_completed_by uuid references public.user_accounts(id);

-- Attendance is an episode ledger. Rejoining never overwrites a prior departure.
create table public.reservation_occupant_presence(
 id uuid primary key default gen_random_uuid(),
 occupant_id uuid not null references public.reservation_guests(id) on delete restrict,
 arrived_at timestamptz not null,
 departed_at timestamptz,
 arrived_by uuid references public.user_accounts(id),
 departed_by uuid references public.user_accounts(id),
 check(departed_at is null or departed_at>=arrived_at),
 check(departed_by is null or departed_at is not null)
);
create unique index reservation_occupant_one_open_presence on public.reservation_occupant_presence(occupant_id)
 where departed_at is null;
create index reservation_occupant_presence_history_idx on public.reservation_occupant_presence(occupant_id,arrived_at desc);

-- Enforcement is enabled by an explicit, future-dated Admin/Owner policy action.
create table public.hotel_occupant_policy(
 key text primary key check(key='default'),
 register_effective_from date,
 age_effective_from date,
 version integer not null default 0 check(version>=0),
 updated_at timestamptz not null default now()
);
insert into public.hotel_occupant_policy(key) values('default') on conflict do nothing;

create or replace function public.hotel_party_primary_on_booking()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into reservation_guests(reservation_id,guest_id,role,full_name,nationality,added_by)
 select new.id,g.id,'primary',coalesce(nullif(trim(g.name),''),trim(new.guest_name)),g.nationality,
  case when auth.uid() is not null then auth.uid() end
 from guests g where g.id=new.guest_id and lower(trim(g.name))=lower(trim(new.guest_name))
 on conflict do nothing;
 return new;
end$$;

create or replace function public.hotel_party_capacity_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if (select count(*) from reservation_guests where reservation_id=new.id and removed_at is null)
  >least(new.guests,coalesce((select max_guests from room_types where name=new.room_type),new.guests))
 then raise exception 'PARTY_CAPACITY';end if;
 return new;
end$$;

create or replace function public.hotel_occupant_policy_read(p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p hotel_occupant_policy%rowtype;
begin
 perform hotel_actor(p_actor,array['admin','owner']);
 select * into p from hotel_occupant_policy where key='default';
 return jsonb_build_object('registerEffectiveFrom',p.register_effective_from,
   'ageEffectiveFrom',p.age_effective_from,'minimumBookingAge',
  coalesce((current_operational_policy_snapshot()->>'minimumBookingAge')::integer,18),
  'hotelTimezone',coalesce(current_operational_policy_snapshot()->>'hotelTimezone','Asia/Manila'),
   'version',p.version);
end$$;

create or replace function public.hotel_occupant_policy_update(
 p_register_effective_from date,p_age_effective_from date,p_reason text,p_version integer,p_actor uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare p hotel_occupant_policy%rowtype;old_register date;old_age date;old_version integer;minimum_date date;
begin
 perform hotel_actor(p_actor,array['admin','owner']);
 minimum_date:=((now() at time zone coalesce(current_operational_policy_snapshot()->>'hotelTimezone','Asia/Manila'))::date)+7;
 if nullif(trim(p_reason),'') is null or char_length(trim(p_reason))>500 then raise exception 'POLICY_REASON_REQUIRED';end if;
 select * into p from hotel_occupant_policy where key='default' for update;
 if p.version<>p_version then raise exception 'STALE_VERSION';end if;
 old_register:=p.register_effective_from;old_age:=p.age_effective_from;old_version:=p.version;
 if (p_register_effective_from is distinct from p.register_effective_from and p_register_effective_from is not null and p_register_effective_from<minimum_date)
   or (p_age_effective_from is distinct from p.age_effective_from and p_age_effective_from is not null and p_age_effective_from<minimum_date) then raise exception 'POLICY_NOTICE_REQUIRED';end if;
 if p.register_effective_from is not null and p_register_effective_from is null
   or p.age_effective_from is not null and p_age_effective_from is null then raise exception 'POLICY_CANNOT_DISABLE';end if;
 update hotel_occupant_policy set register_effective_from=p_register_effective_from,
  age_effective_from=p_age_effective_from,version=version+1,updated_at=now()
  where key='default' returning * into p;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
 values(p_actor,'hotel_occupant_policy_update','hotel_occupant_policy','default',
  jsonb_build_object('registerEffectiveFrom',old_register,'ageEffectiveFrom',old_age,'version',old_version),
  jsonb_build_object('registerEffectiveFrom',p.register_effective_from,'ageEffectiveFrom',p.age_effective_from,'reason',trim(p_reason),'version',p.version));
 return jsonb_build_object('registerEffectiveFrom',p.register_effective_from,
  'ageEffectiveFrom',p.age_effective_from,'minimumBookingAge',
  coalesce((current_operational_policy_snapshot()->>'minimumBookingAge')::integer,18),
  'hotelTimezone',coalesce(current_operational_policy_snapshot()->>'hotelTimezone','Asia/Manila'),'version',p.version);
end$$;

create or replace function public.hotel_party_read(p_reservation_id text,p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;p hotel_occupant_policy%rowtype;members jsonb;
begin
 perform hotel_actor(p_actor,array['front_desk','manager','owner']);
 select * into r from reservations where id=p_reservation_id;
 if not found then raise exception 'RESERVATION_NOT_FOUND';end if;
 select * into p from hotel_occupant_policy where key='default';
 select coalesce(jsonb_agg(jsonb_build_object(
  'occupantId',m.id,'guestId',m.guest_id,'name',m.full_name,'role',m.role,
  'occupantType',m.occupant_type,'dateOfBirth',m.date_of_birth,'nationality',m.nationality,
  'idVerified',m.id_verified,'ageVerified',m.age_verified_for_date=r.check_in,
  'attendanceStatus',case when exists(select 1 from reservation_occupant_presence x where x.occupant_id=m.id and x.departed_at is null) then 'present' else m.attendance_status end,
  'removedAt',m.removed_at)
  order by case when m.role='primary' then 0 else 1 end,m.full_name nulls last,m.id),'[]'::jsonb)
 into members from reservation_guests m where m.reservation_id=r.id and m.removed_at is null;
 return jsonb_build_object('version',r.party_version,'status',r.status,'capacity',
  least(r.guests,coalesce((select max_guests from room_types where name=r.room_type),r.guests)),
  'declaredCount',r.guests,'complete',r.party_completed_at is not null and (select count(*) from reservation_guests x where x.reservation_id=r.id and x.removed_at is null)=r.guests,
  'primaryGuestId',r.guest_id,'primaryGuestName',coalesce((select g.name from guests g where g.id=r.guest_id),r.guest_name),
  'members',members,'registerEffectiveFrom',p.register_effective_from,
  'ageEffectiveFrom',p.age_effective_from);
end$$;

create or replace function public.hotel_party_update(
 p_reservation_id text,p_members jsonb,p_expected_version integer,p_key uuid,p_actor uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;before_members jsonb;result jsonb;member jsonb;current_member reservation_guests%rowtype;roster jsonb;complete_register boolean;
 gid text;oid uuid;seen_ids uuid[]:='{}';seen_guests text[]:='{}';v_name text;v_role text;v_type text;v_dob date;v_nationality text;
begin
 perform hotel_actor(p_actor,array['front_desk']);
 result:=hotel_request_result(p_key,'party',p_reservation_id,p_actor,p_members);
 if result is not null then return result;end if;
 select * into r from reservations where id=p_reservation_id for update;
 if not found or r.status not in('confirmed','checked_in') then raise exception 'PARTY_NOT_EDITABLE';end if;
 if r.party_version<>p_expected_version then raise exception 'STALE_VERSION';end if;
 if jsonb_typeof(p_members)='array' then roster:=p_members;complete_register:=false;
 elsif jsonb_typeof(p_members)='object' and jsonb_typeof(p_members->'members')='array' then roster:=p_members->'members';complete_register:=coalesce((p_members->>'completeRegister')::boolean,false);
 else raise exception 'INVALID_PARTY';end if;
 if jsonb_array_length(roster)>least(r.guests,coalesce((select max_guests from room_types where name=r.room_type),r.guests)) then raise exception 'PARTY_CAPACITY';end if;
 if (select count(*) from jsonb_array_elements(roster) m where m->>'role'='primary')<>1 then raise exception 'PARTY_PRIMARY_REQUIRED';end if;
 if complete_register and jsonb_array_length(roster)<>r.guests then raise exception 'PARTY_REGISTER_COUNT_MISMATCH';end if;
 before_members:=hotel_party_read(r.id,p_actor);
 for member in select value from jsonb_array_elements(roster) loop
  if coalesce(member->>'role','') not in('primary','accompanying')
   or coalesce(member->>'occupantType','unknown') not in('adult','child','infant','unknown') then raise exception 'INVALID_PARTY';end if;
  oid:=nullif(member->>'occupantId','')::uuid;
  if oid is not null then
   select * into current_member from reservation_guests where id=oid and reservation_id=r.id and removed_at is null for update;
   if not found then raise exception 'OCCUPANT_NOT_FOUND';end if;
  else current_member:=null;end if;
  gid:=coalesce(nullif(member->>'guestId',''),current_member.guest_id);
  v_name:=coalesce(nullif(trim(member->>'name'),''),current_member.full_name,
   (select g.name from guests g where g.id=gid));
  v_role:=member->>'role';v_type:=coalesce(member->>'occupantType',current_member.occupant_type,'unknown');
  v_dob:=coalesce(nullif(member->>'dateOfBirth','')::date,current_member.date_of_birth);
  v_nationality:=coalesce(nullif(trim(member->>'nationality'),''),current_member.nationality,
   (select g.nationality from guests g where g.id=gid));
  if char_length(coalesce(v_name,'')) not between 2 and 160 then raise exception 'GUEST_NAME_REQUIRED';end if;
  if v_dob>(now() at time zone coalesce(current_operational_policy_snapshot()->>'hotelTimezone','Asia/Manila'))::date then raise exception 'INVALID_DATE_OF_BIRTH';end if;
  if v_role='primary' and gid is distinct from r.guest_id then raise exception 'PRIMARY_STAYING_GUEST_LOCKED';end if;
  if gid is not null then
   if not exists(select 1 from guests where id=gid) then raise exception 'GUEST_NOT_FOUND';end if;
   if gid=any(seen_guests) then raise exception 'DUPLICATE_PARTY_MEMBER';end if;
   seen_guests:=array_append(seen_guests,gid);
  end if;
  if oid is not null then
   if v_role is distinct from current_member.role then raise exception 'OCCUPANT_ROLE_LOCKED';end if;
   if r.status='checked_in' and current_member.attendance_status in('present','unknown')
    and (current_member.guest_id is distinct from gid or current_member.full_name is distinct from v_name
      or current_member.date_of_birth is distinct from v_dob) then raise exception 'OCCUPANT_ATTENDANCE_REVIEW';end if;
   update reservation_guests set guest_id=gid,full_name=v_name,occupant_type=v_type,
    date_of_birth=v_dob,nationality=v_nationality,
    id_verified=case when current_member.guest_id is distinct from gid or current_member.full_name is distinct from v_name or current_member.date_of_birth is distinct from v_dob then false else id_verified end,
    id_verified_by=case when current_member.guest_id is distinct from gid or current_member.full_name is distinct from v_name or current_member.date_of_birth is distinct from v_dob then null else id_verified_by end,
    id_verified_at=case when current_member.guest_id is distinct from gid or current_member.full_name is distinct from v_name or current_member.date_of_birth is distinct from v_dob then null else id_verified_at end,
    age_verified_by=case when current_member.guest_id is distinct from gid or current_member.date_of_birth is distinct from v_dob or current_member.full_name is distinct from v_name then null else age_verified_by end,
    age_verified_at=case when current_member.guest_id is distinct from gid or current_member.date_of_birth is distinct from v_dob or current_member.full_name is distinct from v_name then null else age_verified_at end,
    age_verified_for_date=case when current_member.guest_id is distinct from gid or current_member.date_of_birth is distinct from v_dob or current_member.full_name is distinct from v_name then null else age_verified_for_date end,
    verified_age_years=case when current_member.guest_id is distinct from gid or current_member.date_of_birth is distinct from v_dob or current_member.full_name is distinct from v_name then null else verified_age_years end,
    updated_at=now() where id=oid;
   seen_ids:=array_append(seen_ids,oid);
  else
   insert into reservation_guests(reservation_id,guest_id,role,full_name,occupant_type,date_of_birth,nationality,added_by,attendance_status)
   values(r.id,gid,v_role,v_name,v_type,v_dob,v_nationality,p_actor,'expected') returning id into oid;
   seen_ids:=array_append(seen_ids,oid);
  end if;
 end loop;
 if exists(select 1 from reservation_guests m where m.reservation_id=r.id and m.removed_at is null
   and not(m.id=any(seen_ids)) and (m.attendance_status in('present','unknown') or exists(
    select 1 from reservation_occupant_presence ep where ep.occupant_id=m.id and ep.departed_at is null))) then
  raise exception 'OCCUPANT_PRESENT';
 end if;
 update reservation_guests set removed_at=now(),removed_by=p_actor,updated_at=now()
  where reservation_id=r.id and removed_at is null and not(id=any(seen_ids));
 if not exists(select 1 from reservation_guests where reservation_id=r.id and role='primary'
    and guest_id is not distinct from r.guest_id and removed_at is null) then raise exception 'PARTY_PRIMARY_REQUIRED';end if;
 if complete_register then
  update reservations set party_version=party_version+1,party_completed_at=now(),party_completed_by=p_actor where id=r.id;
 else
  update reservations set party_version=party_version+1,party_completed_at=null,party_completed_by=null where id=r.id;
 end if;
 result:=hotel_party_read(r.id,p_actor);
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
 values(p_actor,'reservation_party_update','reservation',r.id,before_members,result);
 insert into hotel_operation_requests values(p_key,'party',r.id,p_actor,p_members,result,now());
 return result;
end$$;

create or replace function public.hotel_occupant_verify(
 p_reservation_id text,p_occupant_id uuid,p_date_of_birth date,p_verified_age_years integer,p_nationality text,p_key uuid,p_evidence text,p_actor uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;m reservation_guests%rowtype;result jsonb;age_years integer;age_date date;payload jsonb;
begin
 perform hotel_actor(p_actor,array['front_desk']);
 payload:=jsonb_build_object('reservationId',p_reservation_id,'dateOfBirth',p_date_of_birth,'verifiedAgeYears',p_verified_age_years,'nationality',p_nationality);
 result:=hotel_request_result(p_key,'occupant_verify',p_occupant_id::text,p_actor,payload);
 if result is not null then return result;end if;
 select * into r from reservations where id=p_reservation_id for update;
 if not found or r.status not in('confirmed','checked_in') then raise exception 'PARTY_NOT_EDITABLE';end if;
 select * into m from reservation_guests where id=p_occupant_id and reservation_id=r.id and removed_at is null for update;
 if not found then raise exception 'OCCUPANT_NOT_FOUND';end if;
 if p_date_of_birth is not null and p_date_of_birth>(now() at time zone coalesce(current_operational_policy_snapshot()->>'hotelTimezone','Asia/Manila'))::date then raise exception 'INVALID_DATE_OF_BIRTH';end if;
 if p_verified_age_years is not null and p_verified_age_years not between 0 and 120 then raise exception 'INVALID_VERIFIED_AGE';end if;
 if nullif(trim(p_evidence),'') is null or char_length(trim(p_evidence))>500 then raise exception 'VERIFICATION_EVIDENCE_REQUIRED';end if;
 age_date:=r.check_in;
 if (p_date_of_birth is null)=(p_verified_age_years is null) then raise exception 'AGE_EVIDENCE_INVALID';end if;
 if p_date_of_birth is not null and p_date_of_birth>age_date then raise exception 'INVALID_DATE_OF_BIRTH';end if;
 age_years:=case when p_date_of_birth is not null then extract(year from age(age_date,p_date_of_birth))::integer else p_verified_age_years end;
 update reservation_guests set date_of_birth=coalesce(p_date_of_birth,date_of_birth),
  nationality=coalesce(nullif(trim(p_nationality),''),nationality),
  id_verified=true,id_verified_by=p_actor,id_verified_at=now(),
  age_verified_by=case when age_years is null then null else p_actor end,
  age_verified_at=case when age_years is null then null else now() end,
  age_verified_for_date=case when age_years is null then null else age_date end,
  verified_age_years=age_years,updated_at=now() where id=m.id;
 update reservations set party_version=party_version+1 where id=r.id;
 result:=jsonb_build_object('occupantId',m.id,'idVerified',true,'ageVerified',age_years is not null,
  'referenceDate',case when age_years is null then null else age_date end);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
 values(p_actor,'reservation_occupant_verify','reservation_occupant',m.id::text,
  jsonb_build_object('reservationId',r.id,'idVerified',true,'ageVerified',age_years is not null,
   'referenceDate',case when age_years is null then null else age_date end,
   'evidence',trim(p_evidence)));
 insert into hotel_operation_requests values(p_key,'occupant_verify',p_occupant_id::text,p_actor,payload,result,now());
 return result;
end$$;

create or replace function public.hotel_occupant_presence_update(
 p_reservation_id text,p_occupant_id uuid,p_action text,p_version integer,p_key uuid,p_actor uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;m reservation_guests%rowtype;result jsonb;before_status text;
begin
 perform hotel_actor(p_actor,array['front_desk']);
 if p_action not in('arrive','depart') then raise exception 'INVALID_PRESENCE_ACTION';end if;
 result:=hotel_request_result(p_key,'occupant_presence',p_occupant_id::text,p_actor,jsonb_build_object('action',p_action,'reservationId',p_reservation_id,'version',p_version));
 if result is not null then return result;end if;
 select * into r from reservations where id=p_reservation_id for update;
 select * into m from reservation_guests where id=p_occupant_id and reservation_id=r.id and removed_at is null for update;
 if not found or r.status<>'checked_in' then raise exception 'OCCUPANT_NOT_PRESENT';end if;
 if r.party_version<>p_version then raise exception 'STALE_VERSION';end if;
 before_status:=case when exists(select 1 from reservation_occupant_presence where occupant_id=m.id and departed_at is null) then 'present' else m.attendance_status end;
 if p_action='arrive' then
  if before_status='present' then raise exception 'OCCUPANT_ALREADY_PRESENT';end if;
  insert into reservation_occupant_presence(occupant_id,arrived_at,arrived_by) values(m.id,now(),p_actor);
  update reservation_guests set attendance_status='present',updated_at=now() where id=m.id;
 else
  update reservation_occupant_presence set departed_at=now(),departed_by=p_actor
   where occupant_id=m.id and departed_at is null;
  if not found and m.attendance_status<>'unknown' then raise exception 'OCCUPANT_NOT_PRESENT';end if;
  update reservation_guests set attendance_status='departed',updated_at=now() where id=m.id;
 end if;
 update reservations set party_version=party_version+1 where id=r.id;
 result:=jsonb_build_object('occupantId',m.id,'attendanceStatus',case when p_action='arrive' then 'present' else 'departed' end,'version',r.party_version+1);
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
 values(p_actor,'reservation_occupant_'||p_action,'reservation_occupant',m.id::text,
  jsonb_build_object('reservationId',r.id,'attendanceStatus',before_status),result);
 insert into hotel_operation_requests values(p_key,'occupant_presence',p_occupant_id::text,p_actor,
  jsonb_build_object('action',p_action,'reservationId',p_reservation_id,'version',p_version),result,now());
 return result;
end$$;

create or replace function public.hotel_occupants_in_house(p_actor uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
 perform hotel_actor(p_actor,array['front_desk','manager','owner']);
 select coalesce(jsonb_agg(jsonb_build_object('reservationId',r.id,'confirmationNumber',r.confirmation_number,
  'roomId',a.room_id,'roomNumber',room.number,'checkIn',r.check_in,'checkOut',r.check_out,
  'declaredCount',r.guests,'registeredCount',party.registered_count,'registerComplete',r.party_completed_at is not null,
  'occupants',party.members) order by room.number,r.id),'[]'::jsonb) into result
 from reservations r
  left join lateral(select x.room_id from reservation_room_assignments x where x.reservation_id=r.id and x.status='active' order by x.assigned_at desc limit 1)a on true
 left join rooms room on room.id=a.room_id
 join lateral(
  select count(*)::integer registered_count,coalesce(jsonb_agg(jsonb_build_object('name',m.full_name,'type',m.occupant_type,
   'status',case when exists(select 1 from reservation_occupant_presence ep where ep.occupant_id=m.id and ep.departed_at is null) then 'present' else m.attendance_status end)
   order by case when m.role='primary' then 0 else 1 end,m.full_name),'[]'::jsonb) members
  from reservation_guests m where m.reservation_id=r.id and m.removed_at is null
 ) party on true
 where r.status='checked_in';
 return jsonb_build_object('assessedAt',now(),'items',result);
end$$;

create or replace function public.hotel_occupant_checkin_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare p hotel_occupant_policy%rowtype;minimum_age integer;primary_member reservation_guests%rowtype;
begin
 if new.status is distinct from 'checked_in' or old.status='checked_in' then return new;end if;
 select * into p from hotel_occupant_policy where key='default' for share;
 if p.register_effective_from is not null and new.check_in>=p.register_effective_from then
  if new.party_completed_at is null or (select count(*) from reservation_guests where reservation_id=new.id and removed_at is null)<>new.guests then raise exception 'OCCUPANT_REGISTER_REQUIRED';end if;
  if (select count(*) from reservation_guests where reservation_id=new.id and role='primary' and guest_id is not distinct from new.guest_id and removed_at is null)<>1 then raise exception 'PARTY_PRIMARY_REQUIRED';end if;
 end if;
 if p.age_effective_from is not null and new.check_in>=p.age_effective_from then
  select * into primary_member from reservation_guests where reservation_id=new.id and role='primary' and removed_at is null for update;
  if not found then raise exception 'PARTY_PRIMARY_REQUIRED';end if;
  minimum_age:=coalesce((current_operational_policy_snapshot()->>'minimumBookingAge')::integer,18);
  if primary_member.age_verified_for_date is distinct from new.check_in or primary_member.verified_age_years is null then raise exception 'PRIMARY_AGE_UNVERIFIED';end if;
  if primary_member.verified_age_years<minimum_age then raise exception 'PRIMARY_UNDER_MINIMUM_AGE';end if;
 end if;
 return new;
end$$;
create trigger hotel_occupant_checkin_guard before update of status on public.reservations
 for each row when(new.status='checked_in') execute function public.hotel_occupant_checkin_guard();

create function public.hotel_occupant_primary_arrival()
returns trigger language plpgsql security definer set search_path=public as $$
declare m reservation_guests%rowtype;
begin
 if old.status is distinct from 'checked_in' and new.status='checked_in' then
  select * into m from reservation_guests where reservation_id=new.id and role='primary' and removed_at is null for update;
  if found and not exists(select 1 from reservation_occupant_presence where occupant_id=m.id and departed_at is null) then
   insert into reservation_occupant_presence(occupant_id,arrived_at) values(m.id,now());
   update reservation_guests set attendance_status='present',updated_at=now() where id=m.id;
  end if;
 end if;
 return new;
end$$;
create trigger hotel_occupant_primary_arrival after update of status on public.reservations
 for each row when(new.status='checked_in') execute function public.hotel_occupant_primary_arrival();

create function public.hotel_occupant_checkout_departure()
returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.status is distinct from 'checked_out' and new.status='checked_out' then
  update reservation_occupant_presence ep set departed_at=now()
   from reservation_guests m where m.id=ep.occupant_id and m.reservation_id=new.id and ep.departed_at is null;
  update reservation_guests set attendance_status='departed',updated_at=now()
   where reservation_id=new.id and removed_at is null;
 end if;
 return new;
end$$;
create trigger hotel_occupant_checkout_departure after update of status on public.reservations
 for each row when(new.status='checked_out') execute function public.hotel_occupant_checkout_departure();

-- Enrich the existing read-only readiness assessment; the check-in trigger remains final authority.
do $$
declare body text;old_clause text:='if r.status<>''confirmed'' then ci:=array_append(ci,''CONFIRMED_STAY_REQUIRED'');end if;';
begin
 select pg_get_functiondef('public.hotel_reservation_readiness(text,uuid,text)'::regprocedure) into body;
 if position(old_clause in body)=0 then raise exception 'READINESS_BODY_UNEXPECTED';end if;
 body:=replace(body,old_clause,old_clause||
 'if exists(select 1 from hotel_occupant_policy p where p.key=''default'' and p.register_effective_from is not null and r.check_in>=p.register_effective_from and (r.party_completed_at is null or (select count(*) from reservation_guests m where m.reservation_id=r.id and m.removed_at is null)<>r.guests)) then ci:=array_append(ci,''OCCUPANT_REGISTER_REQUIRED'');end if;'||
 'if exists(select 1 from hotel_occupant_policy p where p.key=''default'' and p.age_effective_from is not null and r.check_in>=p.age_effective_from) then if exists(select 1 from reservation_guests m where m.reservation_id=r.id and m.role=''primary'' and m.removed_at is null and m.age_verified_for_date=r.check_in and m.verified_age_years<coalesce((current_operational_policy_snapshot()->>''minimumBookingAge'')::integer,18)) then ci:=array_append(ci,''PRIMARY_UNDER_MINIMUM_AGE'');elsif not exists(select 1 from reservation_guests m where m.reservation_id=r.id and m.role=''primary'' and m.removed_at is null and m.age_verified_for_date=r.check_in and m.verified_age_years is not null) then ci:=array_append(ci,''PRIMARY_AGE_UNVERIFIED'');end if;end if;');
 execute body;
end$$;

do $$declare name text;fn record;begin
 foreach name in array array['reservation_guests','reservation_occupant_presence','hotel_occupant_policy'] loop
  execute format('alter table public.%I enable row level security',name);
  execute format('revoke all on public.%I from public,anon,authenticated',name);
  execute format('grant all on public.%I to service_role',name);
 end loop;
 for fn in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('hotel_party_read','hotel_party_update','hotel_occupant_policy_read',
   'hotel_occupant_policy_update','hotel_occupant_verify','hotel_occupant_presence_update','hotel_occupants_in_house',
   'hotel_occupant_checkin_guard','hotel_occupant_primary_arrival','hotel_occupant_checkout_departure') loop
  execute format('revoke all on function %s from public,anon,authenticated',fn.signature);
  execute format('grant execute on function %s to service_role',fn.signature);
 end loop;
end$$;
commit;
