CREATE OR REPLACE FUNCTION public.accounting_close_cash_shift(p_shift_id uuid, p_actual_cash numeric, p_notes text, p_idempotency_key uuid, p_staff_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor text;s cash_shifts%rowtype;existing cash_shifts%rowtype;v_in numeric;v_out numeric;v_expected numeric;v_variance numeric;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','accounting')then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 select * into existing from cash_shifts where close_idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('shiftId',existing.id,'status',existing.status,'expectedCash',existing.expected_cash,'actualCash',existing.actual_cash,'variance',existing.variance);end if;
 if p_actual_cash is null or p_actual_cash<0 then raise exception'INVALID_COUNTED_CASH';end if;
 select * into s from cash_shifts where id=p_shift_id for update;if not found then raise exception'CASH_SHIFT_NOT_FOUND';end if;
 if s.status<>'open'then raise exception'CASH_SHIFT_NOT_OPEN';end if;
 if s.staff_user_id<>p_staff_user_id and actor<>'accounting'then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 select coalesce(sum(amount),0)into v_in from payments where cash_shift_id=s.id and status='paid'and purpose<>'refund';
 select coalesce(sum(amount),0)into v_out from payments where cash_shift_id=s.id and status='paid'and purpose='refund';
 v_expected:=round(s.opening_amount+v_in-v_out,2);v_variance:=round(round(p_actual_cash,2)-v_expected,2);
 update cash_shifts set status='closed',closed_at=now(),expected_cash=v_expected,actual_cash=round(p_actual_cash,2),variance=v_variance,close_notes=nullif(trim(p_notes),''),close_idempotency_key=p_idempotency_key where id=s.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'close_cash_shift','cash_shift',s.id::text,jsonb_build_object('expectedCash',v_expected,'actualCash',round(p_actual_cash,2),'variance',v_variance,'cashCollected',v_in,'cashPaidOut',v_out));
 return jsonb_build_object('shiftId',s.id,'status','closed','expectedCash',v_expected,'actualCash',round(p_actual_cash,2),'variance',v_variance,'cashCollected',v_in,'cashPaidOut',v_out);end$function$

CREATE OR REPLACE FUNCTION public.accounting_open_cash_shift(p_staff_user_id uuid, p_location text, p_opening_amount numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor text;v_id uuid;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','accounting')then raise exception'CASH_SHIFT_FORBIDDEN';end if;
 if p_opening_amount is null or p_opening_amount<0 then raise exception'INVALID_OPENING_AMOUNT';end if;
 perform pg_advisory_xact_lock(hashtextended('cash_shift_open',0));
 if exists(select 1 from cash_shifts where status='open')then raise exception'CASH_SHIFT_ALREADY_OPEN';end if;
 insert into cash_shifts(staff_user_id,location,opening_amount)values(p_staff_user_id,coalesce(nullif(trim(p_location),''),'Front Desk'),round(p_opening_amount,2))returning id into v_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'open_cash_shift','cash_shift',v_id::text,jsonb_build_object('openingAmount',round(p_opening_amount,2),'location',coalesce(nullif(trim(p_location),''),'Front Desk')));
 return jsonb_build_object('shiftId',v_id,'status','open','openingAmount',round(p_opening_amount,2));end$function$

CREATE OR REPLACE FUNCTION public.housekeeping_complete_task(p_task_id text, p_checklist jsonb, p_notes text, p_staff_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor text;t housekeeping_tasks%rowtype;room rooms%rowtype;inspection_required boolean;blocked boolean;next_state text;next_room_status text;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'housekeeping'then raise exception'HOUSEKEEPING_ACTION_FORBIDDEN';end if;select * into t from housekeeping_tasks where id=p_task_id for update;if not found then raise exception'TASK_NOT_FOUND';end if;if t.status<>'in_progress'then raise exception'TASK_NOT_COMPLETABLE';end if;if t.started_by is distinct from p_staff_user_id and actor='housekeeping'then raise exception'TASK_ASSIGNED_TO_ANOTHER_WORKER';end if;select * into room from rooms where id=t.room_id for update;if not found then raise exception'ROOM_NOT_FOUND';end if;if t.task_type in('checkout_cleaning','reclean','maintenance_cleanup','room_preparation')and room.status in('occupied','reserved')then raise exception'ROOM_STATE_CHANGED';end if;select coalesce((select housekeeping_inspection_required from hotel_operational_policies where key='default'),true)into inspection_required;blocked:=maintenance_room_is_blocked(room.id);next_state:=case when room.status='occupied'then'clean'when inspection_required then'inspection'else'clean'end;next_room_status:=case when room.status='occupied'then'occupied'when blocked then'maintenance'when room.status in('dirty','maintenance')then'available'else room.status end;update housekeeping_tasks set status='completed',completed_at=now(),completed_by=p_staff_user_id,checklist=coalesce(p_checklist,'{}'),notes=concat_ws(E'\n',notes,nullif(trim(p_notes),'')),inspection_status=case when room.status<>'occupied'and inspection_required then'pending'else'not_required'end,version=version+1,updated_at=now()where id=t.id;update rooms set housekeeping=next_state,status=next_room_status where id=room.id;if t.guest_request_id is not null then update guest_requests set status='completed'where id=t.guest_request_id and status<>'completed';end if;insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'housekeeping_complete_task','housekeeping_task',t.id,jsonb_build_object('status',t.status),jsonb_build_object('status','completed','maintenanceBlocked',blocked));return jsonb_build_object('taskId',t.id,'status','completed','roomState',next_state,'maintenanceBlocked',blocked);end$function$

