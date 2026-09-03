-- Feature 2 (DB): structured multi guest requests.
-- Booking checkout options ride the hold -> reservation as request_options (jsonb
-- array of request-type keys); on reaching status='confirmed' each chosen option is
-- auto-filed as a real guest_requests row routed via the shared guest_request_route()
-- helper, plus one 'general' row for the free-text "Other" note. The portal Requests
-- module also gains a multi-pick bulk RPC. Routing lives in exactly one place
-- (guest_request_route) so the auto-filer, the portal single insert and the portal
-- bulk insert never diverge.
alter table public.booking_holds add column if not exists request_options jsonb not null default '[]';
alter table public.reservations add column if not exists request_options jsonb not null default '[]';

-- Shared routing helper: department + human label per request type. Unknown types
-- fall back to front_desk with an underscored-to-spaced label (never raise -- the
-- app zod whitelist is the real gate, the DB stays permissive).
create or replace function public.guest_request_route(p_request_type text)
returns table(department text,label text) language sql security definer set search_path=public as $$
select
 case p_request_type
  when'extra_towels'then 'housekeeping' when'extra_pillows'then 'housekeeping'
  when'toiletries'then 'housekeeping' when'baby_crib'then 'housekeeping'
  when'housekeeping'then 'housekeeping' when'maintenance'then 'maintenance'
  else 'front_desk' end,
 case p_request_type
  when'extra_towels'then 'Extra towels' when'extra_pillows'then 'Extra pillows'
  when'toiletries'then 'Toiletries' when'baby_crib'then 'Baby crib'
  when'housekeeping'then 'Housekeeping request' when'maintenance'then 'Maintenance concern'
  when'room_assistance'then 'Room assistance' when'room_change'then 'Room change request'
  when'stay_extension'then 'Stay extension request' when'general'then 'General hotel assistance'
  when'high_floor_quiet'then 'High floor / quiet room request'
  when'early_check_in'then 'Early check-in request' when'late_check_out'then 'Late check-out request'
  when'celebration'then 'Celebration arrangement request'
  else replace(p_request_type,'_',' ') end;$$;

