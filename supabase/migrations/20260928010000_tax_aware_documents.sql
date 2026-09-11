-- Tax-aware financial documents (2026-09-28). VAT-INCLUSIVE pricing: displayed totals
-- remain the full amount guests pay; receipts and folio statements DERIVE the breakdown
-- from the total (net + service charge + VAT, the VAT line absorbing rounding so the
-- lines always sum exactly to the gross). Rates live on hotel_operational_policies
-- (Owner/Admin governed, version-stamped, audited) and freeze into each reservation's
-- operational_policy_snapshot at booking through the existing trigger. Settled documents
-- are immutable snapshots and are never recomputed; when both rates are 0 no breakdown
-- is attached and documents look exactly as before.

alter table public.hotel_operational_policies add column if not exists vat_rate_bp integer not null default 1200 check(vat_rate_bp between 0 and 10000);
alter table public.hotel_operational_policies add column if not exists service_charge_bp integer not null default 1000 check(service_charge_bp between 0 and 10000);

-- current_operational_policy_snapshot: live body + the two new keys, so every new hold
-- and reservation freezes the applicable tax rates (reservations_policy_snapshot trigger
-- already stamps this on insert).
create or replace function public.current_operational_policy_snapshot()
returns jsonb language sql stable security definer set search_path=public as $$
select jsonb_build_object('hotelTimezone',hotel_timezone,'checkInTime',check_in_time::text,'checkOutTime',check_out_time::text,'noShowCutoffTime',no_show_cutoff_time::text,'validIdRequired',valid_id_required,'minimumBookingAge',minimum_booking_age,'cancellationFullRefundDays',cancellation_full_refund_days,'cancellationPartialRefundDays',cancellation_partial_refund_days,'cancellationPartialRefundBasisPoints',cancellation_partial_refund_basis_points,'selfServiceModificationDays',self_service_modification_days,'incidentalsDue',incidentals_due,'petsAllowed',pets_allowed,'smokingAllowed',smoking_allowed,'specialRequestsGuaranteed',special_requests_guaranteed,'emailVerificationRequired',email_verification_required,'earlyCheckInAllowed',early_check_in_allowed,'vatRateBp',vat_rate_bp,'serviceChargeBp',service_charge_bp)from hotel_operational_policies where key='default'
$$;

