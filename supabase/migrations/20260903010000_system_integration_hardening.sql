-- FINAL SYSTEM-WIDE INTEGRATION HARDENING
-- Additive/definition-only: no business rows are inserted, updated, deleted, or reseeded.
-- This migration reconciles with current remote function definitions that have
-- already undergone partial hardening transformations.

-- verify_reservation_deposit: already hardened remotely (front_desk/accounting only,
-- denies NULL/guest/housekeeping/maintenance/admin/owner). No transformation needed.

-- verify_customer_stay_payment: already hardened remotely (front_desk/accounting only,
-- denies NULL/guest/housekeeping/maintenance/admin/owner). No transformation needed.

-- customer_submit_guest_request: add NULL-safe Guest authorization.
-- Current remote has: if actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';
-- Desired: if actor is null or actor<>guest then raise exception'CUSTOMER_ACCESS_REQUIRED';
-- (NULL-safe: also denies NULL actor, not just non-guest actors)
create or replace function public.customer_submit_guest_request(p_user_id uuid,p_reservation_id text,p_request_type text,p_description text,p_requested_action jsonb,p_idempotency_key uuid)
returns table(id uuid,status text)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;existing guest_requests%rowtype;dept text;label text;rid uuid;begin
 select role into actor from user_accounts ua where ua.id=p_user_id and ua.active;if actor is null or actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 if nullif(trim(p_description),'')is null or length(trim(p_description))>500 then raise exception'INVALID_REQUEST';end if;
 select * into existing from guest_requests where idempotency_key=p_idempotency_key;if found then return query select existing.id,existing.status;return;end if;
 select * into r from reservations rr where rr.id = p_reservation_id and rr.user_id = p_user_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;
 if r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_REQUEST_READY';end if;
 case p_request_type when'extra_towels'then dept:='housekeeping';label:='Extra towels';when'toiletries'then dept:='housekeeping';label:='Toiletries';when'housekeeping'then dept:='housekeeping';label:='Housekeeping request';when'maintenance'then dept:='maintenance';label:='Maintenance concern';when'room_assistance'then dept:='front_desk';label:='Room assistance';when'room_change'then dept:='front_desk';label:='Room change request';when'stay_extension'then dept:='front_desk';label:='Stay extension request';when'general'then dept:='front_desk';label:='General hotel assistance';else raise exception'INVALID_REQUEST_TYPE';end case;
 if p_request_type='stay_extension'and(coalesce(p_requested_action->>'requestedCheckOut','')!~'^\d{4}-\d{2}-\d{2}$'or(p_requested_action->>'requestedCheckOut')::date<=r.check_out)then raise exception'INVALID_EXTENSION_DATE';end if;
 insert into guest_requests(reservation_id,guest_id,request,request_type,requested_action,department,priority,status,idempotency_key)
 values(r.id,r.guest_id,label||': '||trim(p_description),p_request_type,coalesce(p_requested_action,'{}'),dept,'normal','open',p_idempotency_key)returning guest_requests.id into rid;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_user_id,'customer_submit_guest_request','guest_request',rid::text,jsonb_build_object('reservationId',r.id,'requestType',p_request_type,'department',dept));
 return query select rid,'open'::text;end$$;
