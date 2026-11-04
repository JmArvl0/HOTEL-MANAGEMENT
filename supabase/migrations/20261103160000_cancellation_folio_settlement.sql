-- Prospective settlement only. Historical refunds/documents are never rewritten.
begin;
alter table public.invoices add column terminal_settlement jsonb;

-- Adjustments have no status column. Resolve OLD.status only inside the matching
-- table branch; a compound boolean expression can resolve missing record fields.
create or replace function public.hotel_posting_stamp() returns trigger language plpgsql security definer set search_path=public as $$
declare day date;posting boolean:=true;begin
 day:=hotel_lock_operating_day();
 if tg_op='UPDATE' and old.operating_date is not null then
  if new.operating_date is distinct from old.operating_date then raise exception 'POSTING_DATE_IMMUTABLE';end if;return new;
 end if;
 if tg_table_name='payments' then posting:=new.status='paid';
 elsif tg_table_name='refund_requests' then posting:=new.status='processed';end if;
 if tg_op='UPDATE' then
  if tg_table_name not in('payments','refund_requests') then new.operating_date:=old.operating_date;return new;end if;
  if tg_table_name='payments' then
   if old.status='paid' then new.operating_date:=old.operating_date;return new;end if;
  elsif tg_table_name='refund_requests' then
   if old.status='processed' then new.operating_date:=old.operating_date;return new;end if;
  end if;
 end if;
 new.operating_date:=case when posting then day else null end;return new;
end$$;

create function public.settle_terminal_folio(p_reservation_id text,p_actor uuid,p_fee numeric,p_basis integer,p_policy jsonb,p_kind text)
returns numeric language plpgsql security definer set search_path=public as $$
declare i invoices%rowtype; credit numeric; cid uuid;retained numeric;released numeric;begin
 perform hotel_lock_operating_day();
 select * into i from invoices where reservation_id=p_reservation_id for update;
 if not found then raise exception 'FOLIO_NOT_FOUND';end if;
 if i.terminal_settlement is not null then raise exception 'FOLIO_ALREADY_SETTLED';end if;
 if p_kind not in('cancellation_fee','no_show_fee') or p_fee<0 then raise exception 'INVALID_TERMINAL_FEE';end if;
 -- Independently posted transportation remains collectible (SYSTEM 7.11).
 -- Legacy booking transport has its own cancellation reversal trigger.
 select least(i.amount,coalesce(sum(greatest(c.amount-coalesce(a.reversed,0),0)),0)) into retained
 from folio_charges c left join lateral(select sum(amount) reversed from financial_adjustments where source_charge_id=c.id and transaction_type='reversal') a on true
 where c.invoice_id=i.id and c.category='transportation' and c.status<>'reversed';
 released:=i.amount-retained;
 -- The unused invoice obligation is released explicitly; settled payments survive.
 -- Existing transport cancellation triggers run before this helper.
 if released>0 then
  insert into financial_adjustments(invoice_id,reservation_id,transaction_type,direction,amount,reason,created_by,idempotency_key)
  values(i.id,p_reservation_id,'credit','credit',released,'Unused reservation obligation released on '||replace(p_kind,'_fee',''),p_actor,gen_random_uuid());
 end if;
 if p_fee>0 then
  insert into folio_charges(invoice_id,reservation_id,description,category,amount,posted_by,idempotency_key,source,source_record_id,fee_snapshot)
  values(i.id,p_reservation_id,case when p_kind='no_show_fee' then 'No-show fee' else 'Cancellation fee' end,p_kind,round(p_fee,2),p_actor,gen_random_uuid(),'reservation_policy',p_reservation_id,
   jsonb_build_object('code',p_kind,'policySnapshot',p_policy,'refundBasisPoints',p_basis,'calculationBasis','settled_reservation_deposit','taxTreatment','reservation_snapshot')) returning id into cid;
 end if;
 update invoices set amount=round(retained+p_fee,2),status='paid',terminal_settlement=jsonb_build_object('kind',p_kind,'originalAmount',i.amount,'releasedAmount',released,'retainedServiceCharges',retained,'feeAmount',round(p_fee,2),'chargeId',cid,'policySnapshot',p_policy,'settledAt',now()) where id=i.id;
 select * into i from sync_invoice_financials(i.id);credit:=i.credit_balance;
 update invoices set status=case when credit>0 then 'refund_pending' else i.status end where id=i.id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data) values(p_actor,'settle_terminal_folio','invoice',i.id,jsonb_build_object('reservationId',p_reservation_id,'releasedObligation',i.terminal_settlement->'originalAmount','fee',p_fee,'refundableCredit',credit));
 return credit;
