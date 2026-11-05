"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { cashExpected, cashMoney, type CashRecord } from "@/lib/cash-shift-display";

type Props = { refund: CashRecord; drawer: CashRecord | null; basisLabel: ReactNode; onClose: () => void; onSaved: () => void };
export default function RefundPayoutDialog({ refund, drawer, basisLabel, onClose, onSaved }: Props) {
  const [method, setMethod] = useState("");
  const [drawerId, setDrawerId] = useState("");
  const [reference, setReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cashDrawer, setCashDrawer] = useState(drawer);
  const [drawerReady, setDrawerReady] = useState(false);
  const [drawerError, setDrawerError] = useState("");
  const [drawerRetry, setDrawerRetry] = useState(0);
  const input = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (method !== "cash") return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/accounting/ledger", { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.data?.cashShifts)) throw new Error("Current drawer unavailable. Refresh before recording a cash payout.");
        if (!controller.signal.aborted) { setCashDrawer(body.data.cashShifts.find((shift: CashRecord) => shift.status === "open") ?? null); setDrawerReady(true); setDrawerError(""); }
      } catch { if (!controller.signal.aborted) setDrawerError("Current drawer unavailable. Refresh before recording a cash payout."); }
    }
    void load(); return () => controller.abort();
  }, [method, drawerRetry]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !confirmed || !method || method === "cash" && (!drawerId || !drawerReady)) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/accounting/refunds/" + refund.id + "/process", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, cashShiftId: method === "cash" ? drawerId : null, reference: reference.trim() })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to record this refund. Your payout details are preserved.");
      onSaved(); onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to confirm the result. Retry with the same payout details."); }
    finally { setBusy(false); }
  }
  return <Modal isOpen onClose={() => { if (!busy) onClose(); }} title="Record refund payout" description="Accounting records the method used for a completed payout." initialFocusRef={input} className="cash-count-dialog" closeOnEscape={!busy} closeOnOverlayClick={!busy} showCloseButton={!busy}>
    <form className="hms-cash-count" onSubmit={submit}>
      <div><strong>{cashMoney(refund.eligible_amount)}</strong><div>{basisLabel}</div></div>
      <p>Record the actual payout. This action does not send a bank, GCash or card refund.</p>
      <label>Payout method<select ref={input} required value={method} disabled={busy} onChange={event => { setMethod(event.target.value); setDrawerId(""); setConfirmed(false); setDrawerReady(false); setDrawerError(""); }}>
        <option value="">Choose the actual payout method</option><option value="cash">Cash from drawer</option><option value="bank_transfer">Bank transfer</option><option value="gcash">GCash</option><option value="card">Card reversal (completed externally)</option>
      </select></label>
      {method === "cash" && <>
        <label>Cash drawer used<select required value={drawerId} disabled={busy || !drawerReady || !cashDrawer} onChange={event => setDrawerId(event.target.value)}><option value="">Confirm the drawer used</option>{drawerReady && cashDrawer && <option value={String(cashDrawer.id)}>{String(cashDrawer.location || "Front Desk")} · {String(cashDrawer.staff_name || "Cashier")} · #{String(cashDrawer.id).slice(0, 8)}</option>}</select></label>
        {drawerError ? <p role="alert">{drawerError} <button type="button" className="cash-text-action" onClick={() => { setDrawerError(""); setDrawerRetry(value => value + 1); }}>Refresh drawer</button></p> : !drawerReady ? <p role="status">Loading the current payout drawer…</p> : cashDrawer ? <p>Recorded available cash: <strong>{cashMoney(cashExpected(cashDrawer.opening_amount, cashDrawer.collected))}</strong>. Availability is checked again when recording.</p> : <p role="alert">No drawer is open. Open the drawer before paying and recording a cash refund.</p>}
      </>}
      <label>Payout / transaction reference<input required minLength={2} maxLength={120} value={reference} disabled={busy} onChange={event => setReference(event.target.value)} /></label>
      <label className="cash-payout-confirm"><input type="checkbox" required checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />I confirm this refund has actually been paid using the method and reference above.</label>
      {error && <p role="alert">{error}</p>}
      <div className="btn-row"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || !confirmed || !method || method === "cash" && (!drawerId || !drawerReady)}>{busy ? "Recording refund…" : "Record completed refund"}</button></div>
    </form>
  </Modal>;
}
