-- Automated Inventory Replenishment & PO Approval Workflow.
-- Extends draft-only POs: draft -> pending_approval|approved -> received|cancelled.
-- Threshold lives on hotel_operational_policies (default PHP 50000).

alter table public.purchase_orders
  add column if not exists version integer not null default 1,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references public.user_accounts(id) on delete set null,
  add column if not exists received_at timestamptz,
  add column if not exists received_by uuid references public.user_accounts(id) on delete set null,
  add column if not exists approval_request_id uuid;
alter table public.purchase_orders
  drop constraint if exists purchase_orders_status_check;
alter table public.purchase_orders
  add constraint purchase_orders_status_check check (status in ('draft','pending_approval','approved','received','cancelled'));
create unique index if not exists purchase_orders_one_pending_approval
  on public.purchase_orders(approval_request_id) where status = 'pending_approval' and approval_request_id is not null;

alter table public.hotel_operational_policies
  add column if not exists po_auto_approve_threshold numeric(12,2) not null default 50000;

alter table public.manager_approval_requests drop constraint if exists manager_approval_requests_request_type_check;
alter table public.manager_approval_requests
  add constraint manager_approval_requests_request_type_check check(request_type in('room_upgrade','room_type_exception','reservation_modification','early_check_in','late_checkout','guest_compensation','refund_exception','checkout_exception','guest_escalation','stay_extension','purchase_order_approval'));

