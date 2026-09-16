-- Department fulfillment for guest requests. Approval (approval_status) authorizes
-- and routes; fulfillment (status) is the owning department's work. Until now a
-- housekeeping-routed item with no auto-created room task had no completion path
-- at all (generic PATCH refuses housekeeping on guest_requests), and maintenance
-- items were completable only through an unaudited generic write or order
-- resolution. staff_progress_guest_request gives each owning department one
-- audited start/complete path over its own approved items. Front Desk approval
-- semantics, escalation, batching, and the linked task/order auto-completion
-- (which keep working exactly as before) are untouched.

alter table public.guest_requests add column if not exists completed_by uuid references public.user_accounts(id) on delete set null;
alter table public.guest_requests add column if not exists completed_at timestamptz;

create or replace function public.staff_progress_guest_request(p_request_id uuid,p_action text,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;g guest_requests%rowtype;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('housekeeping','maintenance','front_desk')then raise exception'REQUEST_PROGRESS_FORBIDDEN';end if;
if p_action not in('start','complete')then raise exception'INVALID_PROGRESS_ACTION';end if;
select * into g from guest_requests where id=p_request_id for update;if not found then raise exception'GUEST_REQUEST_NOT_FOUND';end if;
if g.approval_status<>'approved'then raise exception'REQUEST_NOT_APPROVED';end if;
if g.department<>actor then raise exception'REQUEST_DEPARTMENT_FORBIDDEN';end if;
if g.status in('completed','cancelled')then raise exception'REQUEST_ALREADY_CLOSED';end if;
if p_action='start'then
if g.status<>'open'then raise exception'REQUEST_NOT_STARTABLE';end if;
update guest_requests set status='in_progress'where id=g.id;
else
update guest_requests set status='completed',completed_by=p_staff_user_id,completed_at=now()where id=g.id;
end if;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,case when p_action='start'then'staff_start_guest_request'else'staff_complete_guest_request'end,'guest_request',g.id::text,jsonb_build_object('status',g.status),jsonb_build_object('status',case when p_action='start'then'in_progress'else'completed'end));
return jsonb_build_object('id',g.id,'status',case when p_action='start'then'in_progress'else'completed'end);end$$;

revoke all on function public.staff_progress_guest_request(uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.staff_progress_guest_request(uuid,text,uuid) to service_role;
