-- Restore cumulative receipts overwritten by the stock-status replacement.
-- Keep received orders and historical receipt quantities unchanged.
begin;

create or replace function public.inventory_receive_purchase_order(p_po_id uuid,p_staff_user_id uuid,p_items_received_json jsonb,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text; po purchase_orders%rowtype; prior purchase_order_receipts%rowtype;
 item jsonb; line jsonb; iid text; qty numeric; ordered numeric; received numeric;
 totals jsonb; done boolean := true; result jsonb; next_status text;
begin
 select role into actor from user_accounts where id=p_staff_user_id and active;
 if actor is null or actor not in('manager','housekeeping','owner','admin') then raise exception 'PO_RECEIVE_FORBIDDEN'; end if;
 select * into po from purchase_orders where id=p_po_id for update;
 if not found then raise exception 'PO_NOT_FOUND'; end if;
 select * into prior from purchase_order_receipts where po_id=p_po_id and expected_version=p_expected_version;
 if found then
  if prior.received_by<>p_staff_user_id or prior.items<>p_items_received_json then raise exception 'PO_STALE'; end if;
  return prior.result;
 end if;
 if po.status not in('approved','partially_received') then raise exception 'PO_NOT_APPROVED'; end if;
 if po.version<>p_expected_version then raise exception 'PO_STALE'; end if;
 if jsonb_typeof(p_items_received_json) is distinct from 'array' or jsonb_array_length(p_items_received_json)=0 then raise exception 'PO_INVALID_RECEIVED_QTY'; end if;
 if exists(select 1 from jsonb_array_elements(p_items_received_json) x group by x->>'itemId' having count(*)>1) then raise exception 'PO_INVALID_RECEIVED_QTY'; end if;
 if exists(select 1 from jsonb_array_elements(po.items) x group by x->>'itemId' having count(*)>1) then raise exception 'PO_DUPLICATE_LINES'; end if;
 totals:=po.received_quantities;
 for item in select * from jsonb_array_elements(p_items_received_json) loop
  iid:=item->>'itemId'; qty:=(item->>'quantity')::numeric;
  select value into line from jsonb_array_elements(po.items) where value->>'itemId'=iid;
  if not found or qty is null or qty<=0 or qty>100000 or qty<>trunc(qty) or qty::text='NaN' then raise exception 'PO_INVALID_RECEIVED_QTY'; end if;
  ordered:=(line->>'quantity')::numeric; received:=coalesce((totals->>iid)::numeric,0);
  if qty>ordered-received then raise exception 'PO_INVALID_RECEIVED_QTY'; end if;
  update inventory set quantity=coalesce(quantity,0)+qty,
   status=case when coalesce(quantity,0)+qty=0 then 'out'
     when coalesce(quantity,0)+qty<=reorder_point then 'low' else 'healthy' end,
   updated_at=now() where id=iid;
  if not found then raise exception 'PO_ITEM_NOT_FOUND'; end if;
  insert into inventory_movements(item_id,quantity,direction,source_type,source_id,recorded_by,note)
   values(iid,qty,'restock','purchase_order',po.id::text,p_staff_user_id,'PO receipt');
  totals:=jsonb_set(totals,array[iid],to_jsonb(received+qty),true);
 end loop;
 for line in select * from jsonb_array_elements(po.items) loop
  if coalesce((totals->>(line->>'itemId'))::numeric,0)<(line->>'quantity')::numeric then done:=false; end if;
 end loop;
 next_status:=case when done then 'received' else 'partially_received' end;
 update purchase_orders set received_quantities=totals,status=next_status,version=version+1,
  received_at=case when done then now() else null end,received_by=case when done then p_staff_user_id else null end where id=po.id;
 result:=jsonb_build_object('status',next_status,'version',po.version+1,'receivedQuantities',totals);
 insert into purchase_order_receipts(po_id,expected_version,received_by,items,result) values(po.id,p_expected_version,p_staff_user_id,p_items_received_json,result);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_staff_user_id,'purchase_order_receipt','purchase_order',po.id::text,result||jsonb_build_object('items',p_items_received_json));
 return result;
end$$;

revoke all on function public.inventory_receive_purchase_order(uuid,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.inventory_receive_purchase_order(uuid,uuid,jsonb,integer) to service_role;

commit;