-- Submit: recompute total from live inventory costs, auto-approve <= threshold else file approval.
create or replace function public.submit_purchase_order(p_po_id uuid, p_staff_user_id uuid, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text; po purchase_orders%rowtype; threshold numeric(12,2); computed numeric(12,2) := 0;
  item jsonb; qty numeric; cost numeric; ap_id uuid;
begin
  select role into actor from user_accounts where id=p_staff_user_id and active;
  if actor is null or actor not in('manager','owner','admin') then raise exception 'PO_SUBMIT_FORBIDDEN'; end if;
  select * into po from purchase_orders where id=p_po_id for update;
  if not found then raise exception 'PO_NOT_FOUND'; end if;
  if po.status <> 'draft' then raise exception 'PO_NOT_DRAFT'; end if;
  if po.version <> p_expected_version then raise exception 'PO_STALE'; end if;
  select coalesce(po_auto_approve_threshold, 50000) into threshold from hotel_operational_policies where key='default';
  for item in select * from jsonb_array_elements(coalesce(po.items, '[]'::jsonb)) loop
    qty := coalesce((item->>'quantity')::numeric, 0);
    select unit_cost into cost from inventory where id = item->>'itemId';
    if not found then raise exception 'PO_ITEM_NOT_FOUND'; end if;
    computed := computed + qty * coalesce(cost, 0);
  end loop;
  computed := round(computed, 2);
  if computed <= threshold then
    update purchase_orders set status='approved', total=computed, submitted_at=now(), approved_at=now(), approved_by=p_staff_user_id, version=version+1 where id=p_po_id;
    insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
      values(p_staff_user_id,'purchase_order_auto_approved','purchase_order',p_po_id::text,to_jsonb(po),jsonb_build_object('status','approved','total',computed,'threshold',threshold));
    return jsonb_build_object('status','approved','total',computed);
  else
    insert into manager_approval_requests(request_type,related_entity_type,related_entity_id,department,severity,reason,requested_action,requested_by,status)
      values('purchase_order_approval','purchase_order',p_po_id::text,'operations','high','Purchase order exceeds auto-approve threshold',
        jsonb_build_object('poId',p_po_id,'total',computed,'threshold',threshold),p_staff_user_id, 'pending')
      returning id into ap_id;
    update purchase_orders set status='pending_approval', total=computed, submitted_at=now(), approval_request_id=ap_id, version=version+1 where id=p_po_id;
    insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
      values(p_staff_user_id,'purchase_order_submitted','purchase_order',p_po_id::text,to_jsonb(po),jsonb_build_object('status','pending_approval','total',computed,'threshold',threshold,'approvalRequestId',ap_id));
    return jsonb_build_object('status','pending_approval','total',computed,'approvalRequestId',ap_id);
  end if;
end$$;

-- Receive: atomic restock — PO -> received, inventory.quantity += qty, movements rows, audit.
create or replace function public.inventory_receive_purchase_order(p_po_id uuid, p_staff_user_id uuid, p_items_received_json jsonb, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text; po purchase_orders%rowtype; item jsonb; rqty numeric; oqty numeric; iid text;
begin
  select role into actor from user_accounts where id=p_staff_user_id and active;
  if actor is null or actor not in('manager','housekeeping','owner','admin') then raise exception 'PO_RECEIVE_FORBIDDEN'; end if;
  select * into po from purchase_orders where id=p_po_id for update;
  if not found then raise exception 'PO_NOT_FOUND'; end if;
  if po.status <> 'approved' then raise exception 'PO_NOT_APPROVED'; end if;
  if po.version <> p_expected_version then raise exception 'PO_STALE'; end if;
  for item in select * from jsonb_array_elements(coalesce(po.items, '[]'::jsonb)) loop
    iid := item->>'itemId'; oqty := coalesce((item->>'quantity')::numeric, 0);
    select coalesce((value->>'quantity')::numeric, oqty) into rqty
      from jsonb_array_elements(coalesce(p_items_received_json, '[]'::jsonb)) as value where value->>'itemId' = iid;
    rqty := coalesce(rqty, oqty);
    if rqty < 0 or rqty > oqty then raise exception 'PO_INVALID_RECEIVED_QTY'; end if;
    if rqty > 0 then
      update inventory set quantity = coalesce(quantity,0) + rqty, updated_at=now() where id=iid;
      if not found then raise exception 'PO_ITEM_NOT_FOUND'; end if;
      insert into inventory_movements(item_id,quantity,direction,source_type,source_id,recorded_by,note)
        values(iid,rqty,'restock','purchase_order',p_po_id::text,p_staff_user_id,'PO receipt');
    end if;
  end loop;
  update purchase_orders set status='received', received_at=now(), received_by=p_staff_user_id, version=version+1 where id=p_po_id;
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
    values(p_staff_user_id,'purchase_order_received','purchase_order',p_po_id::text,to_jsonb(po),jsonb_build_object('status','received','received',p_items_received_json));
  return jsonb_build_object('status','received');
end$$;

create or replace function public.cancel_purchase_order(p_po_id uuid, p_staff_user_id uuid, p_reason text, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text; po purchase_orders%rowtype;
begin
  select role into actor from user_accounts where id=p_staff_user_id and active;
  if actor is null or actor not in('manager','owner','admin') then raise exception 'PO_CANCEL_FORBIDDEN'; end if;
  select * into po from purchase_orders where id=p_po_id for update;
  if not found then raise exception 'PO_NOT_FOUND'; end if;
  if po.status in ('received','cancelled') then raise exception 'PO_IMMUTABLE'; end if;
  if po.version <> p_expected_version then raise exception 'PO_STALE'; end if;
  if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'PO_REASON_REQUIRED'; end if;
  update purchase_orders set status='cancelled', version=version+1 where id=p_po_id;
  update manager_approval_requests set status='rejected', decision_reason='PO cancelled: '||trim(p_reason) where id=po.approval_request_id and status='pending';
  insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)
    values(p_staff_user_id,'purchase_order_cancelled','purchase_order',p_po_id::text,to_jsonb(po),jsonb_build_object('status','cancelled','reason',trim(p_reason)));
  return jsonb_build_object('status','cancelled');
end$$;

-- Approve PO exception: owner/admin approve the pending manager_approval_requests row -> PO approved.
create or replace function public.review_purchase_order_approval(p_approval_id uuid, p_staff_user_id uuid, p_decision text, p_reason text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text; ap manager_approval_requests%rowtype; po purchase_orders%rowtype;
begin
  select role into actor from user_accounts where id=p_staff_user_id and active;
  if actor is null or actor not in('owner','admin') then raise exception 'PO_APPROVAL_FORBIDDEN'; end if;
  select * into ap from manager_approval_requests where id=p_approval_id for update;
  if not found or ap.request_type <> 'purchase_order_approval' then raise exception 'PO_APPROVAL_NOT_FOUND'; end if;
  if ap.status <> 'pending' then raise exception 'PO_APPROVAL_STALE'; end if;
  if p_decision not in ('approve','reject') then raise exception 'PO_INVALID_DECISION'; end if;
  select * into po from purchase_orders where id = (ap.related_entity_id::uuid) for update;
  if p_decision = 'approve' then
    if po.status <> 'pending_approval' then raise exception 'PO_APPROVAL_STALE'; end if;
    update manager_approval_requests set status='approved', reviewed_by=p_staff_user_id, reviewed_at=now(), decision_reason=nullif(trim(coalesce(p_reason,'')),'') where id=p_approval_id;
    update purchase_orders set status='approved', approved_at=now(), approved_by=p_staff_user_id, version=version+1 where id=po.id;
    insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
      values(p_staff_user_id,'purchase_order_exception_approved','purchase_order',po.id::text,jsonb_build_object('status','approved','approvalRequestId',p_approval_id));
    return jsonb_build_object('status','approved');
  else
    if nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'PO_REASON_REQUIRED'; end if;
    update manager_approval_requests set status='rejected', reviewed_by=p_staff_user_id, reviewed_at=now(), decision_reason=trim(p_reason) where id=p_approval_id;
    update purchase_orders set status='draft', approval_request_id=null, version=version+1 where id=po.id;
    insert into audit_logs(user_id,action,entity_type,entity_id,after_data)
      values(p_staff_user_id,'purchase_order_exception_rejected','purchase_order',po.id::text,jsonb_build_object('status','draft','reason',trim(p_reason)));
    return jsonb_build_object('status','draft');
  end if;
end$$;

-- Received POs are immutable.
create or replace function public.protect_received_po() returns trigger language plpgsql as $$
begin
  if old.status = 'received' then raise exception 'PO_IMMUTABLE'; end if;
  return new;
end$$;
drop trigger if exists protect_received_po on public.purchase_orders;
create trigger protect_received_po before update or delete on public.purchase_orders
  for each row execute function public.protect_received_po();

revoke all on function public.submit_purchase_order(uuid,uuid,integer) from public,anon,authenticated;
revoke execute on function public.submit_purchase_order(uuid,uuid,integer) from anon,authenticated;
revoke all on function public.inventory_receive_purchase_order(uuid,uuid,jsonb,integer) from public,anon,authenticated;
revoke execute on function public.inventory_receive_purchase_order(uuid,uuid,jsonb,integer) from anon,authenticated;
revoke all on function public.cancel_purchase_order(uuid,uuid,text,integer) from public,anon,authenticated;
revoke execute on function public.cancel_purchase_order(uuid,uuid,text,integer) from anon,authenticated;
revoke all on function public.review_purchase_order_approval(uuid,uuid,text,text) from public,anon,authenticated;
revoke execute on function public.review_purchase_order_approval(uuid,uuid,text,text) from anon,authenticated;
grant execute on function public.submit_purchase_order(uuid,uuid,integer), public.inventory_receive_purchase_order(uuid,uuid,jsonb,integer), public.cancel_purchase_order(uuid,uuid,text,integer), public.review_purchase_order_approval(uuid,uuid,text,text) to service_role;
