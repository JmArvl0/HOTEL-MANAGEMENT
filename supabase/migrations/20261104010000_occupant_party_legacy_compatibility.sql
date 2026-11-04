-- Preserve ID-only party updates after the occupant-register extension.
-- Live ledger read 2026-11-04: last remote 20261103150000; local pending through
-- 20261103210000. Additive replacement; no hosted write or historical backfill.
begin;

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
  else
   -- Legacy callers identify linked guests rather than stable occupant rows.
   -- Resolve only an exact CRM ID on this stay; never match names or revive
   -- removed occupants. Explicit occupant IDs still use the strict path above.
   select * into current_member from reservation_guests
    where reservation_id=r.id and guest_id=nullif(member->>'guestId','')
     and removed_at is null for update;
   oid:=current_member.id;
  end if;
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

revoke all on function public.hotel_party_update(text,jsonb,integer,uuid,uuid) from public,anon,authenticated;
grant execute on function public.hotel_party_update(text,jsonb,integer,uuid,uuid) to service_role;

commit;
