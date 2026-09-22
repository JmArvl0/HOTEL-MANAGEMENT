import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { PaymentSubmissionForm } from "@/components/customer/payment-submission-form";
import { ReceiptAction } from "@/components/customer/receipt-action";
import { PaymentsFolioPanel, type PaymentsFolioItem } from "@/components/customer/payments-folio-panel";
import { requireCustomerSession } from "@/lib/customer-auth";
import { emailConfigured } from "@/lib/email";
import { formatPeso } from "@/lib/booking";
import { receiptEligible } from "@/lib/receipt";
import {
  FOLIO_PAY_FILTERS,
  FOLIO_STAY_FILTERS,
  financialPaymentState,
  folioMoney,
  formatStayRange,
  friendlyStatus,
  getCustomerFinancials,
  reservationCategory,
  type FolioPaymentState,
  type ReservationCategory,
} from "@/lib/customer";
import { operationalPolicyFromSnapshot } from "@/lib/hotel-policy";
import { StatusBadge } from "@/components/ui";

type FinancialRecord = Awaited<ReturnType<typeof getCustomerFinancials>>[number];

function FolioCard({ record, emailAvailable }: { record: FinancialRecord; emailAvailable: boolean }) {
  const invoice = record.invoice;
  const { total, paid, balance } = folioMoney(record);
  const policy = operationalPolicyFromSnapshot(record.operational_policy_snapshot);
  const progress = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  return (
    <article>
      <header>
        <div>
          <p>{record.confirmation_number ?? record.id}</p>
          <h2>{record.room_type}</h2>
          <small>{formatStayRange(record.check_in, record.check_out)}</small>
        </div>
        <StatusBadge status={invoice?.status ?? record.payment_status} size="sm" className={`customer-folio-status ${invoice?.status ?? record.payment_status}`} />
      </header>
      <div className="folio-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={`Paid ${formatPeso(paid)} of ${formatPeso(total)} stay total`}>
        <div className={`folio-progress-fill ${progress >= 100 ? "clear" : "partial"}`} style={{ width: `${progress}%` }} />
      </div>
      <div className="folio-summary">
        <div><span>Stay total</span><strong>{formatPeso(total)}</strong></div>
        <div><span>Paid</span><strong>{formatPeso(paid)}</strong></div>
        <div className="folio-balance"><span>Remaining balance</span><strong>{formatPeso(balance)}</strong></div>
      </div>
      {total !== Number(record.total) && <p className="folio-note">Includes incidentals and corrections on your stay total of {formatPeso(record.total)}.</p>}
      {record.charges.length > 0 && (
        <div className="payment-history">
          <h3>Folio charges</h3>
          {record.charges.map((charge) => (
            <div className="payment-transaction" key={charge.id}>
              <span><strong>{charge.description}</strong><small>{friendlyStatus(charge.category)} - {new Date(charge.created_at).toLocaleDateString("en-PH")}</small></span>
              <span><b>{formatPeso(charge.amount)}</b></span>
            </div>
          ))}
        </div>
      )}
      {record.adjustments.length > 0 && (
        <div className="payment-history">
          <h3>Folio corrections</h3>
          {record.adjustments.map((adjustment) => (
            <div className="payment-transaction" key={adjustment.id}>
              <span><strong>{adjustment.reason}</strong><small>{friendlyStatus(adjustment.transaction_type)} · {new Date(adjustment.created_at).toLocaleDateString("en-PH")}</small></span>
              <span><b>{adjustment.direction === "credit" ? "−" : "+"}{formatPeso(adjustment.amount)}</b></span>
            </div>
          ))}
        </div>
      )}
      {(record.payments.length > 0 || (["confirmed", "checked_in"].includes(record.status) && balance > 0)) && (
        <div className="payment-history">
          <h3>Payment transactions</h3>
          {record.payments.map((payment) => (
            <div className="payment-transaction" key={payment.id}>
              <span>
                <strong>{friendlyStatus(payment.purpose)}</strong>
                <small>{new Date(payment.verified_at ?? payment.submitted_at ?? payment.created_at).toLocaleDateString("en-PH")} - {friendlyStatus(payment.method)}{payment.reference ? ` - Ref ${payment.reference}` : ""}</small>
                {payment.status === "pending_verification" && <small className="payment-transaction-note">Payment proof submitted — awaiting verification.</small>}
              </span>
              <span className="payment-transaction-summary">
                <b>{payment.purpose === "refund" ? "-" : ""}{formatPeso(payment.amount)}</b>
                <span className="payment-transaction-controls">
                  <em className={`customer-status ${payment.status}`}>{friendlyStatus(payment.status)}</em>
                  {receiptEligible(payment) && <ReceiptAction paymentId={payment.id} emailAvailable={emailAvailable} />}
                </span>
              </span>
            </div>
          ))}
          {["confirmed", "checked_in"].includes(record.status) && <PaymentSubmissionForm reservationId={record.id} balance={balance} />}
        </div>
      )}
      {record.refunds.length > 0 && (
        <div className="payment-history">
          <h3>Refund status</h3>
          {record.refunds.map((refund) => (
            <div className="payment-transaction" key={refund.id}>
              <span><strong>{refund.reason}</strong><small>{refund.reference ? `Reference ${refund.reference}` : "Accounting processing reference pending"}</small></span>
              <span><b>{formatPeso(refund.eligible_amount)}</b><em className={`customer-status ${refund.status}`}>{friendlyStatus(refund.status)}</em></span>
            </div>
          ))}
        </div>
      )}
      <footer>
        <span>Incidentals due: {policy.incidentalsDue}</span>
        <Link className="btn btn-soft" href={`/my-reservations/${record.id}`}>View reservation</Link>
      </footer>
    </article>
  );
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireCustomerSession();
  const records = await getCustomerFinancials(session.user.id);
  // Decided once per render: whether the receipt email path has a provider.
  // When it does not, the action says so instead of failing on click.
  const emailAvailable = emailConfigured();
  const raw = await searchParams;
  const param = (key: string) => {
    const value = raw[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const stay = param("stay") ?? null;
  const pay = param("pay") ?? null;
  const initialStay = FOLIO_STAY_FILTERS.includes(stay as ReservationCategory) ? stay as ReservationCategory : "all";
  const initialPayment = FOLIO_PAY_FILTERS.includes(pay as FolioPaymentState) ? pay as FolioPaymentState : "all";
  const items: PaymentsFolioItem[] = records.map((record) => {
    const money = folioMoney(record);
    return {
      id: record.id,
      stayState: reservationCategory(record),
      paymentState: financialPaymentState(record),
      balance: money.balance,
      paid: money.paid,
      searchText: `${record.confirmation_number ?? record.id} ${record.room_type} ${record.status} ${record.payment_status}`,
      content: <FolioCard record={record} emailAvailable={emailAvailable} />,
    };
  });

  return (
    <div className="customer-content--payments">
      <section className="customer-page-title">
        <p className="eyebrow">Payments &amp; folio</p>
        <h1>A clear view of every stay.</h1>
        <p>Stay totals, verified payments, remaining balances, and refunds from Haven&apos;s live billing records.</p>
      </section>
      {records.length === 0 ? (
        <div className="customer-empty">
          <ReceiptText />
          <h2>No financial records yet</h2>
          <p>Folios appear after a reservation is created.</p>
        </div>
      ) : (
        <PaymentsFolioPanel items={items} initialStay={initialStay} initialPayment={initialPayment} initialQuery={param("q") ?? ""} />
      )}
    </div>
  );
}
