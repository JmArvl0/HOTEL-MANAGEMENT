-- Feature 3 (DB): transport (fleet) booking at checkout, charged to the folio as its
-- own line at confirmation, paid separately from the room deposit.
--
-- Design:
--  * transport_services is the manager-maintained price list (owner/admin/manager write,
--    service-role reads; RLS on with no grants, so only the bypassing service role reads
--    it server-side).
--  * Selected transport rides hold -> reservation as transport_lines (jsonb array of
--    {name,price,note}) exactly like request_options from Feature 2. Room total/deposit
--    stay room-only through deposit verification.
--  * verify_reservation_deposit (live body preserved, transport appended) posts each
--    line as its own folio_charges row (source='transport', category='transport',
--    deterministic idempotency_key), bumps invoice.amount and reservation.total, then
--    re-syncs invoice financials so the guest pays transport via the normal balance /
--    pay flow (deposit is never touched by transport).
--  * A trigger reverses those folio lines (status='reversed', totals drop back to
--    room-only) when a confirmed transport reservation is cancelled or no-showed;
--    deposit-based refunds are unaffected.

-- Catalog table
create table if not exists public.transport_services(
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 description text,
 price numeric(12,2) not null check(price>0),
 unit text not null default 'per trip',
 active boolean not null default true,
 sort integer not null default 0,
 version integer not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now());
insert into public.transport_services(name,description,price,unit,sort)values
 ('Makati to NAIA airport transfer','Door-to-door airport transfer between Makati and NAIA terminals.',1200.00,'per trip',1),
 ('Makati to Tagaytay day trip','Full-day trip to Tagaytay with hotel pickup and drop-off.',4500.00,'per trip',2),
 ('Evening city tour shuttle','Guided evening tour of Makati and Bonifacio Global City landmarks.',1800.00,'per trip',3)
 on conflict(name)do nothing;
alter table public.transport_services enable row level security;

alter table public.booking_holds add column if not exists transport_lines jsonb not null default '[]';
alter table public.reservations add column if not exists transport_lines jsonb not null default '[]';

