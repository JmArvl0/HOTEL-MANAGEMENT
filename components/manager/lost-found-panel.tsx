"use client";
import { useCallback, useEffect, useState } from "react";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import { manilaInputToIso, type FoundEvent, type FoundItem } from "@/lib/operations";
import type { Role } from "@/lib/types";

const label = (s: string) => s.replaceAll("_", " ");
export default function LostFoundPanel({ role }: { role: Role }) {
  const [data, setData] = useState<{ items: FoundItem[]; events: FoundEvent[] } | null>(null);
  const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false); const [filter, setFilter] = useState("active");
  const dialogs = useActionDialogs();
  const load = useCallback(async (signal?: AbortSignal) => {
    try { const response = await fetch("/api/staff/lost-found", { cache: "no-store", signal }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body.data); setError(""); }
    catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "Unable to load. Try again."); }
  }, []);
  useEffect(() => { const c = new AbortController(); queueMicrotask(() => { if (!c.signal.aborted) void load(c.signal); }); return () => c.abort(); }, [load]);
  async function save(payload: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage("");
    try { const response = await fetch("/api/staff/lost-found", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setMessage("Item history updated."); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to save. Try again."); } finally { setBusy(false); }
  }
  async function record() {
    const value = await dialogs.askForm({ title: "Record a found item", description: "Describe the item and where it was found. Keep identity documents, card numbers and guest contact details out of the description.", fields: [
      { key: "description", label: "Item description", type: "textarea", required: true },
      { key: "location", label: "Found location", type: "text", required: true },
      { key: "foundAt", label: "Found at (Manila)", type: "datetime-local", required: true }
    ], submitText: "Record item" });
    if (!value) return;
    try { await save({ ...value, action: "record", id: crypto.randomUUID(), foundAt: manilaInputToIso(String(value.foundAt)) }); }
    catch (e) { setError(e instanceof Error ? e.message : "Check the found time."); }
  }
  async function act(item: FoundItem, action: string) {
    const titles: Record<string, string> = { secure: "Secure item", claim: "Record claim", authorize_release: "Authorize release", reject_claim: "Decline claim", release: "Release to verified claimant", dispose: "Authorize disposition", take_custody: "Acknowledge physical custody" };
    const note = await dialogs.askPrompt({ title: titles[action], message: action === "secure" ? "Enter the secure storage location." : action === "take_custody" ? "Confirm that you physically hold the item. Record its storage location and the staff member who handed it over." : action === "claim" ? "Record the claim verification reference. Do not enter ID numbers or payment details." : "Record the verification, approval or disposition reason. This history is retained.", label: "Required note", multiline: true, required: true });
    if (!note) return;
    let verified = false;
    if (action === "release" || action === "dispose") {
      verified = await dialogs.askConfirm({ title: titles[action], message: action === "release" ? "I have verified the claimant against the authorized claim and am physically handing over this item." : "I have checked the hotel's custody/retention policy and have authority to carry out this disposition. No automatic retention period is assumed.", confirmText: "Confirm", cancelText: "Go back" });
      if (!verified) return;
    }
    await save({ action, id: item.id, version: item.version, note, identityVerified: verified });
  }
  const visible = data?.items.filter(i => filter === "all" || !["released", "disposed"].includes(i.status)) ?? [];
  return <section className="data-panel ops-workspace">
    {dialogs.view}
    <header className="ops-heading"><div><p className="eyebrow">Guest belongings</p><h2>Lost & Found</h2><p>Secure custody, documented claims and an accountable release.</p></div><div className="btn-row"><button className="btn btn-secondary" disabled={busy} onClick={() => void load()}>Refresh</button>{role === "housekeeping" && <button className="btn btn-primary" disabled={busy || !data} onClick={() => void record()}>Record found item</button>}</div></header>
    <div className="haven-filter-badges" role="group" aria-label="Found items view">{["active", "all"].map(f => <button key={f} className="haven-filter-badge" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === "active" ? "In custody" : "All items"}</button>)}</div>
    {error && <p role="alert">{error} <button className="table-action" onClick={() => void load()}>Retry</button></p>}{message && <p role="status">{message}</p>}
    {!data && !error && <p role="status">Loading item register…</p>}
    {data && !visible.length && <p className="ops-empty">No items in this view.</p>}
    <div className="ops-card-list">{visible.map(item => <article className="ops-card" key={item.id}><div><span className="badge">{label(item.status)}</span><h3>{item.description}</h3><p>Found at {item.found_location} · {new Date(item.found_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</p><p>Current custodian: {item.custodian_name ?? "Staff member"}</p>{item.storage_location && <p>Stored: {item.storage_location}</p>}{item.claimant_note && <p>Claim: {item.claimant_note}</p>}
      <details><summary>Recent custody & action history</summary><ol>{data?.events.filter(e => e.item_id === item.id).map(e => <li key={e.id}><b>{label(e.action)}</b> · {e.actor_name} · {new Date(e.created_at).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}<p>{e.note}</p></li>)}</ol></details></div>
      <div className="btn-row">
        {role === "housekeeping" && item.status === "found" && <button className="table-action" disabled={busy} onClick={() => void act(item, "secure")}>Secure item</button>}
        {role === "front_desk" && item.status === "secured" && <button className="table-action" disabled={busy} onClick={() => void act(item, "claim")}>Record claim</button>}
        {role === "manager" && item.status === "claim_pending" && <><button className="table-action" disabled={busy} onClick={() => void act(item, "authorize_release")}>Authorize release</button><button className="table-action" disabled={busy} onClick={() => void act(item, "reject_claim")}>Decline claim</button></>}
        {role === "front_desk" && item.status === "release_authorized" && <button className="table-action" disabled={busy} onClick={() => void act(item, "release")}>Release item</button>}
        {role === "manager" && item.status === "secured" && <button className="table-action" disabled={busy} onClick={() => void act(item, "dispose")}>Record disposition</button>}
        {["secured", "claim_pending", "release_authorized"].includes(item.status) && <button className="table-action" disabled={busy} onClick={() => void act(item, "take_custody")}>Take custody</button>}
      </div></article>)}</div>
  </section>;
}
