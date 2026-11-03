"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { Role } from "@/lib/types";
type Item = { id: string; name: string; quantity: number; unit: string; reorder_point: number; updated_at: string };
type Movement = { id: string; item_id: string; quantity: number; direction: string; note: string | null; created_at: string };
export default function StockIntegrityPanel({ role }: { role: Role }) {
 const [data, setData] = useState<{ items: Item[]; movements: Movement[] } | null>(null);
 const [selected, setSelected] = useState("");
 const [kind, setKind] = useState("issue");
 const [quantity, setQuantity] = useState("");
 const [countVersion, setCountVersion] = useState<string | null>(null);
 const [reference, setReference] = useState("");
 const [reason, setReason] = useState("");
 const [busy, setBusy] = useState(false);
 const [error, setError] = useState("");
 const [message, setMessage] = useState("");
 const retry = useRef<{ signature: string; key: string } | null>(null);
 const allowed = ["housekeeping", "maintenance"].includes(role);
 const item = data?.items.find(i => i.id === selected);
 const load = useCallback(async (signal?: AbortSignal) => {
  try { const res = await fetch("/api/inventory/movements", { cache: "no-store", signal }); const body = await res.json(); if (!res.ok) throw new Error(body.error); setData(body.data); setSelected(previous => previous || body.data.items[0]?.id || ""); setError(""); }
  catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "Unable to load stock. Retry."); }
 }, []);
 useEffect(() => { const c = new AbortController(); queueMicrotask(() => { if (!c.signal.aborted) void load(c.signal); }); return () => c.abort(); }, [load]);
 async function submit(e: FormEvent) {
  e.preventDefault(); if (!item || busy) return;
  const payload = { itemId: item.id, kind, quantity: Number(quantity), expectedUpdated: kind === "count" ? countVersion : null, reason, reference };
  const signature = JSON.stringify(payload);
  if (retry.current?.signature !== signature) retry.current = { signature, key: crypto.randomUUID() };
  setBusy(true); setError(""); setMessage("");
  try { const res = await fetch("/api/inventory/movements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, idempotencyKey: retry.current.key }) }); const body = await res.json(); if (!res.ok) throw new Error(body.error); retry.current = null; setQuantity(""); setCountVersion(null); setReference(""); setReason(""); setMessage("Stock balance and movement history saved together."); await load(); }
  catch (e) { setError(e instanceof Error ? e.message : "Save unavailable. Keep your entries and retry."); }
  finally { setBusy(false); }
 }
 return <section className="hms-workflow"><header className="ops-heading"><div><h2>Inventory</h2><p>Record supply usage and physical counts with a matching history.</p></div><button className="btn btn-secondary" disabled={busy} onClick={() => void load()}>Refresh balances</button></header>
  {error && <p className="hms-alert" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
  {!data ? !error && <p role="status">Loading stock and movement history…</p> : <><div className="hms-metrics"><div><b>{data.items.length}</b><span>Tracked supplies</span></div><div><b>{data.items.filter(i => Number(i.quantity) <= Number(i.reorder_point)).length}</b><span>At or below minimum</span></div><div><b>{data.movements.length}</b><span>Recent movements · up to 100</span></div></div><div className={`hms-split${allowed ? "" : " hms-read-only"}`}><div className="hms-stack"><section className="panel hms-panel"><h3>Supplies on hand</h3><p>Select a supply to record a movement.</p><div className="hms-table-wrap"><table><thead><tr><th>Supply</th><th>Available</th><th>Status</th>{allowed && <th>Action</th>}</tr></thead><tbody>{data.items.map(i => <tr key={i.id} aria-selected={i.id === selected}><td><b>{i.name}</b><small>{i.id}</small></td><td>{Number(i.quantity)} {i.unit}</td><td><span className="badge">{Number(i.quantity) === 0 ? "Out of stock" : Number(i.quantity) <= Number(i.reorder_point) ? "Low stock" : "Available"}</span></td>{allowed && <td><button className="table-action" disabled={busy} onClick={() => { setSelected(i.id); setQuantity(""); setCountVersion(null); retry.current = null; }}>Select</button></td>}</tr>)}</tbody></table></div>{!data.items.length && <p>No supplies are recorded. Ask the responsible team to configure inventory.</p>}</section>
  <section className="panel hms-panel"><h3>Movement history</h3><p>Recent issues, replenishments and reasoned corrections.</p><ul className="hms-history">{data.movements.map(m => <li key={m.id}><div><b>{data.items.find(i => i.id === m.item_id)?.name ?? m.item_id}</b><p>{m.direction} · {Number(m.quantity)} · {m.note}</p><small>{new Date(m.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</small></div></li>)}</ul>{!data.movements.length && <p>No recorded movements yet. A saved supply issue will appear here.</p>}</section></div>
  {allowed && <section className="panel hms-panel"><h3>Record stock movement</h3><p>{item ? `${item.name} · ${Number(item.quantity)} ${item.unit} available` : "Select a supply first."}</p><form onSubmit={submit}><fieldset disabled={busy || !item}><label>Movement type<select value={kind} onChange={e => { setKind(e.target.value); setQuantity(""); setCountVersion(null); retry.current = null; }}><option value="issue">Issue supplies</option><option value="count">Correct physical count</option></select></label><label>{kind === "count" ? "Physical quantity counted" : "Quantity to issue"}<input type="number" min={kind === "count" ? 0 : 0.01} step="0.01" required value={quantity} onChange={e => { setQuantity(e.target.value); setCountVersion(previous => e.target.value === "" ? null : previous ?? item?.updated_at ?? null); }} /></label><label>Room / operational reference<input value={reference} onChange={e => setReference(e.target.value)} required maxLength={120} /></label><label>Reason<textarea value={reason} onChange={e => setReason(e.target.value)} required minLength={3} maxLength={500} rows={3} /></label><p className="hms-note">{kind === "count" ? "A newer stock change blocks an outdated count. Clear the quantity, recount, and enter it again after refreshing." : "Insufficient stock blocks the entire save. A retry uses the same operation key."}</p><button className="btn btn-primary" type="submit">{busy ? "Saving movement…" : "Save movement"}</button></fieldset></form></section>}</div></>}
 </section>;
}
