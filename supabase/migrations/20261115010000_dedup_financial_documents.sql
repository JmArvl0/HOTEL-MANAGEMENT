-- Dedup folio statements (2026-11-15): accounting_generate_document now checks
-- whether an existing folio statement for the same reservation already carries
-- the same financial snapshot (amount, paid, balance, credit, status). If so,
-- it returns the existing document instead of inserting a duplicate. Receipts
-- are unaffected -- each payment is a unique event. Existing immutable documents
-- are preserved; no rows are deleted or modified.

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
 -- Dedup folio statements: return existing document if same reservation and
 -- same financial snapshot already has an issued statement.
 if p_document_type = 'folio' then
  select * into existing from financial_documents
  where reservation_id = r.id
    and document_type = 'folio'
    and coalesce((snapshot->>'folioAmount')::numeric,0) = coalesce(i.amount,0)
    and coalesce((snapshot->>'paid')::numeric,0) = coalesce(i.paid,0)
    and coalesce((snapshot->>'balance')::numeric,0) = coalesce(i.balance,0)
    and coalesce((snapshot->>'creditBalance')::numeric,0) = coalesce(i.credit_balance,0)
    and snapshot->>'folioStatus' = i.status
  order by created_at desc limit 1;
  if found then
   return jsonb_build_object('documentId',existing.id,'documentNumber',existing.document_number,'documentType',existing.document_type,'snapshot',existing.snapshot,'deduplicated',true);
  end if;
 end if;
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

-- Keep grants consistent with the previous migration.
revoke all on function public.accounting_generate_document(text,text,uuid,uuid,uuid)from public,anon,authenticated;
revoke execute on function public.accounting_generate_document(text,text,uuid,uuid,uuid)from anon,authenticated;
grant execute on function public.accounting_generate_document(text,text,uuid,uuid,uuid)to service_role;
