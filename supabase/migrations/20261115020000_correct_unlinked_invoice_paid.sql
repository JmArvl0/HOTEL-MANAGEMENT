-- Correct unlinked paid totals (2026-11-15): three invoices (INV-7799,
-- INV-7800, INV-7801) report nonzero paid totals with zero linked payment
-- transactions. The paid field is derived from linked payments via
-- sync_invoice_financials, so these values are incorrect. This additive
-- correction sets paid=0, balance=amount, and status='unpaid' on each
-- affected invoice, with audit log entries. No payment records are created,
-- modified, or deleted; no folio amounts are changed. BILL-01 / KI-029.

do $$
declare v_actor uuid;
begin
  select id into v_actor from public.user_accounts where role='accounting' and active limit 1;
  if v_actor is null then
    select id into v_actor from public.user_accounts where active limit 1;
  end if;

  update public.invoices
  set paid = 0,
      balance = amount,
      status = 'unpaid'
  where id in ('INV-7799', 'INV-7800', 'INV-7801')
    and paid > 0;

  insert into public.audit_logs(user_id, action, entity_type, entity_id, after_data)
  select v_actor,
         'correct_unlinked_invoice_paid',
         'invoice',
         i.id,
         jsonb_build_object(
           'invoiceId', i.id,
           'correctedPaid', 0,
           'correctedBalance', i.amount,
           'correctedStatus', 'unpaid',
           'reason', 'Paid total had no linked payment transaction'
         )
  from public.invoices i
  where i.id in ('INV-7799', 'INV-7800', 'INV-7801')
    and i.paid > 0;

  -- Recompute linked reservation payment status through the authoritative helper.
  for inv in select id from public.invoices where id in ('INV-7799', 'INV-7800', 'INV-7801') loop
    perform public.sync_invoice_financials(inv.id);
  end loop;
end $$;
