alter table public.guest_requests add column if not exists version integer not null default 1;
alter table public.guest_requests drop constraint guest_requests_approval_status_chk;
alter table public.guest_requests add constraint guest_requests_approval_status_chk check(approval_status in('pending','approved','rejected','withdrawn')) not valid;
create function public.increment_guest_request_version() returns trigger language plpgsql as $$
begin new.version:=old.version+1; return new; end$$;
create trigger guest_request_version before update on public.guest_requests for each row execute function public.increment_guest_request_version();

create function public.customer_withdraw_guest_request(p_user_id uuid,p_request_id uuid,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare req guest_requests%rowtype;
begin
 if not exists(select 1 from user_accounts where id=p_user_id and active and role='guest') then raise exception 'CUSTOMER_ACCESS_REQUIRED'; end if;
 select g.* into req from guest_requests g join reservations r on r.id=g.reservation_id where g.id=p_request_id and r.user_id=p_user_id for update of g;
 if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
 if req.approval_status='withdrawn' then return jsonb_build_object('status','cancelled','version',req.version); end if;
 if req.version<>p_expected_version then raise exception 'REQUEST_STALE'; end if;
 if req.approval_status<>'pending' or req.status<>'open' or req.assigned_to is not null then raise exception 'WITHDRAWAL_NOT_PERMITTED'; end if;
 -- Do not leave any scheduled or active department work orphaned.
 if exists(select 1 from housekeeping_tasks where source_type='guest_request' and source_id=req.id::text and status not in('cancelled','completed'))
 or exists(select 1 from maintenance_orders where guest_request_id=req.id and status not in('cancelled','completed')) then raise exception 'WITHDRAWAL_NOT_PERMITTED'; end if;
 update guest_requests set status='cancelled',approval_status='withdrawn' where id=req.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_user_id,'customer_withdraw_guest_request','guest_request',req.id::text,jsonb_build_object('reservationId',req.reservation_id,'status','cancelled'));
 return jsonb_build_object('status','cancelled','version',req.version+1);
end$$;
revoke all on function public.customer_withdraw_guest_request(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.customer_withdraw_guest_request(uuid,uuid,integer) to service_role;

-- Serialize new department work against withdrawal. Existing pending-work
-- creation stays supported, but withdrawn requests cannot acquire new work.
create function public.guard_withdrawn_request_work() returns trigger language plpgsql set search_path=public as $$
declare request_id uuid; current_status text;
begin
 request_id:=new.guest_request_id;
 if request_id is null and new.source_type='guest_request' and new.source_id is not null then request_id:=new.source_id::uuid; end if;
 if request_id is not null then
  select status into current_status from guest_requests where id=request_id for update;
  if current_status='cancelled' then raise exception 'REQUEST_WITHDRAWN'; end if;
 end if;
 return new;
end$$;
create trigger housekeeping_withdrawn_request_guard before insert on public.housekeeping_tasks for each row execute function public.guard_withdrawn_request_work();
create trigger maintenance_withdrawn_request_guard before insert on public.maintenance_orders for each row execute function public.guard_withdrawn_request_work();
