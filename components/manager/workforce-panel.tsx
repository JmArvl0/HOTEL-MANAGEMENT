"use client";


import { fetchPublic, readResponse } from "@/lib/client-errors";

import { userMessage } from "@/lib/errors";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { RefreshCw } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatHotelDateTime } from "@/lib/format";
import { WORKFORCE_STATUS_LABELS, type WorkforceMember, type WorkforceSnapshot } from "@/lib/workforce";
import "./workforce-panel.css";

function currentStatus(member: WorkforceMember, now: number) {
  if (member.validUntil && Date.parse(member.validUntil) <= now) return "stale";
  if (member.status === "on_duty" && member.shiftEndsAt && Date.parse(member.shiftEndsAt) <= now) return "outside_shift";
  return member.status;
}

export default function WorkforcePanel({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<WorkforceSnapshot | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(0);
  const [selected, setSelected] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [reason, setReason] = useState("");
  const load = useCallback(async (signal?: AbortSignal) => {
    setRefreshing(true);
    try {
      const response = await fetchPublic("/api/staff/workforce", { cache: "no-store", signal });
      const body = await readResponse(response);
      if (!response.ok || !Array.isArray(body.data?.staff) || !body.data?.settings) throw new Error(body.error ?? "We couldn't load staff availability. Try again shortly.");
      setData(body.data); setNow(Date.now()); setError("");
    } catch (caught) {
      if (!signal?.aborted) setError(userMessage(caught, "We couldn't load staff availability. Try again shortly."));
    } finally { if (!signal?.aborted) setRefreshing(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    const timer = window.setInterval(() => { setNow(Date.now()); void load(controller.signal); }, 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [load]);

  async function save(payload: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetchPublic("/api/staff/workforce", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await readResponse(response);
      if (!response.ok) throw new Error(body.error ?? "Unable to save Workforce settings.");
      setMessage("Saved. Workforce availability will be checked before each automatic assignment.");
      setEmployeeId(""); setReason(""); await load();
    } catch (caught) { setMessage(userMessage(caught, "Unable to save Workforce settings.")); }
    finally { setBusy(false); }
  }
  function configure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const fields = new FormData(event.currentTarget);
    void save({ action: "configure", sourceSystem: fields.get("source"), propertyId: fields.get("property"), autoAssignCheckout: fields.get("auto") === "on", expectedVersion: data.settings.version, reason: fields.get("reason") });
  }
  const selectedMember = data?.staff.find(member => member.userId === selected);
  const eligible = data?.staff.filter(member => member.role === "housekeeping" && currentStatus(member, now) === "on_duty").length ?? 0;
  const showTeam = !compact || data?.scope === "team";

  return <section className="panel workforce-panel" aria-label="Workforce availability">
    <header className="panel-heading"><div><h3>Workforce availability</h3><p>Shift and attendance updates from Workforce Management. Times are Philippine time.</p></div><button type="button" className="btn btn-secondary" disabled={refreshing || busy} onClick={() => void load()}><RefreshCw size={14} aria-hidden="true" />{refreshing ? "Refreshing…" : "Refresh"}</button></header>
    {error ? <div role="alert"><p>{error}</p><p>Duty availability cannot be verified. Existing task activity is shown separately.</p></div>
      : !data ? <p role="status">Loading Workforce availability…</p> : <>
        <div className="workforce-summary"><StatusBadge status={data.receiverConfigured ? "info" : "pending"} label={data.receiverConfigured ? "Receiver configured" : "Connection not configured"} /><StatusBadge status={data.settings.autoAssignCheckout ? "active" : "info"} label={data.settings.autoAssignCheckout ? "Automatic checkout assignment enabled" : "Automatic checkout assignment off"} />{showTeam && <span>{eligible} Housekeeping staff verified on duty</span>}</div>
        {data.unassignedCheckoutTasks > 0 && <p className="workforce-notice">{data.unassignedCheckoutTasks} checkout cleaning task{data.unassignedCheckoutTasks === 1 ? "" : "s"} awaiting assignment. {data.settings.autoAssignCheckout ? "Fresh Workforce updates assign pending tasks to eligible staff by workload." : "Automatic assignment can be enabled after the Workforce connection is verified."}</p>}
        {showTeam ? <details open={!compact}><summary>Employee availability and shifts</summary><div className="workforce-table-scroll" tabIndex={0} role="region" aria-label="Employee availability table"><table><thead><tr><th>Hotel staff</th><th>Workforce employee</th><th>Availability</th><th>Shift</th><th>Last update</th><th>Open cleaning tasks</th></tr></thead><tbody>{data.staff.map(member => <tr key={member.userId}><td><b>{member.name}</b><small>{member.role.replaceAll("_", " ")}</small></td><td>{member.employeeId ?? "Not linked"}</td><td><StatusBadge status={currentStatus(member, now) === "on_duty" ? "active" : "pending"} label={WORKFORCE_STATUS_LABELS[currentStatus(member, now)]} /></td><td>{member.shiftStartsAt ? <>{formatHotelDateTime(member.shiftStartsAt)}<small>to {formatHotelDateTime(member.shiftEndsAt)}</small></> : "No shift received"}</td><td>{formatHotelDateTime(member.observedAt)}{member.validUntil && <small>Valid until {formatHotelDateTime(member.validUntil)}</small>}</td><td>{member.openTasks}</td></tr>)}</tbody></table>{data.staff.length === 0 && <p>No operational staff accounts found.</p>}</div></details>
          : data.staff.map(member => <div key={member.userId} className="workforce-own"><StatusBadge status={currentStatus(member, now) === "on_duty" ? "active" : "pending"} label={WORKFORCE_STATUS_LABELS[currentStatus(member, now)]} /><span>{member.shiftStartsAt ? `Shift ${formatHotelDateTime(member.shiftStartsAt)} to ${formatHotelDateTime(member.shiftEndsAt)}` : "Your shift has not been received."}</span><span>Last Workforce update {formatHotelDateTime(member.observedAt)}</span></div>)}
        {data.canManage && <details><summary>Configure connection and employee links</summary><p>Link employees by their reviewed Workforce ID. Linking never grants a Hotel role or changes attendance.</p>
          <form className="workforce-form" onSubmit={configure} key={data.settings.version}>
            <label>Source system<input name="source" required maxLength={120} defaultValue={data.settings.sourceSystem} /></label>
            <label>Property ID<input name="property" required maxLength={120} defaultValue={data.settings.propertyId} /></label>
            <label className="workforce-check"><input name="auto" type="checkbox" defaultChecked={data.settings.autoAssignCheckout} disabled={!data.receiverConfigured && !data.settings.autoAssignCheckout} />Automatically assign checkout cleaning</label>
            <label>Reason for settings change<input name="reason" required minLength={3} maxLength={500} /></label>
            <button type="submit" className="btn btn-primary" disabled={busy}>Save connection settings</button>
          </form>
          <form className="workforce-form" onSubmit={event => { event.preventDefault(); void save({ action: "link", userId: selected, employeeId, reason }); }}>
            <label>Hotel staff account<select required value={selected} onChange={event => { setSelected(event.target.value); setEmployeeId(""); }}><option value="">Choose staff</option>{data.staff.map(member => <option key={member.userId} value={member.userId}>{member.name} · {member.role.replaceAll("_", " ")}</option>)}</select></label>
            <label>Workforce employee ID<input required maxLength={120} value={employeeId} disabled={Boolean(selectedMember?.linkId)} onChange={event => setEmployeeId(event.target.value)} placeholder={selectedMember?.employeeId ?? "Exact employee ID"} /></label>
            <label>Reason for mapping change<input required minLength={3} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} /></label>
            <div className="workforce-actions"><button className="btn btn-primary" type="submit" disabled={busy || !selected || Boolean(selectedMember?.linkId)}>Link employee</button><button className="btn btn-secondary" type="button" disabled={busy || !selectedMember?.linkId || reason.trim().length < 3} onClick={() => void save({ action: "unlink", userId: selected, linkId: selectedMember?.linkId, reason })}>Remove employee link</button></div>
            {selectedMember?.linkId && <p>Current employee ID {selectedMember.employeeId}. Removing the link revokes its cached availability. Existing assigned tasks and audit history remain recorded.</p>}
          </form>
        </details>}
        <p className="workforce-footnote">Automatic assignment uses verified on-duty Housekeeping staff with the fewest unfinished cleaning tasks, with a random choice when tied. Workforce refreshes must arrive at least every 15 minutes.</p>
      </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
