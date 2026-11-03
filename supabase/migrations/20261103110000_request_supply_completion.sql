-- Centralize all mapped request fulfillment, including the department progress
-- path which can complete a request without a housekeeping task.
create function public.hms_consume_request_stock(p_request uuid,p_actor uuid) returns void
language plpgsql security definer set search_path=public as $$
declare r guest_requests%rowtype; i inventory%rowtype;
begin
 select * into r from guest_requests where id=p_request for update;
 if not found or r.status='cancelled' or r.approval_status<>'approved' then raise exception 'REQUEST_NOT_FULFILLABLE'; end if;
 if r.inventory_item_id is null then
  if r.request_type in('extra_towels','extra_pillows','toiletries') then raise exception 'STOCK_MAPPING_REVIEW_REQUIRED'; end if;
  return;
 end if;
 if exists(select 1 from inventory_movements where source_type='guest_request' and source_id=r.id::text) then return; end if;
 if p_actor is null or not exists(select 1 from user_accounts where id=p_actor and active and role=r.department) then raise exception 'STOCK_ACTOR_REQUIRED'; end if;
 select * into i from inventory where id=r.inventory_item_id for update;
 if not found or i.quantity<1 then raise exception 'STOCK_INSUFFICIENT'; end if;
 update inventory set quantity=quantity-1,updated_at=clock_timestamp(),status=case when quantity-1=0 then 'out' when quantity-1<=reorder_point then 'low' else 'healthy' end where id=i.id;
 insert into inventory_movements(item_id,quantity,direction,source_type,source_id,recorded_by,note) values(i.id,1,'consumption','guest_request',r.id::text,p_actor,'Fulfilled approved request');
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'request_stock_consumed','guest_request',r.id::text,jsonb_build_object('itemId',i.id,'quantity',1));
end$$;
create or replace function public.hms_consume_completed_request() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='completed' and old.status<>'completed' and new.guest_request_id is not null then perform hms_consume_request_stock(new.guest_request_id,new.completed_by); end if;
 return new;
end$$;
create function public.hms_request_completion_stock() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.status='completed' and old.status<>'completed' then perform hms_consume_request_stock(new.id,new.completed_by); end if;
 return new;
end$$;
create trigger hms_department_request_stock before update of status on public.guest_requests for each row execute function public.hms_request_completion_stock();
revoke all on function public.hms_consume_request_stock(uuid,uuid),public.hms_request_completion_stock() from public,anon,authenticated;
