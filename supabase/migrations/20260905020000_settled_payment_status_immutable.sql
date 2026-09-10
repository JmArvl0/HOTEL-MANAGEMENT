-- F3 hardening: a payment recorded as 'paid' is settled history. The existing
-- protect_settled_payment trigger already blocks DELETEs and any change to the
-- economic fields (amount/currency/method/reference/purpose/invoice/reservation);
-- it did not guard the status column, so a direct UPDATE could flip a settled
-- payment paid -> failed|expired. No RPC ever moves a paid row off 'paid' (a
-- refund is recorded as a NEW payment row with purpose='refund', status='paid';
-- process_refund marks invoices/reservations refunded, never the original
-- payment), so any status change away from 'paid' is illegitimate and is now
-- rejected with the same SETTLED_PAYMENT_IMMUTABLE.
create or replace function public.protect_settled_payment()returns trigger language plpgsql set search_path=public as $$
begin if tg_op='DELETE'and old.status='paid'then raise exception'SETTLED_PAYMENT_IMMUTABLE';end if;
if tg_op='UPDATE'and old.status='paid'and(old.amount is distinct from new.amount or old.currency is distinct from new.currency or old.method is distinct from new.method or old.reference is distinct from new.reference or old.purpose is distinct from new.purpose or old.invoice_id is distinct from new.invoice_id or old.reservation_id is distinct from new.reservation_id or new.status is distinct from old.status)then raise exception'SETTLED_PAYMENT_IMMUTABLE';end if;
return case when tg_op='DELETE'then old else new end;end$$;
drop trigger if exists payments_preserve_settled_history on public.payments;create trigger payments_preserve_settled_history before update or delete on public.payments for each row execute function public.protect_settled_payment();
-- Function ACL must stay owner/service_role only (the trigger runs SECURITY
-- DEFINER as the invoking role via the table owner path; re-asserting the
-- PUBLIC revoke is idempotent and keeps the same posture as 20260830040000).
revoke execute on function public.protect_settled_payment() from public;
