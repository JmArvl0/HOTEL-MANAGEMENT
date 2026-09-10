-- Task 7 — Manager physical room management.
--
-- 1. Deactivation provenance on rooms (why a room left inventory, and when).
-- 2. admin_create_room — the first create path for physical rooms; rate is copied
--    from the room type so pricing authority stays with room_types.
-- 3. admin_update_room_metadata — admits manager, guards retyping against forward
--    commitments, stamps deactivation provenance.
-- 4. The seven inventory counts that gate booking are requalified through
--    room_is_sellable(), which was deployed with zero callers. They previously
--    omitted administratively_active and the maintenance-blocked check, so a
--    deactivated or blocked room still counted as sellable in SQL while the
--    TypeScript path (lib/booking.ts countAvailableUnits) excluded it.

alter table rooms add column if not exists deactivated_at timestamptz;
alter table rooms add column if not exists deactivation_reason text;

-- Physical-room creation. Configuration only: status and housekeeping take their
-- column defaults because those states belong to the front-desk, housekeeping, and
-- maintenance workflows. rate satisfies a NOT NULL column from room_types.base_rate
-- rather than exposing a second place to price a room.
CREATE OR REPLACE FUNCTION public.admin_create_room(p_number text, p_type text, p_floor integer, p_wing text, p_designation text, p_active boolean, p_reason text, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$declare actor text;v_number text;v_rate numeric(12,2);r rooms%rowtype;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin','manager')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;
 v_number:=nullif(trim(p_number),'');if v_number is null or p_floor is null or p_floor<0 or nullif(trim(p_type),'')is null or nullif(trim(p_reason),'')is null then raise exception'INVALID_ROOM_CONFIGURATION';end if;
 select base_rate into v_rate from room_types where name=p_type;if not found then raise exception'ROOM_TYPE_NOT_FOUND';end if;
 if exists(select 1 from rooms where number=v_number)then raise exception'ROOM_NUMBER_TAKEN';end if;
 begin
  insert into rooms(number,floor,type,rate,wing,administrative_designation,administratively_active,configuration_version)
  values(v_number,p_floor,p_type,v_rate,nullif(trim(p_wing),''),nullif(trim(p_designation),''),coalesce(p_active,true),1)returning * into r;
 exception when unique_violation then raise exception'ROOM_NUMBER_TAKEN';end;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_create_room','room',r.id,null,to_jsonb(r)-'id'||jsonb_build_object('reason',trim(p_reason)));
 return jsonb_build_object('id',r.id,'number',r.number,'version',r.configuration_version);end$function$;

revoke all on function public.admin_create_room(text, text, integer, text, text, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_create_room(text, text, integer, text, text, boolean, text, uuid) to service_role;

-- Manager gains configuration authority. Retyping is blocked while any reservation
-- or active assignment points at the room: front_desk_assign_room and
-- front_desk_check_in both raise ROOM_TYPE_MISMATCH when room.type no longer
-- matches reservations.room_type, so a silent retype becomes a failure at the
-- counter. Room number stays absent from this signature by design — it is
-- denormalized into reservations, housekeeping_tasks, and maintenance_orders.
CREATE OR REPLACE FUNCTION public.admin_update_room_metadata(p_room_id text, p_floor integer, p_type text, p_wing text, p_designation text, p_active boolean, p_reason text, p_expected_version integer, p_actor_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$declare actor text;r rooms%rowtype;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin','manager')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;if p_floor<0 or nullif(trim(p_type),'')is null or nullif(trim(p_reason),'')is null or not exists(select 1 from room_types where name=p_type)then raise exception'INVALID_ROOM_CONFIGURATION';end if;select * into r from rooms where id=p_room_id for update;if not found then raise exception'ROOM_NOT_FOUND';end if;if r.configuration_version<>p_expected_version then raise exception'ROOM_CONFIGURATION_STALE';end if;
 if p_type is distinct from r.type and(exists(select 1 from reservation_room_assignments a where a.room_id=r.id and a.status='active')or exists(select 1 from reservations x where x.room_id=r.id and x.status in('pending','confirmed','checked_in')))then raise exception'ROOM_HAS_FUTURE_COMMITMENT';end if;
 if not p_active and(r.status in('occupied','reserved')or exists(select 1 from reservation_room_assignments a where a.room_id=r.id and a.status='active')or exists(select 1 from reservations x where x.room_id=r.id and x.status in('pending','confirmed','checked_in')))then raise exception'ROOM_HAS_ACTIVE_ASSIGNMENT';end if;
 update rooms set floor=p_floor,type=p_type,wing=nullif(trim(p_wing),''),administrative_designation=nullif(trim(p_designation),''),administratively_active=p_active,deactivated_at=case when p_active then null when r.administratively_active then now() else r.deactivated_at end,deactivation_reason=case when p_active then null else trim(p_reason) end,configuration_version=configuration_version+1,updated_at=now()where id=r.id;insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_update_room_metadata','room',r.id,jsonb_build_object('floor',r.floor,'type',r.type,'active',r.administratively_active),jsonb_build_object('floor',p_floor,'type',p_type,'active',p_active,'wing',nullif(trim(p_wing),''),'designation',nullif(trim(p_designation),''),'reason',trim(p_reason)));return jsonb_build_object('id',r.id,'version',r.configuration_version+1);end$function$;

revoke all on function public.admin_update_room_metadata(text, integer, text, text, text, boolean, text, integer, uuid) from public, anon, authenticated;
grant execute on function public.admin_update_room_metadata(text, integer, text, text, text, boolean, text, integer, uuid) to service_role;

-- create_booking_hold: inventory count requalified through room_is_sellable()
CREATE OR REPLACE FUNCTION public.create_booking_hold(p_user_id uuid, p_room_type text, p_check_in date, p_check_out date, p_guest_count integer, p_first_name text, p_last_name text, p_email text, p_mobile text, p_address text DEFAULT NULL::text, p_nationality text DEFAULT NULL::text, p_expected_arrival text DEFAULT NULL::text, p_special_requests text DEFAULT NULL::text, p_request_options jsonb DEFAULT '[]'::jsonb, p_transport_lines jsonb DEFAULT '[]'::jsonb, p_transportation_preferences jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare t room_types%rowtype;p reservation_deposit_policies%rowtype;inventory int;reserved int;held int;nights int;total numeric(12,2);v_transport numeric(12,2):=0;combined numeric(12,2);required numeric(12,2);result uuid;
 v_pref jsonb;v_service text;v_pickup text;v_dropoff_pref text;v_return_location text;v_pickup_date date;v_pickup_time text;v_return_date date;v_return_time text;v_passengers int;
begin
 perform expire_booking_holds();
 if p_check_in<current_date or p_check_out<=p_check_in then raise exception 'INVALID_DATES';end if;
 if p_guest_count<1 then raise exception 'INVALID_GUEST_COUNT';end if;
 if nullif(trim(p_first_name),'')is null or nullif(trim(p_last_name),'')is null or nullif(trim(p_email),'')is null or nullif(trim(p_mobile),'')is null then raise exception 'INVALID_GUEST_DETAILS';end if;
 if coalesce(p_request_options,'[]'::jsonb)::text<>'[]'and (jsonb_typeof(coalesce(p_request_options,'[]'::jsonb))<>'array' or exists(select 1 from jsonb_array_elements(coalesce(p_request_options,'[]'::jsonb))e where jsonb_typeof(e.value)<>'string' or coalesce(e.value#>>'{}','')='' or char_length(e.value#>>'{}')>40))then raise exception 'INVALID_REQUEST_OPTIONS';end if;
 if coalesce(p_transport_lines,'[]'::jsonb)::text<>'[]'and(jsonb_typeof(coalesce(p_transport_lines,'[]'::jsonb))<>'array' or (select count(*)from jsonb_array_elements(coalesce(p_transport_lines,'[]'::jsonb)))>12 or exists(select 1 from jsonb_array_elements(coalesce(p_transport_lines,'[]'::jsonb))ln where jsonb_typeof(ln.value)<>'object' or nullif(trim(coalesce(ln.value->>'name','')),'')is null or char_length(ln.value->>'name')>120 or coalesce(ln.value->>'price','')!~'^[0-9]+(\.[0-9]{1,2})?$' or (ln.value->>'price')::numeric<=0))then raise exception 'INVALID_TRANSPORT_LINE';end if;
 -- Transportation preferences: strict, service-type-conditional. The client never supplies
 -- the hotel side of the route — the filer fills it from hotel_operational_policies.
 if p_transportation_preferences is not null then
  if jsonb_typeof(p_transportation_preferences)<>'object' then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  v_pref:=p_transportation_preferences;
  v_service:=lower(coalesce(v_pref->>'serviceType',''));
  v_pickup:=nullif(trim(coalesce(v_pref->>'pickupLocation','')),'');
  v_dropoff_pref:=nullif(trim(coalesce(v_pref->>'dropoffLocation','')),'');
  v_return_location:=nullif(trim(coalesce(v_pref->>'returnLocation','')),'');
  v_pickup_date:=nullif(v_pref->>'pickupDate','')::date;
  v_pickup_time:=v_pref->>'pickupTime';
  v_return_date:=nullif(v_pref->>'returnDate','')::date;
  v_return_time:=v_pref->>'returnTime';
  v_passengers:=nullif(v_pref->>'passengerCount','')::int;
  if v_service not in('pickup','dropoff','round_trip') then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_pickup is null or char_length(v_pickup)>200 then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_service='pickup' and v_dropoff_pref is not null then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_service in('dropoff','round_trip') then
   if v_dropoff_pref is null or char_length(v_dropoff_pref)>200 then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  end if;
  if v_service='round_trip' then
   if v_return_location is null or char_length(v_return_location)>200 or v_return_date is null or v_return_time is null then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
   if v_return_date<v_pickup_date or v_return_date>p_check_out then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
   if v_return_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  end if;
  if v_pickup_date is null or v_pickup_time is null or v_pickup_time!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_pickup_date<p_check_in or v_pickup_date>p_check_out then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if v_passengers is null or v_passengers<1 or v_passengers>20 then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
  if char_length(coalesce(v_pref->>'specialInstructions',''))>500 then raise exception 'INVALID_TRANSPORTATION_PREFERENCES';end if;
 end if;
 select * into p from reservation_deposit_policies where key='online_reservation' and active_from<=now();if not found or not p.enabled then raise exception 'DEPOSIT_POLICY_UNAVAILABLE';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(p_room_type),0));
 select * into t from room_types where name=p_room_type and active;if not found or p_guest_count>t.max_guests then raise exception 'ROOM_TYPE_UNAVAILABLE';end if;
 select count(*)into inventory from rooms r where r.type=p_room_type and room_is_sellable(r.id,p_check_in,null);
 select count(*)into reserved from reservations r where r.room_type=p_room_type and(r.status in('confirmed','checked_in')or(r.status='pending'and(lower(coalesce(r.source,''))<>'website'or r.payment_due_at is null or r.payment_due_at>now())))and r.check_in<p_check_out and r.check_out>p_check_in;
 select count(*)into held from booking_holds h where h.room_type=p_room_type and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<p_check_out and h.check_out>p_check_in;
 if inventory-reserved-held<=0 then raise exception 'ROOM_TYPE_UNAVAILABLE';end if;
 nights:=p_check_out-p_check_in;total:=round(t.base_rate*nights,2);
 if jsonb_typeof(coalesce(p_transport_lines,'[]'::jsonb))='array'then select coalesce(sum(round((ln.value->>'price')::numeric,2)),0)into v_transport from jsonb_array_elements(coalesce(p_transport_lines,'[]'::jsonb))ln;end if;
 combined:=round(total+v_transport,2);required:=case p.calculation_type when'percentage'then round(combined*p.percentage_basis_points/10000.0,2)else least(combined,round(p.fixed_amount,2))end;
 insert into booking_holds(user_id,room_type,check_in,check_out,guest_count,nightly_rate,subtotal,total,deposit_required,deposit_policy_snapshot,first_name,last_name,email,mobile,address,nationality,expected_arrival,special_requests,request_options,transport_lines,transportation_preferences,expires_at)
 values(p_user_id,p_room_type,p_check_in,p_check_out,p_guest_count,t.base_rate,total,combined,required,jsonb_build_object('key',p.key,'calculationType',p.calculation_type,'percentageBasisPoints',p.percentage_basis_points,'fixedAmount',p.fixed_amount,'remainingBalanceDue',p.remaining_balance_due),trim(p_first_name),trim(p_last_name),lower(trim(p_email)),trim(p_mobile),nullif(trim(p_address),''),nullif(trim(p_nationality),''),nullif(trim(p_expected_arrival),''),nullif(trim(p_special_requests),''),coalesce(p_request_options,'[]'::jsonb),coalesce(p_transport_lines,'[]'::jsonb),p_transportation_preferences,now()+make_interval(mins=>p.hold_minutes))returning token into result;return result;
end$function$;
-- customer_request_reservation_change: inventory count requalified through room_is_sellable()
CREATE OR REPLACE FUNCTION public.customer_request_reservation_change(p_user_id uuid, p_reservation_id text, p_check_in date, p_check_out date, p_room_type text, p_guests integer, p_special_requests text, p_reason text, p_idempotency_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
 select count(*)into inventory from rooms x where x.type=t.name and room_is_sellable(x.id,cin,policy);
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
 return jsonb_build_object('id',cid,'status',case when aid is null then'executed'else'pending'end,'executionStatus',case when aid is null then'not_required'else'pending_review'end,'calculatedTotal',new_total,'paymentDifference',diff,'managerApprovalId',aid);end$function$;

-- front_desk_create_reservation: inventory count requalified through room_is_sellable()
CREATE OR REPLACE FUNCTION public.front_desk_create_reservation(p_guest_name text, p_email text, p_phone text, p_room_type text, p_check_in date, p_check_out date, p_guest_count integer, p_source text, p_special_requests text, p_expected_arrival text, p_idempotency_key uuid, p_staff_user_id uuid)
 RETURNS TABLE(reservation_id text, confirmation_number text, total numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor text;t room_types%rowtype;inventory int;reserved int;guest text;rid text;confirmation text;amount numeric;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'STAFF_RESERVATION_FORBIDDEN';end if;
if p_check_in<(now()at time zone'Asia/Manila')::date or p_check_out<=p_check_in then raise exception'INVALID_DATES';end if;if p_guest_count<1 then raise exception'INVALID_GUEST_COUNT';end if;
if nullif(trim(p_guest_name),'')is null or nullif(trim(p_email),'')is null or nullif(trim(p_phone),'')is null then raise exception'INVALID_GUEST_DETAILS';end if;if p_source not in('Front Desk','Walk-In','Phone')then raise exception'INVALID_BOOKING_SOURCE';end if;
select id into rid from reservations where idempotency_key=p_idempotency_key;if found then return query select r.id,r.confirmation_number,r.total from reservations r where r.id=rid;return;end if;
perform pg_advisory_xact_lock(hashtextextended(lower(p_room_type),0));select * into t from room_types where name=p_room_type and active;if not found or p_guest_count>t.max_guests then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
select count(*)into inventory from rooms r where r.type=p_room_type and room_is_sellable(r.id,p_check_in,null);select count(*)into reserved from reservations where room_type=p_room_type and status in('pending','confirmed','checked_in')and check_in<p_check_out and check_out>p_check_in;
if inventory-reserved<=0 then raise exception'ROOM_TYPE_UNAVAILABLE';end if;amount:=round(t.base_rate*(p_check_out-p_check_in),2);
select id into guest from guests where lower(email)=lower(trim(p_email))limit 1 for update;if guest is null then insert into guests(name,email,phone)values(trim(p_guest_name),lower(trim(p_email)),trim(p_phone))returning id into guest;else update guests set name=trim(p_guest_name),phone=trim(p_phone)where id=guest;end if;
confirmation:='HVN-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
insert into reservations(guest_id,guest_name,guest_email,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,special_requests,expected_arrival,payment_status,confirmation_number,idempotency_key)
values(guest,trim(p_guest_name),lower(trim(p_email)),p_room_type,p_check_in,p_check_out,p_guest_count,'confirmed',p_source,amount,0,0,nullif(trim(p_special_requests),''),nullif(trim(p_expected_arrival),''),'unpaid',confirmation,p_idempotency_key)returning id into rid;
insert into invoices(reservation_id,guest_name,amount,paid,balance,status,due_date)values(rid,trim(p_guest_name),amount,0,amount,'unpaid',p_check_in);
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'create_staff_reservation','reservation',rid,jsonb_build_object('source',p_source,'roomType',p_room_type,'checkIn',p_check_in,'checkOut',p_check_out,'total',amount));return query select rid,confirmation,amount;end$function$;

-- front_desk_execute_manager_approval: inventory count requalified through room_is_sellable()
CREATE OR REPLACE FUNCTION public.front_desk_execute_manager_approval(p_approval_id uuid, p_room_id text, p_staff_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor text;a manager_approval_requests%rowtype;r reservations%rowtype;oldroom rooms%rowtype;newroom rooms%rowtype;assignment reservation_room_assignments%rowtype;t room_types%rowtype;i invoices%rowtype;new_total numeric;new_paid numeric;available_same int;inventory int;reserved int;held int;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'FRONT_DESK_EXECUTION_FORBIDDEN';end if;
select * into a from manager_approval_requests where id=p_approval_id for update;if not found or a.status<>'approved'or a.execution_status<>'awaiting_execution'then raise exception'APPROVAL_NOT_EXECUTABLE';end if;
select * into r from reservations where id=a.reservation_id for update;if not found or r.status in('cancelled','no_show','checked_out')then raise exception'APPROVAL_STALE';end if;
if a.request_type='room_upgrade'then
 select count(*)into available_same from rooms x where x.type=r.room_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);if available_same>0 then raise exception'APPROVAL_STALE';end if;
 select * into oldroom from rooms where id=r.room_id for update;select * into newroom from rooms where(id=p_room_id or number=p_room_id)for update;
 if not found or newroom.type<>(a.requested_action->>'requestedRoomType')or newroom.status<>'available'or newroom.housekeeping<>'clean'then raise exception'UPGRADE_ROOM_NOT_READY';end if;
 if exists(select 1 from maintenance_orders where room_id=newroom.id and status in('open','in_progress'))or exists(select 1 from reservation_room_assignments where room_id=newroom.id and reservation_id<>r.id and status='active'and check_in<r.check_out and check_out>r.check_in)then raise exception'UPGRADE_ROOM_UNAVAILABLE';end if;
 select * into assignment from reservation_room_assignments where reservation_id=r.id and status='active'for update;if found then update reservation_room_assignments set status='reassigned',released_at=now(),reason=a.reason where id=assignment.id;end if;
 insert into reservation_room_assignments(reservation_id,room_id,check_in,check_out,assigned_by,reason,is_upgrade,authorized_by)values(r.id,newroom.id,r.check_in,r.check_out,p_staff_user_id,a.reason,true,a.reviewed_by);
 update reservations set room_id=newroom.id,room_number=newroom.number,room_type=newroom.type where id=r.id;update rooms set status=case when r.status='checked_in'then'occupied'else'reserved'end where id=newroom.id;if not coalesce((a.requested_action->>'waived')::boolean,false)and coalesce((a.requested_action->>'priceDifference')::numeric,0)>0 then select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,source_record_id)values(i.id,r.id,'Manager-approved room upgrade to '||newroom.type,'upgrade',round((a.requested_action->>'priceDifference')::numeric,2),p_staff_user_id,a.id,'manager_approval',a.id::text);update invoices set amount=round(amount+round((a.requested_action->>'priceDifference')::numeric,2),2)where id=i.id;perform sync_invoice_financials(i.id);end if;
 if oldroom.id is not null then update rooms set status='dirty',housekeeping='dirty'where id=oldroom.id;insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)values(oldroom.id,oldroom.number,'Manager-approved room-change turnover','high','pending','Before next arrival',a.reason);end if;
elsif a.request_type='reservation_modification'then
 if r.status not in('pending','confirmed')then raise exception'APPROVAL_STALE';end if;select * into t from room_types where name=coalesce(nullif(a.requested_action->>'roomType',''),r.room_type)and active;if not found then raise exception'ROOM_TYPE_UNAVAILABLE';end if;perform pg_advisory_xact_lock(hashtextextended(t.name,0));perform expire_booking_holds();
 select count(*)into inventory from rooms x where x.type=t.name and room_is_sellable(x.id,(a.requested_action->>'checkIn')::date,null);select count(*)into reserved from reservations y where y.id<>r.id and y.room_type=t.name and y.status in('pending','confirmed','checked_in')and y.check_in<(a.requested_action->>'checkOut')::date and y.check_out>(a.requested_action->>'checkIn')::date;select count(*)into held from booking_holds h where h.room_type=t.name and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<(a.requested_action->>'checkOut')::date and h.check_out>(a.requested_action->>'checkIn')::date;if inventory-reserved-held<=0 then raise exception'MODIFICATION_INVENTORY_UNAVAILABLE';end if;
 if r.room_id is not null then select * into oldroom from rooms where id=r.room_id for update;end if;new_total:=round(t.base_rate*((a.requested_action->>'checkOut')::date-(a.requested_action->>'checkIn')::date),2);select * into i from invoices where reservation_id=r.id for update;new_paid:=i.paid;
 update reservations set check_in=(a.requested_action->>'checkIn')::date,check_out=(a.requested_action->>'checkOut')::date,room_type=t.name,total=new_total,room_id=null,room_number=null where id=r.id;
 update invoices set amount=new_total,balance=greatest(new_total-new_paid,0),credit_balance=greatest(new_paid-new_total,0),status=case when new_paid>new_total then'credit'when new_paid=new_total then'paid'when new_paid>0 then'partial'else'unpaid'end where id=i.id;
 update reservation_room_assignments set status='cancelled',released_at=now(),reason='Reservation modification requires reassignment'where reservation_id=r.id and status='active';if oldroom.id is not null then update rooms set status=case when housekeeping='clean'then'available'else'dirty'end where id=oldroom.id and status='reserved';end if;
elsif a.request_type='early_check_in'then update reservations set early_check_in_approved_until=now()+interval'8 hours'where id=r.id;
elsif a.request_type='late_checkout'then if r.status<>'checked_in'or exists(select 1 from reservation_room_assignments ra where ra.room_id=r.room_id and ra.reservation_id<>r.id and ra.status='active'and ra.check_in<=((a.requested_action->>'requestedUntil')::timestamptz at time zone'Asia/Manila')::date and ra.check_out>r.check_out)then raise exception'APPROVAL_STALE';end if;update reservations set late_checkout_until=(a.requested_action->>'requestedUntil')::timestamptz where id=r.id;
elsif a.request_type='checkout_exception'then if r.status<>'checked_in'or nullif(a.requested_action->>'arrangement','')is null then raise exception'APPROVAL_STALE';end if;select * into oldroom from rooms where id=r.room_id for update;update reservations set status='checked_out',checked_out_at=now()where id=r.id;update rooms set status='dirty',housekeeping='dirty'where id=r.room_id;update reservation_room_assignments set status='released',released_at=now(),reason='Manager-approved checkout exception; balance remains collectible'where reservation_id=r.id and status='active';if not exists(select 1 from housekeeping_tasks where room_id=r.room_id and status in('pending','in_progress'))then insert into housekeeping_tasks(room_id,room_number,task,priority,status,due,notes)values(r.room_id,oldroom.number,'Checkout turnover','high','pending','Before next arrival','Checkout exception executed; folio balance retained: '||(a.requested_action->>'arrangement'));end if;
else raise exception'APPROVAL_REQUIRES_OTHER_DEPARTMENT';end if;
update manager_approval_requests set execution_status='executed',executed_by=p_staff_user_id,executed_at=now(),version=version+1,updated_at=now()where id=a.id;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'execute_manager_approval','manager_approval',a.id::text,jsonb_build_object('requestType',a.request_type,'reservationId',r.id,'roomId',p_room_id));
return jsonb_build_object('status','executed','requestType',a.request_type,'reservationId',r.id);end$function$;

-- review_manager_approval: inventory count requalified through room_is_sellable()
CREATE OR REPLACE FUNCTION public.review_manager_approval(p_approval_id uuid, p_decision text, p_reason text, p_expected_version integer, p_manager_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor text;a manager_approval_requests%rowtype;r reservations%rowtype;available_same int;available_target int;inventory int;reserved int;held int;target_type text;requested_amount numeric;deposit_paid numeric;already_refunded numeric;i invoices%rowtype;rid uuid;begin
select role into actor from user_accounts where id=p_manager_user_id and active;if actor is null or actor not in('owner','admin','manager')then raise exception'MANAGER_REVIEW_FORBIDDEN';end if;
if p_decision not in('approve','reject')or nullif(trim(p_reason),'')is null then raise exception'INVALID_MANAGER_DECISION';end if;
select * into a from manager_approval_requests where id=p_approval_id for update;if not found then raise exception'APPROVAL_NOT_FOUND';end if;
if a.status<>'pending'or a.version<>p_expected_version then raise exception'APPROVAL_ALREADY_REVIEWED';end if;if a.requested_by=p_manager_user_id then raise exception'SELF_APPROVAL_FORBIDDEN';end if;
if a.reservation_id is not null then select * into r from reservations where id=a.reservation_id for update;if not found then raise exception'APPROVAL_STALE';end if;end if;
if a.request_type in('room_upgrade','room_type_exception','reservation_modification','early_check_in','late_checkout','checkout_exception')and r.status in('cancelled','no_show','checked_out')then raise exception'APPROVAL_STALE';end if;
if p_decision='approve'and a.request_type='room_upgrade'then
 target_type:=nullif(a.requested_action->>'requestedRoomType','');if target_type is null or target_type=r.room_type then raise exception'INVALID_UPGRADE_REQUEST';end if;
 select count(*)into available_same from rooms x where x.type=r.room_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
 if available_same>0 then raise exception'SAME_TYPE_ROOM_AVAILABLE';end if;
 select count(*)into available_target from rooms x where x.type=target_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
 if available_target=0 then raise exception'UPGRADE_ROOM_UNAVAILABLE';end if;
end if;
if p_decision='approve'and a.request_type='room_type_exception'then
 target_type:=nullif(a.requested_action->>'roomType','');if target_type is null or target_type=r.room_type then raise exception'ROOM_TYPE_EXCEPTION_SAME_TYPE';end if;
 if not exists(select 1 from room_types where name=target_type and active)then raise exception'ROOM_TYPE_EXCEPTION_TYPE_UNAVAILABLE';end if;
 select count(*)into available_same from rooms x where x.type=r.room_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
 if available_same>0 then raise exception'ROOM_TYPE_EXCEPTION_NOT_NEEDED';end if;
 select count(*)into available_target from rooms x where x.type=target_type and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress'))and not exists(select 1 from reservation_room_assignments ra where ra.room_id=x.id and ra.status='active'and ra.reservation_id<>r.id and ra.check_in<r.check_out and ra.check_out>r.check_in);
 if available_target=0 then raise exception'ROOM_TYPE_EXCEPTION_UNAVAILABLE';end if;
end if;
if p_decision='approve'and a.request_type='reservation_modification'then
 if nullif(a.requested_action->>'checkIn','')is null or nullif(a.requested_action->>'checkOut','')is null or(a.requested_action->>'checkOut')::date<=(a.requested_action->>'checkIn')::date then raise exception'INVALID_MODIFICATION_REQUEST';end if;
 target_type:=coalesce(nullif(a.requested_action->>'roomType',''),r.room_type);
 if r.status not in('pending','confirmed')then raise exception'APPROVAL_STALE';end if;perform pg_advisory_xact_lock(hashtextextended(target_type,0));perform expire_booking_holds();
 select count(*)into inventory from rooms x where x.type=target_type and room_is_sellable(x.id,(a.requested_action->>'checkIn')::date,null);
 select count(*)into reserved from reservations y where y.id<>r.id and y.room_type=target_type and y.status in('pending','confirmed','checked_in')and y.check_in<(a.requested_action->>'checkOut')::date and y.check_out>(a.requested_action->>'checkIn')::date;
 select count(*)into held from booking_holds h where h.room_type=target_type and h.status in('active','payment_submitted')and h.expires_at>now()and h.reservation_id is null and h.check_in<(a.requested_action->>'checkOut')::date and h.check_out>(a.requested_action->>'checkIn')::date;available_target:=inventory-reserved-held;
 if available_target<=0 then raise exception'MODIFICATION_INVENTORY_UNAVAILABLE';end if;
end if;
if p_decision='approve'and a.request_type='early_check_in'then
 if r.status<>'confirmed'or r.room_id is null or not exists(select 1 from rooms x where x.id=r.room_id and x.status='available'and x.housekeeping='clean'and not exists(select 1 from maintenance_orders m where m.room_id=x.id and m.status in('open','in_progress')))then raise exception'EARLY_CHECKIN_NOT_SAFE';end if;
end if;
if p_decision='approve'and a.request_type='late_checkout'then
 if r.status<>'checked_in'or nullif(a.requested_action->>'requestedUntil','')is null then raise exception'INVALID_LATE_CHECKOUT';end if;
 if exists(select 1 from reservation_room_assignments ra where ra.room_id=r.room_id and ra.reservation_id<>r.id and ra.status='active'and ra.check_in<=((a.requested_action->>'requestedUntil')::timestamptz at time zone'Asia/Manila')::date and ra.check_out>r.check_out)then raise exception'LATE_CHECKOUT_CONFLICT';end if;
end if;
if p_decision='approve'and a.request_type='guest_compensation'then requested_amount:=coalesce((a.requested_action->>'amount')::numeric,0);select * into i from invoices where reservation_id=r.id for update;if not found or requested_amount<=0 or requested_amount>i.amount then raise exception'COMPENSATION_EXCEEDS_FOLIO';end if;end if;
if p_decision='approve'and a.request_type='checkout_exception'then if r.status<>'checked_in'or nullif(a.requested_action->>'arrangement','')is null then raise exception'INVALID_CHECKOUT_EXCEPTION';end if;end if;
if p_decision='approve'and a.request_type='refund_exception'then
 requested_amount:=coalesce((a.requested_action->>'amount')::numeric,0);select coalesce(sum(amount),0)into deposit_paid from payments where reservation_id=r.id and purpose='reservation_deposit'and status='paid';
 select coalesce(sum(amount),0)into already_refunded from payments where reservation_id=r.id and purpose='refund'and status='paid';if requested_amount<=0 or requested_amount>deposit_paid-already_refunded then raise exception'REFUND_EXCEPTION_EXCEEDS_SETTLED_PAYMENT';end if;
 select * into i from invoices where reservation_id=r.id for update;insert into refund_requests(reservation_id,invoice_id,requested_by,reason,paid_deposit,refund_basis_points,eligible_amount,status,exception_approval_id,normal_policy_amount)
 values(r.id,i.id,a.requested_by,a.reason,deposit_paid,0,round(requested_amount,2),'pending',a.id,coalesce((a.normal_policy_result->>'normalPolicyRefund')::numeric,0))returning id into rid;
end if;
update manager_approval_requests set status=case when p_decision='approve'then'approved'else'rejected'end,reviewed_by=p_manager_user_id,reviewed_at=now(),decision_reason=trim(p_reason),
 execution_status=case when p_decision='reject'then'not_required'when request_type='guest_escalation'then'executed'else'awaiting_execution'end,executed_by=case when p_decision='approve'and request_type='guest_escalation'then p_manager_user_id else null end,executed_at=case when p_decision='approve'and request_type='guest_escalation'then now()else null end,version=version+1,updated_at=now()where id=a.id;
if a.request_type='guest_escalation'and p_decision='approve'then update guest_requests set escalation_status='coordinated',manager_resolution=trim(p_reason)where id=a.guest_request_id;end if;
insert into manager_notes(approval_id,note,created_by)values(a.id,trim(p_reason),p_manager_user_id);
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_manager_user_id,'manager_'||p_decision,'manager_approval',a.id::text,jsonb_build_object('status',a.status,'version',a.version),jsonb_build_object('status',case when p_decision='approve'then'approved'else'rejected'end,'reason',trim(p_reason),'refundRequestId',rid));
return jsonb_build_object('status',case when p_decision='approve'then'approved'else'rejected'end,'executionStatus',case when p_decision='reject'then'not_required'when a.request_type='guest_escalation'then'executed'else'awaiting_execution'end,'refundRequestId',rid);end$function$;

-- submit_reservation_deposit: inventory count requalified through room_is_sellable()
CREATE OR REPLACE FUNCTION public.submit_reservation_deposit(p_token uuid, p_user_id uuid, p_payment_method text, p_payment_reference text)
 RETURNS TABLE(reservation_id text, confirmation_number text, reservation_status text, payment_status text, deposit_required numeric, remaining_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
 select count(*)into inventory from rooms r where r.type=h.room_type and room_is_sellable(r.id,h.check_in,h.operational_policy_snapshot);
 select count(*)into reserved from reservations r where r.room_type=h.room_type and(r.status in('confirmed','checked_in')or(r.status='pending'and(lower(coalesce(r.source,''))<>'website'or r.payment_due_at is null or r.payment_due_at>now())))and r.check_in<h.check_out and r.check_out>h.check_in;
 if inventory-reserved<=0 then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 select g.id into guest from guests g where g.user_account_id=p_user_id or lower(g.email)=lower(h.email)order by(g.user_account_id=p_user_id)desc limit 1 for update;
 if guest is null then insert into guests(name,first_name,last_name,email,phone,user_account_id,address,nationality,special_requests)values(trim(h.first_name||' '||h.last_name),h.first_name,h.last_name,h.email,h.mobile,p_user_id,h.address,h.nationality,h.special_requests)returning id into guest;
 else update guests set user_account_id=coalesce(user_account_id,p_user_id),name=trim(h.first_name||' '||h.last_name),first_name=h.first_name,last_name=h.last_name,phone=h.mobile,address=coalesce(h.address,address),nationality=coalesce(h.nationality,nationality),special_requests=coalesce(h.special_requests,special_requests)where id=guest;end if;
 confirmation:='HVN-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 insert into reservations(guest_id,user_id,guest_name,guest_email,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,deposit_policy_snapshot,operational_policy_snapshot,special_requests,request_options,transport_lines,transportation_preferences,expected_arrival,payment_status,payment_method,payment_due_at,confirmation_number,idempotency_key)
 values(guest,p_user_id,trim(h.first_name||' '||h.last_name),h.email,h.room_type,h.check_in,h.check_out,h.guest_count,'pending','Website',h.total,0,h.deposit_required,h.deposit_policy_snapshot,h.operational_policy_snapshot,h.special_requests,h.request_options,h.transport_lines,h.transportation_preferences,h.expected_arrival,'unpaid',p_payment_method,null,confirmation,p_token)returning id into rid;
 insert into invoices(reservation_id,guest_name,amount,paid,balance,status,method,due_date)values(rid,trim(h.first_name||' '||h.last_name),h.total,0,h.total,'unpaid',p_payment_method,h.check_in)returning id into iid;
 insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key)values(iid,rid,h.deposit_required,'PHP',p_payment_method,trim(p_payment_reference),'reservation_deposit','pending_verification',p_token);
 update booking_holds set status='payment_submitted',reservation_id=rid,guarantee_method=null,submitted_at=now()where token=p_token;
 return query select rid,confirmation,'pending'::text,'unpaid'::text,h.deposit_required,h.total-h.deposit_required;
end$function$;

-- verify_reservation_deposit: inventory count requalified through room_is_sellable()
CREATE OR REPLACE FUNCTION public.verify_reservation_deposit(p_payment_id uuid, p_staff_user_id uuid)
 RETURNS TABLE(reservation_id text, reservation_status text, payment_status text, deposit_paid numeric, remaining_balance numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p payments%rowtype;r reservations%rowtype;i invoices%rowtype;h booking_holds%rowtype;actor text;inventory int;reserved int;paid_total numeric(12,2);ln jsonb;lname text;lprice numeric;v_posted numeric:=0;
begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'accounting'then raise exception'PAYMENT_VERIFICATION_FORBIDDEN';end if;
 perform expire_booking_holds();select * into p from payments where id=p_payment_id for update;if not found or p.purpose<>'reservation_deposit'then raise exception'PAYMENT_NOT_FOUND';end if;
 select * into r from reservations where id=p.reservation_id for update;select * into i from invoices where id=p.invoice_id for update;select bh.* into h from booking_holds bh where bh.reservation_id=r.id for update;
 if p.status='paid'then return query select r.id,r.status,r.payment_status,coalesce(r.deposit,0),greatest(i.balance,0);return;end if;
 if p.status<>'pending_verification'then raise exception'PAYMENT_NOT_PENDING';end if;
 if h.status<>'payment_submitted'or r.status<>'pending'then raise exception'HOLD_EXPIRED';end if;
 if round(p.amount,2)<>round(r.deposit_required,2)or round(i.amount,2)<>round(r.total,2)then raise exception'PAYMENT_AMOUNT_MISMATCH';end if;
 perform pg_advisory_xact_lock(hashtextextended(lower(r.room_type),0));
 select count(*)into inventory from rooms x where x.type=r.room_type and room_is_sellable(x.id,r.check_in,r.operational_policy_snapshot);
 select count(*)into reserved from reservations x where x.id<>r.id and x.room_type=r.room_type and(x.status in('confirmed','checked_in')or(x.status='pending'and(lower(coalesce(x.source,''))<>'website'or x.payment_due_at is null or x.payment_due_at>now())))and x.check_in<r.check_out and x.check_out>r.check_in;
 if inventory-reserved<=0 then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
 update payments set status='paid',verified_at=now(),received_by=p_staff_user_id where id=p.id;
 select coalesce(sum(amount),0)into paid_total from payments where invoice_id=i.id and status='paid'and purpose<>'refund';
 update invoices set paid=least(paid_total,amount),balance=greatest(amount-paid_total,0),status=case when paid_total>=amount then'paid'else'partial'end where id=i.id;
 update reservations set status='confirmed',deposit=p.amount,payment_status=case when paid_total>=total then'paid'else'partial'end where id=r.id;
 update booking_holds set status='completed'where token=h.token;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'verify_reservation_deposit','payment',p.id::text,jsonb_build_object('reservationId',r.id,'amount',p.amount,'reference',p.reference));
 -- Transport booked at checkout is posted here, as its own folio lines, once. The total
 -- already includes transport (create_booking_hold folds it in), so these inserts are
 -- itemization only -- no invoice.amount / reservation.total bump (that would double-count).
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
   perform public.sync_invoice_financials(i.id);
   insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'verify_reservation_deposit_transport','reservation',r.id,jsonb_build_object('transportTotal',v_posted));
  end if;
 end if;
 return query select r.id,'confirmed'::text,case when paid_total>=r.total then'paid'::text else'partial'::text end,p.amount,greatest(i.amount-paid_total,0);
end$function$;
-- End of physical room management migration.
