"use client";
import { useCallback, useEffect, useState } from "react";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import type { MaintenanceAsset } from "@/lib/maintenance-assets";
import type { Role } from "@/lib/types";

type Link = { order_id: string; asset_id: string; serviced_at: string | null; service_note: string | null; maintenance_orders: { status: string; assigned_user_id: string | null } | null };
export default function PreventiveWorkPanel({ assets, role, actorId, onServiceRecorded }: { assets: MaintenanceAsset[]; role: Role; actorId: string; onServiceRecorded: () => void }) {
  const [data, setData] = useState<{ links: Link[]; technicians: { id: string; name: string }[] } | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const dialogs = useActionDialogs();
  const load = useCallback(async (signal?: AbortSignal) => { try { const response = await fetch("/api/maintenance/asset-work", { cache: "no-store", signal }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setData(body.data); setError(""); } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : "Unable to load preventive work."); } }, []);
  useEffect(() => { const c = new AbortController(); queueMicrotask(() => { if (!c.signal.aborted) void load(c.signal); }); return () => c.abort(); }, [load]);
  async function save(payload: Record<string, unknown>) { setBusy(true); setError(""); try { const response = await fetch("/api/maintenance/asset-work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const body = await response.json(); if (!response.ok) throw new Error(body.error); setMessage(payload.action === "create" ? `Assigned work order ${body.data}. Continue in the Maintenance work queue.` : "Service linked and next service date updated."); await load(); onServiceRecorded(); } catch (e) { setError(e instanceof Error ? e.message : "Unable to save preventive work."); } finally { setBusy(false); } }
  async function create(asset: MaintenanceAsset) {
    let technicianId = actorId;
    if (role === "manager") { const selected = await dialogs.askSelect({ title: `Assign preventive service — ${asset.name}`, label: "Maintenance technician", required: true, options: (data?.technicians ?? []).map(t => ({ value: t.id, label: t.name })) }); if (!selected) return; technicianId = selected; }
    await save({ action: "create", assetId: asset.id, technicianId });
  }
  async function record(link: Link) { const v = await dialogs.askForm({ title: "Record completed asset service", description: "The linked work order must be completed. Enter the actual service date; future dates are not accepted.", fields: [{ key: "serviceDate", label: "Actual service date", type: "date", required: true, defaultValue: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()) }, { key: "note", label: "Service note (optional)", type: "textarea" }], submitText: "Record linked service" }); if (v) await save({ ...v, action: "record_service", orderId: link.order_id }); }
  return <section className="data-panel ops-workspace">{dialogs.view}<header className="ops-heading"><div><p className="eyebrow">Preventive work</p><h2>From due date to completed service</h2><p>Assign an asset to a technician. Record service after the work order is completed.</p></div><button className="btn btn-secondary" disabled={busy} onClick={() => void load()}>Refresh</button></header>{error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}{!data && !error && <p role="status">Loading linked work…</p>}<div className="ops-card-list">{assets.map(asset => {
    const links = data?.links.filter(l => l.asset_id === asset.id) ?? [];
    const pending = links.find(l => !l.serviced_at && l.maintenance_orders?.status !== "cancelled");
    return <article className="ops-card" key={asset.id}><div><h3>{asset.name}</h3><p>Next service: {asset.next_service_date ?? "Not scheduled"}</p>{pending && <p>Work order <code>{pending.order_id}</code> · {pending.maintenance_orders?.status.replaceAll("_", " ")}</p>}{links.length > 0 && <details><summary>Linked service history</summary><ul>{links.map(l => <li key={l.order_id}>{l.order_id} · {l.serviced_at ? `Serviced ${l.serviced_at}` : l.maintenance_orders?.status}{l.service_note ? ` · ${l.service_note}` : ""}</li>)}</ul></details>}</div><div>{!pending ? <button className="table-action" disabled={busy || !data} onClick={() => void create(asset)}>Assign preventive work</button> : pending.maintenance_orders?.status === "completed" && (role === "manager" || pending.maintenance_orders.assigned_user_id === actorId) ? <button className="table-action" disabled={busy} onClick={() => void record(pending)}>Record linked service</button> : <span>Continue in work queue</span>}</div></article>;
  })}{assets.length === 0 && <p className="ops-empty">Register real maintenance assets to assign preventive work.</p>}</div></section>;
}