-- create_booking_hold final: 15-arg (adds p_transport_lines). Body otherwise preserved
-- from the Feature 2 file (request_options validation + insert unchanged); the dropped
-- 14-arg overload is what Feature 2 created, so the drop/recreate below is additive and
-- matches the live sequence (F2 push then F3). Room total/deposit stay room-only.
drop function if exists public.create_booking_hold(uuid,text,date,date,integer,text,text,text,text,text,text,text,text,jsonb);
create or replace function public.create_booking_hold(p_user_id uuid,p_room_type text,p_check_in date,p_check_out date,p_guest_count integer,p_first_name text,p_last_name text,p_email text,p_mobile text,p_address text default null,p_nationality text default null,p_expected_arrival text default null,p_special_requests text default null,p_request_options jsonb default '[]'::jsonb,p_transport_lines jsonb default '[]'::jsonb)returns uuid language plpgsql security definer set search_path=public as $$
declare t room_types%rowtype;p reservation_deposit_policies%rowtype;inventory int;reserved int;held int;nights int;total numeric(12,2);required numeric(12,2);result uuid;
begin
 perform expire_booking_holds();
 if p_check_in<current_date or p_check_out<=p_check_in then raise exception 'INVALID_DATES';end if;
 if p_guest_count<1 then raise exception 'INVALID_GUEST_COUNT';end if;
 if nullif(trim(p_first_name),'')is null or nullif(trim(p_last_name),'')is null or nullif(trim(p_email),'')is null or nullif(trim(p_mobile),'')is null then raise exception 'INVALID_GUEST_DETAILS';end if;
 if coalesce(p_request_options,'[]'::jsonb)::text<>'[]'and (jsonb_typeof(coalesce(p_request_options,'[]'::jsonb))<>'array' or exists(select 1 from jsonb_array_elements(coalesce(p_request_options,'[]'::jsonb))e where jsonb_typeof(e.value)<>'string' or coalesce(e.value#>>'{}','')='' or char_length(e.value#>>'{}')>40))then raise exception 'INVALID_REQUEST_OPTIONS';end if;
 if coalesce(p_transport_lines,'[]'::jsonb)::text<>'[]'and(jsonb_typeof(coalesce(p_transport_lines,'[]'::jsonb))<>'array' or (select count(*)from jsonb_array_elements(coalesce(p_transport_lines,'[]'::jsonb)))>12 or exists(select 1 from jsonb_array_elements(coalesce(p_transport_lines,'[]'::jsonb))ln where jsonb_typeof(ln.value)<>'object' or nullif(trim(coalesce(ln.value->>'name','')),'')is null or char_length(ln.value->>'name')>120 or coalesce(ln.value->>'price','')!~'^[0-9]+(\.[0-9]{1,2})?$' or (ln.value->>'price')::numeric<=0))then raise exception 'INVALID_TRANSPORT_LINE';end if;
 select * into p from reservation_deposit_policies where key='online_reservation' and active_from<=now();if not found or not p.enabled then raise exception 'DEPOSIT_POLICY_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(p_room_type),0));
 select * into t from room_types where name=p_room_type and active;if not found or p_guest_count>t.max_guests then raise exception 'ROOM_TYPE_UNAVAILABLE';end if;
 select count(*)into inventory from rooms r where r.type=p_room_type and r.status<>'maintenance' and(p_check_in>current_date or r.housekeeping='clean');
 select count(*)into reserved from reservations r where r.room_type=p_room_type and(r.status in('confirmed','checked_in')or(r.status='pending'and(lower(coalesce(r.source,''))<>'website'or r.payment_due_at is null or r.payment_due_at>now())))and r.check_in<p_check_out and r.check_out>p_check_in;
 select count(*)into held from booking_holds h where h.room_type=p_room_type and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<p_check_out and h.check_out>p_check_in;
 if inventory-reserved-held<=0 then raise exception 'ROOM_TYPE_UNAVAILABLE';end if;
 nights:=p_check_out-p_check_in;total:=round(t.base_rate*nights,2);required:=case p.calculation_type when'percentage'then round(total*p.percentage_basis_points/10000.0,2)else least(total,round(p.fixed_amount,2))end;
 insert into booking_holds(user_id,room_type,check_in,check_out,guest_count,nightly_rate,subtotal,total,deposit_required,deposit_policy_snapshot,first_name,last_name,email,mobile,address,nationality,expected_arrival,special_requests,request_options,transport_lines,expires_at)
 values(p_user_id,p_room_type,p_check_in,p_check_out,p_guest_count,t.base_rate,total,total,required,jsonb_build_object('key',p.key,'calculationType',p.calculation_type,'percentageBasisPoints',p.percentage_basis_points,'fixedAmount',p.fixed_amount,'remainingBalanceDue',p.remaining_balance_due),trim(p_first_name),trim(p_last_name),lower(trim(p_email)),trim(p_mobile),nullif(trim(p_address),''),nullif(trim(p_nationality),''),nullif(trim(p_expected_arrival),''),nullif(trim(p_special_requests),''),coalesce(p_request_options,'[]'::jsonb),coalesce(p_transport_lines,'[]'::jsonb),now()+make_interval(mins=>p.hold_minutes))returning token into result;return result;
end$$;

-- submit_reservation_deposit: carry transport_lines (like request_options) from the
-- hold onto the reservation. Same signature; body otherwise unchanged.
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
 insert into reservations(guest_id,user_id,guest_name,guest_email,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,deposit_policy_snapshot,operational_policy_snapshot,special_requests,request_options,transport_lines,expected_arrival,payment_status,payment_method,payment_due_at,confirmation_number,idempotency_key)
 values(guest,p_user_id,trim(h.first_name||' '||h.last_name),h.email,h.room_type,h.check_in,h.check_out,h.guest_count,'pending','Website',h.total,0,h.deposit_required,h.deposit_policy_snapshot,h.operational_policy_snapshot,h.special_requests,h.request_options,h.transport_lines,h.expected_arrival,'unpaid',p_payment_method,h.expires_at,confirmation,p_token)returning id into rid;
 insert into invoices(reservation_id,guest_name,amount,paid,balance,status,method,due_date)values(rid,trim(h.first_name||' '||h.last_name),h.total,0,h.total,'unpaid',p_payment_method,h.check_in)returning id into iid;
 insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key)values(iid,rid,h.deposit_required,'PHP',p_payment_method,trim(p_payment_reference),'reservation_deposit','pending_verification',p_token);
 update booking_holds set status='payment_submitted',reservation_id=rid,guarantee_method=null,submitted_at=now()where token=p_token;
 return query select rid,confirmation,'pending'::text,'unpaid'::text,h.deposit_required,h.total-h.deposit_required;
end$$;

-- verify_reservation_deposit: recreated from the LIVE body (Feature-2 file never touched
-- it) with the transport-at-confirm posting appended just before the return. After the
-- existing confirm updates, each transport line becomes its own folio_charges row with a
-- deterministic idempotency_key (the partial unique index makes a re-entry a no-op);
-- invoice.amount and reservation.total are bumped by the transport total and invoice
-- financials re-synced. The earlier deposit/amount guards still run on room-only totals.
create or replace function public.verify_reservation_deposit(p_payment_id uuid,p_staff_user_id uuid)
returns table(reservation_id text,reservation_status text,payment_status text,deposit_paid numeric,remaining_balance numeric)language plpgsql security definer set search_path=public as $$
declare p payments%rowtype;r reservations%rowtype;i invoices%rowtype;h booking_holds%rowtype;actor text;inventory int;reserved int;paid_total numeric(12,2);ln jsonb;lname text;lprice numeric;v_posted numeric:=0;
begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','accounting')then raise exception'PAYMENT_VERIFICATION_FORBIDDEN';end if;
 perform expire_booking_holds();select * into p from payments where id=p_payment_id for update;if not found or p.purpose<>'reservation_deposit'then raise exception'PAYMENT_NOT_FOUND';end if;
 select * into r from reservations where id=p.reservation_id for update;select * into i from invoices where id=p.invoice_id for update;select bh.* into h from booking_holds bh where bh.reservation_id=r.id for update;
 if p.status='paid'then return query select r.id,r.status,r.payment_status,coalesce(r.deposit,0),greatest(i.balance,0);return;end if;
 if p.status<>'pending_verification'then raise exception'PAYMENT_NOT_PENDING';end if;
 if h.status<>'payment_submitted'or h.expires_at<=now()or r.status<>'pending'then raise exception'HOLD_EXPIRED';end if;
 if round(p.amount,2)<>round(r.deposit_required,2)or round(i.amount,2)<>round(r.total,2)then raise exception'PAYMENT_AMOUNT_MISMATCH';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(r.room_type),0));
 select count(*)into inventory from rooms x where x.type=r.room_type and x.status<>'maintenance'and(r.check_in>current_date or x.housekeeping='clean');
 select count(*)into reserved from reservations x where x.id<>r.id and x.room_type=r.room_type and(x.status in('confirmed','checked_in')or(x.status='pending'and(lower(coalesce(x.source,''))<>'website'or x.payment_due_at is null or x.payment_due_at>now())))and x.check_in<r.check_out and x.check_out>r.check_in;
 if inventory-reserved<=0 then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 update payments set status='paid',verified_at=now(),received_by=p_staff_user_id where id=p.id;
 select coalesce(sum(amount),0)into paid_total from payments where invoice_id=i.id and status='paid'and purpose<>'refund';
 update invoices set paid=least(paid_total,amount),balance=greatest(amount-paid_total,0),status=case when paid_total>=amount then'paid'else'partial'end where id=i.id;
 update reservations set status='confirmed',deposit=p.amount,payment_status=case when paid_total>=total then'paid'else'partial'end where id=r.id;
 update booking_holds set status='completed'where token=h.token;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'verify_reservation_deposit','payment',p.id::text,jsonb_build_object('reservationId',r.id,'amount',p.amount,'reference',p.reference));
 -- Transport booked at checkout is posted here, as its own folio lines, once.
 if jsonb_typeof(coalesce(r.transport_lines,'[]'::jsonb))='array'and jsonb_array_length(coalesce(r.transport_lines,'[]'::jsonb))>0 then
  for ln in select e.value from jsonb_array_elements(coalesce(r.transport_lines,'[]'::jsonb))e loop
   lname:=coalesce(ln->>'name','');lprice:=coalesce((ln->>'price')::numeric,0);
   if nullif(trim(lname),'')is null or lprice<=0 then continue;end if;
   if not exists(select 1 from folio_charges where idempotency_key=md5(r.id||'|transport|'||lower(trim(lname)))::uuid)then
    insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,status)
    values(i.id,r.id,trim(lname),'transport',round(lprice,2),p_staff_user_id,md5(r.id||'|transport|'||lower(trim(lname)))::uuid,'transport','posted');
    v_posted:=round(v_posted+lprice,2);
   end if;
  end loop;
  if v_posted>0 then
   update invoices set amount=round(amount+v_posted,2)where id=i.id;
   update reservations set total=round(total+v_posted,2)where id=r.id;
   perform public.sync_invoice_financials(i.id);
   insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'verify_reservation_deposit_transport','reservation',r.id,jsonb_build_object('transportTotal',v_posted));
  end if;
 end if;
 return query select r.id,'confirmed'::text,case when paid_total>=r.total then'paid'::text else'partial'::text end,p.amount,greatest(i.amount+v_posted-paid_total,0);