revoke all on function public.customer_submit_guest_request(uuid,text,text,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.customer_submit_guest_request(uuid,text,text,text,jsonb,uuid) to service_role;

-- customer_request_reservation_change: add NULL-safe Guest authorization.
-- Current remote has: if actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';
-- Desired: if actor is null or actor<>guest then raise exception'CUSTOMER_ACCESS_REQUIRED';
-- (NULL-safe: also denies NULL actor, not just non-guest actors)
-- Preserve ownership, availability, policy and timezone logic.
create or replace function public.customer_request_reservation_change(p_user_id uuid,p_reservation_id text,p_check_in date,p_check_out date,p_room_type text,p_guests integer,p_special_requests text,p_reason text,p_idempotency_key uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;t room_types%rowtype;i invoices%rowtype;existing reservation_change_requests%rowtype;policy jsonb;today date;cin date;cout date;rtype text;gcount int;inventory int;reserved int;held int;new_total numeric;diff numeric;days_before int;cid uuid;aid uuid;begin
 select role into actor from user_accounts where id=p_user_id and active;if actor is null or actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 select * into existing from reservation_change_requests where idempotency_key=p_idempotency_key;if found then return jsonb_build_object('id',existing.id,'status',existing.status,'executionStatus',existing.execution_status);end if;
 select * into r from reservations where id=p_reservation_id and user_id=p_user_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;if r.status not in('pending','confirmed')then raise exception'RESERVATION_NOT_MODIFIABLE';end if;
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
revoke all on function public.customer_request_reservation_change(uuid,text,date,date,text,integer,text,text,uuid) from public,anon,authenticated;
grant execute on function public.customer_request_reservation_change(uuid,text,date,date,text,integer,text,text,uuid) to service_role;

-- customer_submit_stay_payment: add NULL-safe Guest authorization.
-- Current remote has: if actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';
-- Desired: if actor is null or actor<>guest then raise exception'CUSTOMER_ACCESS_REQUIRED';
-- (NULL-safe: also denies NULL actor, not just non-guest actors)
-- Preserve payment/idempotency/ownership behavior.
create or replace function public.customer_submit_stay_payment(p_user_id uuid,p_reservation_id text,p_amount numeric,p_method text,p_reference text,p_idempotency_key uuid)
returns table(payment_id uuid,status text)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;i invoices%rowtype;existing payments%rowtype;pid uuid;begin
 select role into actor from user_accounts where id=p_user_id and active;if actor is null or actor<>'guest'then raise exception'CUSTOMER_ACCESS_REQUIRED';end if;
 if p_amount<=0 or p_method not in('manual_bank_transfer','manual_gcash')or nullif(trim(p_reference),'')is null then raise exception'INVALID_PAYMENT_DETAILS';end if;
 select * into existing from payments where idempotency_key=p_idempotency_key;if found then return query select existing.id,existing.status;return;end if;
 select * into r from reservations where id=p_reservation_id and user_id=p_user_id for update;if not found then raise exception'RESERVATION_NOT_FOUND';end if;if r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_PAYMENT_READY';end if;
 select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 if round(p_amount,2)>round(i.balance,2)then raise exception'PAYMENT_EXCEEDS_BALANCE';end if;
 insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,submitted_at)
 values(i.id,r.id,round(p_amount,2),'PHP',p_method,trim(p_reference),'stay_payment','pending_verification',p_idempotency_key,now())returning id into pid;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_user_id,'customer_submit_stay_payment','payment',pid::text,jsonb_build_object('reservationId',r.id,'amount',round(p_amount,2),'method',p_method));
 return query select pid,'pending_verification'::text;end$$;
revoke all on function public.customer_submit_stay_payment(uuid,text,numeric,text,text,uuid) from public,anon,authenticated;
grant execute on function public.customer_submit_stay_payment(uuid,text,numeric,text,text,uuid) to service_role;

-- room_is_sellable: already hardened remotely (administratively_active, maintenance,
-- hotel_today, not maintenance_room_is_blocked). No transformation needed.

-- create_booking_hold: already hardened remotely with current_operational_policy_snapshot()
-- and room_is_sellable. No transformation needed.

-- submit_reservation_deposit: already hardened remotely with operational_policy_snapshot
-- and room_is_sellable. No transformation needed.

-- front_desk_assign_room: already hardened remotely with administratively_active check
-- and maintenance_room_is_blocked. No transformation needed.

-- front_desk_check_in: already hardened remotely. No transformation needed.

-- front_desk_change_room: already hardened remotely with administratively_active check.

-- front_desk_execute_manager_approval: already hardened remotely.

-- protect_owner_exception_review: already hardened remotely.

-- Service-role-only RPC boundary preservation.
do $$declare f record;begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname=any(array[
  'room_is_sellable','create_booking_hold','customer_submit_guest_request','submit_reservation_deposit','verify_reservation_deposit','customer_request_reservation_change',
  'front_desk_create_reservation','front_desk_assign_room','front_desk_check_in','front_desk_change_room','front_desk_extend_stay','front_desk_update_guest','front_desk_checkout','front_desk_execute_manager_approval','verify_guest_identity','mark_reservation_no_show','post_folio_charges',
  'request_manager_approval','review_manager_approval','manager_prioritize_housekeeping','manager_escalate_maintenance','maintenance_create_work_order','maintenance_assign_work_order','maintenance_start_work_order','maintenance_record_diagnosis','maintenance_defer_work_order','maintenance_add_progress','maintenance_resolve_work_order','maintenance_cancel_work_order','housekeeping_assign_task','housekeeping_start_task','housekeeping_complete_task','housekeeping_inspect_task','housekeeping_defer_task','housekeeping_report_maintenance','record_staff_payment','accounting_reject_deposit','process_refund','accounting_reverse_charge','accounting_record_adjustment','accounting_fail_refund','accounting_open_cash_shift','accounting_close_cash_shift','accounting_reconcile_cash_shift','accounting_reconcile_payments','accounting_generate_document','accounting_execute_manager_financial_approval'
  ])loop execute format('revoke all on function %s from public,anon,authenticated',f.oid::regprocedure);execute format('grant execute on function %s to service_role',f.oid::regprocedure);end loop;
end$$;