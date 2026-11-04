"use client";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { cashMoney, cashNumber, cashExpected, cashCountVariance, canCloseDrawer } from "@/lib/cash-shift-display";
import type { AccountingLedger } from "@/lib/accounting";
import type { Role } from "@/lib/types";

export type CashCountPresentation = {
  counted: number | null; variance: number | null; expected: number | null;
  busy: boolean; mayClose: boolean; review: () => void;
};
type CashCountProps = {
  ledger: AccountingLedger; actorId: string; role: Role;
  onSaved: (message?: string) => void;
  onStale?: () => void;
  renderWorkspace?: (count: CashCountPresentation) => ReactNode;
};
export default function CashCountPanel(props: CashCountProps) {
  const shiftId = props.ledger.cashShifts.find(s => s.status === "open")?.id ?? "closed";
  // Refresh preserves this count; a new drawer/operator/role requires a fresh count.
  return <DrawerCount key={`${shiftId}:${props.actorId}:${props.role}`} {...props} />;
}
function DrawerCount({ ledger, actorId, role, onSaved, onStale, renderWorkspace }: CashCountProps) {
  const shift = ledger.cashShifts.find(s => s.status === "open");
  const [count, setCount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  const expected = cashExpected(shift?.opening_amount, shift?.collected);
  const counted = cashNumber(count);
  const variance = cashCountVariance(counted, expected);
  const mayClose = Boolean(shift && canCloseDrawer(shift, actorId, role));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!shift || !mayClose || busy) return;
    if (counted === null || counted < 0 || counted > 10000000) {
      setError("Enter a fresh physical cash count between ₱0.00 and ₱10,000,000.00 before closing the drawer."); return;
    }
    if (expected === null) { setError("Expected cash is unavailable. Refresh the ledger before closing."); return; }
    if (variance !== 0 && note.trim().length < 3) { setError("Explain the cash difference before closing the drawer."); return; }
    const payload = { action: "close", actualCash: counted, notes: note };
    const signature = JSON.stringify({ ...payload, shift: shift.id });
    if (retry.current?.signature !== signature) retry.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/accounting/cash-shifts/${shift.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, idempotencyKey: retry.current.key }),
      });
      const body = await res.json();
      if (!res.ok) {
        if (res.status === 409) onStale?.();
        throw new Error(body.error || "Unable to close. Your count is preserved; retry.");
      }
      const result = `Drawer closed. Expected ${cashMoney(body.data.expectedCash)}; counted ${cashMoney(body.data.actualCash)}; variance ${cashMoney(body.data.variance)}.`;
      setMessage(result); setReviewOpen(false); setCount(""); setNote(""); retry.current = null;
      onSaved(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to close. Your count is preserved; retry.");
    } finally { setBusy(false); }
  }

  const form = <form className="hms-cash-count" onSubmit={submit}>
    <p>Count physical cash independently. The final expected amount is confirmed when the drawer closes.</p>
    <label>Physical cash counted (PHP)<input ref={inputRef} id="physical-cash-count" type="number" required min="0" max="10000000" step="0.01" value={count} disabled={busy} onChange={e => setCount(e.target.value)} aria-describedby="cash-count-help" /></label>
    <dl><div><dt>Expected cash</dt><dd>{cashMoney(expected)}</dd></div><div><dt>Variance</dt><dd>{variance === null ? "Enter physical count" : cashMoney(variance)}</dd></div></dl>
    <label>Count note / variance explanation<textarea rows={3} maxLength={400} value={note} disabled={busy} onChange={e => setNote(e.target.value)} required={counted !== null && variance !== 0} aria-describedby="cash-count-help" /></label>
    <p id="cash-count-help">Explain any difference before closing. Closing ends cash collection in this drawer; Accounting reviews it afterward.</p>
    {error && <p role="alert">{error}</p>}
    <div className="btn-row">
      {renderWorkspace && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setReviewOpen(false)}>Keep draft &amp; return</button>}
      <button className="btn btn-primary" disabled={busy}>{busy ? "Closing drawer…" : "Close shared drawer"}</button>
    </div>
  </form>;

  if (renderWorkspace) return <>
    {renderWorkspace({ counted, variance, expected, busy, mayClose, review: () => setReviewOpen(true) })}
    <Modal isOpen={reviewOpen && mayClose} onClose={() => { if (!busy) setReviewOpen(false); }} title="Review count & close" description="Record the physical count and any cash difference." initialFocusRef={inputRef} className="cash-count-dialog" closeOnEscape={!busy} closeOnOverlayClick={!busy} showCloseButton={!busy}>
      {form}
    </Modal>
  </>;
  return <section id="shared-drawer-count" className="panel hms-panel"><h3>Count &amp; close shared drawer</h3>
    {message && <p role="status">{message}</p>}
    {!shift ? <p>No drawer is open. Use Open shift to start the next drawer with a counted opening float.</p>
      : !mayClose ? <p>The opener or Accounting can close this shared drawer. Expected cash: {cashMoney(expected)}.</p>
        : form}
  </section>;
}