end$$;

-- Reversal: a confirmed transport booking that is cancelled / no-showed drops its posted
-- transport folio lines back to reversed and its totals back to room-only, so balances
-- stay tidy. Deposit-based refund math is independent of total, so nothing over-refunds.
create or replace function public.reverse_reservation_transport(p_reservation_id text)returns numeric language plpgsql security definer set search_path=public as $$
declare c folio_charges%rowtype;v_sum numeric(12,2):=0;v_invoice text;begin
 select id into v_invoice from invoices where reservation_id=p_reservation_id;if v_invoice is null then return 0;end if;
 for c in select * from folio_charges where reservation_id=p_reservation_id and source='transport' and status<>'reversed' for update loop
  update folio_charges set status='reversed'where id=c.id;v_sum:=round(v_sum+c.amount,2);
 end loop;
 if v_sum>0 then
  update invoices set amount=greatest(round(amount-v_sum,2),0)where id=v_invoice;
  update reservations set total=greatest(round(total-v_sum,2),0)where id=p_reservation_id;
  perform public.sync_invoice_financials(v_invoice);
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(null,'reverse_reservation_transport','reservation',p_reservation_id,jsonb_build_object('transportTotal',v_sum));
 end if;
 return v_sum;end$$;
create or replace function public.trigger_reverse_transport_on_cancel()returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.status='confirmed'and new.status in('cancelled','no_show')then perform public.reverse_reservation_transport(new.id);end if;
 return new;end$$;
