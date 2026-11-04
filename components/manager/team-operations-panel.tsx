"use client";
import { useCallback, useEffect, useState } from "react";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import { manilaInputToIso, type OperationalStaff, type RosterAssignment, type ShiftHandover } from "@/lib/operations";
import type { Role } from "@/lib/types";

const displayTime = (s: string) => new Date(s).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const hotelDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
const nameOf = (staff: OperationalStaff[], id: string) => staff.find(s => s.id === id)?.name ?? "Staff member";

export default function TeamOperationsPanel({ role, actorId, onOpenSource }: { role: Role; actorId: string; onOpenSource?: (type: string, id: string) => void }) {
  const [from, setFrom] = useState(hotelDate);
  const [data, setData] = useState<{ roster: RosterAssignment[]; handovers: ShiftHandover[]; staff: OperationalStaff[] } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("schedule");
  const dialogs = useActionDialogs();
  const manager = role === "manager";
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/staff/operations?from=${from}`, { cache: "no-store", signal });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setData(body.data); setError("");
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "Unable to load. Try again."); }
  }, [from]);
  useEffect(() => { const controller = new AbortController(); queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); }); return () => controller.abort(); }, [load]);
  async function save(payload: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/staff/operations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error);
      setMessage("Saved. The team view is updated."); await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save. Try again."); }
    finally { setBusy(false); }
  }
  async function schedule() {
    const v = await dialogs.askForm({ title: "Schedule a shift", description: "Times use Asia/Manila. A schedule records planned coverage, not attendance.", fields: [
      { key: "staffId", label: "Staff member", type: "select", required: true, options: (data?.staff ?? []).map(s => ({ value: s.id, label: `${s.name} · ${s.role.replaceAll("_", " ")}` })) },
      { key: "start", label: "Starts at (Manila)", type: "datetime-local", required: true, defaultValue: `${from}T08:00` },
      { key: "end", label: "Ends at (Manila)", type: "datetime-local", required: true, defaultValue: `${from}T16:00` },
      { key: "note", label: "Coverage note (optional)", type: "textarea" }
    ], submitText: "Schedule shift" });
    if (!v) return;
    try { await save({ action: "schedule", id: crypto.randomUUID(), staffId: v.staffId, startsAt: manilaInputToIso(String(v.start)), endsAt: manilaInputToIso(String(v.end)), note: v.note ?? "" }); }
    catch (e) { setError(e instanceof Error ? e.message : "Check date and time."); }
  }
  async function handover() {
    const v = await dialogs.askForm({ title: "Submit a handover", description: "Link the existing record and assign follow-up. Keep the note within your department; omit payment credentials and guest identity documents.", fields: [
      { key: "sourceType", label: "Source", type: "select", required: true, options: ["reservation", "guest_request", "housekeeping", "maintenance", ...(role === "front_desk" || role === "accounting" ? ["cash_shift"] : [])].map(value => ({ value, label: value.replaceAll("_", " ") })) },
      { key: "sourceId", label: "Source record ID", type: "text", required: true },
      { key: "followUpId", label: "Follow-up owner", type: "select", required: true, options: (data?.staff ?? []).map(s => ({ value: s.id, label: s.name })) },
      { key: "summary", label: "What needs attention?", type: "textarea", required: true }
    ], submitText: "Submit handover" });
    if (v) await save({ ...v, action: "handover", id: crypto.randomUUID() });
  }
  return <section className="data-panel ops-workspace">{dialogs.view}
    <header className="ops-heading"><div><p className="eyebrow">Team continuity</p><h2>Schedule & handover</h2><p>Planned coverage and accountable follow-up. All times are Asia/Manila.</p></div><div className="btn-row"><button className="btn btn-secondary" disabled={busy} onClick={() => void load()}>Refresh</button><button className="btn btn-primary" disabled={busy || !data} onClick={() => void handover()}>New handover</button>{manager && <button className="btn btn-secondary" disabled={busy || !data} onClick={() => void schedule()}>Schedule shift</button>}</div></header>
    <div className="haven-filter-badges" role="group" aria-label="Team view">{["schedule", "handover"].map(t => <button key={t} className="haven-filter-badge" aria-pressed={tab === t} onClick={() => setTab(t)}>{t === "schedule" ? "Weekly schedule" : "Handovers"}</button>)}</div>
    {error && <p role="alert">{error} <button className="table-action" onClick={() => void load()}>Retry</button></p>}{message && <p role="status">{message}</p>}
    {!data && !error && <p role="status">Loading team operations…</p>}
    {tab === "schedule" && <><label className="ops-week">Week starting<input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><p>{manager ? "Team coverage" : "Your schedule"} · Scheduled work does not confirm attendance.</p>
      <div className="ops-card-list">{data?.roster.filter(r => r.status === "scheduled").map(r => <article className="ops-card" key={r.id}><div><h3>{nameOf(data.staff, r.staff_user_id)}</h3><p>{displayTime(r.starts_at)} → {displayTime(r.ends_at)}</p><small>{r.department.replaceAll("_", " ")}{r.note ? ` · ${r.note}` : ""}</small></div>{manager && <button className="table-action" disabled={busy} onClick={async () => { const note = await dialogs.askPrompt({ title: "Cancel scheduled shift", label: "Reason", required: true }); if (note) await save({ action: "cancel_schedule", id: r.id, version: r.version, note }); }}>Cancel shift</button>}</article>)}</div>
      {data && !data.roster.some(r => r.status === "scheduled") && <p className="ops-empty">No scheduled shifts in this seven-day window.</p>}</>}
    {tab === "handover" && <div className="ops-card-list">{data?.handovers.map(h => <article className="ops-card" key={h.id}><div><span className="badge">{h.resolved_at ? "Resolved" : h.acknowledged_at ? "Acknowledged" : "Awaiting acknowledgement"}</span><h3>{h.summary}</h3><p>{h.source_type.replaceAll("_", " ")} · <code>{h.source_id}</code> {onOpenSource && <button className="table-action" onClick={() => onOpenSource(h.source_type, h.source_id)}>Open source</button>}</p><small>Follow-up: {nameOf(data.staff, h.follow_up_user_id)} · Submitted {displayTime(h.submitted_at)}</small>{h.resolution && <p>Resolution: {h.resolution}</p>}</div>{!h.resolved_at && (manager || h.follow_up_user_id === actorId) && <button className="table-action" disabled={busy} onClick={async () => { if (!h.acknowledged_at) await save({ action: "acknowledge", id: h.id, version: h.version }); else { const note = await dialogs.askPrompt({ title: "Resolve handover", label: "What was done?", required: true, multiline: true }); if (note) await save({ action: "resolve", id: h.id, version: h.version, note }); } }}>{h.acknowledged_at ? "Resolve" : "Acknowledge"}</button>}</article>)}{data?.handovers.length === 0 && <p className="ops-empty">No handovers yet. Link an unresolved operational record to start.</p>}</div>}
  </section>;
}
