import Link from "next/link";
import { ReceiptText } from "lucide-react";
import { PaymentSubmissionForm } from "@/components/customer/payment-submission-form";
import { requireCustomerSession } from "@/lib/customer-auth";
import { formatPeso } from "@/lib/booking";
import {
  FOLIO_PAY_FILTERS,
  FOLIO_STAY_FILTERS,
  filterFinancialRecords,
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

const STAY_LABELS: Record<ReservationCategory, string> = {
  current: "Current stay",
  upcoming: "Upcoming",
  past: "Past",
  cancelled: "Cancelled",
};
const PAY_LABELS: Record<FolioPaymentState, string> = {
  pending: "Awaiting verification",
  due: "Balance due",
  refund: "Refunds",
  settled: "Settled",
};

// URL-driven chips: filters are plain links so the back button, sharing, and
// direct loads all work with zero client JS. "All" resets that dimension.
function folioHref(stay: string | null, pay: string | null) {
  const params = new URLSearchParams();
  if (stay) params.set("stay", stay);
  if (pay) params.set("pay", pay);
  const query = params.toString();
  return query ? `/account/payments?${query}` : "/account/payments";
}

function FilterChip({
  href,
  active,
  count,
  disabled,
  children,
}: {
  href: string;
  active: boolean;
  count: number;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return (
      <span className="folio-chip" aria-disabled="true">
        {children} <b>0</b>
      </span>
    );
  }
  return (
    <Link className={`folio-chip${active ? " is-active" : ""}`} href={href}>
      {children} <b>{count}</b>
    </Link>
  );
}

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireCustomerSession();
  const records = await getCustomerFinancials(session.user.id);
  const raw = await searchParams;
  const param = (key: string) => {
    const value = raw[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const stay = param("stay") ?? null;
  const pay = param("pay") ?? null;
  const stayActive = FOLIO_STAY_FILTERS.includes(stay as ReservationCategory);
  const payActive = FOLIO_PAY_FILTERS.includes(pay as FolioPaymentState);

  const stayCounts = Object.fromEntries(
    FOLIO_STAY_FILTERS.map((key) => [key, records.filter((record) => reservationCategory(record) === key).length]),
  ) as Record<ReservationCategory, number>;
  const payCounts = Object.fromEntries(
    FOLIO_PAY_FILTERS.map((key) => [key, records.filter((record) => financialPaymentState(record) === key).length]),
  ) as Record<FolioPaymentState, number>;

  const filtered = filterFinancialRecords(records, { stay, pay });
  const outstanding = filtered.reduce((sum, record) => sum + folioMoney(record).balance, 0);
  const paidToDate = filtered.reduce((sum, record) => sum + folioMoney(record).paid, 0);

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
        <>
          <div className="folio-filters">
            <div className="folio-filter-group" role="group" aria-label="Filter folios by stay">
              <span className="folio-filter-label">Stay</span>
              <div className="folio-chips">
                <FilterChip href={folioHref(null, payActive ? pay : null)} active={!stayActive} count={records.length}>
                  All
                </FilterChip>
                {FOLIO_STAY_FILTERS.map((key) => (
                  <FilterChip key={key} href={folioHref(key, payActive ? pay : null)} active={stayActive && stay === key} count={stayCounts[key]} disabled={stayCounts[key] === 0 && stay !== key}>
                    {STAY_LABELS[key]}
                  </FilterChip>
                ))}
              </div>
            </div>
            <div className="folio-filter-group" role="group" aria-label="Filter folios by payment state">
              <span className="folio-filter-label">Payment</span>
              <div className="folio-chips">
                <FilterChip href={folioHref(stayActive ? stay : null, null)} active={!payActive} count={records.length}>
                  All
                </FilterChip>
                {FOLIO_PAY_FILTERS.map((key) => (
                  <FilterChip key={key} href={folioHref(stayActive ? stay : null, key)} active={payActive && pay === key} count={payCounts[key]} disabled={payCounts[key] === 0 && pay !== key}>
                    {PAY_LABELS[key]}
                  </FilterChip>
                ))}
              </div>
            </div>
          </div>
          <div className="folio-aggregate">
            <span>
              {filtered.length} of {records.length} folios
            </span>
            <span>
              Outstanding <b>{formatPeso(outstanding)}</b>
            </span>
            <span>
              Paid to date <b>{formatPeso(paidToDate)}</b>
            </span>
          </div>
          {filtered.length === 0 ? (
            <div className="customer-empty folio-empty">
              <h2>No folios match these filters</h2>
              <p>
                Nothing in {stayActive ? STAY_LABELS[stay as ReservationCategory].toLowerCase() : "any stay"} with{" "}
                {payActive ? PAY_LABELS[pay as FolioPaymentState].toLowerCase() : "any payment state"}. Try widening the filters.
              </p>
              <Link className="btn btn-soft" href="/account/payments">
                Show all folios
              </Link>
            </div>
          ) : (
            <div className="customer-financial-list">
              {filtered.map((record) => {
                const invoice = record.invoice;
                const { total, paid, balance } = folioMoney(record);
                const policy = operationalPolicyFromSnapshot(record.operational_policy_snapshot);
                const progress = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
                return (
                  <article key={record.id}>
                    <header>
                      <div>
                        <p>{record.confirmation_number ?? record.id}</p>
                        <h2>{record.room_type}</h2>
                        <small>{formatStayRange(record.check_in, record.check_out)}</small>
                      </div>
                      <StatusBadge
                        status={invoice?.status ?? record.payment_status}
                        size="sm"
                        className={`customer-folio-status ${invoice?.status ?? record.payment_status}`}
                      />
                    </header>
                    <div
                      className="folio-progress"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={progress}
                      aria-label={`Paid ${formatPeso(paid)} of ${formatPeso(total)} stay total`}
                    >
                      <div className={`folio-progress-fill ${progress >= 100 ? "clear" : "partial"}`} style={{ width: `${progress}%` }} />
                    </div>
                    <div className="folio-summary">
                      <div>
                        <span>Stay total</span>
                        <strong>{formatPeso(total)}</strong>
                      </div>
                      <div>
                        <span>Paid</span>
                        <strong>{formatPeso(paid)}</strong>
                      </div>
                      <div className="folio-balance">
                        <span>Remaining balance</span>
                        <strong>{formatPeso(balance)}</strong>
                      </div>
                    </div>
                    {total !== Number(record.total) && (
                      <p className="folio-note">Includes incidentals and corrections on your stay total of {formatPeso(record.total)}.</p>
                    )}
                    {record.charges.length > 0 && (
                      <div className="payment-history">
                        <h3>Folio charges</h3>
                        {record.charges.map((charge) => (
                          <div className="payment-transaction" key={charge.id}>
                            <span>
                              <strong>{charge.description}</strong>
                              <small>
                                {friendlyStatus(charge.category)} - {new Date(charge.created_at).toLocaleDateString("en-PH")}
                              </small>
                            </span>
                            <span>
                              <b>{formatPeso(charge.amount)}</b>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {record.adjustments.length > 0 && (
                      <div className="payment-history">
                        <h3>Folio corrections</h3>
                        {record.adjustments.map((adjustment) => (
                          <div className="payment-transaction" key={adjustment.id}>
                            <span>
                              <strong>{adjustment.reason}</strong>
                              <small>
                                {friendlyStatus(adjustment.transaction_type)} ·{" "}
                                {new Date(adjustment.created_at).toLocaleDateString("en-PH")}
                              </small>
                            </span>
                            <span>
                              <b>
                                {adjustment.direction === "credit" ? "−" : "+"}
                                {formatPeso(adjustment.amount)}
                              </b>
                            </span>
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
                              <small>
                                {new Date(payment.verified_at ?? payment.submitted_at ?? payment.created_at).toLocaleDateString("en-PH")} -{" "}
                                {friendlyStatus(payment.method)}
                                {payment.reference ? ` - Ref ${payment.reference}` : ""}
                              </small>
                            </span>
                            <span className="payment-transaction-summary">
                              <b>{payment.purpose === "refund" ? "-" : ""}{formatPeso(payment.amount)}</b>
                              <span className="payment-transaction-controls">
                                <em className={`customer-status ${payment.status}`}>{friendlyStatus(payment.status)}</em>
                                {payment.status === "paid" && (
                                  <Link className="customer-receipt-link" href={`/account/receipts/${payment.id}`}>
                                    <ReceiptText size={14} aria-hidden="true" />
                                    View receipt
                                  </Link>
                                )}
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
                            <span>
                              <strong>{refund.reason}</strong>
                              <small>{refund.reference ? `Reference ${refund.reference}` : "Accounting processing reference pending"}</small>
                            </span>
                            <span>
                              <b>{formatPeso(refund.eligible_amount)}</b>
                              <em className={`customer-status ${refund.status}`}>{friendlyStatus(refund.status)}</em>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <footer>
                      <span>Incidentals due: {policy.incidentalsDue}</span>
                      <Link href={`/my-reservations/${record.id}`}>View reservation</Link>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
