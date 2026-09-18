import { CreditCard, Undo2, Wallet } from "lucide-react";
import { formatPeso } from "@/lib/format";
// Type-only: value helpers live in lib/booking and lib/hotel-policy, but both
// modules import the server-only supabase client at module scope, so a "use
// client" ancestor (ConfirmBookingForm) must not import their values — the
// two one-line mirrors below stay in sync by test, not by import.
import type { DepositPolicy } from "@/lib/booking";
import type { OperationalPolicy } from "@/lib/hotel-policy";

const depositLabel = (policy: DepositPolicy) =>
  policy.calculationType === "percentage" ? `${policy.percentageBasisPoints / 100}%` : formatPeso(policy.fixedAmount);
const formatCutoff = (value: string) => {
  const [hour, minute] = value.split(":").map(Number);
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    new Date(Date.UTC(2026, 0, 1, hour, minute)),
  );
};

// Informational transparency panel for the reservation-deposit page. Every
// figure and rule renders from the hold's frozen policy snapshots passed in
// as props — nothing here recomputes money or invents policy.
export function DepositPolicyPanel({
  depositPolicy,
  cancelPolicy,
  depositRequired,
  remainingBalance,
  checkIn,
}: {
  depositPolicy: DepositPolicy;
  cancelPolicy: OperationalPolicy;
  depositRequired: number | string;
  remainingBalance: number | string;
  checkIn: string;
}) {
  const fullDays = cancelPolicy.cancellationFullRefundDays;
  const partialDays = cancelPolicy.cancellationPartialRefundDays;
  const partialPct = cancelPolicy.cancellationPartialRefundBasisPoints / 100;
  const singleTier = fullDays <= partialDays;
  return (
    <section className="before-you-pay" aria-labelledby="before-you-pay-heading">
      <h2 id="before-you-pay-heading">Before you pay</h2>
      <p className="before-you-pay-lede">
        Please review how your deposit, refunds, and remaining balance work before submitting your payment.
      </p>

      <section aria-labelledby="byp-deposit-heading">
        <h3 id="byp-deposit-heading">
          <CreditCard size={15} aria-hidden="true" /> Reservation deposit
        </h3>
        <p className="byp-figures">
          Deposit required: <strong>{depositLabel(depositPolicy)} of stay total</strong>
          {" · "}Amount due now: <strong>{formatPeso(depositRequired)}</strong>
        </p>
        <p>
          Your reservation is not confirmed yet. After sending your deposit through GCash, submit your
          reference number and payment receipt below. Accounting will review the payment — submitting
          creates a pending payment for verification; it does not mark the deposit as paid.
        </p>
        <ol className="byp-status-ladder">
          <li><strong>Submitted</strong> — payment received for review.</li>
          <li><strong>Awaiting verification</strong> — Accounting has not yet approved it.</li>
          <li><strong>Verified / Paid</strong> — payment accepted.</li>
          <li><strong>Reservation confirmed</strong> — once the required deposit has been verified.</li>
        </ol>
        <p className="byp-note">
          If the submitted payment cannot be verified, the pending reservation is cancelled and you can
          book again.
        </p>
      </section>

      <section aria-labelledby="byp-refund-heading">
        <h3 id="byp-refund-heading">
          <Undo2 size={15} aria-hidden="true" /> Cancellation &amp; refunds
        </h3>
        <p>
          Refund eligibility depends on when the reservation is cancelled relative to your scheduled
          check-in date ({checkIn}). Refunds apply to the eligible (paid) reservation deposit.
        </p>
        <ul className="byp-tiers">
          <li>
            <strong>{fullDays} days or more before check-in</strong>
            <span>100% of eligible deposit refundable</span>
          </li>
          {!singleTier && (
            <li>
              <strong>{partialDays}–{fullDays - 1} days before check-in</strong>
              <span>{partialPct}% of eligible deposit refundable</span>
            </li>
          )}
          <li className="byp-restricted">
            <strong>Less than {singleTier ? fullDays : partialDays} days before check-in</strong>
            <span>Non-refundable</span>
          </li>
          <li className="byp-restricted">
            <strong>No-show (after {formatCutoff(cancelPolicy.noShowCutoffTime)} local on check-in day)</strong>
            <span>Non-refundable</span>
          </li>
        </ul>
        <details className="byp-details">
          <summary>How refunds are settled</summary>
          <p>
            Eligible refunds are settled by Accounting after cancellation; refunds are not instant.
            Amounts follow the policy above — only a refund that departs from the policy amount needs
            separate approval.
          </p>
        </details>
      </section>

      <section aria-labelledby="byp-balance-heading">
        <h3 id="byp-balance-heading">
          <Wallet size={15} aria-hidden="true" /> Remaining balance
        </h3>
        <p className="byp-figures">
          Remaining balance: <strong>{formatPeso(remainingBalance)}</strong>
        </p>
        <p>Due {depositPolicy.remainingBalanceDue.toLowerCase()}.</p>
        <p className="byp-note">The balance must be cleared before check-in can complete.</p>
      </section>
    </section>
  );
}
