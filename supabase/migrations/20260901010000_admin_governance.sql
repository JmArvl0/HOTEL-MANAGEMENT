-- PROVISIONAL ADMIN GOVERNANCE BASELINE
-- Additive extensions to HAVEN's existing user, staff, room, room-type, policy and audit systems.

alter table public.user_accounts add column if not exists phone text;
alter table public.user_accounts add column if not exists department text;
alter table public.user_accounts add column if not exists employee_reference text;
alter table public.user_accounts add column if not exists account_status text;
alter table public.user_accounts add column if not exists auth_version integer not null default 1;
alter table public.user_accounts add column if not exists recovery_required boolean not null default false;
alter table public.user_accounts add column if not exists creation_idempotency_key uuid;
alter table public.user_accounts add column if not exists updated_at timestamptz not null default now();
update public.user_accounts set account_status=case when active then'active'else'inactive'end where account_status is null;
alter table public.user_accounts alter column account_status set default 'active';
alter table public.user_accounts alter column account_status set not null;
do $$begin alter table public.user_accounts add constraint user_accounts_status_check check(account_status in('active','inactive','suspended'));exception when duplicate_object then null;end$$;
do $$begin alter table public.user_accounts add constraint user_accounts_auth_version_check check(auth_version>0);exception when duplicate_object then null;end$$;
create unique index if not exists user_accounts_employee_reference_unique on public.user_accounts(employee_reference)where employee_reference is not null;
create unique index if not exists user_accounts_creation_idempotency_unique on public.user_accounts(creation_idempotency_key)where creation_idempotency_key is not null;
create index if not exists user_accounts_governance_idx on public.user_accounts(role,account_status,created_at);

create or replace function public.sync_user_account_lifecycle()returns trigger language plpgsql set search_path=public as $$begin
 if tg_op='INSERT'and not new.active then new.account_status:='inactive';
 elsif tg_op='UPDATE'and new.active is distinct from old.active and new.account_status=old.account_status then new.account_status:=case when new.active then'active'else'inactive'end;end if;
 new.active:=new.account_status='active';new.updated_at:=now();return new;
end$$;
create trigger user_account_lifecycle_sync before insert or update of active,account_status on public.user_accounts for each row execute function public.sync_user_account_lifecycle();

create table if not exists public.account_recovery_tokens(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.user_accounts(id)on delete restrict,
 token_hash text not null unique,created_by uuid references public.user_accounts(id)on delete set null,
 expires_at timestamptz not null,used_at timestamptz,created_at timestamptz not null default now(),
 check(expires_at>created_at)
);
create index if not exists account_recovery_active_idx on public.account_recovery_tokens(user_id,expires_at)where used_at is null;
alter table public.account_recovery_tokens enable row level security;

alter table public.rooms add column if not exists administratively_active boolean not null default true;
alter table public.rooms add column if not exists wing text;
alter table public.rooms add column if not exists administrative_designation text;
alter table public.rooms add column if not exists configuration_version integer not null default 1;
alter table public.rooms add column if not exists updated_at timestamptz not null default now();
do $$begin alter table public.rooms add constraint rooms_configuration_version_check check(configuration_version>0);exception when duplicate_object then null;end$$;

alter table public.room_types add column if not exists version integer not null default 1;
alter table public.room_types add column if not exists updated_at timestamptz not null default now();
do $$begin alter table public.room_types add constraint room_types_version_check check(version>0);exception when duplicate_object then null;end$$;

alter table public.hotel_operational_policies add column if not exists version integer not null default 1;
do $$begin alter table public.hotel_operational_policies add constraint hotel_policy_version_check check(version>0);exception when duplicate_object then null;end$$;