-- create_booking_hold: gains p_request_options. Recreated (was 13-arg) so the param
-- joins the defaults; body otherwise preserved from the live definition (deposit
-- policy snapshot, advisory inventory lock, special_requests handling unchanged).
-- Room total/deposit are unaffected -- requests are not money.
drop function if exists public.create_booking_hold(uuid,text,date,date,integer,text,text,text,text,text,text,text,text);
create or replace function public.create_booking_hold(p_user_id uuid,p_room_type text,p_check_in date,p_check_out date,p_guest_count integer,p_first_name text,p_last_name text,p_email text,p_mobile text,p_address text default null,p_nationality text default null,p_expected_arrival text default null,p_special_requests text default null,p_request_options jsonb default '[]'::jsonb)returns uuid language plpgsql security definer set search_path=public as $$
declare t room_types%rowtype;p reservation_deposit_policies%rowtype;inventory int;reserved int;held int;nights int;total numeric(12,2);required numeric(12,2);result uuid;
begin
 perform expire_booking_holds();
 if p_check_in<current_date or p_check_out<=p_check_in then raise exception 'INVALID_DATES';end if;
 if p_guest_count<1 then raise exception 'INVALID_GUEST_COUNT';end if;
 if nullif(trim(p_first_name),'')is null or nullif(trim(p_last_name),'')is null or nullif(trim(p_email),'')is null or nullif(trim(p_mobile),'')is null then raise exception 'INVALID_GUEST_DETAILS';end if;
 if coalesce(p_request_options,'[]'::jsonb)::text<>'[]'and (jsonb_typeof(coalesce(p_request_options,'[]'::jsonb))<>'array' or exists(select 1 from jsonb_array_elements(coalesce(p_request_options,'[]'::jsonb))e where jsonb_typeof(e.value)<>'string' or coalesce(e.value#>>'{}','')='' or char_length(e.value#>>'{}')>40))then raise exception 'INVALID_REQUEST_OPTIONS';end if;
 select * into p from reservation_deposit_policies where key='online_reservation' and active_from<=now();if not found or not p.enabled then raise exception 'DEPOSIT_POLICY_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(p_room_type),0));
 select * into t from room_types where name=p_room_type and active;if not found or p_guest_count>t.max_guests then raise exception 'ROOM_TYPE_UNAVAILABLE';end if;
 select count(*)into inventory from rooms r where r.type=p_room_type and r.status<>'maintenance' and(p_check_in>current_date or r.housekeeping='clean');
 select count(*)into reserved from reservations r where r.room_type=p_room_type and(r.status in('confirmed','checked_in')or(r.status='pending'and(lower(coalesce(r.source,''))<>'website'or r.payment_due_at is null or r.payment_due_at>now())))and r.check_in<p_check_out and r.check_out>p_check_in;
 select count(*)into held from booking_holds h where h.room_type=p_room_type and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<p_check_out and h.check_out>p_check_in;
 if inventory-reserved-held<=0 then raise exception 'ROOM_TYPE_UNAVAILABLE';end if;
 nights:=p_check_out-p_check_in;total:=round(t.base_rate*nights,2);required:=case p.calculation_type when'percentage'then round(total*p.percentage_basis_points/10000.0,2)else least(total,round(p.fixed_amount,2))end;
 insert into booking_holds(user_id,room_type,check_in,check_out,guest_count,nightly_rate,subtotal,total,deposit_required,deposit_policy_snapshot,first_name,last_name,email,mobile,address,nationality,expected_arrival,special_requests,request_options,expires_at)
 values(p_user_id,p_room_type,p_check_in,p_check_out,p_guest_count,t.base_rate,total,total,required,jsonb_build_object('key',p.key,'calculationType',p.calculation_type,'percentageBasisPoints',p.percentage_basis_points,'fixedAmount',p.fixed_amount,'remainingBalanceDue',p.remaining_balance_due),trim(p_first_name),trim(p_last_name),lower(trim(p_email)),trim(p_mobile),nullif(trim(p_address),''),nullif(trim(p_nationality),''),nullif(trim(p_expected_arrival),''),nullif(trim(p_special_requests),''),coalesce(p_request_options,'[]'::jsonb),now()+make_interval(mins=>p.hold_minutes))returning token into result;return result;
end$$;

-- submit_reservation_deposit: carry request_options from the hold onto the reservation.
create or replace function public.submit_reservation_deposit(p_token uuid,p_user_id uuid,p_payment_method text,p_payment_reference text)
returns table(reservation_id text,confirmation_number text,reservation_status text,payment_status text,deposit_required numeric,remaining_balance numeric)
language plpgsql security definer set search_path=public as $$
declare h booking_holds%rowtype;t room_types%rowtype;inventory int;reserved int;guest text;rid text;iid text;confirmation text;
begin
 perform expire_booking_holds();select * into h from booking_holds where token=p_token and user_id=p_user_id for update;if not found then raise exception'HOLD_NOT_FOUND';end if;
 if h.reservation_id is not null then return query select r.id,r.confirmation_number,r.status,r.payment_status,r.deposit_required,greatest(r.total-coalesce(i.paid,0),0)from reservations r left join invoices i on i.reservation_id=r.id where r.id=h.reservation_id;return;end if;
 if h.status<>'active'or h.expires_at<=now()then raise exception'HOLD_EXPIRED';end if;
 if p_payment_method not in('manual_bank_transfer','manual_gcash')then raise exception'UNSUPPORTED_PAYMENT_METHOD';end if;
 if nullif(trim(p_payment_reference),'')is null or length(trim(p_payment_reference))>120 then raise exception'INVALID_PAYMENT_REFERENCE';end if;
 if h.deposit_required<=0 then raise exception'INVALID_DEPOSIT_AMOUNT';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(h.room_type),0));select * into t from room_types where name=h.room_type and active;
 if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;if round(t.base_rate,2)<>round(h.nightly_rate,2)then raise exception'RATE_CHANGED';end if;
 select count(*)into inventory from rooms r where r.type=h.room_type and r.status<>'maintenance'and(h.check_in>current_date or r.housekeeping='clean');
 select count(*)into reserved from reservations r where r.room_type=h.room_type and(r.status in('confirmed','checked_in')or(r.status='pending'and(lower(coalesce(r.source,''))<>'website'or r.payment_due_at is null or r.payment_due_at>now())))and r.check_in<h.check_out and r.check_out>h.check_in;
 if inventory-reserved<=0 then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 select g.id into guest from guests g where g.user_account_id=p_user_id or lower(g.email)=lower(h.email)order by(g.user_account_id=p_user_id)desc limit 1 for update;
 if guest is null then insert into guests(name,first_name,last_name,email,phone,user_account_id,address,nationality,special_requests)values(trim(h.first_name||' '||h.last_name),h.first_name,h.last_name,h.email,h.mobile,p_user_id,h.address,h.nationality,h.special_requests)returning id into guest;
 else update guests set user_account_id=coalesce(user_account_id,p_user_id),name=trim(h.first_name||' '||h.last_name),first_name=h.first_name,last_name=h.last_name,phone=h.mobile,address=coalesce(h.address,address),nationality=coalesce(h.nationality,nationality),special_requests=coalesce(h.special_requests,special_requests)where id=guest;end if;
 confirmation:='HVN-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 insert into reservations(guest_id,user_id,guest_name,guest_email,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,deposit_policy_snapshot,operational_policy_snapshot,special_requests,request_options,expected_arrival,payment_status,payment_method,payment_due_at,confirmation_number,idempotency_key)
 values(guest,p_user_id,trim(h.first_name||' '||h.last_name),h.email,h.room_type,h.check_in,h.check_out,h.guest_count,'pending','Website',h.total,0,h.deposit_required,h.deposit_policy_snapshot,h.operational_policy_snapshot,h.special_requests,h.request_options,h.expected_arrival,'unpaid',p_payment_method,h.expires_at,confirmation,p_token)returning id into rid;
 insert into invoices(reservation_id,guest_name,amount,paid,balance,status,method,due_date)values(rid,trim(h.first_name||' '||h.last_name),h.total,0,h.total,'unpaid',p_payment_method,h.check_in)returning id into iid;
 insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key)values(iid,rid,h.deposit_required,'PHP',p_payment_method,trim(p_payment_reference),'reservation_deposit','pending_verification',p_token);
 update booking_holds set status='payment_submitted',reservation_id=rid,guarantee_method=null,submitted_at=now()where token=p_token;
 return query select rid,confirmation,'pending'::text,'unpaid'::text,h.deposit_required,h.total-h.deposit_required;
