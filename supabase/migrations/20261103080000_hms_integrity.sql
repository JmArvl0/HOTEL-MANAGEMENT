-- Focused HMS repair. No procurement, roster, payroll or enterprise GL dependency.
create table public.inventory_operations (
 id uuid primary key, item_id text not null references public.inventory(id),
 actor_id uuid not null references public.user_accounts(id), payload jsonb not null,
 result jsonb not null, created_at timestamptz not null default now()
);
alter table public.inventory_operations enable row level security;
revoke all on public.inventory_operations from public,anon,authenticated;
grant select on public.inventory_operations to service_role;
create function public.hms_stock_movement(p_actor uuid,p_key uuid,p_item text,p_kind text,p_quantity numeric,p_expected_updated timestamptz,p_reason text,p_reference text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare i inventory%rowtype; previous inventory_operations%rowtype; payload jsonb; result jsonb; delta numeric; next_quantity numeric;
begin
 if not exists(select 1 from user_accounts where id=p_actor and active and role in('housekeeping','maintenance')) then raise exception 'STOCK_FORBIDDEN'; end if;
 if p_key is null or p_kind not in('issue','count') or p_quantity is null or p_quantity<0 or p_quantity='NaN'::numeric or p_quantity<>round(p_quantity,2) or p_quantity>9999999999.99 or (p_kind='issue' and p_quantity=0) or length(trim(coalesce(p_reason,''))) not between 3 and 500 or length(trim(coalesce(p_reference,''))) not between 1 and 120 then raise exception 'INVALID_STOCK_MOVEMENT'; end if;
 payload:=jsonb_build_object('kind',p_kind,'quantity',p_quantity,'expectedUpdated',p_expected_updated,'reason',trim(p_reason),'reference',trim(p_reference));
 perform pg_advisory_xact_lock(hashtextextended('stock:'||p_key::text,0));
 select * into previous from inventory_operations where id=p_key;
 if found then
  if previous.actor_id<>p_actor or previous.item_id<>p_item or previous.payload<>payload then raise exception 'STOCK_RETRY_CONFLICT'; end if;
  return previous.result;
 end if;
 select * into i from inventory where id=p_item for update;
 if not found then raise exception 'STOCK_NOT_FOUND'; end if;
 if p_kind='count' and (p_expected_updated is null or i.updated_at is distinct from p_expected_updated) then raise exception 'STOCK_STALE'; end if;
 next_quantity:=case when p_kind='issue' then i.quantity-p_quantity else p_quantity end;
 if next_quantity<0 then raise exception 'STOCK_INSUFFICIENT'; end if;
 delta:=next_quantity-i.quantity;
 update inventory set quantity=next_quantity,status=case when next_quantity=0 then 'out' when next_quantity<=reorder_point then 'low' else 'healthy' end,updated_at=clock_timestamp() where id=i.id;
 if delta<>0 then
  insert into inventory_movements(item_id,quantity,direction,source_type,source_id,recorded_by,note)
  values(i.id,abs(delta),case when p_kind='issue' then 'consumption' when delta>0 then 'restock' else 'adjustment' end,'stock_operation',p_key::text,p_actor,trim(p_reference)||' · '||trim(p_reason));
 end if;
 result:=jsonb_build_object('itemId',i.id,'previousQuantity',i.quantity,'quantity',next_quantity,'operationId',p_key);
 insert into inventory_operations(id,item_id,actor_id,payload,result) values(p_key,i.id,p_actor,payload,result);
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(p_actor,'stock_'||p_kind,'inventory',i.id,jsonb_build_object('quantity',i.quantity),result||jsonb_build_object('reason',trim(p_reason),'reference',trim(p_reference)));
 return result;
end$$;
-- Runs inside the existing protected completion transaction, preserving room
-- readiness rules and rolling back completion if stock/movement/audit fails.
create function public.hms_consume_completed_request() returns trigger language plpgsql security definer set search_path=public as $$
declare r guest_requests%rowtype; i inventory%rowtype;
begin
 if new.status<>'completed' or old.status='completed' or new.guest_request_id is null then return new; end if;
 select * into r from guest_requests where id=new.guest_request_id for update;
 if not found or r.status='cancelled' or r.approval_status<>'approved' then raise exception 'REQUEST_NOT_FULFILLABLE'; end if;
 if r.inventory_item_id is null then
  if r.request_type in('extra_towels','extra_pillows','toiletries') then raise exception 'STOCK_MAPPING_REVIEW_REQUIRED'; end if;
  return new;
 end if;
 if new.completed_by is null then raise exception 'STOCK_ACTOR_REQUIRED'; end if;
 select * into i from inventory where id=r.inventory_item_id for update;
 if not found or i.quantity<1 then raise exception 'STOCK_INSUFFICIENT'; end if;
 -- A source is consumed once even if a second task was linked accidentally.
 if exists(select 1 from inventory_movements where source_type='guest_request' and source_id=r.id::text) then return new; end if;
 update inventory set quantity=quantity-1,updated_at=clock_timestamp(),status=case when quantity-1=0 then 'out' when quantity-1<=reorder_point then 'low' else 'healthy' end where id=i.id;
 insert into inventory_movements(item_id,quantity,direction,source_type,source_id,recorded_by,note) values(i.id,1,'consumption','guest_request',r.id::text,new.completed_by,'Fulfilled through housekeeping task '||new.id);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(new.completed_by,'request_stock_consumed','guest_request',r.id::text,jsonb_build_object('itemId',i.id,'taskId',new.id,'quantity',1));
 return new;
end$$;
create trigger hms_request_stock_completion before update of status on public.housekeeping_tasks for each row execute function public.hms_consume_completed_request();
create function public.hms_save_guest_profile(p_actor uuid,p_name text,p_mobile text,p_address text,p_nationality text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare u user_accounts%rowtype; g guests%rowtype; matches integer;
begin
 select * into u from user_accounts where id=p_actor and active and role='guest' for update;
 if not found then raise exception 'PROFILE_FORBIDDEN'; end if;
 if length(trim(coalesce(p_name,''))) not between 2 and 120 or length(coalesce(p_mobile,''))>30 or length(coalesce(p_address,''))>300 or length(coalesce(p_nationality,''))>80 then raise exception 'PROFILE_INVALID'; end if;
 select count(*) into matches from guests where user_account_id=p_actor;
 if matches>1 then raise exception 'PROFILE_AMBIGUOUS'; end if;
 select * into g from guests where user_account_id=p_actor for update;
 if g.id is null then
  -- Never claim an unlinked record by matching email alone. Resolve ambiguity explicitly.
  if exists(select 1 from guests where lower(email)=lower(u.email)) then raise exception 'PROFILE_LINK_REVIEW_REQUIRED'; end if;
  insert into guests(name,first_name,last_name,email,user_account_id) values(trim(p_name),split_part(trim(p_name),' ',1),substring(trim(p_name) from position(' ' in trim(p_name))+1),u.email,p_actor) returning * into g;
 end if;
 update user_accounts set name=trim(p_name) where id=p_actor;
 update guests set name=trim(p_name),first_name=split_part(trim(p_name),' ',1),last_name=case when position(' ' in trim(p_name))>0 then substring(trim(p_name) from position(' ' in trim(p_name))+1) else '' end,phone=nullif(trim(p_mobile),''),address=nullif(trim(p_address),''),nationality=nullif(trim(p_nationality),'') where id=g.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'customer_update_profile','user_account',p_actor::text,jsonb_build_object('guestId',g.id,'hasMobile',length(trim(coalesce(p_mobile,'')))>0,'hasAddress',length(trim(coalesce(p_address,'')))>0));
 return jsonb_build_object('guestId',g.id,'name',trim(p_name));
end$$;
create function public.hms_verify_uploaded_id(p_actor uuid,p_reservation text,p_document uuid)
returns void language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype; d guest_id_documents%rowtype;
begin
 if not exists(select 1 from user_accounts where id=p_actor and active and role='front_desk') then raise exception 'IDENTITY_VERIFICATION_FORBIDDEN'; end if;
 select * into r from reservations where id=p_reservation for update;
 if not found or r.status not in('confirmed','checked_in') then raise exception 'RESERVATION_NOT_IDENTITY_READY'; end if;
 select * into d from guest_id_documents where id=p_document and reservation_id=r.id for update;
 if not found or d.status<>'pending_review' or exists(select 1 from guest_id_documents where reservation_id=r.id and (created_at,id)>(d.created_at,d.id)) then raise exception 'DOCUMENT_STALE'; end if;
 perform verify_guest_identity(r.id,p_actor);
 update guest_id_documents set status='verified',reviewed_by=p_actor,reviewed_at=now() where id=d.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'uploaded_id_review','reservation',r.id,jsonb_build_object('documentId',d.id,'path','uploaded'));
end$$;
-- Serialize a replacement upload with review, and invalidate the prior decision.
create function public.hms_id_upload_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform 1 from reservations where id=new.reservation_id for update;
 if new.status='pending_review' then
  update reservations set identity_status='unverified',identity_verified_by=null,identity_verified_at=null where id=new.reservation_id and identity_status='verified';
 end if;
 return new;
end$$;
create trigger hms_id_upload before insert on public.guest_id_documents for each row execute function public.hms_id_upload_guard();
revoke all on function public.hms_stock_movement(uuid,uuid,text,text,numeric,timestamptz,text,text),public.hms_save_guest_profile(uuid,text,text,text,text),public.hms_verify_uploaded_id(uuid,text,uuid),public.hms_consume_completed_request(),public.hms_id_upload_guard() from public,anon,authenticated;
grant execute on function public.hms_stock_movement(uuid,uuid,text,text,numeric,timestamptz,text,text),public.hms_save_guest_profile(uuid,text,text,text,text),public.hms_verify_uploaded_id(uuid,text,uuid) to service_role;