end$$;
revoke all on function public.settle_terminal_folio(text,uuid,numeric,integer,jsonb,text) from public,anon,authenticated,service_role;

create or replace function public.cancel_reservation(p_reservation_id text,p_actor_user_id uuid,p_reason text)
returns table(reservation_status text,refund_request_id uuid,eligible_refund numeric,refund_basis_points integer)language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;policy jsonb;days_before integer;deposit_paid numeric;basis integer;fee numeric;eligible numeric;refund_id uuid;i invoices%rowtype;existing refund_requests%rowtype;begin
 perform hotel_lock_operating_day();
 select role into actor from user_accounts where id=p_actor_user_id and active;
 select * into r from reservations where id=p_reservation_id for update;if not found then raise exception 'RESERVATION_NOT_FOUND';end if;
 if actor='guest' and r.user_id is distinct from p_actor_user_id then raise exception 'RESERVATION_OWNERSHIP_REQUIRED';end if;
 if actor is null or actor not in('guest','front_desk') then raise exception 'CANCELLATION_FORBIDDEN';end if;
 select * into existing from refund_requests where reservation_id=r.id and status in('pending','failed','processed') order by created_at desc limit 1;
 if r.status='cancelled' then return query select r.status,existing.id,coalesce(existing.eligible_amount,0),coalesce(existing.refund_basis_points,0);return;end if;
 if r.status not in('pending','confirmed') then raise exception 'RESERVATION_NOT_CANCELLABLE';end if;
 if nullif(trim(p_reason),'') is null then raise exception 'CANCELLATION_REASON_REQUIRED';end if;
 policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());
 days_before:=r.check_in-(now() at time zone coalesce(policy->>'hotelTimezone','Asia/Manila'))::date;
 basis:=case when days_before>=coalesce((policy->>'cancellationFullRefundDays')::int,14) then 10000 when days_before>=coalesce((policy->>'cancellationPartialRefundDays')::int,7) then coalesce((policy->>'cancellationPartialRefundBasisPoints')::int,5000) else 0 end;
 select coalesce(sum(amount),0) into deposit_paid from payments where reservation_id=r.id and purpose='reservation_deposit' and status='paid';
 fee:=deposit_paid-round(deposit_paid*basis/10000.0,2);
 update reservations set status='cancelled',cancellation_reason=trim(p_reason) where id=r.id;
 update payments set status='expired',notes=coalesce(notes,'Reservation cancelled before deposit verification') where reservation_id=r.id and status='pending_verification';
 eligible:=settle_terminal_folio(r.id,p_actor_user_id,fee,basis,policy,'cancellation_fee');
 select * into i from invoices where reservation_id=r.id;
 if eligible>0 then insert into refund_requests(reservation_id,invoice_id,requested_by,reason,paid_deposit,refund_basis_points,eligible_amount) values(r.id,i.id,p_actor_user_id,trim(p_reason),deposit_paid,basis,eligible) returning id into refund_id;end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(p_actor_user_id,'cancel_reservation','reservation',r.id,jsonb_build_object('status',r.status),jsonb_build_object('status','cancelled','reason',p_reason,'eligibleRefund',eligible,'refundBasisPoints',basis,'feeAmount',fee));
 return query select 'cancelled'::text,refund_id,eligible,basis;
end$$;

