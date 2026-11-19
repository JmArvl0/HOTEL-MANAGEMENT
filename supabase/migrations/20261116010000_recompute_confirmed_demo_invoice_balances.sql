-- The owner confirmed these three legacy seed folios are demo records and
-- their displayed paid amounts have no real payment evidence. Recompute them
-- through the authoritative ledger function; preserve the original values in
-- immutable audit history. Do not create fictitious payments or refunds.
--
-- Deployment gate: the linked migration ledger contains remote-only versions
-- through 20261115090000 and a different 20261115010000. Reconcile that
-- history with repository source before applying this file with db push.
do $$
declare
  target record;
  prior public.invoices%rowtype;
  corrected public.invoices%rowtype;
begin
  -- Fresh installations have no legacy seed rows; a partial match is unsafe.
  if not exists (select 1 from public.invoices
    where id in ('INV-7799', 'INV-7800', 'INV-7801')) then
    return;
  end if;
  if (select count(*) from public.invoices
    where id in ('INV-7799', 'INV-7800', 'INV-7801')) <> 3 then
    raise exception 'DEMO_INVOICE_SET_INCOMPLETE';
  end if;

  -- Keep the absence-of-payment proof stable while the folios are corrected.
  lock table public.payments, public.refund_requests, public.financial_documents,
    public.folio_charges, public.financial_adjustments in share mode;

  for target in
    select * from (values
      ('INV-7799', 'RSV-1048', 26700.00::numeric, 8900.00::numeric, 17800.00::numeric, 'partial'),
      ('INV-7800', 'RSV-1045', 23200.00::numeric, 23200.00::numeric, 0.00::numeric, 'paid'),
      ('INV-7801', 'RSV-1047', 12800.00::numeric, 6400.00::numeric, 6400.00::numeric, 'partial')
    ) as expected(invoice_id, reservation_id, amount, paid, balance, status)
  loop
    select * into strict prior from public.invoices
      where id = target.invoice_id for update;
    if prior.reservation_id is distinct from target.reservation_id
      or prior.amount is distinct from target.amount
      or prior.paid is distinct from target.paid
      or prior.balance is distinct from target.balance
      or prior.status is distinct from target.status
      or prior.created_at is distinct from '2026-08-25T16:13:46.438314+00:00'::timestamptz
    then
      raise exception 'DEMO_INVOICE_STATE_CHANGED: %', target.invoice_id;
    end if;

    if exists (select 1 from public.payments where invoice_id = target.invoice_id or reservation_id = target.reservation_id)
      or exists (select 1 from public.refund_requests where invoice_id = target.invoice_id or reservation_id = target.reservation_id)
      or exists (select 1 from public.financial_documents where reservation_id = target.reservation_id)
      or exists (select 1 from public.folio_charges where invoice_id = target.invoice_id or reservation_id = target.reservation_id)
      or exists (select 1 from public.financial_adjustments where invoice_id = target.invoice_id or reservation_id = target.reservation_id)
      or exists (select 1 from public.audit_logs where action = 'collect_payment'
        and after_data->>'reservationId' = target.reservation_id)
    then
      raise exception 'DEMO_INVOICE_HAS_FINANCIAL_HISTORY: %', target.invoice_id;
    end if;

    select * into corrected from public.sync_invoice_financials(target.invoice_id);
    if corrected.paid is distinct from 0::numeric
      or corrected.balance is distinct from target.amount
      or corrected.status is distinct from 'unpaid'
    then
      raise exception 'DEMO_INVOICE_RECOMPUTE_UNEXPECTED: %', target.invoice_id;
    end if;

    insert into public.audit_logs(action, entity_type, entity_id, before_data, after_data)
    values ('recompute_confirmed_demo_invoice', 'invoice', target.invoice_id,
      jsonb_build_object('paid', prior.paid, 'balance', prior.balance, 'status', prior.status),
      jsonb_build_object('paid', corrected.paid, 'balance', corrected.balance,
        'status', corrected.status, 'reason', 'Confirmed unsupported demo seed paid total'));
  end loop;
end $$;