drop trigger if exists reverse_transport_on_cancel on public.reservations;
create trigger reverse_transport_on_cancel after update of status on public.reservations
 for each row execute function public.trigger_reverse_transport_on_cancel();

-- Catalog write RPC (owner/admin/manager), audited, optimistic version for updates.
-- Deactivation only -- never delete (house rules preserve history).
create or replace function public.upsert_transport_service(p_id uuid,p_name text,p_description text,p_price numeric,p_unit text,p_active boolean,p_sort integer,p_reason text,p_expected_version integer,p_actor_user_id uuid)returns uuid language plpgsql security definer set search_path=public as $$
declare actor text;existing record;new_id uuid;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin','manager')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;
 if nullif(trim(p_name),'')is null or length(trim(p_name))>120 or p_price is null or p_price<=0 then raise exception'INVALID_TRANSPORT_SERVICE';end if;
 if p_id is null then
  if exists(select 1 from transport_services where lower(name)=lower(trim(p_name)))then raise exception'TRANSPORT_SERVICE_NAME_TAKEN';end if;
  insert into transport_services(name,description,price,unit,active,sort,version)
  values(trim(p_name),nullif(trim(coalesce(p_description,'')),''),round(p_price,2),coalesce(nullif(trim(p_unit),''),'per trip'),coalesce(p_active,true),coalesce(p_sort,0),1)returning id into new_id;
  insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_actor_user_id,'create_transport_service','transport_service',new_id::text,jsonb_build_object('name',trim(p_name),'price',round(p_price,2)));
  return new_id;
 end if;
 select * into existing from transport_services where id=p_id for update;if not found then raise exception'TRANSPORT_SERVICE_NOT_FOUND';end if;
 if existing.version<>p_expected_version then raise exception'TRANSPORT_SERVICE_STALE';end if;
 if exists(select 1 from transport_services where id<>p_id and lower(name)=lower(trim(p_name)))then raise exception'TRANSPORT_SERVICE_NAME_TAKEN';end if;
 update transport_services set name=trim(p_name),description=nullif(trim(coalesce(p_description,'')),''),price=round(p_price,2),unit=coalesce(nullif(trim(p_unit),''),'per trip'),active=coalesce(p_active,true),sort=coalesce(p_sort,0),version=existing.version+1,updated_at=now()where id=p_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_actor_user_id,'update_transport_service','transport_service',p_id::text,jsonb_build_object('name',trim(p_name),'price',round(p_price,2),'active',coalesce(p_active,true),'reason',nullif(trim(coalesce(p_reason,'')),''),'version',existing.version+1));
 return p_id;end$$;

