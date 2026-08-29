-- Integrated Accounting operations. Existing reservations, invoices, payments, refunds and audits remain authoritative.
alter table public.invoices add column if not exists credit_balance numeric(12,2)not null default 0 check(credit_balance>=0);
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices add constraint invoices_status_check check(status in('unpaid','deposit','partial','paid','credit','refund_pending','partial_refund','refunded','cancelled'));
alter table public.reservations drop constraint if exists reservations_payment_status_check;
alter table public.reservations add constraint reservations_payment_status_check check(payment_status in('unpaid','deposit','partial','paid','credit','failed','partial_refund','refunded'));
alter table public.folio_charges add column if not exists source text not null default 'hotel_operations';
alter table public.folio_charges add column if not exists source_record_id text;
alter table public.folio_charges add column if not exists status text not null default 'posted';
alter table public.folio_charges drop constraint if exists folio_charges_status_check;
alter table public.folio_charges add constraint folio_charges_status_check check(status in('posted','partially_reversed','reversed'));
alter table public.payments add column if not exists reviewed_by uuid references public.user_accounts(id)on delete set null;
alter table public.payments add column if not exists reviewed_at timestamptz;
alter table public.payments add column if not exists decision_reason text;

create table if not exists public.financial_adjustments(
 id uuid primary key default gen_random_uuid(),invoice_id text not null references public.invoices(id)on delete restrict,reservation_id text not null references public.reservations(id)on delete restrict,
 transaction_type text not null check(transaction_type in('adjustment','credit','reversal','write_off')),direction text not null check(direction in('debit','credit')),amount numeric(12,2)not null check(amount>0),
 reason text not null,source_charge_id uuid references public.folio_charges(id)on delete restrict,created_by uuid references public.user_accounts(id)on delete set null,idempotency_key uuid not null unique,created_at timestamptz not null default now());
create index if not exists financial_adjustments_reservation_idx on public.financial_adjustments(reservation_id,created_at desc);
create table if not exists public.cash_shifts(
 id uuid primary key default gen_random_uuid(),staff_user_id uuid not null references public.user_accounts(id)on delete restrict,location text not null default 'Front Desk',opening_amount numeric(12,2)not null check(opening_amount>=0),
 status text not null default 'open'check(status in('open','closed','reconciled')),opened_at timestamptz not null default now(),closed_at timestamptz,expected_cash numeric(12,2),actual_cash numeric(12,2),variance numeric(12,2),
 close_notes text,close_idempotency_key uuid unique,reconciled_by uuid references public.user_accounts(id)on delete set null,reconciled_at timestamptz,reconciliation_notes text);
create unique index if not exists cash_shift_one_open_per_staff on public.cash_shifts(staff_user_id)where status='open';
alter table public.payments add column if not exists cash_shift_id uuid references public.cash_shifts(id)on delete restrict;
create table if not exists public.payment_reconciliations(
 id uuid primary key default gen_random_uuid(),period_start date not null,period_end date not null check(period_end>=period_start),payment_method text not null,expected_amount numeric(12,2)not null,
 settled_amount numeric(12,2)not null check(settled_amount>=0),variance numeric(12,2)not null,status text not null check(status in('balanced','variance')),notes text,
 reconciled_by uuid references public.user_accounts(id)on delete set null,reconciled_at timestamptz not null default now(),idempotency_key uuid not null unique);
create table if not exists public.refund_attempts(
 id uuid primary key default gen_random_uuid(),refund_request_id uuid not null references public.refund_requests(id)on delete restrict,status text not null check(status in('processed','failed')),
 reference text,reason text,attempted_by uuid references public.user_accounts(id)on delete set null,attempted_at timestamptz not null default now());
create table if not exists public.financial_documents(
 id uuid primary key default gen_random_uuid(),document_number text not null unique,document_type text not null check(document_type in('receipt','folio')),reservation_id text references public.reservations(id)on delete restrict,
 payment_id uuid references public.payments(id)on delete restrict,snapshot jsonb not null,generated_by uuid references public.user_accounts(id)on delete set null,idempotency_key uuid not null unique,created_at timestamptz not null default now());
alter table public.financial_adjustments enable row level security;alter table public.cash_shifts enable row level security;alter table public.payment_reconciliations enable row level security;
alter table public.refund_attempts enable row level security;alter table public.financial_documents enable row level security;
revoke all on table public.financial_adjustments,public.cash_shifts,public.payment_reconciliations,public.refund_attempts,public.financial_documents from anon,authenticated;

create or replace function public.protect_settled_payment()returns trigger language plpgsql set search_path=public as $$
begin if tg_op='DELETE'and old.status='paid'then raise exception'SETTLED_PAYMENT_IMMUTABLE';end if;
if tg_op='UPDATE'and old.status='paid'and(old.amount is distinct from new.amount or old.currency is distinct from new.currency or old.method is distinct from new.method or old.reference is distinct from new.reference or old.purpose is distinct from new.purpose or old.invoice_id is distinct from new.invoice_id or old.reservation_id is distinct from new.reservation_id)then raise exception'SETTLED_PAYMENT_IMMUTABLE';end if;
return case when tg_op='DELETE'then old else new end;end$$;
drop trigger if exists payments_preserve_settled_history on public.payments;create trigger payments_preserve_settled_history before update or delete on public.payments for each row execute function public.protect_settled_payment();
create or replace function public.protect_audit_history()returns trigger language plpgsql as $$begin raise exception'AUDIT_HISTORY_IMMUTABLE';end$$;
drop trigger if exists audit_logs_immutable on public.audit_logs;create trigger audit_logs_immutable before update or delete on public.audit_logs for each statement execute function public.protect_audit_history();