create or replace function public.mark_reservation_no_show(p_reservation_id text,p_staff_user_id uuid,p_reason text)returns void language plpgsql security definer set search_path=public as $$
declare actor text;r reservations%rowtype;policy jsonb;deposit_paid numeric;eligible numeric;i invoices%rowtype;begin
 perform hotel_lock_operating_day();
 select role into actor from user_accounts where id=p_staff_user_id and active;
 if actor is null or actor<>'front_desk' then raise exception 'NO_SHOW_FORBIDDEN';end if;
 select * into r from reservations where id=p_reservation_id for update;
 if not found then raise exception 'RESERVATION_NOT_NO_SHOW_READY';end if;
 if r.status='no_show' and exists(select 1 from invoices where reservation_id=r.id and terminal_settlement is not null) then return;end if;
 if r.status<>'confirmed' then raise exception 'RESERVATION_NOT_NO_SHOW_READY';end if;
 policy:=coalesce(r.operational_policy_snapshot,current_operational_policy_snapshot());
 if (now() at time zone coalesce(policy->>'hotelTimezone','Asia/Manila'))<(r.check_in+coalesce((policy->>'noShowCutoffTime')::time,'23:59'::time)) then raise exception 'NO_SHOW_CUTOFF_NOT_REACHED';end if;
 select coalesce(sum(amount),0) into deposit_paid from payments where reservation_id=r.id and purpose='reservation_deposit' and status='paid';
 update reservations set status='no_show',cancellation_reason=coalesce(nullif(trim(p_reason),''),'Guest did not arrive by no-show cutoff') where id=r.id;
 if r.room_id is not null then update rooms set status=case when housekeeping='clean' then 'available' else 'dirty' end where id=r.room_id and status='reserved';end if;
 update payments set status='expired' where reservation_id=r.id and status='pending_verification';
 eligible:=settle_terminal_folio(r.id,p_staff_user_id,deposit_paid,0,policy,'no_show_fee');
 select * into i from invoices where reservation_id=r.id;
 if eligible>0 then insert into refund_requests(reservation_id,invoice_id,requested_by,reason,paid_deposit,refund_basis_points,eligible_amount) values(r.id,i.id,p_staff_user_id,'Unused advance payment after no-show fee',deposit_paid,0,eligible);end if;
 insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data) values(p_staff_user_id,'reservation_no_show','reservation',r.id,jsonb_build_object('status',r.status),jsonb_build_object('status','no_show','depositRetained',deposit_paid,'feeAmount',deposit_paid,'eligibleRefund',eligible));
end$$;

-- Preserve retry/audit/manager-execution hooks in the deployed refund RPC. Legacy
-- folios continue their historical path; new ones must reconcile to actual credit.
do $$declare body text;old text;begin
 select pg_get_functiondef('public.process_refund(uuid,uuid,text)'::regprocedure) into body;
 old:='if round(v_refunded+rr.eligible_amount,2)>round(v_gross,2)then';
 if strpos(body,old)=0 then raise exception 'REFUND_BODY_UNEXPECTED';end if;
 body:=replace(body,old,$patch$
 if i.terminal_settlement is not null then
  if rr.eligible_amount>i.credit_balance and rr.exception_approval_id is not null then
   perform 1 from manager_approval_requests where id=rr.exception_approval_id and status='approved' and execution_status='awaiting_execution' and reservation_id=r.id and request_type='refund_exception' and round((requested_action->>'amount')::numeric,2)=rr.eligible_amount;
   if not found then raise exception 'REFUND_EXCEPTION_NOT_APPROVED';end if;
   -- A waiver increases the guest credit. The approved payout never silently
   -- leaves the original fee outstanding on the statement.
   declare c folio_charges%rowtype;waiver numeric;reversed numeric;begin
    select * into c from folio_charges where id=(i.terminal_settlement->>'chargeId')::uuid for update;
    select coalesce(sum(amount),0) into reversed from financial_adjustments where source_charge_id=c.id and transaction_type='reversal';
    waiver:=round(rr.eligible_amount-i.credit_balance,2);
    if c.id is null or waiver>c.amount-reversed then raise exception 'REFUND_EXCEEDS_FOLIO_CREDIT';end if;
    insert into financial_adjustments(invoice_id,reservation_id,transaction_type,direction,amount,reason,source_charge_id,created_by,idempotency_key,manager_approval_id)
    values(i.id,r.id,'reversal','credit',waiver,'Manager-approved policy fee waiver: '||rr.reason,c.id,p_staff_user_id,rr.id,rr.exception_approval_id);
    update folio_charges set status=case when reversed+waiver=c.amount then 'reversed' else 'partially_reversed' end where id=c.id;
    update invoices set amount=amount-waiver where id=i.id;
   end;
   select * into i from sync_invoice_financials(i.id);
  end if;
  if rr.eligible_amount>i.credit_balance then raise exception 'REFUND_EXCEEDS_FOLIO_CREDIT';end if;
 end if;
 if round(v_refunded+rr.eligible_amount,2)>round(v_gross,2)then
$patch$);
 old:='update invoices set paid=v_net,balance=0,credit_balance=0,status=case when v_net=0 then''refunded''else''partial_refund''end where id=i.id;';
 if strpos(body,old)=0 then raise exception 'REFUND_BALANCE_BODY_UNEXPECTED';end if;
 body:=replace(body,old,'if i.terminal_settlement is not null then perform sync_invoice_financials(i.id);update invoices set status=case when credit_balance>0 then ''refund_pending'' when amount=0 then ''refunded'' else ''partial_refund'' end where id=i.id;else '||old||'end if;');
 -- All new reservation mutations lock reservation then invoice. Match that
 -- order before taking the refund-request lock to prevent a cancellation deadlock.
 body:=replace(body,'select * into rr from refund_requests where id=p_refund_id for update;', 'select * into rr from refund_requests where id=p_refund_id;perform 1 from reservations where id=rr.reservation_id for update;perform 1 from invoices where id=rr.invoice_id for update;select * into rr from refund_requests where id=p_refund_id for update;');
 execute body;
