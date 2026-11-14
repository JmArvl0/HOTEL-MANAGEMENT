"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleDollarSign, Clock3, CreditCard, FileText, Info, Search, ShieldAlert } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/Navigation";
import { depositAgeBand, depositAgeMinutes, formatDepositAge } from "@/lib/deposit-sla";
import { formatPaymentSubmittedAt, paymentSearchText } from "@/lib/payment-display";
import type { RecordItem } from "@/lib/types";
import "./deposit-verification-workspace.css";

type Queue = "all" | "needs" | "past" | "provider" | "history";
type Decision = "verify" | "reject";

type Props = {
  items: RecordItem[];
  canVerify: boolean;
  slaHours: number;
  search: string;
  onSearch: (value: string) => void;
  onVerify: (payment: RecordItem) => Promise<boolean>;
  onReject: (payment: RecordItem, reason: string) => Promise<boolean>;
};

const money = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const hotelDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" });
const peso = (value: unknown) => money.format(Number(value ?? 0));
const text = (value: unknown, fallback = "—") => String(value ?? "").trim() || fallback;
const reservationFor = (item: RecordItem) => item.reservation as RecordItem | null | undefined;
const isPending = (item: RecordItem) => item.status === "pending_verification";
const isProvider = (item: RecordItem) => isPending(item) && item.method === "gateway_paymongo";
const isManual = (item: RecordItem) => isPending(item) && !isProvider(item);
const isHistory = (item: RecordItem) => !isPending(item);
const stamp = (item: RecordItem) => Date.parse(String(item.submitted_at ?? item.created_at ?? "")) || 0;
const decisionStamp = (item: RecordItem) => Date.parse(String(item.reviewed_at ?? item.verified_at ?? item.created_at ?? "")) || 0;
const methodLabel = (method: unknown) => method === "gateway_paymongo" ? "Online · PayMongo" :
  ["manual_gcash", "gcash"].includes(String(method)) ? "Manual GCash" : text(method).replaceAll("_", " ");
const purposeLabel = (purpose: unknown) => purpose === "stay_payment" ? "Stay payment" : "Reservation deposit";

function statusFor(item: RecordItem, slaHours: number) {
  if (isProvider(item)) return { tone: "provider", label: "Awaiting provider" };
  if (isManual(item)) {
    const band = depositAgeBand(item.submitted_at, slaHours);
    return band === "breach" ? { tone: "past", label: "Past SLA" }
      : { tone: band === "attention" ? "pending" : "neutral", label: "Needs review" };
  }
  if (item.status === "paid") return { tone: "paid", label: "Verified" };
  if (item.status === "rejected" || item.status === "failed" && item.decision_reason) return { tone: "rejected", label: "Rejected" };
  if (item.status === "failed") return { tone: "rejected", label: "Failed" };
  return { tone: "neutral", label: text(item.status).replaceAll("_", " ") };
}

