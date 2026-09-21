-- History-carrying guest-to-staff conversion (Option C, D-024).
--
-- The base converter (20261012010000 + ...02 hardening) refuses any guest
-- with booking holds or reservations, which is the correct default: a staff
-- identity must not silently inherit live guest history. This migration adds
-- a SEPARATE, owner-only path for the explicitly authorized case where the
-- business accepts carrying that history (test-account onboarding).
--
-- What this path does differently:
--   * actor must be an active, non-recovery owner (admin actors are refused);
--   * the history check is replaced by a history census recorded in audit;
--   * the staff mirror is flagged converted_with_guest_history (hook for
--     future segregation-of-duties guards; no behavior change now).
-- Everything else is identical to the base converter: exact ID+email match,
-- version check, staff-mirror creation, recovery onboarding with sentinel
-- password, session/OTP invalidation, version bump, full audit. No
-- reservation, hold, payment, refund, notification, or audit row is inserted,
-- updated, or deleted here — history is carried, never rewritten.
-- The base converter and the generic role RPC are untouched.

alter table public.staff
  add column if not exists converted_with_guest_history boolean not null default false;

create or replace function public.admin_convert_guest_to_staff_with_history(
  p_target_user_id uuid,
  p_expected_email text,
  p_role text,
  p_department text,
  p_employee_reference text,
  p_reason text,
  p_expected_version integer,
  p_token_hash text,
  p_expires_at timestamptz,
  p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  actor text;
  t user_accounts%rowtype;
  allowed boolean;
  v_department text;
  v_holds integer;
  v_reservations integer;
  token_id uuid;
begin
  select role into actor from user_accounts
    where id=p_actor_user_id and active and not recovery_required;
  if actor is null or actor<>'owner' then
    raise exception 'OWNER_AUTHORITY_REQUIRED';
  end if;

  select * into t from user_accounts where id=p_target_user_id for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  if nullif(trim(p_expected_email),'') is null
    or lower(t.email)<>lower(trim(p_expected_email)) then
    raise exception 'ACCOUNT_IDENTITY_MISMATCH';
  end if;
  if p_expected_version is null or t.auth_version<>p_expected_version then raise exception 'ACCOUNT_STALE'; end if;
  if t.id=p_actor_user_id then raise exception 'SELF_ROLE_CHANGE_FORBIDDEN'; end if;
  if t.role<>'guest' then raise exception 'ACCOUNT_NOT_GUEST'; end if;
  if nullif(trim(p_reason),'') is null then raise exception 'ROLE_CHANGE_REASON_REQUIRED'; end if;
  if nullif(trim(p_token_hash),'') is null or length(p_token_hash)<32 or p_expires_at<=now() then
    raise exception 'INVALID_RECOVERY_REQUEST';
  end if;

  allowed:=p_role in('owner','admin','manager','front_desk','housekeeping','maintenance','accounting');
  if not coalesce(allowed,false) then raise exception 'PROTECTED_ROLE_FORBIDDEN'; end if;
  if char_length(coalesce(p_department,''))>80 or char_length(coalesce(p_employee_reference,''))>80
    or char_length(p_reason)>500 then raise exception 'INVALID_STAFF_ACCOUNT'; end if;

  if exists(select 1 from staff where user_id=t.id) then
    raise exception 'STAFF_RECORD_EXISTS';
  end if;

  -- Census, not gate: the carried history is recorded in audit so reviewers
  -- can see exactly what moved with the identity. Nothing is modified.
  select count(*) into v_holds from booking_holds where user_id=t.id;
  select count(*) into v_reservations from reservations r
    where r.user_id=t.id
    or exists(select 1 from guests g where g.id=r.guest_id and g.user_account_id=t.id);

  v_department:=coalesce(nullif(trim(p_department),''),case p_role
    when 'owner' then 'Executive'
    when 'admin' then 'System Administration'
    when 'manager' then 'Management'
    when 'front_desk' then 'Front Desk'
    else initcap(replace(p_role,'_',' ')) end);

  insert into staff(user_id,name,role,department,status,converted_with_guest_history)
    values(t.id,t.name,p_role,v_department,'off_duty',true);

  update account_recovery_tokens set used_at=now()
    where user_id=t.id and used_at is null;
  update auth_otp_challenges set invalidated_at=now()
    where user_id=t.id and consumed_at is null and invalidated_at is null;

  insert into account_recovery_tokens(user_id,token_hash,created_by,expires_at)
    values(t.id,p_token_hash,p_actor_user_id,p_expires_at)
    returning id into token_id;

  update user_accounts set
    role=p_role,
    password_hash='recovery-required',
    active=false,
    account_status='inactive',
    recovery_required=true,
    department=v_department,
    employee_reference=nullif(trim(p_employee_reference),''),
    auth_version=auth_version+1,
    updated_at=now()
  where id=t.id;

  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(
    p_actor_user_id,
    'admin_convert_guest_to_staff_with_history',
    'user_account',
    t.id::text,
    jsonb_build_object('role',t.role,'active',t.active,'status',t.account_status,'authVersion',t.auth_version),
    jsonb_build_object('role',p_role,'active',false,'status','inactive','recoveryRequired',true,
      'department',v_department,'reason',trim(p_reason),'authVersion',t.auth_version+1,
      'convertedWithHistory',true,'holdsCarried',v_holds,'reservationsCarried',v_reservations)
  );

  return jsonb_build_object('id',t.id,'email',t.email,'role',p_role,
    'status','inactive','recoveryRequired',true,'version',t.auth_version+1,
    'convertedWithHistory',true,'recoveryTokenId',token_id);
end$$;

revoke all on function public.admin_convert_guest_to_staff_with_history(uuid,text,text,text,text,text,integer,text,timestamptz,uuid) from public,anon,authenticated;
grant execute on function public.admin_convert_guest_to_staff_with_history(uuid,text,text,text,text,text,integer,text,timestamptz,uuid) to service_role;
