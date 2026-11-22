-- Keep the existing audited activation dates. Age eligibility is tied to
-- both the reservation's current primary guest and its local arrival date.
create function public.hotel_primary_age_issue(
  p_reservation_id text, p_guest_id text, p_check_in date
) returns text
language sql stable set search_path = public
as $$
  select case
    when not exists (
      select 1 from hotel_occupant_policy
      where key = 'default' and age_effective_from <= p_check_in
    ) then null
    when m.id is null then 'PARTY_PRIMARY_REQUIRED'
    when m.id_verified is not true or m.age_verified_for_date is distinct from p_check_in
      or m.verified_age_years is null then 'PRIMARY_AGE_UNVERIFIED'
    when m.verified_age_years < coalesce((current_operational_policy_snapshot()->>'minimumBookingAge')::integer, 18)
      then 'PRIMARY_UNDER_MINIMUM_AGE'
  end
  from (select 1) as arrival
  left join reservation_guests m on m.reservation_id = p_reservation_id
    and m.guest_id = p_guest_id and m.role = 'primary' and m.removed_at is null;
$$;

revoke all on function public.hotel_primary_age_issue(text, text, date) from public, anon, authenticated;

create or replace function public.hotel_occupant_checkin_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  policy hotel_occupant_policy%rowtype;
  age_issue text;
begin
  if new.status is distinct from 'checked_in' or old.status = 'checked_in' then
    return new;
  end if;

  select * into policy from hotel_occupant_policy where key = 'default' for share;
  if policy.register_effective_from <= new.check_in then
    if new.party_completed_at is null or (
      select count(*) from reservation_guests where reservation_id = new.id and removed_at is null
    ) <> new.guests then
      raise exception 'OCCUPANT_REGISTER_REQUIRED';
    end if;
    if not exists (
      select 1 from reservation_guests where reservation_id = new.id
        and role = 'primary' and guest_id is not distinct from new.guest_id and removed_at is null
    ) then
      raise exception 'PARTY_PRIMARY_REQUIRED';
    end if;
  end if;

  age_issue := hotel_primary_age_issue(new.id, new.guest_id, new.check_in);
  if age_issue is not null then raise exception '%', age_issue; end if;
  return new;
end;
$$;

-- Use the same test in readiness without replacing its other supervised checks.
do $$
declare
  body text := pg_get_functiondef('public.hotel_reservation_readiness(text,uuid,text)'::regprocedure);
  original text := $old$if exists(select 1 from hotel_occupant_policy p where p.key='default' and p.age_effective_from is not null and r.check_in>=p.age_effective_from) then if exists(select 1 from reservation_guests m where m.reservation_id=r.id and m.role='primary' and m.removed_at is null and m.age_verified_for_date=r.check_in and m.verified_age_years<coalesce((current_operational_policy_snapshot()->>'minimumBookingAge')::integer,18)) then ci:=array_append(ci,'PRIMARY_UNDER_MINIMUM_AGE');elsif not exists(select 1 from reservation_guests m where m.reservation_id=r.id and m.role='primary' and m.removed_at is null and m.age_verified_for_date=r.check_in and m.verified_age_years is not null) then ci:=array_append(ci,'PRIMARY_AGE_UNVERIFIED');end if;end if;$old$;
begin
  if strpos(body, original) = 0 then raise exception 'READINESS_AGE_CHECK_UNEXPECTED'; end if;
  execute replace(body, original, 'ci:=ci||array_remove(array[hotel_primary_age_issue(r.id,r.guest_id,r.check_in)],null);');
end;
$$;

-- The roster only needs verification state. In particular, party updates use
-- this same read model for their audit snapshots.
do $$
declare
  body text := pg_get_functiondef('public.hotel_party_read(text,uuid)'::regprocedure);
  dob text := $old$'dateOfBirth',m.date_of_birth,$old$;
  tail text := $old$'ageEffectiveFrom',p.age_effective_from);$old$;
