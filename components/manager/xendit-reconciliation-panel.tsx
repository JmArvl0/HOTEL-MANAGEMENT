"use client";

import { fetchPublic, readResponse } from "@/lib/client-errors";

import { userMessage } from "@/lib/errors";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { formatPeso } from "@/lib/format";
import "./xendit-reconciliation-panel.css";

type Payment = { reservation_id: string; amount: number; gateway_checkout_amount: number | null;
  provider_reference_id: string; gateway_reference_id: string | null; gateway_payment_id: string | null };
type Review = { payment_id: string; reason: "session_unknown" | "capture_after_release"; payments: Payment | Payment[] };

export default function XenditReconciliationPanel() {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const endpoint = "/api/accounting/xendit-reconciliation";
  const load = useCallback(async (nextPage = 0) => {
    try {
      const response = await fetchPublic(endpoint + "?page=" + nextPage, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const body = await readResponse(response) as { data: Review[]; total: number };
      setReviews(body.data);
      setTotal(body.total ?? body.data.length);
      setPage(nextPage);
    } catch { setError("Could not load Xendit reviews."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>, paymentId: string, action: "check" | "resolve") {
    event.preventDefault();
    if (busy) return;
    const details = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(paymentId); setError(""); setMessage("");
    try {
      const response = await fetchPublic(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId, action, ...details }),
      });
      const body = await readResponse(response);
      if (!response.ok) { setError(userMessage(body.error, "Unable to save the review.")); return; }
      if (action === "resolve") setMessage("Reconciliation recorded.");
      else if (body.data?.outcome === "review_required") setMessage("Xendit confirmed the capture. Record the refund or reconciliation reference after handling it.");
      else setMessage("Provider status checked.");
      await load();
    } catch { setError("Could not confirm the update. Refresh the queue before retrying."); }
    finally { setBusy(""); }
  }

  return <section className="panel xendit-review-panel" aria-labelledby="xendit-review-heading" aria-busy={Boolean(busy)}>
    <div className="panel-heading">
      <div><h3 id="xendit-review-heading">Xendit reconciliation</h3><p>Review uncertain checkouts and payments received after a room was released.</p></div>
      <button className="btn btn-soft" type="button" onClick={() => { setError(""); void load(); }}>Refresh</button>
    </div>
    {error && <p role="alert" className="booking-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    {!reviews && !error && <p role="status">Loading the review queue…</p>}
    {reviews?.length === 0 && <p>No payments need review.</p>}
    {reviews?.map(review => {
      const payment = Array.isArray(review.payments) ? review.payments[0] : review.payments;
      if (!payment) return null;
      const late = review.reason === "capture_after_release";
      return <details key={review.payment_id} className="xendit-review-item">
        <summary><span className="xendit-review-summary">
          <strong>{payment.reservation_id}</strong>
          <span>{late ? "Captured after room release" : "Checkout creation uncertain"}</span>
          <span>{formatPeso(Number(payment.gateway_checkout_amount ?? payment.amount))}</span>
        </span></summary>
        <dl><div><dt>Merchant reference</dt><dd>{payment.provider_reference_id}</dd></div>
          {payment.gateway_payment_id && <div><dt>Xendit payment ID</dt><dd>{payment.gateway_payment_id}</dd></div>}
        </dl>
        <div className="xendit-review-actions">
          <form onSubmit={event => void submit(event, review.payment_id, "check")}>
            {!payment.gateway_reference_id && <label>Xendit session ID<input name="sessionId" placeholder="ps-…" maxLength={63} required /></label>}
            <button className="btn btn-soft" disabled={Boolean(busy)}>Check provider</button>
          </form>
          <form onSubmit={event => void submit(event, review.payment_id, "resolve")}>
            <label>{late ? "Refund or reconciliation reference" : "Dashboard finding and reference"}
              <input name="evidence" required minLength={8} maxLength={500} />
            </label>
            <button className="btn btn-accent" disabled={Boolean(busy)}>Record resolution</button>
          </form>
        </div>
      </details>;
    })}
    {total > 50 && <nav aria-label="Xendit review pages" className="reservation-actions">
      <button className="btn btn-soft" disabled={Boolean(busy) || page === 0} onClick={() => void load(page - 1)}>Previous</button>
      <span>Page {page + 1} of {Math.ceil(total / 50)}</span>
      <button className="btn btn-soft" disabled={Boolean(busy) || (page + 1) * 50 >= total} onClick={() => void load(page + 1)}>Next</button>
    </nav>}
  </section>;
}
