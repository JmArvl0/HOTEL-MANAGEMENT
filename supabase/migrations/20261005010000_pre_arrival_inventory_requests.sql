-- Pre-arrival inventory request options (Manager-governed).
--
-- A guest_request_catalog row may link an inventory item AND opt into
-- pre-arrival (booking checkout) visibility, INDEPENDENTLY of the in-stay
-- portal's `active` flag:
--   active + pre_arrival_requestable + linked item quantity > 0 → offered at checkout.
-- In-stay Guest Requests behavior (active rows only) is unchanged.
--
-- Stock rule: inventory.quantity is authoritative. inventory.status is
-- staff-maintained display state (no trigger keeps it in sync with quantity),
-- so visibility gating uses quantity only; a stale status can neither hide an
-- available item nor expose an empty one.
--
-- guest_requests gains a nullable inventory_item_id FK so filed rows reference
-- the exact item; fulfillment consumes it exactly (legacy rows without the FK
-- keep the name-matching fallback). Nothing is reserved or decremented at
-- request time — consumption stays at fulfillment.
--
-- Governance for the two new columns is enforced at the API route layer
-- (Manager-only); RLS posture is unchanged (service-role-only tables).

alter table public.guest_request_catalog
  add column if not exists inventory_item_id text references public.inventory(id) on delete set null,
  add column if not exists pre_arrival_requestable boolean not null default false;

-- One inventory item backs at most one request type.
create unique index if not exists guest_request_catalog_inventory_item_uidx
  on public.guest_request_catalog(inventory_item_id) where inventory_item_id is not null;

alter table public.guest_requests
  add column if not exists inventory_item_id text references public.inventory(id) on delete set null;

create index if not exists guest_requests_inventory_item_idx
  on public.guest_requests(inventory_item_id) where inventory_item_id is not null;

-- file_booking_guest_requests: same batching/idempotency as 20260909010000,
-- plus stamping inventory_item_id from the catalog row (null when unlinked).
create or replace function public.file_booking_guest_requests(p_reservation_id text)returns integer language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;opt text;dept text;label text;item_id text;key uuid;b uuid;n int:=0;begin
 select * into r from reservations where id=p_reservation_id;if not found then return 0;end if;
 b:=md5(r.id||'|checkout')::uuid;
 if jsonb_typeof(coalesce(r.request_options,'[]'::jsonb))='array'then
  for opt in select e.value#>>'{}' from jsonb_array_elements(coalesce(r.request_options,'[]'::jsonb))e loop
   if opt is null or char_length(opt)=0 or char_length(opt)>40 then continue;end if;
   key:=md5(r.id||'|'||opt)::uuid;
   if exists(select 1 from guest_requests where idempotency_key=key)then continue;end if;
   select g.department,g.label,g.inventory_item_id into dept,label,item_id from public.guest_request_catalog g where g.value=opt and g.active limit 1;
   if dept is null then select g.department,g.label into dept,label from public.guest_request_route(opt) g;end if;
   insert into guest_requests(reservation_id,guest_id,request,request_type,department,priority,status,requested_action,batch_id,idempotency_key,inventory_item_id)
   values(r.id,r.guest_id,label,opt,dept,'normal','open','{}'::jsonb,b,key,item_id);n:=n+1;
  end loop;
 end if;
 if nullif(trim(coalesce(r.special_requests,'')),'')is not null then
  key:=md5(r.id||'|general')::uuid;
  if not exists(select 1 from guest_requests where idempotency_key=key)then
   insert into guest_requests(reservation_id,guest_id,request,request_type,department,priority,status,requested_action,batch_id,idempotency_key)
   values(r.id,r.guest_id,trim(r.special_requests),'general','front_desk','normal','open','{}'::jsonb,b,key);n:=n+1;
  end if;
 end if;
 if n>0 then insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(null,'file_booking_guest_requests','reservation',r.id,jsonb_build_object('requestCount',n));end if;
 return n;end$$;

revoke all on function public.file_booking_guest_requests(text) from public,anon,authenticated;
grant execute on function public.file_booking_guest_requests(text) to service_role;
