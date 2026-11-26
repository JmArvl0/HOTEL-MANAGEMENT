"use client";
import { fetchPublic, readResponse } from "@/lib/client-errors";

import { userMessage } from "@/lib/errors";
import { useCallback, useEffect, useState } from "react";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import type { Role } from "@/lib/types";

type Link = { order_id: string; assetName: string; serviced_at: string | null; service_note: string | null; order: { status: string; assigned_user_id: string | null } | null };
export default function PreventiveWorkPanel({ role, actorId }: { role: Role; actorId: string }) {
  const [data, setData] = useState<{ links: Link[] } | null>(null);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const dialogs = useActionDialogs();
  const load = useCallback(async (signal?: AbortSignal) => { try { const response = await fetchPublic("/api/maintenance/asset-work", { cache: "no-store", signal }); const body = await readResponse(response); if (!response.ok) throw new Error(body.error); setData(body.data); setError(""); } catch (e) { if (!signal?.aborted) setError(userMessage(e, "Unable to load preventive work.")); } }, []);
  useEffect(() => { const c = new AbortController(); queueMicrotask(() => { if (!c.signal.aborted) void load(c.signal); }); return () => c.abort(); }, [load]);
  async function save(payload: Record<string, unknown>) { setBusy(true); setError(""); try { const response = await fetchPublic("/api/maintenance/asset-work", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); const body = await readResponse(response); if (!response.ok) throw new Error(body.error); setMessage("Completed service recorded on the linked work order."); await load(); } catch (e) { setError(userMessage(e, "Unable to save preventive work.")); } finally { setBusy(false); } }
  async function record(link: Link) { const v = await dialogs.askForm({ title: "Record completed asset service", description: "The linked work order must be completed. Enter the actual service date; future dates are not accepted.", fields: [{ key: "serviceDate", label: "Actual service date", type: "date", required: true, defaultValue: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()) }, { key: "note", label: "Service note (optional)", type: "textarea" }], submitText: "Record linked service" }); if (v) await save({ ...v, action: "record_service", orderId: link.order_id }); }
  if (data?.links.length === 0 && !message && !error) return null;
  return <section className="data-panel ops-workspace">
    {dialogs.view}
    <header className="ops-heading"><div><h2>Linked maintenance history</h2><p>Record completed service for existing Hotel work orders. Coordinate new preventive work with Facilities.</p></div><button className="btn btn-secondary" disabled={busy} onClick={() => void load()}>Refresh</button></header>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}{!data && !error && <p role="status">Loading linked work…</p>}
    <div className="ops-card-list">{data?.links.map(link => {
      const mayRecord = !link.serviced_at && link.order?.status === "completed" && (role === "manager" || link.order.assigned_user_id === actorId);
      return <article className="ops-card" key={link.order_id}>
        <div><h3>{link.assetName}</h3><p>Work order <code>{link.order_id}</code> · {link.serviced_at ? `Serviced ${link.serviced_at}` : link.order?.status.replaceAll("_", " ")}</p>{link.service_note && <p>{link.service_note}</p>}</div>
        {mayRecord && <button className="table-action" disabled={busy} onClick={() => void record(link)}>Record linked service</button>}
      </article>;
    })}</div>
  </section>;
}
