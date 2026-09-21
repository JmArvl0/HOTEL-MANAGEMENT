-- Defense-in-depth validation for direct service-role callers.
-- The HTTP route already validates these inputs; the database must do so independently.

create or replace function public.admin_convert_guest_to_staff(
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
  token_id uuid;
begin
  select role into actor from user_accounts
    where id=p_actor_user_id and active and not recovery_required;
  if actor is null or actor not in('owner','admin') then
    raise exception 'ADMIN_AUTHORITY_REQUIRED';
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

  allowed:=case when actor='owner'
    then p_role in('owner','admin','manager','front_desk','housekeeping','maintenance','accounting')
    else p_role in('manager','front_desk','housekeeping','maintenance','accounting')
  end;
  if not coalesce(allowed,false) then raise exception 'PROTECTED_ROLE_FORBIDDEN'; end if;
  if char_length(coalesce(p_department,''))>80 or char_length(coalesce(p_employee_reference,''))>80
    or char_length(p_reason)>500 then raise exception 'INVALID_STAFF_ACCOUNT'; end if;

  -- A current staff identity must never become the owner of historical guest
  -- reservations or finance records. Any hold or reservation is a conflict;
  -- dependent payments, invoices, and refunds are therefore covered too.
  if exists(select 1 from booking_holds where user_id=t.id)
    or exists(select 1 from reservations where user_id=t.id)
    or exists(
      select 1 from reservations r
      join guests g on g.id=r.guest_id
      where g.user_account_id=t.id)
  then raise exception 'GUEST_BUSINESS_HISTORY_CONFLICT'; end if;

  if exists(select 1 from staff where user_id=t.id) then
    raise exception 'STAFF_RECORD_EXISTS';
  end if;

  v_department:=coalesce(nullif(trim(p_department),''),case p_role
    when 'owner' then 'Executive'
    when 'admin' then 'System Administration'
    when 'manager' then 'Management'
    when 'front_desk' then 'Front Desk'
    else initcap(replace(p_role,'_',' ')) end);

  insert into staff(user_id,name,role,department,status)
    values(t.id,t.name,p_role,v_department,'off_duty');

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
    'admin_convert_guest_to_staff',
    'user_account',
    t.id::text,
    jsonb_build_object('role',t.role,'active',t.active,'status',t.account_status,'authVersion',t.auth_version),
    jsonb_build_object('role',p_role,'active',false,'status','inactive','recoveryRequired',true,
      'department',v_department,'reason',trim(p_reason),'authVersion',t.auth_version+1)
  );

  return jsonb_build_object('id',t.id,'email',t.email,'role',p_role,
    'status','inactive','recoveryRequired',true,'version',t.auth_version+1,
    'recoveryTokenId',token_id);
end$$;