-- accounting_generate_document: live body + taxBreakdown. Rates resolve from the
-- reservation's frozen snapshot, falling back to the current policy row for legacy
-- reservations created before this migration. Gross is the receipt's payment amount or
-- the folio amount — the inclusive total the document already reports.
create or replace function public.accounting_generate_document(p_document_type text,p_reservation_id text,p_payment_id uuid,p_idempotency_key uuid,p_staff_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare actor text;existing financial_documents%rowtype;r reservations%rowtype;i invoices%rowtype;p payments%rowtype;v_number text;v_snapshot jsonb;v_id uuid;v_gross numeric;v_vat_bp integer;v_sc_bp integer;v_net numeric;v_sc numeric;v_vat numeric;begin
 select role into actor from user_accounts where id=p_staff_user_id and active;if actor is null or actor not in('front_desk','accounting')then raise exception'DOCUMENT_FORBIDDEN';end if;
 select * into existing from financial_documents where idempotency_key=p_idempotency_key;
 if found then return jsonb_build_object('documentId',existing.id,'documentNumber',existing.document_number,'documentType',existing.document_type,'snapshot',existing.snapshot);end if;
 if p_document_type not in('receipt','folio')then raise exception'UNSUPPORTED_DOCUMENT_TYPE';end if;
 if p_document_type='receipt'then
  select * into p from payments where id=p_payment_id;if not found or p.status<>'paid'then raise exception'PAYMENT_NOT_SETTLED';end if;
  select * into r from reservations where id=p.reservation_id;select * into i from invoices where id=p.invoice_id;
 else select * into r from reservations where id=p_reservation_id;if not found then raise exception'RESERVATION_NOT_FOUND';end if;select * into i from invoices where reservation_id=r.id;end if;
 if i.id is null then raise exception'FOLIO_NOT_FOUND';end if;
 v_number:=case p_document_type when'receipt'then'RCP-'else'FOL-'end||to_char(clock_timestamp(),'YYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
 v_snapshot:=jsonb_build_object('documentType',p_document_type,'documentNumber',v_number,'reservationId',r.id,'confirmationNumber',r.confirmation_number,'guestName',r.guest_name,'roomType',r.room_type,'checkIn',r.check_in,'checkOut',r.check_out,
  'currency',i.currency,'folioAmount',i.amount,'paid',i.paid,'balance',i.balance,'creditBalance',i.credit_balance,'folioStatus',i.status,'generatedAt',now(),
  'charges',(select coalesce(jsonb_agg(jsonb_build_object('description',fc.description,'category',fc.category,'amount',fc.amount,'status',fc.status,'postedAt',fc.created_at)order by fc.created_at),'[]'::jsonb)from folio_charges fc where fc.invoice_id=i.id),
  'adjustments',(select coalesce(jsonb_agg(jsonb_build_object('transactionType',fa.transaction_type,'direction',fa.direction,'amount',fa.amount,'reason',fa.reason,'createdAt',fa.created_at)order by fa.created_at),'[]'::jsonb)from financial_adjustments fa where fa.invoice_id=i.id),
  'payments',case when p_document_type='receipt'then jsonb_build_array(jsonb_build_object('purpose',p.purpose,'method',p.method,'reference',p.reference,'amount',p.amount,'receivedAt',coalesce(p.verified_at,p.created_at)))
   else(select coalesce(jsonb_agg(jsonb_build_object('purpose',pp.purpose,'method',pp.method,'reference',pp.reference,'amount',pp.amount,'receivedAt',coalesce(pp.verified_at,pp.created_at))order by pp.created_at),'[]'::jsonb)from payments pp where pp.invoice_id=i.id and pp.status='paid')end);
 v_gross:=case when p_document_type='receipt'then p.amount else i.amount end;
 select coalesce((r.operational_policy_snapshot->>'vatRateBp')::int,pol.vat_rate_bp),coalesce((r.operational_policy_snapshot->>'serviceChargeBp')::int,pol.service_charge_bp)into v_vat_bp,v_sc_bp from hotel_operational_policies pol where pol.key='default';
 if v_vat_bp+v_sc_bp>0 then
  v_net:=round(v_gross/((1+v_sc_bp/10000.0)*(1+v_vat_bp/10000.0)),2);
  v_sc:=round(v_net*v_sc_bp/10000.0,2);
  v_vat:=v_gross-v_net-v_sc;
  v_snapshot:=v_snapshot||jsonb_build_object('taxBreakdown',jsonb_build_object('pricingBasis','vat_inclusive','vatRateBp',v_vat_bp,'serviceChargeBp',v_sc_bp,'netSubtotal',v_net,'serviceCharge',v_sc,'vatAmount',v_vat,'grossTotal',v_gross));
 end if;
 insert into financial_documents(document_number,document_type,reservation_id,payment_id,snapshot,generated_by,idempotency_key)
 values(v_number,p_document_type,r.id,case when p_document_type='receipt'then p.id else null end,v_snapshot,p_staff_user_id,p_idempotency_key)returning id into v_id;
 insert into audit_logs(user_id,action,entity_type,entity_id,after_data)values(p_staff_user_id,'generate_financial_document','financial_document',v_id::text,jsonb_build_object('documentNumber',v_number,'documentType',p_document_type,'reservationId',r.id));
 return jsonb_build_object('documentId',v_id,'documentNumber',v_number,'documentType',p_document_type,'snapshot',v_snapshot);end$$;

-- admin_update_operational_policy: live body + the two rate parameters (0-10000 basis
-- points). Owner/Admin only, version-stamped, audited with before/after.
create or replace function public.admin_update_operational_policy(p_hotel_timezone text,p_check_in_time time,p_check_out_time time,p_no_show_cutoff_time time,p_valid_id_required boolean,p_minimum_booking_age integer,p_cancellation_full_refund_days integer,p_cancellation_partial_refund_days integer,p_cancellation_partial_refund_basis_points integer,p_self_service_modification_days integer,p_early_check_in_allowed boolean,p_housekeeping_inspection_required boolean,p_vat_rate_bp integer,p_service_charge_bp integer,p_reason text,p_expected_version integer,p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$declare actor text;p hotel_operational_policies%rowtype;begin
 select role into actor from user_accounts where id=p_actor_user_id and active;if actor is null or actor not in('owner','admin')then raise exception'ADMIN_AUTHORITY_REQUIRED';end if;select * into p from hotel_operational_policies where key='default'for update;if not found then raise exception'POLICY_NOT_FOUND';end if;if p.version<>p_expected_version then raise exception'POLICY_STALE';end if;if p_hotel_timezone<>p.hotel_timezone and actor<>'owner'then raise exception'TIMEZONE_OWNER_ONLY';end if;if not exists(select 1 from pg_timezone_names where name=p_hotel_timezone)or p_minimum_booking_age not between 1 and 120 or p_cancellation_full_refund_days<0 or p_cancellation_partial_refund_days<0 or p_cancellation_full_refund_days<p_cancellation_partial_refund_days or p_cancellation_partial_refund_basis_points not between 0 and 10000 or p_self_service_modification_days<0 or p_vat_rate_bp is null or p_vat_rate_bp not between 0 and 10000 or p_service_charge_bp is null or p_service_charge_bp not between 0 and 10000 or nullif(trim(p_reason),'')is null then raise exception'INVALID_OPERATIONAL_POLICY';end if;
 update hotel_operational_policies set hotel_timezone=p_hotel_timezone,check_in_time=p_check_in_time,check_out_time=p_check_out_time,no_show_cutoff_time=p_no_show_cutoff_time,valid_id_required=p_valid_id_required,minimum_booking_age=p_minimum_booking_age,cancellation_full_refund_days=p_cancellation_full_refund_days,cancellation_partial_refund_days=p_cancellation_partial_refund_days,cancellation_partial_refund_basis_points=p_cancellation_partial_refund_basis_points,self_service_modification_days=p_self_service_modification_days,early_check_in_allowed=p_early_check_in_allowed,housekeeping_inspection_required=p_housekeeping_inspection_required,vat_rate_bp=p_vat_rate_bp,service_charge_bp=p_service_charge_bp,version=version+1,updated_at=now()where key='default';insert into audit_logs(user_id,action,entity_type,entity_id,before_data,after_data)values(p_actor_user_id,'admin_update_operational_policy','hotel_operational_policy','default',to_jsonb(p),jsonb_build_object('hotelTimezone',p_hotel_timezone,'checkInTime',p_check_in_time,'checkOutTime',p_check_out_time,'noShowCutoffTime',p_no_show_cutoff_time,'validIdRequired',p_valid_id_required,'minimumBookingAge',p_minimum_booking_age,'cancellationFullRefundDays',p_cancellation_full_refund_days,'cancellationPartialRefundDays',p_cancellation_partial_refund_days,'cancellationPartialRefundBasisPoints',p_cancellation_partial_refund_basis_points,'selfServiceModificationDays',p_self_service_modification_days,'earlyCheckInAllowed',p_early_check_in_allowed,'housekeepingInspectionRequired',p_housekeeping_inspection_required,'vatRateBp',p_vat_rate_bp,'serviceChargeBp',p_service_charge_bp,'reason',trim(p_reason),'version',p.version+1));return jsonb_build_object('version',p.version+1);end$$;

-- The new parameter list creates a new overload, not a replacement — drop the old
-- 16-param signature (created by 20260901010000) so only one entry point exists.
drop function if exists public.admin_update_operational_policy(text,time,time,time,boolean,integer,integer,integer,integer,integer,boolean,boolean,text,integer,uuid);

revoke all on function public.current_operational_policy_snapshot()from public,anon,authenticated;
revoke all on function public.accounting_generate_document(text,text,uuid,uuid,uuid)from public,anon,authenticated;
revoke all on function public.admin_update_operational_policy(text,time,time,time,boolean,integer,integer,integer,integer,integer,boolean,boolean,integer,integer,text,integer,uuid)from public,anon,authenticated;
-- Supabase grants anon/authenticated named-role EXECUTE that a PUBLIC revoke misses;
-- revoke them explicitly (service_role keeps EXECUTE below).
revoke execute on function public.current_operational_policy_snapshot()from anon,authenticated;
revoke execute on function public.accounting_generate_document(text,text,uuid,uuid,uuid)from anon,authenticated;
revoke execute on function public.admin_update_operational_policy(text,time,time,time,boolean,integer,integer,integer,integer,integer,boolean,boolean,integer,integer,text,integer,uuid)from anon,authenticated;
grant execute on function public.current_operational_policy_snapshot(),public.accounting_generate_document(text,text,uuid,uuid,uuid),public.admin_update_operational_policy(text,time,time,time,boolean,integer,integer,integer,integer,integer,boolean,boolean,integer,integer,text,integer,uuid)to service_role;