end$$;

-- Auto-filer: files one guest_requests row per request_options key (and one 'general'
-- row for a non-empty special_requests free-text note). Deterministic idempotency key
-- per (reservation,type) + a guard that skips any already-filed key make re-runs a
-- no-op rather than a duplicate (partial-unique index on idempotency_key).
create or replace function public.file_booking_guest_requests(p_reservation_id text)returns integer language plpgsql security definer set search_path=public as $$
declare r reservations%rowtype;opt text;dept text;label text;key uuid;n int:=0;begin
 select * into r from reservations where id=p_reservation_id;if not found then return 0;end if;
 if jsonb_typeof(coalesce(r.request_options,'[]'::jsonb))='array'then
  for opt in select e.value#>>'{}' from jsonb_array_elements(coalesce(r.request_options,'[]'::jsonb))e loop
   if opt is null or char_length(opt)=0 or char_length(opt)>40 then continue;end if;
   key:=md5(r.id||'|'||opt)::uuid;
   if exists(select 1 from guest_requests where idempotency_key=key)then continue;end if;
   select g.department,g.label into dept,label from public.guest_request_route(opt) g;
   insert into guest_requests(reservation_id,guest_id,request,request_type,department,priority,status,requested_action,idempotency_key)
   values(r.id,r.guest_id,label,opt,dept,'normal','open','{}'::jsonb,key);n:=n+1;
  end loop;
 end if;
 if nullif(trim(coalesce(r.special_requests,'')),'')is not null then
  key:=md5(r.id||'|general')::uuid;
  if not exists(select 1 from guest_requests where idempotency_key=key)then
   insert into guest_requests(reservation_id,guest_id,request,request_type,department,priority,status,requested_action,idempotency_key)
   values(r.id,r.guest_id,trim(r.special_requests),'general','front_desk','normal','open','{}'::jsonb,key);n:=n+1;
  end if;
 end if;
 if n>0 then insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(null,'file_booking_guest_requests','reservation',r.id,jsonb_build_object('requestCount',n));end if;
 return n;end$$;

-- Auto-file trigger: fires once on each path into 'confirmed' (deposit verification
-- and any other status transition/insert), restricted to website-source reservations
-- (only the website checkout carries structured request_options; front-desk bookings
-- are handled directly by staff).
create or replace function public.trigger_file_booking_requests()returns trigger language plpgsql security definer set search_path=public as $$
begin
 if lower(coalesce(new.source,''))='website'and new.status='confirmed'and(old is null or old.status is distinct from'confirmed')then
  perform public.file_booking_guest_requests(new.id);
 end if;
 return new;end$$;
