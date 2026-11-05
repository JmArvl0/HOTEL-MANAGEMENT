"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { cashMoney, cashNumber, cashExpected, cashCountVariance, canCloseDrawer, cashDate } from "@/lib/cash-shift-display";
import type { AccountingLedger } from "@/lib/accounting";
import type { Role } from "@/lib/types";

export type CashCountPresentation = {
  counted: number | null; variance: number | null; expected: number | null;
  busy: boolean; mayClose: boolean; review: () => void;
  draftStatus: string;
};
type SavedCount = {
  actualCash: number; notes: string; basis: string; version: number; closeKey: string;
  updatedAt: string; invalidatedAt?: string | null; stale?: boolean;
};
type CountContext = { status: string; basis: string; expectedCash: number; draft: SavedCount | null };
type CashCountProps = {
  ledger: AccountingLedger; actorId: string; role: Role;
  onSaved: (message?: string) => void; onStale?: () => void;
  renderWorkspace?: (count: CashCountPresentation) => ReactNode;
};
export default function CashCountPanel(props: CashCountProps) {
  const shiftId = props.ledger.cashShifts.find(s => s.status === "open")?.id ?? "closed";
  return <DrawerCount key={String(shiftId) + ":" + props.actorId + ":" + props.role} {...props} />;
}
function DrawerCount({ ledger, actorId, role, onSaved, onStale, renderWorkspace }: CashCountProps) {
  const shift = ledger.cashShifts.find(s => s.status === "open");
  const mayClose = Boolean(shift && canCloseDrawer(shift, actorId, role));
  const shiftId = String(shift?.id ?? "");
  const [count, setCount] = useState("");
  const [note, setNote] = useState("");
  const [context, setContext] = useState<CountContext | null>(null);
  const [countBasis, setCountBasis] = useState("");
  const [version, setVersion] = useState(0);
  const [chosen, setChosen] = useState(false);
  const [loading, setLoading] = useState(mayClose);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<SavedCount | null>(null);
  const countStarted = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const saved = context?.draft && !context.draft.invalidatedAt ? context.draft : null;
  const counted = cashNumber(count);
  const expected = context?.expectedCash ?? cashExpected(shift?.opening_amount, shift?.collected);
  const variance = cashCountVariance(counted, expected);
  const stale = Boolean(count && context && countBasis !== context.basis);
  const dirty = Boolean(count || note) && !(saved && counted === Number(saved.actualCash) && note.trim() === saved.notes && countBasis === saved.basis);
  const chooseSaved = Boolean(saved && !chosen);
  const activity = JSON.stringify((ledger.transactions ?? []).filter(row => row.cash_shift_id === shift?.id && row.status === "paid")
    .map(row => [row.id, row.amount, row.purpose, row.method]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))));

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!mayClose) return;
    setLoading(true);
    try {
      const response = await fetch("/api/accounting/cash-shifts/" + shiftId, { cache: "no-store", signal });
      const body = await response.json();
      if (!response.ok || typeof body.data?.basis !== "string" || typeof body.data?.status !== "string") throw new Error(body.error || "Saved count unavailable. Reload before saving or closing.");
      if (signal?.aborted) return;
      setContext(body.data);
      if (!countStarted.current) setCountBasis(body.data.basis);
      if (body.data.status !== "open") { setMessage("This drawer is already closed. Refresh to view its recorded count."); onStale?.(); }
    } catch (cause) {
      if (!signal?.aborted) { setContext(null); setError(cause instanceof Error ? cause.message : "Unable to load the saved count."); }
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [mayClose, shiftId, onStale]);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); });
    return () => controller.abort();
  }, [load, activity]);
  useEffect(() => {
    if (!dirty && !uncertain) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, uncertain]);

  function resume() {
    if (!saved || uncertain) return;
    countStarted.current = true;
    setCount(String(saved.actualCash)); setNote(saved.notes); setCountBasis(saved.basis);
    setVersion(saved.version); setChosen(true); setError("");
  }
  function fresh() {
    if (!context || uncertain) return;
    countStarted.current = false;
    setCount(""); setNote(""); setCountBasis(context.basis); setVersion(context.draft?.version ?? 0);
    setChosen(true); setError(""); inputRef.current?.focus();
  }
  async function saveDraft(): Promise<SavedCount> {
    if (counted === null || counted < 0 || counted > 10000000) throw new Error("Enter a fresh physical cash count between ₱0.00 and ₱10,000,000.00.");
    if (!context || context.status !== "open") throw new Error("Reload the drawer before saving or closing.");
    if (stale) throw new Error("Cash activity changed. Start a fresh physical count before saving or closing.");
    if (!dirty && saved) return saved;
    const response = await fetch("/api/accounting/cash-shifts/" + shiftId, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ actualCash: counted, notes: note.trim(), basis: countBasis, version })
    });
    const body = await response.json();
    if (!response.ok) { if (response.status === 409) void load(); throw new Error(body.error || "Unable to save. Your entries are preserved."); }
    if (!body.data?.closeKey || !body.data?.version) throw new Error("Save result unavailable. Reload the saved draft before continuing.");
    const draft = body.data as SavedCount;
    setContext(current => current && { ...current, draft }); setVersion(draft.version); setChosen(true);
    return draft;
  }
  async function saveAndReturn() {
    if (busy) return;
    setBusy(true); setError("");
    try { await saveDraft(); setReviewOpen(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save. Your entries are preserved."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!shift || !mayClose || busy) return;
    if (!uncertain && (counted === null || counted < 0 || counted > 10000000)) { setError("Enter a fresh physical cash count between ₱0.00 and ₱10,000,000.00."); return; }
    if (!uncertain && variance !== 0 && note.trim().length < 3) { setError("Explain the cash difference before closing the drawer."); return; }
    setBusy(true); setError("");
    try {
      const draft = pending.current ?? await saveDraft();
      pending.current = draft; setUncertain(true);
      const response = await fetch("/api/accounting/cash-shifts/" + shiftId, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", draftVersion: draft.version, idempotencyKey: draft.closeKey })
      });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 409 || response.status === 403) { pending.current = null; setUncertain(false); void load(); onStale?.(); }
        throw new Error(body.error || "Close result unavailable. Retry the same saved count.");
      }
      const result = "Drawer closed. Expected " + cashMoney(body.data.expectedCash) + "; counted " + cashMoney(body.data.actualCash) + "; variance " + cashMoney(body.data.variance) + ".";
      pending.current = null; setUncertain(false); setMessage(result);
      setReviewOpen(false); setCount(""); setNote(""); setContext(null); onSaved(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Close result unavailable. Retry the same saved count."); }
    finally { setBusy(false); }
  }
  const draftStatus = dirty ? "Unsaved changes. Save draft before leaving this module." : chosen && saved && !count && !note ? "Fresh count not saved. The previous saved draft remains available." : saved ? "Draft saved at " + cashDate(saved.updatedAt) : loading ? "Loading saved count…" : "No saved count draft.";
  const status = <p role="status">{draftStatus}</p>;
  const form = <form className="hms-cash-count" onSubmit={submit}>
    <p>Count physical cash independently. Save draft stores your work; Close records the final count.</p>
    {status}
    {saved && <div className="btn-row"><button type="button" className="btn btn-secondary" disabled={busy || uncertain} onClick={resume}>{chosen ? "Reload saved draft" : "Resume saved draft"}</button></div>}
    <button type="button" className="cash-text-action" disabled={busy || !context || uncertain} onClick={fresh}>Start a fresh count</button>
    {stale && <p role="alert">Cash activity changed. Start a fresh count and count the drawer again.</p>}
    {uncertain && <p role="alert">The close result is unconfirmed. Retry closing with the same saved count before making changes.</p>}
    <label>Physical cash counted (PHP)<input ref={inputRef} id="physical-cash-count" type="number" required min="0" max="10000000" step="0.01" value={count} disabled={busy || loading || chooseSaved || uncertain} onChange={event => { countStarted.current = true; setCount(event.target.value); }} aria-describedby="cash-count-help" /></label>
    <dl><div><dt>Expected cash</dt><dd>{cashMoney(expected)}</dd></div><div><dt>Variance</dt><dd>{variance === null ? "Enter physical count" : cashMoney(variance)}</dd></div></dl>
    <label>Count note / variance explanation<textarea rows={3} maxLength={400} value={note} disabled={busy || loading || chooseSaved || uncertain} onChange={event => setNote(event.target.value)} required={counted !== null && variance !== 0} aria-describedby="cash-count-help" /></label>
    <p id="cash-count-help">Explain any difference before closing. Closing ends cash collection in this drawer; Accounting reviews it afterward.</p>
    {error && <p role="alert">{error}</p>}
    <div className="btn-row">
      {renderWorkspace && <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => setReviewOpen(false)}>Return without saving</button>}
      <button type="button" className="btn btn-secondary" disabled={busy || loading || !context || stale || chooseSaved || uncertain} onClick={() => void saveAndReturn()}>Save draft &amp; return</button>
      <button className="btn btn-primary" disabled={busy || loading || !context || stale || chooseSaved}>{busy ? "Recording count…" : uncertain ? "Retry closing drawer" : "Close shared drawer"}</button>
    </div>
    {!context && !loading && <button type="button" className="btn btn-secondary" onClick={() => void load()}>Reload saved count</button>}
  </form>;
  if (renderWorkspace) return <>
    {renderWorkspace({ counted, variance, expected, busy, mayClose, draftStatus, review: () => setReviewOpen(true) })}
    <Modal isOpen={reviewOpen && mayClose} onClose={() => { if (!busy) setReviewOpen(false); }} title="Review count & close" description="Save a count draft or record the final cash difference." initialFocusRef={inputRef} className="cash-count-dialog" closeOnEscape={!busy} closeOnOverlayClick={!busy} showCloseButton={!busy}>{form}</Modal>
  </>;
  return <section id="shared-drawer-count" className="panel hms-panel"><h3>Count &amp; close shared drawer</h3>
    {message && <p role="status">{message}</p>}
    {!shift ? <p>No drawer is open. Use Open shift to start the next drawer with a counted opening float.</p>
      : !mayClose ? <p>The opener or Accounting can close this shared drawer. Expected cash: {cashMoney(expected)}.</p> : form}
  </section>;
}