begin
  if strpos(body, dob) = 0 or strpos(body, tail) = 0 then raise exception 'PARTY_READ_BODY_UNEXPECTED'; end if;
  body := replace(body, dob, '');
  execute replace(body, tail, $new$'ageEffectiveFrom',p.age_effective_from,
    'checkInDate',r.check_in,'hotelDate',hotel_today(),
    'minimumBookingAge',coalesce((current_operational_policy_snapshot()->>'minimumBookingAge')::integer,18),
    'primaryAgeIssue',hotel_primary_age_issue(r.id,r.guest_id,r.check_in));$new$);
end;
$$;

-- Rebinding a stale primary occupant may preserve the occupant row, never
-- the previous guest's DOB or verification.
do $$
declare
  body text := pg_get_functiondef('public.hotel_party_update(text,jsonb,integer,uuid,uuid)'::regprocedure);
  original text := $old$v_dob:=coalesce(nullif(member->>'dateOfBirth','')::date,current_member.date_of_birth);$old$;
begin
  if strpos(body, original) = 0 then raise exception 'PARTY_DOB_BODY_UNEXPECTED'; end if;
  execute replace(body, original, $new$v_dob:=case
    when current_member.id is not null and current_member.guest_id is distinct from gid then null
    else coalesce(nullif(member->>'dateOfBirth','')::date,current_member.date_of_birth)
  end;$new$);
end;
$$;

-- Check the form's arrival and roster under the same reservation lock as the
-- existing verification write. A lost response can still be retried safely.
create function public.hotel_occupant_verify_arrival(
  p_reservation_id text, p_occupant_id uuid, p_date_of_birth date,
  p_verified_age_years integer, p_nationality text, p_key uuid,
  p_expected_check_in date, p_expected_version integer, p_actor uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r reservations%rowtype;
  m reservation_guests%rowtype;
  prior jsonb;
begin
  perform hotel_actor(p_actor, array['front_desk']);
  select * into r from reservations where id = p_reservation_id for update;
  if not found or r.status not in ('confirmed','checked_in') then raise exception 'PARTY_NOT_EDITABLE'; end if;
  if r.check_in is distinct from p_expected_check_in then raise exception 'AGE_ARRIVAL_DATE_CHANGED'; end if;

  select * into m from reservation_guests where id = p_occupant_id
    and reservation_id = r.id and removed_at is null for update;
  if not found then raise exception 'OCCUPANT_NOT_FOUND'; end if;
  if m.role = 'primary' and (r.guest_id is null or m.guest_id is distinct from r.guest_id) then
    raise exception 'PARTY_PRIMARY_REQUIRED';
  end if;

  prior := hotel_request_result(p_key, 'occupant_verify', p_occupant_id::text, p_actor,
    jsonb_build_object('reservationId',r.id,'dateOfBirth',p_date_of_birth,
      'verifiedAgeYears',p_verified_age_years,'nationality',p_nationality));
  if prior is not null then
    if prior->>'referenceDate' is distinct from r.check_in::text then raise exception 'AGE_ARRIVAL_DATE_CHANGED'; end if;
    return prior;
  end if;
  if r.party_version is distinct from p_expected_version then raise exception 'STALE_VERSION'; end if;
  return hotel_occupant_verify(r.id, m.id, p_date_of_birth, p_verified_age_years, p_nationality,
    p_key, 'Government-issued ID visually inspected in person', p_actor);
end;
$$;

revoke all on function public.hotel_occupant_verify_arrival(text, uuid, date, integer, text, uuid, date, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.hotel_occupant_verify_arrival(text, uuid, date, integer, text, uuid, date, integer, uuid)
  to service_role;

-- Current reservation tokens have no fixed expiry. Respect explicit expiry
-- on older or time-limited tokens, and serialize a valid scan with revocation.
do $$
declare
  body text := pg_get_functiondef('public.express_qr_self_check_in(text,uuid)'::regprocedure);
  original text := 'and revoked_at is null;';
begin
  if strpos(body, original) = 0 then raise exception 'EXPRESS_QR_LOOKUP_UNEXPECTED'; end if;
  execute replace(body, original, $new$and purpose = 'check_in' and revoked_at is null
      and (expires_at is null or expires_at > now()) for share;$new$);
end;
$$;