create or replace function public.admin_create_staff(p_name text,p_email text,p_phone text,p_department text,p_employee_reference text,p_role text,p_reason text,p_idempotency_key uuid,p_actor_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor text;uid uuid;allowed boolean;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;
 if actor is null or actor not in('owner','admin')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;
 allowed:=case when actor='owner'then p_role in('owner','admin','manager','front_desk','housekeeping','maintenance','accounting')else p_role in('manager','front_desk','housekeeping','maintenance','accounting')end;
 if not allowed then raise exception'PROTECTED_ROLE_FORBIDDEN';end if;
 if nullif(trim(p_name),'')is null or nullif(trim(p_email),'')is null or nullif(trim(p_reason),'')is null then raise exception'INVALID_STAFF_ACCOUNT';end if;
 insert into user_accounts(email,name,role,password_hash,active,account_status,recovery_required,phone,department,employee_reference,creation_idempotency_key)
 values(lower(trim(p_email)),trim(p_name),p_role,'recovery-required',false,'inactive',true,nullif(trim(p_phone),''),nullif(trim(p_department),''),nullif(trim(p_employee_reference),''),p_idempotency_key)returning id into uid;
 insert into staff(user_id,name,role,department,status)values(uid,trim(p_name),p_role,nullif(trim(p_department),''),'off_duty');
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_actor_user_id,'admin_create_staff','user_account',uid::text,jsonb_build_object('email',lower(trim(p_email)),'role',p_role,'reason',trim(p_reason),'active',false));return uid;
exception when unique_violation then select id into uid from user_accounts where creation_idempotency_key=p_idempotency_key;if uid is null then raise;end if;return uid;end$$;

