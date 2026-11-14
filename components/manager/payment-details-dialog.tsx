"use client";

import type { ReactNode } from "react";
import { CalendarDays, CircleCheck, CircleDollarSign, Coins, FileText, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { HavenLogo } from "@/components/ui/haven-logo";
import { formatPaymentSubmittedAt } from "@/lib/payment-display";
import type { RecordItem } from "@/lib/types";
import "./payment-details-dialog.css";

const text = (value: unknown) => String(value ?? "—").replaceAll("_", " ");
const sentence = (value: unknown) => {
  const valueText = text(value);
  return valueText.charAt(0).toUpperCase() + valueText.slice(1);
};
const money = (value: unknown) => new Intl.NumberFormat("en-PH", {
  style: "currency", currency: "PHP",
}).format(Number(value ?? 0));

function ReceiptBrand() {
  return <div className="spr-brand" aria-label="HAVEN Hotel & Residences">
    <span className="spr-logo"><HavenLogo size={44} small /></span>
    <span className="spr-wordmark">HAVEN<small>HOTEL &amp; RESIDENCES</small></span>
    <svg className="spr-botanical" viewBox="0 0 116 56" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth=".7">
        <path d="M109 57C88 40 67 27 19 5M83 40 57 12M73 34 35 39M96 49 81 20" />
        <g fill="currentColor" fillOpacity=".65">
          <path d="M29 10Q18 1 10 5q5 9 19 5ZM46 19Q29 12 25 17q7 8 21 2ZM58 25Q42 25 36 30q12 5 22-5ZM70 32Q54 32 45 40q15 4 25-8ZM81 39Q68 40 63 48q14 2 18-9ZM58 13Q49 3 43 2q0 12 15 11ZM70 27Q68 13 59 9q-1 12 11 18ZM83 38Q85 23 77 17q-4 12 6 21ZM96 49Q99 33 90 28q-4 11 6 21Z" />
        </g>
      </g>
    </svg>
  </div>;
}

function PaymentDetailRow({ label, value, icon: Icon, className = "" }: {
  label: string; value: ReactNode; icon?: LucideIcon; className?: string;
}) {
  return <div className={`spr-row ${className}`}>
    {Icon && <Icon aria-hidden="true" />}<dt>{label}</dt><dd>{value}</dd>
  </div>;
}

/** One presentation for payment records; review callbacks are supplied only by authorized callers. */
export default function PaymentDetailsDialog({ item, proofMeta, proof, review, onClose }: {
  item: RecordItem;
  proofMeta: string;
  proof?: ReactNode;
  review?: { busy: boolean; onConfirm: () => void; onReject: () => void };
  onClose: () => void;
}) {
  const reservation = item.reservation as RecordItem | null | undefined;
  const amount = money(item.amount);
  const status = String(item.status ?? "");
  const pending = status === "pending_verification";
  const canReview = pending && Boolean(review);
  const stayPayment = item.purpose === "stay_payment";
  const gateway = ["gateway_paymongo", "gateway_xendit"].includes(String(item.method));
  const expected = Number(reservation?.deposit_required ?? 0);
  const difference = expected ? Number(item.amount ?? 0) - expected : 0;
  const statusClass = status === "paid" ? " spr-paid" : pending ? " spr-pending" : ["rejected", "failed"].includes(status) ? " spr-rejected" : "";
  const stayStatus = String(reservation?.status ?? "");
  const rows: [string, ReactNode][] = [
    ["Guest", text(reservation?.guest_name)],
    ["Reservation", `${text(reservation?.confirmation_number ?? item.reservation_id)}${reservation?.room_type ? ` – ${text(reservation.room_type)}` : ""}`],
    ["Stay", <span key="stay" className="spr-stay">{text(reservation?.check_in)} → {text(reservation?.check_out)}<span aria-hidden="true"> · </span><span className={`spr-stay-status${stayStatus === "cancelled" ? " spr-cancelled" : ""}`}>{sentence(reservation?.status)}</span></span>],
    ["Purpose", item.purpose === "reservation_deposit" || !item.purpose ? "Reservation deposit" : sentence(item.purpose)],
    ["Method", ["gcash", "manual_gcash"].includes(String(item.method).toLowerCase()) ? "GCash" : gateway ? (item.method === "gateway_xendit" ? "Xendit sandbox" : "Online payment (PayMongo)") : sentence(item.method)],
    ["Reference", text(item.reference)],
    ["Status", <span key="status" className={`spr-status${statusClass}`}>{status === "paid" && <CircleCheck size={10} aria-hidden="true" />}{sentence(item.status)}</span>],
  ];

  return <Modal isOpen onClose={onClose} title="Payment Details"
    description={canReview ? "Cross-reference the submitted payment against the reservation and your statement before deciding." : "Read-only payment record from the audited verification workflow."}
    size="md" className="payment-receipt" headerBrand={<ReceiptBrand />}
    footer={canReview && review ? <div className="spr-review-actions">
      <button type="button" className="spr-review-button spr-review-reject" disabled={review.busy} onClick={review.onReject}>Reject…</button>
      {!gateway && <button type="button" className="spr-review-button spr-review-confirm" disabled={review.busy} onClick={review.onConfirm}>{review.busy ? "Verifying…" : "Verify & confirm"}</button>}
    </div> : undefined}>
    <div className="spr-record" role="region" aria-label="Payment record" tabIndex={0}>
    <dl className="spr-details">
      {rows.map(([term, value]) => <PaymentDetailRow key={term} label={term} value={value} />)}
    </dl>
    <dl className="spr-verification">
      <PaymentDetailRow icon={FileText} className="spr-proof-row" label="Proof of payment" value={proofMeta || "No proof image submitted"} />
      <PaymentDetailRow icon={CalendarDays} label="Submitted" value={formatPaymentSubmittedAt(item.submitted_at)} />
      <PaymentDetailRow icon={Coins} label="Amount submitted" value={<strong>{amount}</strong>} />
      {!stayPayment && <PaymentDetailRow icon={CircleDollarSign} label="Expected deposit" value={<>
        {money(expected)}{difference !== 0 && <small className="spr-variance">{difference > 0 ? "Over" : "Under"} by {money(Math.abs(difference))}</small>}
      </>} />}
    </dl>
    {proof && <div className="spr-proof-preview">{proof}</div>}
    {canReview && <p className="spr-review-note">
      {!gateway && <>Verifying settles the payment {stayPayment ? "and applies it to the folio" : "and confirms the booking"}. </>}
      Rejecting keeps the submitted record for audit and {stayPayment ? "flags the proof as rejected" : "releases the reservation"}.
    </p>}
    {pending && gateway && <p className="spr-review-note">Online payments confirm automatically once the provider settles — manual verification is disabled for them.</p>}
    <div className="spr-total"><span>Total</span><strong>{amount}</strong></div>
    </div>
  </Modal>;
}
