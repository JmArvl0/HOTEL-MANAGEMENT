-- PROVISIONAL OWNER / SUPER ADMIN GOVERNANCE BASELINE
-- Additive extension of the existing Manager approval, Admin governance, and immutable audit systems.

alter table public.manager_approval_requests add column if not exists authority_level text not null default 'manager';
alter table public.manager_approval_requests add column if not exists owner_escalated_by uuid references public.user_accounts(id) on delete set null;
alter table public.manager_approval_requests add column if not exists owner_escalated_at timestamptz;
alter table public.manager_approval_requests add column if not exists owner_escalation_reason text;
alter table public.manager_approval_requests add column if not exists owner_reviewed_by uuid references public.user_accounts(id) on delete set null;
alter table public.manager_approval_requests add column if not exists owner_reviewed_at timestamptz;
do $$begin
  alter table public.manager_approval_requests add constraint manager_approval_authority_check check(authority_level in('manager','owner'));
exception when duplicate_object then null;end$$;
create index if not exists manager_approval_owner_queue_idx on public.manager_approval_requests(authority_level,status,severity,requested_at desc);

create or replace function public.protect_owner_exception_review() returns trigger
language plpgsql security definer set search_path=public as $$
declare reviewer_role text;begin
  if old.authority_level='owner' and old.status='pending' and new.status is distinct from old.status then
    select role into reviewer_role from user_accounts where id=new.reviewed_by and active;
    if reviewer_role is null or reviewer_role<>'owner' then raise exception'OWNER_REVIEW_REQUIRED';end if;
  end if;
  return new;
end$$;
drop trigger if exists owner_exception_review_guard on public.manager_approval_requests;
create trigger owner_exception_review_guard before update on public.manager_approval_requests for each row execute function public.protect_owner_exception_review();

create or replace function public.escalate_manager_approval_to_owner(
  p_approval_id uuid,p_reason text,p_expected_version integer,p_manager_user_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;a manager_approval_requests%rowtype;begin
  select role into actor from user_accounts where id=p_manager_user_id and active;
  if actor is null or actor<>'manager' then raise exception'MANAGER_ESCALATION_FORBIDDEN';end if;
  if nullif(trim(p_reason),'')is null then raise exception'OWNER_ESCALATION_REASON_REQUIRED';end if;
  select * into a from manager_approval_requests where id=p_approval_id for update;
  if not found then raise exception'APPROVAL_NOT_FOUND';end if;
  if a.status<>'pending' or a.version<>p_expected_version then raise exception'APPROVAL_ALREADY_REVIEWED';end if;
  if a.authority_level='owner' then raise exception'ALREADY_ESCALATED_TO_OWNER';end if;
  if a.severity not in('high','critical') then raise exception'OWNER_ESCALATION_REQUIRES_HIGH_RISK';end if;
  update manager_approval_requests set authority_level='owner',owner_escalated_by=p_manager_user_id,
    owner_escalated_at=now(),owner_escalation_reason=trim(p_reason),version=version+1,updated_at=now()
  where id=a.id;
  insert into manager_notes(approval_id,note,created_by)values(a.id,'Escalated to Owner: '||trim(p_reason),p_manager_user_id);
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_manager_user_id,'manager_escalate_to_owner','manager_approval',a.id::text,
    jsonb_build_object('authorityLevel',a.authority_level,'version',a.version),
    jsonb_build_object('authorityLevel','owner','reason',trim(p_reason),'version',a.version+1));
  return jsonb_build_object('id',a.id,'authorityLevel','owner','version',a.version+1);
end$$;

create or replace function public.review_owner_exception(
  p_approval_id uuid,p_decision text,p_reason text,p_expected_version integer,p_owner_user_id uuid
) returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;a manager_approval_requests%rowtype;result jsonb;begin
  select role into actor from user_accounts where id=p_owner_user_id and active;
  if actor is null or actor<>'owner' then raise exception'OWNER_AUTHORITY_REQUIRED';end if;
  if p_decision not in('approve','reject')or nullif(trim(p_reason),'')is null then raise exception'INVALID_OWNER_DECISION';end if;
  select * into a from manager_approval_requests where id=p_approval_id for update;
  if not found then raise exception'APPROVAL_NOT_FOUND';end if;
  if a.authority_level<>'owner' then raise exception'OWNER_REVIEW_NOT_REQUIRED';end if;
  if a.status<>'pending'or a.version<>p_expected_version then raise exception'APPROVAL_ALREADY_REVIEWED';end if;
  result:=review_manager_approval(a.id,p_decision,trim(p_reason),p_expected_version,p_owner_user_id);
  update manager_approval_requests set owner_reviewed_by=p_owner_user_id,owner_reviewed_at=now(),updated_at=now()where id=a.id;
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
  values(p_owner_user_id,'owner_'||p_decision||'_exception','manager_approval',a.id::text,
    jsonb_build_object('status',a.status,'authorityLevel',a.authority_level,'version',a.version),
    jsonb_build_object('status',case when p_decision='approve'then'approved'else'rejected'end,'reason',trim(p_reason),'departmentExecutes',p_decision='approve'));
  return result||jsonb_build_object('authorityLevel','owner','ownerReviewed',true);
end$$;

revoke all on function public.protect_owner_exception_review(),public.escalate_manager_approval_to_owner(uuid,text,integer,uuid),public.review_owner_exception(uuid,text,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.escalate_manager_approval_to_owner(uuid,text,integer,uuid),public.review_owner_exception(uuid,text,text,integer,uuid) to service_role;