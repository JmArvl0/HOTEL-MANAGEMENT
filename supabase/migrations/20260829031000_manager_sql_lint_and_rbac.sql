-- Manager SQL type cleanup and defense-in-depth RBAC. No data is rewritten.
create or replace function public.request_manager_approval(p_request_type text,p_related_entity_type text,p_related_entity_id text,p_reservation_id text,p_guest_request_id uuid,p_department text,p_severity text,p_reason text,p_requested_action jsonb,p_staff_user_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;g guest_requests%rowtype;aid uuid;normal_result jsonb:='{}'::jsonb;policy jsonb;deposit_paid numeric;normal_refund numeric;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','front_desk','housekeeping','maintenance','accounting')then raise exception'APPROVAL_REQUEST_FORBIDDEN';end if;
if p_request_type not in('room_upgrade','reservation_modification','early_check_in','late_checkout','guest_compensation','refund_exception','checkout_exception','guest_escalation')or nullif(trim(p_reason),'')is null then raise exception'INVALID_APPROVAL_REQUEST';end if;
if p_severity not in('normal','high','critical')then raise exception'INVALID_SEVERITY';end if;
if p_request_type<>'guest_escalation'and p_reservation_id is null then raise exception'RESERVATION_REQUIRED';end if;
if p_reservation_id is not null then select * into r from reservations where id=p_reservation_id;if not found then raise exception'RESERVATION_NOT_FOUND';end if;policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());
 normal_result:=jsonb_build_object('reservationStatus',r.status,'roomType',r.room_type,'checkIn',r.check_in,'checkOut',r.check_out,'policySnapshot',policy);end if;
if p_request_type='guest_escalation'then select * into g from guest_requests where id=p_guest_request_id for update;if not found or g.status='completed'then raise exception'GUEST_REQUEST_NOT_ESCALATABLE';end if;
 update guest_requests set severity=p_severity,escalation_status='escalated',escalated_by=p_staff_user_id,escalated_at=now()where id=g.id;end if;
if p_request_type='refund_exception'then
 if r.status not in('cancelled','no_show')then raise exception'REFUND_EXCEPTION_REQUIRES_CLOSURE';end if;
 select coalesce(sum(amount),0)into deposit_paid from payments where reservation_id=r.id and purpose='reservation_deposit'and status='paid';
 select coalesce(max(eligible_amount),0)into normal_refund from refund_requests where reservation_id=r.id and exception_approval_id is null;
 normal_result:=normal_result||jsonb_build_object('settledDeposit',deposit_paid,'normalPolicyRefund',normal_refund);
end if;
insert into manager_approval_requests(request_type,related_entity_type,related_entity_id,reservation_id,guest_request_id,department,severity,reason,requested_action,normal_policy_result,requested_by)
values(p_request_type,p_related_entity_type,p_related_entity_id,p_reservation_id,p_guest_request_id,lower(trim(p_department)),p_severity,trim(p_reason),coalesce(p_requested_action,'{}'),normal_result,p_staff_user_id)returning id into aid;
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'request_manager_approval','manager_approval',aid::text,jsonb_build_object('type',p_request_type,'reason',trim(p_reason),'relatedEntityId',p_related_entity_id));
return aid;exception when unique_violation then raise exception'APPROVAL_ALREADY_PENDING';end$$;

