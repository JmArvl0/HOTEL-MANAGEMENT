-- Preserve current live routing bodies; defer department work until approval.
CREATE OR REPLACE FUNCTION public.ensure_housekeeping_task_for_guest_request(p_guest_request_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare gr guest_requests%rowtype;r reservations%rowtype;task_id text;begin
 select * into gr from guest_requests where id=p_guest_request_id for update;if not found or gr.department<>'housekeeping' or gr.approval_status<>'approved' or gr.status in('cancelled','completed')then return null;end if;
 select rv.* into r from reservations rv where rv.id=gr.reservation_id;if r.room_number is null then return null;end if;
 insert into housekeeping_tasks(room_id,room_number,reservation_id,guest_request_id,task,task_type,priority,status,due,notes,source_type,source_id)
 values(r.room_id,r.room_number,r.id,gr.id,gr.request,'guest_request',case when gr.priority in('high','urgent')then gr.priority else'normal'end,'pending','Guest requested service','Created from authoritative Guest Request','guest_request',gr.id::text)
 on conflict do nothing returning id into task_id;
 if task_id is not null then insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(null,'create_housekeeping_task_from_guest_request','housekeeping_task',task_id,jsonb_build_object('guestRequestId',gr.id,'reservationId',r.id,'roomId',r.room_id));end if;
 return task_id;end$function$;
CREATE OR REPLACE FUNCTION public.create_maintenance_for_guest_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r reservations%rowtype;begin if new.department<>'maintenance' or new.approval_status<>'approved' or new.status in('cancelled','completed')then return new;end if;if new.reservation_id is not null then select * into r from reservations where id=new.reservation_id;end if;insert into maintenance_orders(room_id,room_number,reservation_id,guest_request_id,target_type,target_label,issue,category,priority,status,serviceability_impact,source_type,source_id)values(r.room_id,r.room_number,new.reservation_id,new.id,'room',r.room_number,new.request,'Guest request',case when new.priority in('low','normal','high','urgent','critical')then new.priority else'normal'end,'open','serviceable','guest_request',new.id::text)on conflict(guest_request_id)where guest_request_id is not null do nothing;return new;end$function$;
create trigger hms_approved_housekeeping_request after update of approval_status on public.guest_requests for each row when(new.department='housekeeping' and new.approval_status='approved' and old.approval_status is distinct from new.approval_status) execute function public.create_housekeeping_task_for_guest_request();
create trigger hms_approved_maintenance_request after update of approval_status on public.guest_requests for each row when(new.department='maintenance' and new.approval_status='approved' and old.approval_status is distinct from new.approval_status) execute function public.create_maintenance_for_guest_request();
create or replace function public.customer_withdraw_guest_request(p_user_id uuid,p_request_id uuid,p_expected_version integer)
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
 perform 1 from housekeeping_tasks where guest_request_id=req.id or (source_type='guest_request' and source_id=req.id::text) for update;
 perform 1 from maintenance_orders where guest_request_id=req.id for update;
 if exists(select 1 from housekeeping_tasks where (guest_request_id=req.id or (source_type='guest_request' and source_id=req.id::text)) and status not in('cancelled','completed') and not(status='pending' and assigned_user_id is null and started_by is null))
 or exists(select 1 from maintenance_orders where guest_request_id=req.id and status not in('cancelled','completed') and not(status='open' and assigned_user_id is null and started_by is null)) then raise exception 'WITHDRAWAL_NOT_PERMITTED'; end if;
 -- Preserve the legacy rows and their history; cancel only work not yet accepted.
 update housekeeping_tasks set status='cancelled',updated_at=now(),version=version+1 where (guest_request_id=req.id or (source_type='guest_request' and source_id=req.id::text)) and status='pending' and assigned_user_id is null and started_by is null;
 update maintenance_orders set status='cancelled',updated_at=now(),version=version+1 where guest_request_id=req.id and status='open' and assigned_user_id is null and started_by is null;
 update guest_requests set status='cancelled',approval_status='withdrawn' where id=req.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_user_id,'customer_withdraw_guest_request','guest_request',req.id::text,jsonb_build_object('reservationId',req.reservation_id,'status','cancelled'));
 return jsonb_build_object('status','cancelled','version',req.version+1);
end$$;