drop trigger if exists file_booking_requests_on_confirm on public.reservations;
create trigger file_booking_requests_on_confirm after insert or update of status on public.reservations
 for each row execute function public.trigger_file_booking_requests();

-- Bulk multi-pick for the portal Requests module: guards match the single insert
-- (NULL-safe guest check, ownership, confirmed/checked_in), optional shared description,
-- per-row deterministic idempotency derived from the client key so a retried submit
-- cannot stack, stay_extension still validated against the reservation check-out.
create or replace function public.customer_submit_guest_requests(p_user_id uuid,p_reservation_id text,p_request_types text[],p_description text,p_requested_action jsonb,p_idempotency_key uuid)
returns table(id uuid,status text)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;existing guest_requests%rowtype;dept text;label text;reqtext text;key uuid;rt text;rid uuid;begin
 select role into actor from user_accounts ua where ua.id=p_user_id and ua.active;if actor is null or actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 if array_length(p_request_types,1)is null or array_length(p_request_types,1)>12 then raise exception'INVALID_REQUEST';end if;
 if length(coalesce(p_description,''))>500 or p_idempotency_key is null then raise exception'INVALID_REQUEST';end if;
 select * into r from reservations rr where rr.id=p_reservation_id and rr.user_id=p_user_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;
 if r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_REQUEST_READY';end if;
 foreach rt in array p_request_types loop
  if rt is null or char_length(trim(rt))=0 then continue;end if;
  key:=md5(p_idempotency_key::text||'|'||trim(rt))::uuid;
  select * into existing from guest_requests where idempotency_key=key;if found then return query select existing.id,existing.status;continue;end if;
  if trim(rt)='stay_extension'and(coalesce(p_requested_action->>'requestedCheckOut','')!~'^\d{4}-\d{2}-\d{2}$'or(p_requested_action->>'requestedCheckOut')::date<=r.check_out)then raise exception'INVALID_EXTENSION_DATE';end if;
  select g.department,g.label into dept,label from public.guest_request_route(trim(rt)) g;
  reqtext:=case when nullif(trim(coalesce(p_description,'')),'')is null then label else label||': '||trim(p_description)end;
  insert into guest_requests(reservation_id,guest_id,request,request_type,requested_action,department,priority,status,idempotency_key)
  values(r.id,r.guest_id,reqtext,trim(rt),coalesce(p_requested_action,'{}'),dept,'normal','open',key)returning guest_requests.id into rid;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_user_id,'customer_submit_guest_requests','guest_request',rid::text,jsonb_build_object('reservationId',r.id,'requestType',trim(rt),'department',dept));
  return query select rid,'open'::text;
 end loop;end$$;

-- Single portal insert: routing now comes from guest_request_route (one source of
-- truth). NULL-safe guest guard, required description, ownership and stay_extension
-- behaviour unchanged.
create or replace function public.customer_submit_guest_request(p_user_id uuid,p_reservation_id text,p_request_type text,p_description text,p_requested_action jsonb,p_idempotency_key uuid)
returns table(id uuid,status text)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;existing guest_requests%rowtype;dept text;label text;rid uuid;begin
 select role into actor from user_accounts ua where ua.id=p_user_id and ua.active;if actor is null or actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 if nullif(trim(p_description),'')is null or length(trim(p_description))>500 then raise exception'INVALID_REQUEST';end if;
 select * into existing from guest_requests where idempotency_key=p_idempotency_key;if found then return query select existing.id,existing.status;return;end if;
 select * into r from reservations rr where rr.id=p_reservation_id and rr.user_id=p_user_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;
 if r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_REQUEST_READY';end if;
 select g.department,g.label into dept,label from public.guest_request_route(p_request_type) g;
 if p_request_type='stay_extension'and(coalesce(p_requested_action->>'requestedCheckOut','')!~'^\d{4}-\d{2}-\d{2}$'or(p_requested_action->>'requestedCheckOut')::date<=r.check_out)then raise exception'INVALID_EXTENSION_DATE';end if;
 insert into guest_requests(reservation_id,guest_id,request,request_type,requested_action,department,priority,status,idempotency_key)
 values(r.id,r.guest_id,label||': '||trim(p_description),p_request_type,coalesce(p_requested_action,'{}'),dept,'normal','open',p_idempotency_key)returning guest_requests.id into rid;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_user_id,'customer_submit_guest_request','guest_request',rid::text,jsonb_build_object('reservationId',r.id,'requestType',p_request_type,'department',dept));
 return query select rid,'open'::text;end$$;

