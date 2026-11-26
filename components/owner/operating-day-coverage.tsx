"use client";

import { useState, type FormEvent } from "react";
import { hotelRequest, useHotelResource } from "@/components/manager/hotel-operations-client";
import { userMessage } from "@/lib/errors";
import type { OperatingDayCoverage as Coverage } from "@/lib/hotel-operations";

const endpoint = "/api/owner/operating-day-coverage";

export default function OperatingDayCoverage() {
  const { data, error, loading, refresh, setData } = useHotelResource<Coverage>(endpoint);
  const [draft, setDraft] = useState<{ primaryId: string; backupId: string } | null>(null);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const [saving, setSaving] = useState(false);
  const selection = draft ?? { primaryId: data?.primaryId ?? "", backupId: data?.backupId ?? "" };
  const candidates = data?.candidates ?? [];
  const eligible = (id: string) => candidates.some(candidate => candidate.id === id);
  const valid = (!selection.primaryId && !selection.backupId) || (
    selection.primaryId !== selection.backupId && eligible(selection.primaryId) && eligible(selection.backupId)
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !valid || saving) return;
    setSaving(true);
    setStatus("");
    setFailure("");
    try {
      setData(await hotelRequest<Coverage>(endpoint, {
        primaryId: selection.primaryId || null,
        backupId: selection.backupId || null,
        expectedVersion: data.version,
        reason: reason.trim(),
      }, "PUT"));
      setDraft(null);
      setReason("");
      setStatus("Close Day coverage saved.");
    } catch (error) {
      setFailure(userMessage(error, "Unable to save Close Day coverage."));
    } finally {
      setSaving(false);
    }
  }

  return <section className="hotel-ops" aria-label="Close Day coverage">
    <h3>Close Day coverage</h3>
    <p>Choose two active Managers who can start operating-day tracking and close an eligible day. Existing Accounting operators retain coverage during the Finance handoff.</p>
    {(failure || error) && <p role="alert">{failure || error}</p>}
    {status && <p role="status">{status}</p>}
    {loading && <p role="status">Loading coverage…</p>}
    {data && <form onSubmit={save}>
      <div className="hotel-ops-fields">
        {([['primaryId', 'Primary Manager'], ['backupId', 'Backup Manager']] as const).map(([key, label]) => <label key={key}>{label}
          <select value={selection[key]} onChange={event => setDraft({ ...selection, [key]: event.target.value })} disabled={saving || loading}>
            <option value="">Unassigned</option>
            {selection[key] && !eligible(selection[key]) && <option value={selection[key]} disabled>Previously assigned Manager is unavailable</option>}
            {candidates.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
          </select>
        </label>)}
      </div>
      {candidates.length < 2 && <p>Two eligible Manager accounts are required to assign coverage.</p>}
      <label>Reason for change<input value={reason} onChange={event => setReason(event.target.value)} maxLength={500} required disabled={saving || loading} /></label>
      <div className="btn-row">
        <button type="submit" className="btn btn-accent" disabled={loading || saving || !valid || reason.trim().length < 3 || !draft}>Save coverage</button>
        <button type="button" className="btn btn-soft" disabled={loading || saving} onClick={() => { setFailure(""); void refresh(); }}>Refresh coverage</button>
      </div>
    </form>}
    {!data && error && <div className="btn-row"><button type="button" className="btn btn-soft" disabled={loading} onClick={() => void refresh()}>Retry coverage</button></div>}
  </section>;
}