-- Guest self-service date/type modification recomputes a room-only total and would
-- silently drop charged transport from the folio. When a reservation carries
-- transport, refuse self-service so staff reverse/reprice instead. Grants survive
-- create-or-replace, so no revoke/grant entry is needed for this unchanged signature.
create or replace function public.customer_request_reservation_change(p_user_id uuid,p_reservation_id text,p_check_in date,p_check_out date,p_room_type text,p_guests integer,p_special_requests text,p_reason text,p_idempotency_key uuid)returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;t room_types%rowtype;i invoices%rowtype;existing reservation_change_requests%rowtype;policy jsonb;today date;cin date;cout date;rtype text;gcount int;inventory int;reserved int;held int;new_total numeric;diff numeric;days_before int;cid uuid;aid uuid;begin
 select role into actor from user_accounts where id=p_user_id and active;if actor is null or actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 select * into existing from reservation_change_requests where idempotency_key=p_idempotency_key;if found then return jsonb_build_object('id',existing.id,'status',existing.status,'executionStatus',existing.execution_status);end if;
 select * into r from reservations where id=p_reservation_id and user_id=p_user_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;if r.status not in('pending','confirmed')then raise exception'RESERVATION_NOT_MODIFIABLE';end if;
 if jsonb_typeof(r.transport_lines)='array'and exists(select 1 from jsonb_array_elements(r.transport_lines)as l where coalesce((l->>'price')::numeric,0)>0)then raise exception'TRANSPORT_REQUIRES_STAFF';end if;
 if exists(select 1 from reservation_change_requests where reservation_id=r.id and status in('pending','approved'))then raise exception'CHANGE_ALREADY_OPEN';end if;
 policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());today:=hotel_today(policy);
 cin:=coalesce(p_check_in,r.check_in);cout:=coalesce(p_check_out,r.check_out);rtype:=coalesce(nullif(trim(p_room_type),''),r.room_type);gcount:=coalesce(p_guests,r.guests);
 if cin<today or cout<=cin or gcount<1 or nullif(trim(p_reason),'')is null then raise exception'INVALID_MODIFICATION';end if;
 select * into t from room_types where name=rtype and active for update;if not found or gcount>t.max_guests then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended(t.name,0));perform expire_booking_holds();
 select count(*)into inventory from rooms x where x.type=t.name and x.status<>'maintenance'and(cin>today or x.housekeeping='clean');
 select count(*)into reserved from reservations x where x.id<>r.id and x.room_type=t.name and x.status in('pending','confirmed','checked_in')and x.check_in<cout and x.check_out>cin;
 select count(*)into held from booking_holds h where h.room_type=t.name and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<cout and h.check_out>cin;
 if inventory-reserved-held<=0 then raise exception'MODIFICATION_INVENTORY_UNAVAILABLE';end if;
 new_total:=round(t.base_rate*(cout-cin),2);select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;diff:=round(new_total-i.amount,2);
 days_before:=r.check_in-today;
 insert into reservation_change_requests(reservation_id,requested_by,requested_check_in,requested_check_out,requested_room_type,requested_guests,requested_special_requests,reason,status,calculated_total,payment_difference,idempotency_key,execution_status)
 values(r.id,p_user_id,cin,cout,rtype,gcount,nullif(trim(p_special_requests),''),trim(p_reason),case when days_before>coalesce((policy->>'selfServiceModificationDays')::int,3)then'executed'else'pending'end,new_total,diff,p_idempotency_key,case when days_before>coalesce((policy->>'selfServiceModificationDays')::int,3)then'not_required'else'pending_review'end)returning id into cid;
 if days_before>coalesce((policy->>'selfServiceModificationDays')::int,3)then
  update reservations set check_in=cin,check_out=cout,room_type=rtype,guests=gcount,special_requests=coalesce(nullif(trim(p_special_requests),''),special_requests),total=new_total,room_id=null,room_number=null where id=r.id;
  update invoices set amount=new_total where id=i.id;perform sync_invoice_financials(i.id);update reservation_room_assignments set status='cancelled',released_at=now(),reason='Customer self-service reservation modification'where reservation_id=r.id and status='active';
 else
  insert into manager_approval_requests(request_type,related_entity_type,related_entity_id,reservation_id,department,severity,reason,requested_action,normal_policy_result,requested_by)
  values('reservation_modification','reservation_change_request',cid::text,r.id,'front_desk','normal',trim(p_reason),jsonb_build_object('checkIn',cin,'checkOut',cout,'roomType',rtype,'guests',gcount,'specialRequests',nullif(trim(p_special_requests),''),'calculatedTotal',new_total,'paymentDifference',diff),jsonb_build_object('requiresManagerApproval',true,'policyDays',coalesce((policy->>'selfServiceModificationDays')::int,3)),p_user_id)returning id into aid;
  update reservation_change_requests set manager_approval_id=aid where id=cid;
 end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_user_id,'customer_request_reservation_change','reservation_change_request',cid::text,jsonb_build_object('checkIn',r.check_in,'checkOut',r.check_out,'roomType',r.room_type,'total',r.total),jsonb_build_object('checkIn',cin,'checkOut',cout,'roomType',rtype,'guests',gcount,'calculatedTotal',new_total,'paymentDifference',diff,'managerApprovalId',aid));
 return jsonb_build_object('id',cid,'status',case when aid is null then'executed'else'pending'end,'executionStatus',case when aid is null then'not_required'else'pending_review'end,'calculatedTotal',new_total,'paymentDifference',diff,'managerApprovalId',aid);end$$;

-- Only the service role may call the new SECURITY DEFINER functions; the recreated
-- create_booking_hold (new 15-arg overload) lost its grants on drop, so it is re-granted
-- here too. The Feature-2/submit/verify grants survive create-or-replace unchanged.
revoke all on function public.create_booking_hold(uuid,text,date,date,integer,text,text,text,text,text,text,text,text,jsonb,jsonb),public.reverse_reservation_transport(text),public.trigger_reverse_transport_on_cancel(),public.upsert_transport_service(uuid,text,text,numeric,text,boolean,integer,text,integer,uuid) from public,anon,authenticated;
grant execute on function public.create_booking_hold(uuid,text,date,date,integer,text,text,text,text,text,text,text,text,jsonb,jsonb),public.reverse_reservation_transport(text),public.trigger_reverse_transport_on_cancel(),public.upsert_transport_service(uuid,text,text,numeric,text,boolean,integer,text,integer,uuid) to service_role;