create or replace function public.front_desk_create_reservation(p_guest_name text,p_email text,p_phone text,p_room_type text,p_check_in date,p_check_out date,p_guest_count integer,p_source text,p_special_requests text,p_expected_arrival text,p_idempotency_key uuid,p_staff_user_id uuid)
returns table(reservation_id text,confirmation_number text,total numeric)language plpgsql security definer set search_path=public as $$
declare actor text;t room_types%rowtype;inventory int;reserved int;guest text;rid text;confirmation text;amount numeric;begin
select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','front_desk')then raise exception'STAFF_RESERVATION_FORBIDDEN';end if;
if p_check_in<(now()at time zone'Asia/Manila')::date or p_check_out<=p_check_in then raise exception'INVALID_DATES';end if;if p_guest_count<1 then raise exception'INVALID_GUEST_COUNT';end if;
if nullif(trim(p_guest_name),'')is null or nullif(trim(p_email),'')is null or nullif(trim(p_phone),'')is null then raise exception'INVALID_GUEST_DETAILS';end if;if p_source not in('Front Desk','Walk-In','Phone')then raise exception'INVALID_BOOKING_SOURCE';end if;
select id into rid from reservations where idempotency_key=p_idempotency_key;if found then return query select r.id,r.confirmation_number,r.total from reservations r where r.id=rid;return;end if;
perform pg_advisory_xact_lock(hashtextextended(lower(p_room_type),0));select * into t from room_types where name=p_room_type and active;if not found or p_guest_count>t.max_guests then raise exception'ROOM_TYPE_UNAVAILABLE';end if;
select count(*)into inventory from rooms where type=p_room_type and status<>'maintenance';select count(*)into reserved from reservations where room_type=p_room_type and status in('pending','confirmed','checked_in')and check_in<p_check_out and check_out>p_check_in;
if inventory-reserved<=0 then raise exception'ROOM_TYPE_UNAVAILABLE';end if;amount:=round(t.base_rate*(p_check_out-p_check_in),2);
select id into guest from guests where lower(email)=lower(trim(p_email))limit 1 for update;if guest is null then insert into guests(name,email,phone)values(trim(p_guest_name),lower(trim(p_email)),trim(p_phone))returning id into guest;else update guests set name=trim(p_guest_name),phone=trim(p_phone)where id=guest;end if;
confirmation:='HVN-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
insert into reservations(guest_id,guest_name,guest_email,room_type,check_in,check_out,guests,status,source,total,deposit,deposit_required,special_requests,expected_arrival,payment_status,confirmation_number,idempotency_key)
values(guest,trim(p_guest_name),lower(trim(p_email)),p_room_type,p_check_in,p_check_out,p_guest_count,'confirmed',p_source,amount,0,0,nullif(trim(p_special_requests),''),nullif(trim(p_expected_arrival),''),'unpaid',confirmation,p_idempotency_key)returning id into rid;
insert into invoices(reservation_id,guest_name,amount,paid,balance,status,due_date)values(rid,trim(p_guest_name),amount,0,amount,'unpaid',p_check_in);
insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'create_staff_reservation','reservation',rid,jsonb_build_object('source',p_source,'roomType',p_room_type,'checkIn',p_check_in,'checkOut',p_check_out,'total',amount));return query select rid,confirmation,amount;end$$;

create or replace function public.process_refund(p_refund_id uuid,p_staff_user_id uuid,p_reference text)
returns table(refund_status text,refund_amount numeric,net_paid numeric)language plpgsql security definer set search_path=public as $$
declare actor text;rr refund_requests%rowtype;i invoices%rowtype;r reservations%rowtype;v_gross numeric;v_refunded numeric;v_net numeric;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor not in('owner','admin','accounting')then raise exception'REFUND_PROCESSING_FORBIDDEN';end if;
 select * into rr from refund_requests where id=p_refund_id for update;if not found then raise exception'REFUND_NOT_FOUND';end if;
 select * into i from invoices where id=rr.invoice_id for update;select * into r from reservations where id=rr.reservation_id for update;
 select coalesce(sum(amount),0)into v_gross from payments where invoice_id=i.id and status='paid'and purpose<>'refund';
 select coalesce(sum(amount),0)into v_refunded from payments where invoice_id=i.id and status='paid'and purpose='refund';
 if rr.status='processed'then return query select rr.status,rr.eligible_amount,greatest(round(v_gross-v_refunded,2),0);return;end if;
 if rr.status not in('pending','failed')or rr.eligible_amount<=0 then raise exception'REFUND_NOT_PENDING';end if;
 if nullif(trim(p_reference),'')is null then raise exception'REFUND_REFERENCE_REQUIRED';end if;
 if round(v_refunded+rr.eligible_amount,2)>round(v_gross,2)then raise exception'REFUND_EXCEEDS_RECEIVED';end if;
 perform 1 from payments where idempotency_key=rr.id;
 if not found then insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,received_by,verified_at)values(i.id,r.id,rr.eligible_amount,'PHP','manual_refund',trim(p_reference),'refund','paid',rr.id,p_staff_user_id,now());end if;
 insert into refund_attempts(refund_request_id,status,reference,attempted_by)values(rr.id,'processed',trim(p_reference),p_staff_user_id);
 update refund_requests set status='processed',processed_by=p_staff_user_id,processed_at=now(),reference=trim(p_reference)where id=rr.id;
 select coalesce(sum(amount),0)into v_gross from payments where invoice_id=i.id and status='paid'and purpose<>'refund';
 select coalesce(sum(amount),0)into v_refunded from payments where invoice_id=i.id and status='paid'and purpose='refund';v_net:=greatest(round(v_gross-v_refunded,2),0);
 update invoices set paid=v_net,balance=0,credit_balance=0,status=case when v_net=0 then'refunded'else'partial_refund'end where id=i.id;
 update reservations set payment_status=case when v_net=0 then'refunded'else'partial_refund'end where id=r.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'process_refund','refund_request',rr.id::text,jsonb_build_object('reservationId',r.id,'amount',rr.eligible_amount,'reference',trim(p_reference)));
 return query select'processed'::text,rr.eligible_amount,v_net;end$$;