create or replace function public.admin_change_account_status(p_target_user_id uuid,p_status text,p_reason text,p_expected_version integer,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;t user_accounts%rowtype;active_owners integer;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;
 if p_status not in('active','inactive','suspended')or nullif(trim(p_reason),'')is null then raise exception'INVALID_ACCOUNT_STATUS';end if;
 select * into t from user_accounts where id=p_target_user_id for update;if not found then raise exception'ACCOUNT_NOT_FOUND';end if;
 if t.auth_version<>p_expected_version then raise exception'ACCOUNT_STALE';end if;if t.id=p_actor_user_id then raise exception'SELF_LIFECYCLE_CHANGE_FORBIDDEN';end if;
 if actor='admin'and t.role in('owner','admin')then raise exception'PROTECTED_ACCOUNT_FORBIDDEN';end if;
 if p_status='active'and t.recovery_required then raise exception'ACCOUNT_RECOVERY_REQUIRED';end if;
 if t.role='owner'and p_status<>'active'then select count(*)into active_owners from user_accounts where role='owner'and active and id<>t.id;if active_owners=0 then raise exception'LAST_ACTIVE_OWNER_PROTECTED';end if;end if;
 update user_accounts set account_status=p_status,active=p_status='active',auth_version=auth_version+1,updated_at=now()where id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_change_account_status','user_account',t.id::text,jsonb_build_object('status',t.account_status,'active',t.active),jsonb_build_object('status',p_status,'active',p_status='active','reason',trim(p_reason)));return jsonb_build_object('id',t.id,'status',p_status,'version',t.auth_version+1);end$$;

create or replace function public.admin_change_user_role(p_target_user_id uuid,p_role text,p_reason text,p_expected_version integer,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;t user_accounts%rowtype;allowed boolean;active_owners integer;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;
 select * into t from user_accounts where id=p_target_user_id for update;if not found then raise exception'ACCOUNT_NOT_FOUND';end if;if t.auth_version<>p_expected_version then raise exception'ACCOUNT_STALE';end if;if t.id=p_actor_user_id then raise exception'SELF_ROLE_CHANGE_FORBIDDEN';end if;if nullif(trim(p_reason),'')is null then raise exception'ROLE_CHANGE_REASON_REQUIRED';end if;
 allowed:=case when actor='owner'then p_role in('owner','admin','manager','front_desk','housekeeping','maintenance','accounting','guest')else p_role in('manager','front_desk','housekeeping','maintenance','accounting')and t.role not in('owner','admin')end;if not allowed then raise exception'PROTECTED_ROLE_FORBIDDEN';end if;
 if t.role='owner'and p_role<>'owner'then select count(*)into active_owners from user_accounts where role='owner'and active and id<>t.id;if active_owners=0 then raise exception'LAST_ACTIVE_OWNER_PROTECTED';end if;end if;
 update user_accounts set role=p_role,auth_version=auth_version+1,updated_at=now()where id=t.id;update staff set role=p_role,department=case when p_role='front_desk'then'Front Desk'else initcap(replace(p_role,'_',' '))end where user_id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_change_user_role','user_account',t.id::text,jsonb_build_object('role',t.role),jsonb_build_object('role',p_role,'reason',trim(p_reason)));return jsonb_build_object('id',t.id,'role',p_role,'version',t.auth_version+1);end$$;

create or replace function public.admin_update_user_metadata(p_target_user_id uuid,p_name text,p_phone text,p_department text,p_employee_reference text,p_expected_version integer,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$declare actor text;t user_accounts%rowtype;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;select * into t from user_accounts where id=p_target_user_id for update;if not found then raise exception'ACCOUNT_NOT_FOUND';end if;if t.auth_version<>p_expected_version then raise exception'ACCOUNT_STALE';end if;if actor='admin'and t.role in('owner','admin')then raise exception'PROTECTED_ACCOUNT_FORBIDDEN';end if;if nullif(trim(p_name),'')is null then raise exception'INVALID_ACCOUNT_METADATA';end if;
 update user_accounts set name=trim(p_name),phone=nullif(trim(p_phone),''),department=nullif(trim(p_department),''),employee_reference=nullif(trim(p_employee_reference),''),auth_version=auth_version+1,updated_at=now()where id=t.id;update staff set name=trim(p_name),department=nullif(trim(p_department),'')where user_id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_update_user_metadata','user_account',t.id::text,jsonb_build_object('name',t.name,'department',t.department,'employeeReference',t.employee_reference),jsonb_build_object('name',trim(p_name),'department',nullif(trim(p_department),''),'employeeReference',nullif(trim(p_employee_reference),'')));return jsonb_build_object('id',t.id,'version',t.auth_version+1);end$$;

create or replace function public.admin_initiate_account_recovery(p_target_user_id uuid,p_token_hash text,p_expires_at timestamptz,p_reason text,p_actor_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$declare actor text;t user_accounts%rowtype;token_id uuid;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;select * into t from user_accounts where id=p_target_user_id for update;if not found then raise exception'ACCOUNT_NOT_FOUND';end if;if actor='admin'and t.role in('owner','admin')then raise exception'PROTECTED_ACCOUNT_FORBIDDEN';end if;if t.id=p_actor_user_id then raise exception'SELF_RECOVERY_FORBIDDEN';end if;if nullif(trim(p_reason),'')is null or p_expires_at<=now()or length(p_token_hash)<32 then raise exception'INVALID_RECOVERY_REQUEST';end if;
 update account_recovery_tokens set used_at=now()where user_id=t.id and used_at is null;insert into account_recovery_tokens(user_id,token_hash,created_by,expires_at)values(t.id,p_token_hash,p_actor_user_id,p_expires_at)returning id into token_id;update user_accounts set recovery_required=true,active=false,account_status='inactive',auth_version=auth_version+1,updated_at=now()where id=t.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_actor_user_id,'admin_initiate_account_recovery','user_account',t.id::text,jsonb_build_object('reason',trim(p_reason),'expiresAt',p_expires_at));return token_id;end$$;

create or replace function public.complete_account_recovery(p_token_hash text,p_password_hash text)returns uuid language plpgsql security definer set search_path=public as $$declare tok account_recovery_tokens%rowtype;begin
 select * into tok from account_recovery_tokens where token_hash=p_token_hash and used_at is null and expires_at>now()for update;if not found then raise exception'RECOVERY_TOKEN_INVALID';end if;if length(p_password_hash)<50 then raise exception'INVALID_PASSWORD_HASH';end if;update account_recovery_tokens set used_at=now()where id=tok.id;update user_accounts set password_hash=p_password_hash,recovery_required=false,account_status='active',active=true,auth_version=auth_version+1,updated_at=now()where id=tok.user_id;insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(tok.user_id,'account_recovery_completed','user_account',tok.user_id::text,jsonb_build_object('recoveryTokenId',tok.id));return tok.user_id;end$$;

create or replace function public.admin_update_room_metadata(p_room_id text,p_floor integer,p_type text,p_wing text,p_designation text,p_active boolean,p_reason text,p_expected_version integer,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$declare actor text;r rooms%rowtype;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;if p_floor<0 or nullif(trim(p_type),'')is null or nullif(trim(p_reason),'')is null or not exists(select 1 from room_types where name=p_type)then raise exception'INVALID_ROOM_CONFIGURATION';end if;select * into r from rooms where id=p_room_id for update;if not found then raise exception'ROOM_NOT_FOUND';end if;if r.configuration_version<>p_expected_version then raise exception'ROOM_CONFIGURATION_STALE';end if;
 if not p_active and(r.status in('occupied','reserved')or exists(select 1 from reservation_room_assignments a where a.room_id=r.id and a.status='active')or exists(select 1 from reservations x where x.room_id=r.id and x.status in('pending','confirmed','checked_in')))then raise exception'ROOM_HAS_ACTIVE_ASSIGNMENT';end if;
 update rooms set floor=p_floor,type=p_type,wing=nullif(trim(p_wing),''),administrative_designation=nullif(trim(p_designation),''),administratively_active=p_active,configuration_version=configuration_version+1,updated_at=now()where id=r.id;insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_update_room_metadata','room',r.id,jsonb_build_object('floor',r.floor,'type',r.type,'active',r.administratively_active),jsonb_build_object('floor',p_floor,'type',p_type,'active',p_active,'wing',nullif(trim(p_wing),''),'designation',nullif(trim(p_designation),''),'reason',trim(p_reason)));return jsonb_build_object('id',r.id,'version',r.configuration_version+1);end$$;

create or replace function public.admin_update_room_type(p_room_type_id uuid,p_description text,p_max_guests integer,p_beds text,p_size_sqm integer,p_amenities jsonb,p_base_rate numeric,p_active boolean,p_reason text,p_expected_version integer,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$declare actor text;t room_types%rowtype;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;if nullif(trim(p_description),'')is null or p_max_guests<=0 or nullif(trim(p_beds),'')is null or(p_size_sqm is not null and p_size_sqm<=0)or p_base_rate<0 or jsonb_typeof(coalesce(p_amenities,'[]'))<>'array'or nullif(trim(p_reason),'')is null then raise exception'INVALID_ROOM_TYPE_CONFIGURATION';end if;select * into t from room_types where id=p_room_type_id for update;if not found then raise exception'ROOM_TYPE_NOT_FOUND';end if;if t.version<>p_expected_version then raise exception'ROOM_TYPE_STALE';end if;
 update room_types set description=trim(p_description),max_guests=p_max_guests,beds=trim(p_beds),size_sqm=p_size_sqm,amenities=coalesce(p_amenities,'[]'),base_rate=round(p_base_rate,2),active=p_active,version=version+1,updated_at=now()where id=t.id;insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_update_room_type','room_type',t.id::text,to_jsonb(t)-'id',jsonb_build_object('name',t.name,'description',trim(p_description),'maxGuests',p_max_guests,'beds',trim(p_beds),'sizeSqm',p_size_sqm,'amenities',coalesce(p_amenities,'[]'),'baseRate',round(p_base_rate,2),'active',p_active,'reason',trim(p_reason)));return jsonb_build_object('id',t.id,'version',t.version+1);end$$;

create or replace function public.admin_update_operational_policy(p_hotel_timezone text,p_check_in_time time,p_check_out_time time,p_no_show_cutoff_time time,p_valid_id_required boolean,p_minimum_booking_age integer,p_cancellation_full_refund_days integer,p_cancellation_partial_refund_days integer,p_cancellation_partial_refund_basis_points integer,p_self_service_modification_days integer,p_early_check_in_allowed boolean,p_housekeeping_inspection_required boolean,p_reason text,p_expected_version integer,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$declare actor text;p hotel_operational_policies%rowtype;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;select * into p from hotel_operational_policies where key='default'for update;if not found then raise exception'POLICY_NOT_FOUND';end if;if p.version<>p_expected_version then raise exception'POLICY_STALE';end if;if p_hotel_timezone<>p.hotel_timezone and actor<>'owner'then raise exception'TIMEZONE_OWNER_ONLY';end if;if not exists(select 1 from pg_timezone_names where name=p_hotel_timezone)or p_minimum_booking_age not between 1 and 120 or p_cancellation_full_refund_days<0 or p_cancellation_partial_refund_days<0 or p_cancellation_full_refund_days<p_cancellation_partial_refund_days or p_cancellation_partial_refund_basis_points not between 0 and 10000 or p_self_service_modification_days<0 or nullif(trim(p_reason),'')is null then raise exception'INVALID_OPERATIONAL_POLICY';end if;
 update hotel_operational_policies set hotel_timezone=p_hotel_timezone,check_in_time=p_check_in_time,check_out_time=p_check_out_time,no_show_cutoff_time=p_no_show_cutoff_time,valid_id_required=p_valid_id_required,minimum_booking_age=p_minimum_booking_age,cancellation_full_refund_days=p_cancellation_full_refund_days,cancellation_partial_refund_days=p_cancellation_partial_refund_days,cancellation_partial_refund_basis_points=p_cancellation_partial_refund_basis_points,self_service_modification_days=p_self_service_modification_days,early_check_in_allowed=p_early_check_in_allowed,housekeeping_inspection_required=p_housekeeping_inspection_required,version=version+1,updated_at=now()where key='default';insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_update_operational_policy','hotel_operational_policy','default',to_jsonb(p),jsonb_build_object('hotelTimezone',p_hotel_timezone,'checkInTime',p_check_in_time,'checkOutTime',p_check_out_time,'noShowCutoffTime',p_no_show_cutoff_time,'validIdRequired',p_valid_id_required,'minimumBookingAge',p_minimum_booking_age,'cancellationFullRefundDays',p_cancellation_full_refund_days,'cancellationPartialRefundDays',p_cancellation_partial_refund_days,'cancellationPartialRefundBasisPoints',p_cancellation_partial_refund_basis_points,'selfServiceModificationDays',p_self_service_modification_days,'earlyCheckInAllowed',p_early_check_in_allowed,'housekeepingInspectionRequired',p_housekeeping_inspection_required,'reason',trim(p_reason),'version',p.version+1));return jsonb_build_object('version',p.version+1);end$$;

revoke all on table public.account_recovery_tokens from public,anon,authenticated;
grant all on table public.account_recovery_tokens to service_role;
revoke all on function public.admin_create_staff(text,text,text,text,text,text,text,uuid,uuid),public.admin_change_account_status(uuid,text,text,integer,uuid),public.admin_change_user_role(uuid,text,text,integer,uuid),public.admin_update_user_metadata(uuid,text,text,text,text,integer,uuid),public.admin_initiate_account_recovery(uuid,text,timestamptz,text,uuid),public.complete_account_recovery(text,text),public.admin_update_room_metadata(text,integer,text,text,text,boolean,text,integer,uuid),public.admin_update_room_type(uuid,text,integer,text,integer,jsonb,numeric,boolean,text,integer,uuid),public.admin_update_operational_policy(text,time,time,time,boolean,integer,integer,integer,integer,integer,boolean,boolean,text,integer,uuid)from public,anon,authenticated;
grant execute on function public.admin_create_staff(text,text,text,text,text,text,text,uuid,uuid),public.admin_change_account_status(uuid,text,text,integer,uuid),public.admin_change_user_role(uuid,text,text,integer,uuid),public.admin_update_user_metadata(uuid,text,text,text,text,integer,uuid),public.admin_initiate_account_recovery(uuid,text,timestamptz,text,uuid),public.complete_account_recovery(text,text),public.admin_update_room_metadata(text,integer,text,text,text,boolean,text,integer,uuid),public.admin_update_room_type(uuid,text,integer,text,integer,jsonb,numeric,boolean,text,integer,uuid),public.admin_update_operational_policy(text,time,time,time,boolean,integer,integer,integer,integer,integer,boolean,boolean,text,integer,uuid)to service_role;
revoke execute on function public.sync_user_account_lifecycle()from public,anon,authenticated;