-- Housekeeping auto-task hardening. A guest_requests insert in department
-- 'housekeeping' used to force-create a housekeeping_task immediately, but
-- housekeeping_tasks.room_number is NOT NULL -- so a housekeeping request filed
-- against a reservation with no assigned room yet (every website confirmation, and
-- any confirmed-but-unchecked-in portal request) raised a NOT-NULL violation that
-- aborted the whole transaction (e.g. deposit verification). Now the task is deferred
-- until a room is assigned, when link_housekeeping_tasks_to_assigned_room() creates
-- it. Behaviour for requests filed in-house (room already assigned) is unchanged.
create or replace function public.ensure_housekeeping_task_for_guest_request(p_guest_request_id uuid)returns text language plpgsql security definer set search_path=public as $$
declare gr guest_requests%rowtype;r reservations%rowtype;task_id text;begin
 select * into gr from guest_requests where id=p_guest_request_id;if not found or gr.department<>'housekeeping'then return null;end if;
 select rv.* into r from reservations rv where rv.id=gr.reservation_id;if r.room_number is null then return null;end if;
 insert into housekeeping_tasks(room_id,room_number,reservation_id,guest_request_id,task,task_type,priority,status,due,notes,source_type,source_id)
 values(r.room_id,r.room_number,r.id,gr.id,gr.request,'guest_request',case when gr.priority in('high','urgent')then gr.priority else'normal'end,'pending','Guest requested service','Created from authoritative Guest Request','guest_request',gr.id::text)
 on conflict do nothing returning id into task_id;
 if task_id is not null then insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(null,'create_housekeeping_task_from_guest_request','housekeeping_task',task_id,jsonb_build_object('guestRequestId',gr.id,'reservationId',r.id,'roomId',r.room_id));end if;
 return task_id;end$$;
create or replace function public.create_housekeeping_task_for_guest_request()returns trigger language plpgsql security definer set search_path=public as $$
begin perform public.ensure_housekeeping_task_for_guest_request(new.id);return new;end$$;
create or replace function public.link_housekeeping_tasks_to_assigned_room()returns trigger language plpgsql security definer set search_path=public as $$
declare gr guest_requests%rowtype;begin
 if new.room_id is not null and new.room_id is distinct from old.room_id then
  update housekeeping_tasks set room_id=new.room_id,room_number=new.room_number,updated_at=now(),version=version+1 where reservation_id=new.id and room_id is null and status in('pending','assigned','deferred');
  for gr in select g.* from guest_requests g where g.reservation_id=new.id and g.department='housekeeping' and g.status in('open','in_progress') and not exists(select 1 from housekeeping_tasks h where h.source_type='guest_request' and h.source_id=g.id::text and h.status<>'cancelled')loop
   perform public.ensure_housekeeping_task_for_guest_request(gr.id);
  end loop;
 end if;return new;end$$;

revoke all on function public.guest_request_route(text),public.file_booking_guest_requests(text),public.trigger_file_booking_requests(),public.customer_submit_guest_requests(uuid,text,text[],text,jsonb,uuid),public.customer_submit_guest_request(uuid,text,text,text,jsonb,uuid),public.ensure_housekeeping_task_for_guest_request(uuid),public.create_housekeeping_task_for_guest_request(),public.link_housekeeping_tasks_to_assigned_room() from public,anon,authenticated;
revoke all on function public.create_booking_hold(uuid,text,date,date,integer,text,text,text,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.submit_reservation_deposit(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.guest_request_route(text),public.file_booking_guest_requests(text),public.trigger_file_booking_requests(),public.customer_submit_guest_requests(uuid,text,text[],text,jsonb,uuid),public.customer_submit_guest_request(uuid,text,text,text,jsonb,uuid),public.ensure_housekeeping_task_for_guest_request(uuid),public.create_housekeeping_task_for_guest_request(),public.link_housekeeping_tasks_to_assigned_room() to service_role;
grant execute on function public.create_booking_hold(uuid,text,date,date,integer,text,text,text,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.submit_reservation_deposit(uuid,uuid,text,text) to service_role;