CREATE OR REPLACE FUNCTION public.record_staff_payment(p_reservation_id text, p_amount numeric, p_method text, p_reference text, p_idempotency_key uuid, p_staff_user_id uuid, p_allow_overpayment boolean DEFAULT false, p_allow_unattributed_cash boolean DEFAULT false)
 RETURNS TABLE(payment_id uuid, paid numeric, balance numeric, payment_status text, folio_credit numeric, reference text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor text;r reservations%rowtype;i invoices%rowtype;existing payments%rowtype;v_pid uuid;v_shift uuid;v_ref text;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','accounting')then raise exception'PAYMENT_COLLECTION_FORBIDDEN';end if;
 if p_allow_overpayment and actor<>'accounting'then raise exception'OVERPAYMENT_FORBIDDEN';end if;
 if p_amount<=0 then raise exception'INVALID_PAYMENT_AMOUNT';end if;
 if nullif(trim(p_method),'')is null or(lower(trim(p_method))<>'cash'and nullif(trim(p_reference),'')is null)then raise exception'INVALID_PAYMENT_DETAILS';end if;
 select * into existing from payments where idempotency_key=p_idempotency_key;if found then select * into i from invoices where id=existing.invoice_id;return query select existing.id,i.paid,i.balance,i.status,i.credit_balance,existing.reference;return;end if;
 select * into r from reservations where id=p_reservation_id for update;if not found or r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_PAYMENT_READY';end if;
 select * into i from invoices where reservation_id=r.id for update;if not found then raise exception'FOLIO_NOT_FOUND';end if;
 if round(p_amount,2)>round(i.balance,2)and not p_allow_overpayment then raise exception'PAYMENT_EXCEEDS_BALANCE';end if;
 if lower(trim(p_method))='cash'then
  select cs.id into v_shift from cash_shifts cs where cs.status='open' order by cs.opened_at asc limit 1;
  if v_shift is null and not coalesce(p_allow_unattributed_cash,false) then raise exception'CASH_SHIFT_REQUIRED';end if;
  v_ref:='CASH-'||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 end if;
 insert into payments(invoice_id,reservation_id,amount,currency,method,reference,purpose,status,idempotency_key,received_by,verified_at,cash_shift_id)
 values(i.id,r.id,round(p_amount,2),'PHP',trim(p_method),coalesce(v_ref,trim(p_reference)),'stay_payment','paid',p_idempotency_key,p_staff_user_id,now(),v_shift)returning id into v_pid;
 select * into i from sync_invoice_financials(i.id);
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'collect_payment','payment',v_pid::text,jsonb_build_object('reservationId',r.id,'amount',round(p_amount,2),'method',trim(p_method),'reference',coalesce(v_ref,trim(p_reference)),'cashShiftId',v_shift,'unattributedCash',v_shift is null,'creditBalance',i.credit_balance));
 return query select v_pid,i.paid,i.balance,i.status,i.credit_balance,coalesce(v_ref,trim(p_reference));end$function$

CREATE OR REPLACE FUNCTION public.verify_guest_identity(p_reservation_id text, p_staff_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare actor text;r reservations%rowtype;begin select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor<>'front_desk'then raise exception'IDENTITY_VERIFICATION_FORBIDDEN';end if;
select * into r from reservations where id=p_reservation_id for update;if not found or r.status not in('confirmed','checked_in')then raise exception'RESERVATION_NOT_IDENTITY_READY';end if;
update reservations set identity_status='verified',identity_verified_by=p_staff_user_id,identity_verified_at=now()where id=r.id;
insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_staff_user_id,'verify_guest_identity','reservation',r.id,jsonb_build_object('identityStatus',r.identity_status),jsonb_build_object('identityStatus','verified'));end$function$
