-- Future issuance reuses a canonical receipt per payment and an exact folio
-- snapshot per reservation. Existing numbered documents and audit rows stay intact.
begin;

-- A key used to return an existing snapshot must stay bound to that snapshot
-- even if the folio changes before the same caller retries.
create table public.financial_document_replay_keys (
  idempotency_key uuid primary key,
  document_id uuid not null references public.financial_documents(id) on delete restrict
);
alter table public.financial_document_replay_keys enable row level security;
revoke all on public.financial_document_replay_keys from public, anon, authenticated, service_role;

create or replace function public.accounting_generate_document(
  p_document_type text, p_reservation_id text, p_payment_id uuid,
  p_idempotency_key uuid, p_staff_user_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  actor text;
  existing public.financial_documents%rowtype;
  payment public.payments%rowtype;
  reservation_id_value text;
  document_number_value text;
  snapshot_value jsonb;
  document_id_value uuid;
  gross numeric;
  vat_bp integer;
  service_charge_bp integer;
  net numeric;
  service_charge numeric;
  vat numeric;
begin
  select u.role into actor from public.user_accounts u where u.id = p_staff_user_id and u.active;
  if actor is null or actor not in ('front_desk', 'accounting') then raise exception 'DOCUMENT_FORBIDDEN'; end if;
  if p_document_type is null or p_document_type not in ('receipt', 'folio') then raise exception 'UNSUPPORTED_DOCUMENT_TYPE'; end if;
  if p_idempotency_key is null then raise exception 'IDEMPOTENCY_KEY_REQUIRED'; end if;

  -- Lock the request key before the source so concurrent retries cannot bind
  -- one key to two documents. Distinct keys for one source then serialize.
  perform pg_advisory_xact_lock(hashtextextended('financial-document-key:' || p_idempotency_key, 0));
  select * into existing from public.financial_documents d where d.idempotency_key = p_idempotency_key;
  if not found then
    select d.* into existing from public.financial_document_replay_keys k
      join public.financial_documents d on d.id = k.document_id
      where k.idempotency_key = p_idempotency_key;
  end if;
  if existing.id is not null then
    if existing.document_type <> p_document_type
      or (p_document_type = 'receipt' and existing.payment_id is distinct from p_payment_id)
      or (p_document_type = 'folio' and existing.reservation_id is distinct from p_reservation_id) then
      raise exception 'IDEMPOTENCY_CONFLICT';
    end if;
    return jsonb_build_object('documentId', existing.id, 'documentNumber', existing.document_number,
      'documentType', existing.document_type, 'snapshot', existing.snapshot);
  end if;

  if p_document_type = 'receipt' then
    perform pg_advisory_xact_lock(hashtextextended('receipt-document:' || p_payment_id, 0));
    select * into payment from public.payments p where p.id = p_payment_id;
    if not found or payment.status <> 'paid' then raise exception 'PAYMENT_NOT_SETTLED'; end if;
    reservation_id_value := payment.reservation_id;
    -- Same ordering as the customer receipt reader, including historical duplicates.
    select * into existing from public.financial_documents d
      where d.document_type = 'receipt' and d.payment_id = payment.id
      order by d.created_at, d.id limit 1;
  else
    perform pg_advisory_xact_lock(hashtextextended('folio-statement:' || p_reservation_id, 0));
    if not exists (select 1 from public.reservations r where r.id = p_reservation_id) then
      raise exception 'RESERVATION_NOT_FOUND';
    end if;
    reservation_id_value := p_reservation_id;
  end if;

  if existing.id is null then
    document_number_value := (case p_document_type when 'receipt' then 'RCP-' else 'FOL-' end)
      || to_char(clock_timestamp(), 'YYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

    -- Read invoice totals, line items, and frozen policy from one database snapshot.
    select jsonb_build_object(
      'documentType', p_document_type, 'documentNumber', document_number_value,
      'reservationId', r.id, 'confirmationNumber', r.confirmation_number, 'guestName', r.guest_name,
      'roomType', r.room_type, 'checkIn', r.check_in, 'checkOut', r.check_out, 'currency', i.currency,
      'originalFolioAmount', coalesce((i.terminal_settlement->>'originalAmount')::numeric, i.amount),
      'terminalSettlement', i.terminal_settlement, 'folioAmount', i.amount, 'paid', i.paid,
      'balance', i.balance, 'creditBalance', i.credit_balance, 'folioStatus', i.status, 'generatedAt', now(),
      'charges', (select coalesce(jsonb_agg(jsonb_build_object(
        'description', fc.description, 'category', fc.category, 'amount', fc.amount,
        'status', fc.status, 'postedAt', fc.created_at
      ) order by fc.created_at, fc.id), '[]'::jsonb) from public.folio_charges fc where fc.invoice_id = i.id),
      'adjustments', (select coalesce(jsonb_agg(jsonb_build_object(
        'transactionType', fa.transaction_type, 'direction', fa.direction, 'amount', fa.amount,
        'reason', fa.reason, 'createdAt', fa.created_at
      ) order by fa.created_at, fa.id), '[]'::jsonb) from public.financial_adjustments fa where fa.invoice_id = i.id),
      'payments', case when p_document_type = 'receipt' then jsonb_build_array(jsonb_build_object(
        'purpose', payment.purpose, 'method', payment.method, 'reference', payment.reference,
        'amount', payment.amount, 'receivedAt', coalesce(payment.verified_at, payment.created_at)
      )) else (select coalesce(jsonb_agg(jsonb_build_object(
        'purpose', p.purpose, 'method', p.method, 'reference', p.reference, 'amount', p.amount,
        'receivedAt', coalesce(p.verified_at, p.created_at)
      ) order by p.created_at, p.id), '[]'::jsonb) from public.payments p where p.invoice_id = i.id and p.status = 'paid') end
    ),
    case when p_document_type = 'receipt' then payment.amount else i.amount end,
    coalesce((r.operational_policy_snapshot->>'vatRateBp')::integer, policy.vat_rate_bp),
    coalesce((r.operational_policy_snapshot->>'serviceChargeBp')::integer, policy.service_charge_bp)
    into snapshot_value, gross, vat_bp, service_charge_bp
    from public.reservations r
    join public.invoices i on i.reservation_id = r.id and (p_document_type = 'folio' or i.id = payment.invoice_id)
    left join public.hotel_operational_policies policy on policy.key = 'default'
    where r.id = reservation_id_value;
    if not found then raise exception 'FOLIO_NOT_FOUND'; end if;

    if vat_bp + service_charge_bp > 0 then
      net := round(gross / ((1 + service_charge_bp / 10000.0) * (1 + vat_bp / 10000.0)), 2);
      service_charge := round(net * service_charge_bp / 10000.0, 2);
      vat := gross - net - service_charge;
      snapshot_value := snapshot_value || jsonb_build_object('taxBreakdown', jsonb_build_object(
        'pricingBasis', 'vat_inclusive', 'vatRateBp', vat_bp, 'serviceChargeBp', service_charge_bp,
        'netSubtotal', net, 'serviceCharge', service_charge, 'vatAmount', vat, 'grossTotal', gross));
    end if;

    if p_document_type = 'folio' then
      select * into existing from public.financial_documents d
        where d.reservation_id = reservation_id_value and d.document_type = 'folio'
          and (d.snapshot - 'documentNumber' - 'generatedAt') = (snapshot_value - 'documentNumber' - 'generatedAt')
        order by d.created_at, d.id limit 1;
    end if;
  end if;

  if existing.id is not null then
    insert into public.financial_document_replay_keys(idempotency_key, document_id)
      values (p_idempotency_key, existing.id);
    return jsonb_build_object('documentId', existing.id, 'documentNumber', existing.document_number,
      'documentType', existing.document_type, 'snapshot', existing.snapshot, 'deduplicated', true);
  end if;

  insert into public.financial_documents(document_number, document_type, reservation_id, payment_id, snapshot, generated_by, idempotency_key)
    values (document_number_value, p_document_type, reservation_id_value, payment.id, snapshot_value, p_staff_user_id, p_idempotency_key)
    returning id into document_id_value;
  insert into public.audit_logs(user_id, action, entity_type, entity_id, after_data)
    values (p_staff_user_id, 'generate_financial_document', 'financial_document', document_id_value::text,
      jsonb_build_object('documentNumber', document_number_value, 'documentType', p_document_type, 'reservationId', reservation_id_value));
  return jsonb_build_object('documentId', document_id_value, 'documentNumber', document_number_value,
    'documentType', p_document_type, 'snapshot', snapshot_value);
end $$;

revoke all on function public.accounting_generate_document(text,text,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.accounting_generate_document(text,text,uuid,uuid,uuid) to service_role;

commit;