end$$;

-- Fee reporting follows posting dates, including subsequent fee reversals.
-- Residual independent service charges remain collectible through the existing
-- staff collection workflow after operational closure.
do $$declare body text;needle text:='r.status not in(''confirmed'',''checked_in'')';begin
 select pg_get_functiondef('public.record_staff_payment(text,numeric,text,text,uuid,uuid,boolean,boolean)'::regprocedure) into body;
 if strpos(body,needle)=0 then raise exception 'PAYMENT_STATUS_BODY_UNEXPECTED';end if;
 execute replace(body,needle,'(r.status not in(''confirmed'',''checked_in'') and not (r.status in(''cancelled'',''no_show'') and exists(select 1 from invoices where reservation_id=r.id and terminal_settlement is not null)))');
end$$;

-- New documents include the original obligation and settlement calculation;
-- previously issued immutable snapshots retain their original contents.
do $$declare body text;needle text:='''folioAmount'',i.amount';begin
 select pg_get_functiondef('public.accounting_generate_document(text,text,uuid,uuid,uuid)'::regprocedure) into body;
 if strpos(body,needle)=0 then raise exception 'DOCUMENT_FOLIO_BODY_UNEXPECTED';end if;
 execute replace(body,needle,'''originalFolioAmount'',coalesce((i.terminal_settlement->>''originalAmount'')::numeric,i.amount),''terminalSettlement'',i.terminal_settlement,'||needle);
end$$;

do $$declare body text;needle text:='''assessedCharges'',';begin
 select pg_get_functiondef('public.hotel_daily_metrics(date)'::regprocedure) into body;
 if strpos(body,needle)=0 then raise exception 'DAILY_METRICS_BODY_UNEXPECTED';end if;
 body:=replace(body,needle,$patch$
 'cancellationFees',coalesce((select sum(amount) from folio_charges where operating_date=p_day and category='cancellation_fee'),0)-coalesce((select sum(a.amount) from financial_adjustments a join folio_charges c on c.id=a.source_charge_id where a.operating_date=p_day and a.transaction_type='reversal' and c.category='cancellation_fee'),0),
 'noShowFees',coalesce((select sum(amount) from folio_charges where operating_date=p_day and category='no_show_fee'),0)-coalesce((select sum(a.amount) from financial_adjustments a join folio_charges c on c.id=a.source_charge_id where a.operating_date=p_day and a.transaction_type='reversal' and c.category='no_show_fee'),0),
 'assessedCharges',
$patch$);
 execute body;
end$$;

create function public.protect_terminal_settlement() returns trigger language plpgsql set search_path=public as $$begin
 if old.terminal_settlement is not null and new.terminal_settlement is distinct from old.terminal_settlement then raise exception 'TERMINAL_SETTLEMENT_IMMUTABLE';end if;return new;
end$$;
create trigger invoices_preserve_terminal_settlement before update on invoices for each row execute function public.protect_terminal_settlement();
revoke all on function public.protect_terminal_settlement() from public,anon,authenticated,service_role;
revoke all on function public.cancel_reservation(text,uuid,text),public.mark_reservation_no_show(text,uuid,text),public.process_refund(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_reservation(text,uuid,text),public.mark_reservation_no_show(text,uuid,text),public.process_refund(uuid,uuid,text) to service_role;
commit;
