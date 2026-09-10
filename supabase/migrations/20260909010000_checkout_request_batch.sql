-- Feature (DB): one checkout = one guest-request submission batch.
-- file_booking_guest_requests previously let every auto-filed row take the
-- batch_id column default, so a checkout that selected three options filed as
-- three separate submissions in the portal request history. All rows filed by
-- one invocation now share batch_id = md5(reservation_id||'|checkout') -- one
-- reservation comes from exactly one checkout, so the grouping is exact, never
-- a timestamp guess. Existing auto-filed rows are regrouped the same
-- deterministic way: only the filer stamps idempotency_key md5(rid|opt) /
-- md5(rid|general), so key-matching cannot touch a portal or staff-filed row.

create or replace function public.file_booking_guest_requests(p_reservation_id text)returns integer language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;opt text;dept text;label text;key uuid;b uuid;n int:=0;begin
 select * into r from reservations where id=p_reservation_id;if not found then return 0;end if;
 b:=md5(r.id||'|checkout')::uuid;
 if jsonb_typeof(coalesce(r.request_options,'[]'::jsonb))='array'then
  for opt in select e.value#>>'{}' from jsonb_array_elements(coalesce(r.request_options,'[]'::jsonb))e loop
   if opt is null or char_length(opt)=0 or char_length(opt)>40 then continue;end if;
   key:=md5(r.id||'|'||opt)::uuid;
   if exists(select 1 from guest_requests where idempotency_key=key)then continue;end if;
   select g.department,g.label into dept,label from public.guest_request_route(opt) g;
   insert into guest_requests(reservation_id,guest_id,request,request_type,department,priority,status,requested_action,batch_id,idempotency_key)
   values(r.id,r.guest_id,label,opt,dept,'normal','open','{}'::jsonb,b,key);n:=n+1;
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

-- Regroup rows the old filer auto-filed (deterministic keys only -- no
-- timestamps, no customer/reservation grouping). Portal submissions keep their
-- idempotency-key batch; staff-filed rows keep their own.
update public.guest_requests g set batch_id=md5(g.reservation_id||'|checkout')::uuid
where exists(
 select 1 from reservations r
 where r.id=g.reservation_id
  and(g.idempotency_key=md5(r.id||'|general')::uuid
   or exists(select 1 from jsonb_array_elements(coalesce(r.request_options,'[]'::jsonb))e
             where g.idempotency_key=md5(r.id||'|'||(e.value#>>'{}'))::uuid)));

revoke all on function public.file_booking_guest_requests(text) from public,anon,authenticated;
grant execute on function public.file_booking_guest_requests(text) to service_role;
