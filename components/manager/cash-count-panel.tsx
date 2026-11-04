"use client";
import { useRef, useState, type FormEvent } from "react";
import type { AccountingLedger } from "@/lib/accounting";
import type { Role } from "@/lib/types";
const peso = (n: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(n);
type CashCountProps = { ledger: AccountingLedger; actorId: string; role: Role; onSaved: () => void };
export default function CashCountPanel(props: CashCountProps) {
 const shiftId = props.ledger.cashShifts.find(s => s.status === "open")?.id ?? "closed";
 // A different drawer or operator must start with an independent physical count.
 return <DrawerCount key={`${shiftId}:${props.actorId}:${props.role}`} {...props} />;
}
function DrawerCount({ ledger, actorId, role, onSaved }: CashCountProps) {
 const shift = ledger.cashShifts.find(s => s.status === "open");
 const [count, setCount] = useState(""); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
 const retry = useRef<{ signature: string; key: string } | null>(null);
 const expected = Number(shift?.opening_amount ?? 0) + Number(shift?.collected ?? 0);
 const variance = Math.round((Number(count) - expected) * 100) / 100;
 async function submit(e: FormEvent) { e.preventDefault(); if (!shift || busy) return; if (count.trim() === "" || !Number.isFinite(Number(count)) || Number(count) < 0) { setError("Enter a fresh physical cash count before closing the drawer."); return; } if (variance !== 0 && note.trim().length < 3) { setError("Explain the cash difference before closing the drawer."); return; } const payload = { action: "close", actualCash: Number(count), notes: note }; const signature = JSON.stringify({ ...payload, shift: shift.id }); if (retry.current?.signature !== signature) retry.current = { signature, key: crypto.randomUUID() }; setBusy(true); setError(""); try { const res = await fetch(`/api/accounting/cash-shifts/${shift.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, idempotencyKey: retry.current.key }) }); const body = await res.json(); if (!res.ok) throw new Error(body.error); setMessage(`Drawer closed. Expected ${peso(body.data.expectedCash)}; counted ${peso(body.data.actualCash)}; variance ${peso(body.data.variance)}.`); setCount(""); setNote(""); retry.current = null; onSaved(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to close. Your count is preserved; retry."); } finally { setBusy(false); } }
 return <section id="shared-drawer-count" className="panel hms-panel"><h3>Count & close shared drawer</h3>{message && <p role="status">{message}</p>}{!shift ? <p>No drawer is open. Use Open shift to start the next drawer with a counted opening float.</p> : shift.staff_user_id !== actorId && role !== "accounting" ? <p>The opener or Accounting can close this shared drawer. Expected cash: {peso(expected)}.</p> : <form className="hms-cash-count" onSubmit={submit}><p>Count physical cash independently. The final expected amount is recalculated under a database lock.</p><label>Physical cash counted (PHP)<input id="physical-cash-count" type="number" required min="0" step="0.01" value={count} disabled={busy} onChange={e => setCount(e.target.value)} /></label><dl><div><dt>Expected cash</dt><dd>{peso(expected)}</dd></div><div><dt>Variance</dt><dd>{count === "" ? "Enter physical count" : peso(variance)}</dd></div></dl><label>Count note / variance explanation<textarea rows={3} maxLength={400} value={note} disabled={busy} onChange={e => setNote(e.target.value)} required={count !== "" && variance !== 0} /></label>{error && <p role="alert">{error}</p>}<button className="btn btn-primary" disabled={busy}>{busy ? "Closing drawer…" : "Close shared drawer"}</button></form>}</section>;
}
