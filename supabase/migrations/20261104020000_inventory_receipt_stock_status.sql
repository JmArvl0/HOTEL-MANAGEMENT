-- Receipt stock status follows the same quantity/reorder rules as hms_stock_movement.
-- Live ledger inspected 2026-11-04 before numbering; last remote 20261103150000.
-- Local additive replacement only. Preserve receipt audit, movement and immutability rules.
begin;

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
      update inventory set quantity = coalesce(quantity,0) + rqty,
        status=case when coalesce(quantity,0)+rqty=0 then 'out'
          when coalesce(quantity,0)+rqty<=reorder_point then 'low' else 'healthy' end,
        updated_at=now() where id=iid;
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

revoke all on function public.inventory_receive_purchase_order(uuid,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.inventory_receive_purchase_order(uuid,uuid,jsonb,integer) to service_role;

commit;
