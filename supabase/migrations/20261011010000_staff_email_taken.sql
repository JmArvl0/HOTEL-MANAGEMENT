-- 20261011010000_staff_email_taken.sql
--
-- Speakable duplicate-email error for System Administrator staff creation.
-- admin_create_staff previously let an email-unique violation propagate as a
-- raw Postgres error, which the route could not map — every duplicate (most
-- often a retry after a first click already committed the row) surfaced as
-- the generic "Unable to create the staff account." The uniqueness itself is
-- unchanged; only the diagnosis is. Recreated from the live body (verified
-- identical to 20260901010000 on 2026-10-11; no drift).

create or replace function public.admin_create_staff(p_name text,p_email text,p_phone text,p_department text,p_employee_reference text,p_role text,p_reason text,p_idempotency_key uuid,p_actor_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor text;uid uuid;allowed boolean;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;
 if actor is null or actor not in('owner','admin')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;
 allowed:=case when actor='owner'then p_role in('owner','admin','manager','front_desk','housekeeping','maintenance','accounting')else p_role in('manager','front_desk','housekeeping','maintenance','accounting')end;
 if not allowed then raise exception'PROTECTED_ROLE_FORBIDDEN';end if;
 if nullif(trim(p_name),'')is null or nullif(trim(p_email),'')is null or nullif(trim(p_reason),'')is null then raise exception'INVALID_STAFF_ACCOUNT';end if;
 if exists(select 1 from user_accounts where email=lower(trim(p_email)))then raise exception'EMAIL_TAKEN';end if;
 insert into user_accounts(email,name,role,password_hash,active,account_status,recovery_required,phone,department,employee_reference,creation_idempotency_key)
 values(lower(trim(p_email)),trim(p_name),p_role,'recovery-required',false,'inactive',true,nullif(trim(p_phone),''),nullif(trim(p_department),''),nullif(trim(p_employee_reference),''),p_idempotency_key)returning id into uid;
 insert into staff(user_id,name,role,department,status)values(uid,trim(p_name),p_role,nullif(trim(p_department),''),'off_duty');
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_actor_user_id,'admin_create_staff','user_account',uid::text,jsonb_build_object('email',lower(trim(p_email)),'role',p_role,'reason',trim(p_reason),'active',false));return uid;
exception when unique_violation then select id into uid from user_accounts where creation_idempotency_key=p_idempotency_key;if uid is null then raise;end if;return uid;end$$;

revoke all on function public.admin_create_staff(text,text,text,text,text,text,text,uuid,uuid)from public,anon,authenticated;
revoke execute on function public.admin_create_staff(text,text,text,text,text,text,text,uuid,uuid)from anon,authenticated;
grant execute on function public.admin_create_staff(text,text,text,text,text,text,text,uuid,uuid)to service_role;