export function PaymentProofPreview({ paymentId, name }: { paymentId: string; name: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/booking/payments/${paymentId}/proof`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject(new Error("proof unavailable")))
      .then((body: { url?: string }) => {
        if (controller.signal.aborted) return;
        if (!body.url) throw new Error("proof unavailable");
        setUrl(body.url);
        setState("ready");
      })
      .catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, [paymentId, retry]);

  if (state === "loading") return <div className="dv-proof-state" role="status">Loading payment proof…</div>;
  if (state === "error" || !url) return <div className="dv-proof-state" role="alert">
    <ShieldAlert size={20} aria-hidden="true" />
    <strong>Proof could not be loaded</strong>
    <button type="button" onClick={() => { setState("loading"); setRetry(value => value + 1); }}>Try again</button>
  </div>;
  return <div className="dv-proof-image">
    <a href={url} target="_blank" rel="noreferrer" aria-label="Open original payment proof in a new tab">
      {/* eslint-disable-next-line @next/next/no-img-element -- short-lived private signed URLs must not enter the Next image cache */}
      <img src={url} alt={`Payment proof${name ? ` — ${name}` : ""}`} />
    </a>
  </div>;
}

function PaymentProof({ item, canVerify }: { item: RecordItem; canVerify: boolean }) {
  if (!canVerify) return <div className="dv-proof-state"><Info size={19} aria-hidden="true" />Payment proof is available to Accounting only.</div>;
  if (isProvider(item)) return <div className="dv-proof-state"><Clock3 size={20} aria-hidden="true" /><strong>Awaiting provider settlement</strong><span>No manual receipt to review.</span></div>;
  if (!item.proof_original_name && !item.proof_size_bytes) return <div className="dv-proof-state"><FileText size={20} aria-hidden="true" />No uploaded proof on file.</div>;
  return <PaymentProofPreview key={item.id} paymentId={String(item.id)} name={item.proof_original_name ? String(item.proof_original_name) : null} />;
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return <div className="dv-fact"><dt>{term}</dt><dd>{children}</dd></div>;
}

export default function DepositVerificationWorkspace({ items, canVerify, slaHours, search, onSearch, onVerify, onReject }: Props) {
  const [queue, setQueue] = useState<Queue>("needs");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const backRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const payments = useMemo(() => items.filter(item => ["reservation_deposit", "stay_payment"].includes(String(item.purpose))), [items]);
  const counts = useMemo(() => {
    const manual = payments.filter(isManual);
    const history = payments.filter(isHistory);
    const today = hotelDate.format(new Date());
    return {
      all: payments.length,
      needs: manual.length,
      past: manual.filter(item => depositAgeBand(item.submitted_at, slaHours) === "breach").length,
      provider: payments.filter(isProvider).length,
      history: history.length,
      reviewedToday: history.filter(item => {
        if (item.method === "gateway_paymongo" || !item.reviewed_at && !item.verified_at) return false;
        const date = new Date(decisionStamp(item));
        return !Number.isNaN(date.getTime()) && hotelDate.format(date) === today;
      }).length,
    };
  }, [payments, slaHours]);

  const rows = useMemo(() => payments.filter(item => {
    const matchesQueue = queue === "all" || queue === "needs" && isManual(item) ||
      queue === "past" && isManual(item) && depositAgeBand(item.submitted_at, slaHours) === "breach" ||
      queue === "provider" && isProvider(item) || queue === "history" && isHistory(item);
    return matchesQueue && (!search.trim() || paymentSearchText(item).includes(search.trim().toLowerCase()));
  }).sort((a, b) => {
    const rank = (item: RecordItem) => isManual(item) ? 0 : isProvider(item) ? 1 : 2;
    const order = rank(a) - rank(b);
    return order || (isPending(a) ? stamp(a) - stamp(b) : decisionStamp(b) - decisionStamp(a));
  }), [payments, queue, search, slaHours]);

  const selected = rows.find(item => String(item.id) === selectedId) ?? rows[0] ?? null;
  const reservation = selected ? reservationFor(selected) : null;
  const status = selected ? statusFor(selected, slaHours) : null;
  const expected = selected?.purpose === "reservation_deposit" && reservation?.deposit_required != null
    ? Number(reservation.deposit_required) : null;
  const difference = expected !== null && Number.isFinite(expected) ? Number(selected?.amount ?? 0) - expected : null;
  const canDecide = canVerify && selected !== null && isPending(selected);
  const canConfirm = canDecide && selected !== null && !isProvider(selected);

  function focusSelection(id: string, showDetail: boolean) {
    requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 680px)").matches && showDetail) backRef.current?.focus();
      else rowRefs.current.get(id)?.focus();
    });
  }

  function select(item: RecordItem) {
    const id = String(item.id);
    setSelectedId(id);
    setMobileDetail(true);
    focusSelection(id, true);
  }

  function backToQueue() {
    setMobileDetail(false);
    if (selected) focusSelection(String(selected.id), false);
  }

  function openDecision(next: Decision) {
    if (!canDecide || !selected || next === "verify" && !canConfirm) return;
    setReason("");
    setReasonError("");
    setDecision(next);
  }

  async function submitDecision() {
    if (!selected || !decision || !canVerify || submitting || !isPending(selected)) return;
    if (decision === "verify" && isProvider(selected)) return;
    if (decision === "reject" && reason.trim().length < 10) {
      setReasonError("Enter at least 10 characters to explain the rejection.");
      reasonRef.current?.focus();
      return;
    }
    setSubmitting(true);
    try {
      const completed = decision === "verify" ? await onVerify(selected) : await onReject(selected, reason.trim());
      if (completed) {
        const id = String(selected.id);
        setDecision(null);
        setQueue("history");
        setSelectedId(id);
        setMobileDetail(true);
        focusSelection(id, true);
      }
    } finally {
      setSubmitting(false);
    }
  }

  const metrics = [
    { key: "needs" as Queue, label: "Needs review", value: counts.needs, hint: "Manual proofs awaiting a decision", icon: FileText },
    { key: "past" as Queue, label: slaHours > 0 ? `Past ${slaHours}-hour target` : "SLA tracking off", value: counts.past, hint: "Visibility only · no auto decision", icon: Clock3 },
    { key: "provider" as Queue, label: "Awaiting provider", value: counts.provider, hint: "Settles automatically", icon: CreditCard },
    { key: "history" as Queue, label: "Reviewed today", value: counts.reviewedToday, hint: "Verified and rejected records", icon: Check },
  ];
  const filters: { key: Queue; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "needs", label: "Needs review", count: counts.needs },
    { key: "past", label: "Past SLA", count: counts.past },
    { key: "provider", label: "Provider", count: counts.provider },
    { key: "history", label: "History", count: counts.history },
  ];

  return <div className={`deposit-workspace${mobileDetail ? " dv-show-detail" : ""}`}>
    <PageHeader title="Deposit verification" subtitle={canVerify
      ? "Review submitted payments against the reservation and payment proof before deciding."
      : "Track submitted deposits and stay payments. Accounting owns verification decisions."} />
    <div className="dv-metrics" role="group" aria-label="Verification summary">
      {metrics.map(({ key, label, value, hint, icon: Icon }) => <button key={key} type="button" className="dv-metric" aria-pressed={queue === key}
        onClick={() => { setQueue(key); setMobileDetail(false); }}>
        <span>{label}</span><Icon size={17} aria-hidden="true" /><strong>{value}</strong><small>{hint}</small>
      </button>)}
    </div>
    <div className="dv-layout">
      <section className="dv-panel dv-queue" aria-label="Payment queue">
        <header className="dv-panel-header"><h2>Payment queue</h2><p>Oldest pending submissions first</p></header>
        <div className="dv-toolbar">
          <label className="dv-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Search payments</span>
            <input type="search" value={search} onChange={event => onSearch(event.target.value)} placeholder="Search guest, booking, or reference" autoComplete="off" />
          </label>
          <div className="dv-filters" role="group" aria-label="Filter payments">
            {filters.map(filter => <button key={filter.key} type="button" aria-pressed={queue === filter.key}
              onClick={() => { setQueue(filter.key); setMobileDetail(false); }}>
              {filter.label} {filter.count}
            </button>)}
          </div>
        </div>
        <div className="dv-queue-meta"><span>{rows.length} {rows.length === 1 ? "record" : "records"}</span><span>{slaHours > 0 ? `${slaHours}-hour review target` : "SLA tracking off"}</span></div>
        <div className="dv-queue-list">
          {rows.length === 0 ? <div className="dv-empty"><h3>No matching payments</h3><p>Try another search or clear the queue filter.</p><button type="button" onClick={() => { onSearch(""); setQueue("all"); }}>Clear filters</button></div> :
            rows.map(item => {
              const rowStatus = statusFor(item, slaHours);
              const linked = reservationFor(item);
              return <button key={item.id} ref={node => { if (node) rowRefs.current.set(String(item.id), node); else rowRefs.current.delete(String(item.id)); }}
                type="button" className="dv-queue-row" aria-current={item.id === selected?.id ? "true" : undefined} onClick={() => select(item)}>
                <span className="dv-row-top"><strong>{text(linked?.guest_name, "Guest")}</strong><b>{peso(item.amount)}</b></span>
                <span className="dv-row-mid"><span>{text(linked?.confirmation_number ?? item.reservation_id)} · {purposeLabel(item.purpose)}</span>{isPending(item) && <span>{formatDepositAge(depositAgeMinutes(item.submitted_at))}</span>}</span>
                <span className="dv-row-bottom"><span className={`dv-pill ${rowStatus.tone}`}>{rowStatus.label}</span><span className="dv-method">{methodLabel(item.method)}</span></span>
              </button>;
            })}
        </div>
      </section>
      <section className="dv-panel dv-detail" aria-label="Payment review">
        {selected && status ? <>
          <header className="dv-detail-header">
            <button ref={backRef} type="button" className="dv-back" onClick={backToQueue}>← Back to queue</button>
            <div><h2>{text(reservation?.guest_name, "Guest")}</h2><p>{text(reservation?.confirmation_number ?? selected.reservation_id)} · {text(reservation?.room_type, "Room type unavailable")}</p></div>
            <span className={`dv-pill ${status.tone}`}>{status.label}</span>
          </header>
          <div className="dv-detail-body">
            <div className="dv-detail-intro"><h3>Payment review</h3><span>Submitted {formatPaymentSubmittedAt(selected.submitted_at)}</span></div>
            <div className="dv-comparison">
              <div><small>Amount submitted</small><strong>{peso(selected.amount)}</strong><span>{methodLabel(selected.method)}</span></div>
              <div><small>{selected.purpose === "stay_payment" ? "Review basis" : "Required deposit"}</small><strong>{selected.purpose === "stay_payment" ? "Folio check" : expected === null ? "Unavailable" : peso(expected)}</strong><span>{selected.purpose === "stay_payment" ? "Balance and statement" : "Reservation policy snapshot"}</span></div>
              <div><small>Comparison</small><strong className={difference === null ? "" : difference === 0 ? "dv-match" : "dv-mismatch"}>{difference === null ? "Statement check" : difference === 0 ? "Exact match" : `${difference > 0 ? "Over" : "Under"} by ${peso(Math.abs(difference))}`}</strong><span>{difference === null ? "Match to statement" : difference === 0 ? "Amount aligns" : "Review discrepancy"}</span></div>
            </div>
            <div className="dv-detail-grid">
              <section><h3>Payment proof</h3><PaymentProof key={selected.id} item={selected} canVerify={canVerify} />
                {canVerify && Boolean(selected.proof_original_name || selected.proof_size_bytes) && !isProvider(selected) && <p className="dv-proof-caption">Open the original receipt to inspect its full size.</p>}
              </section>
              <section><h3>Record details</h3><dl className="dv-facts">
                <Fact term="Purpose">{purposeLabel(selected.purpose)}</Fact>
                <Fact term="Method">{methodLabel(selected.method)}</Fact>
                <Fact term="Reference">{text(selected.reference)}</Fact>
                <Fact term="Stay">{text(reservation?.check_in)} → {text(reservation?.check_out)}</Fact>
                <Fact term="Booking">{text(reservation?.confirmation_number ?? selected.reservation_id)}</Fact>
                <Fact term="Submitted">{formatPaymentSubmittedAt(selected.submitted_at)}</Fact>
                {isPending(selected) && <Fact term="Waiting">{formatDepositAge(depositAgeMinutes(selected.submitted_at))}{depositAgeBand(selected.submitted_at, slaHours) === "breach" ? ` · Past ${slaHours}-hour target` : ""}</Fact>}
                {(selected.reviewed_at || selected.verified_at) && <Fact term="Decision">{formatPaymentSubmittedAt(selected.reviewed_at ?? selected.verified_at)}</Fact>}
              </dl></section>
            </div>
            <div className="dv-guidance"><Info size={16} aria-hidden="true" /><p>{isProvider(selected)
              ? "Online payment confirms automatically when the provider settles. Manual verification is unavailable."
              : isPending(selected) ? "Cross-check the reference, amount, and proof against the payment statement."
              : selected.decision_reason ? `Decision reason: ${text(selected.decision_reason)}` : "Payment decision retained in the audit history."}</p></div>
          </div>
          <footer className="dv-decision-bar"><p>{canDecide ? "Decisions update the payment record and related booking or folio." : canVerify ? "Payment details are retained for audit history." : "Accounting makes verification decisions."}</p>
            {canDecide ? <div className="dv-actions"><button type="button" className="dv-button danger" onClick={() => openDecision("reject")}>Reject payment</button>{canConfirm && <button type="button" className="dv-button primary" onClick={() => openDecision("verify")}><Check size={16} aria-hidden="true" />Verify payment</button>}</div>
              : <span className="dv-read-only"><Info size={15} aria-hidden="true" />{canVerify ? "Read-only history" : "Front Desk view · read-only"}</span>}
          </footer>
        </> : <div className="dv-no-selection"><CircleDollarSign size={25} aria-hidden="true" /><h2>Select a payment</h2><p>Choose a record from the queue to see its details.</p></div>}
      </section>
    </div>
    {decision && selected && <Modal isOpen onClose={() => { if (!submitting) setDecision(null); }} title={decision === "verify" ? "Verify this payment?" : "Reject this payment?"}
      description={decision === "verify" ? selected.purpose === "stay_payment" ? "This applies the payment to the guest folio." : "This confirms the reservation after payment verification." : "Record the reason for rejecting this payment."}
      size="sm" className="dv-decision-modal" initialFocusRef={decision === "reject" ? reasonRef as React.RefObject<HTMLElement> : undefined}
      footer={<div className="dv-modal-actions"><button type="button" className="dv-button secondary" disabled={submitting} onClick={() => setDecision(null)}>Cancel</button><button type="button" className={`dv-button ${decision === "verify" ? "primary" : "danger"}`} disabled={submitting} onClick={() => void submitDecision()}>{submitting ? "Saving…" : decision === "verify" ? "Verify payment" : "Reject payment"}</button></div>}>
      <div className="dv-modal-body"><p><strong>{text(reservation?.guest_name, "Guest")} · {peso(selected.amount)}</strong><br />{text(reservation?.confirmation_number ?? selected.reservation_id)} · {text(selected.reference)}</p>
        {decision === "reject" && <><label htmlFor="dv-reason">Reason for rejection</label><textarea id="dv-reason" ref={reasonRef} value={reason} onChange={event => { setReason(event.target.value); setReasonError(""); }} maxLength={240} placeholder="Describe the mismatch for the audit record." aria-invalid={Boolean(reasonError)} aria-describedby={reasonError ? "dv-reason-error" : undefined} /><small id="dv-reason-error" role={reasonError ? "alert" : undefined}>{reasonError}</small></>}
      </div>
    </Modal>}
  </div>;
}
