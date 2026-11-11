"use client";

import { useRef, useState } from "react";
import { AlertTriangle, ArrowRight, ClipboardList, Printer } from "lucide-react";
import type { NightAudit } from "@/lib/hotel-operations";
import type { Role } from "@/lib/types";
import { formatHotelDateTime, formatPeso } from "@/lib/format";
import { hotelRequest, useHotelResource } from "./hotel-operations-client";

const issueLabels: Record<string,string> = {
  UNRESOLVED_ARRIVAL: "Unresolved arrival",
  UNRESOLVED_DEPARTURE: "Unresolved departure",
  OPEN_CASH_SHIFT: "Open cash shift",
  UNRECONCILED_CASH_SHIFT: "Unreconciled cash shift",
  CALENDAR_DAY_STILL_OPEN: "Calendar day still open",
  CLOSE_CUTOFF_NOT_REACHED: "Close cutoff not reached",
  LEDGER_RECONCILIATION_REQUIRED: "Ledger reconciliation required",
  FROZEN_RATES_REQUIRED: "Frozen rates required",
  PENDING_INSPECTIONS: "Pending room inspections",
  OPEN_HANDOVER_WORK: "Open handover work",
};
export function auditIssueLabel(code: string) {
  return issueLabels[code] ?? (code.charAt(0) + code.slice(1).toLowerCase().replaceAll("_"," "));
}

type Props = { role: Role; onReservation?: (id: string) => void; readOnly?: boolean };

export default function NightAuditPanel(props: Props) {
  const allowed = ["front_desk","accounting","manager","owner"].includes(props.role);
  const resource = useHotelResource<NightAudit>(allowed ? "/api/staff/night-audit" : null);
  return allowed ? <NightAuditView {...props} resource={resource} /> : null;
}

export function NightAuditView({role,onReservation,readOnly=false,resource,onOperatingDayChange}: Props & {
  resource: ReturnType<typeof useHotelResource<NightAudit>>;
  onOperatingDayChange?: () => Promise<void>;
}) {
  const {data,error:loadError,loading,refresh} = resource;
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [acknowledged,setAcknowledged] = useState("");
  const [activation,setActivation] = useState(false);
  const [done,setDone] = useState("");
  const pending = useRef<{businessDate:string;expectedVersion:number;idempotencyKey:string} | null>(null);
  const saving = useRef(false);
  const canClose = role === "accounting" && !readOnly;
  const canReconcile = ["accounting","manager","owner"].includes(role);
  const assessment = data?.active ? [data.businessDate,data.version,data.assessedAt].join(":") : "";
  const reviewed = Boolean(assessment && assessment === acknowledged);

  async function close() {
    if (!data?.active || !canClose || !reviewed || loading || loadError || data.blockers.length || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    if (pending.current?.businessDate !== data.businessDate || pending.current.expectedVersion !== data.version) {
      pending.current = {businessDate:data.businessDate,expectedVersion:data.version,idempotencyKey:crypto.randomUUID()};
    }
    try {
      const result = await hotelRequest<{business_date:string}>("/api/accounting/night-audit/close",pending.current);
      setDone("Operating day " + result.business_date + " closed.");
      pending.current = null;
      setAcknowledged("");
      await Promise.all([refresh(),onOperatingDayChange?.()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to close the operating day.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function activate() {
    if (!canClose || saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await hotelRequest("/api/staff/operational-date",{});
      setActivation(false);
      await Promise.all([refresh(),onOperatingDayChange?.()]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to activate operating-day tracking.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  const metrics = canReconcile ? data?.metrics : null;
  const recentCloses = canReconcile ? data?.recentCloses ?? [] : [];
  return <section className="hotel-audit" aria-label="Operating day and night audit">
    <article className="hotel-ops hotel-audit-sheet">
      <header className="hotel-brief-section-heading">
        <div><h2>Operating day and night audit</h2><p>Review the assessment before Accounting closes the day.</p></div>
        <div className="btn-row">
          <button type="button" className="btn btn-soft btn-sm" disabled={loading||busy} onClick={()=>{setAcknowledged("");void refresh();}}>Refresh night audit</button>
          {data?.active && <button type="button" className="btn btn-soft btn-sm" onClick={()=>window.print()}><Printer size={15} aria-hidden="true"/> Print operating-day report</button>}
        </div>
      </header>
      {(error||loadError)&&<p role="alert">{error||loadError}</p>}
      {done&&<p role="status">{done}</p>}
      {loading&&!data ? <p role="status">Loading operating-day assessment…</p> : data?.active ? <>
        <dl className="hotel-audit-dates">
          <div><dt>Operating day</dt><dd>{data.businessDate}</dd></div>
          {data.calendarDate&&<div><dt>Calendar day</dt><dd>{data.calendarDate}</dd></div>}
          {data.assessedAt&&<div><dt>Assessed at</dt><dd>{formatHotelDateTime(data.assessedAt)}</dd></div>}
        </dl>
        <div className="hotel-audit-checklists">
          <section>
            <h3><AlertTriangle size={16} aria-hidden="true"/> Required before close</h3>
            {data.blockers.length ? <ul>{data.blockers.map(({code,reservationId},index)=><li key={code+"-"+index}>
              <span>{auditIssueLabel(code)}</span>
              {reservationId&&onReservation&&<button type="button" className="btn btn-soft btn-sm" onClick={()=>onReservation(reservationId)}>Review reservation <ArrowRight size={14} aria-hidden="true"/></button>}
            </li>)}</ul> : <p>No current close blockers.</p>}
          </section>
          <section>
            <h3><ClipboardList size={16} aria-hidden="true"/> Carry-forward work</h3>
            {data.warnings.length ? <ul>{data.warnings.map(({code})=><li key={code}>{auditIssueLabel(code)}</li>)}</ul> : <p>No carry-forward warnings.</p>}
          </section>
        </div>
      </> : data ? <>
        <p>Operating-day tracking is inactive. Booking and security continue on the calendar clock.</p>
        {canClose && (activation ? <div className="hotel-audit-signoff"><p>Start with the current hotel-local date. Historical records keep their original dates.</p><button type="button" className="btn btn-accent" disabled={busy} onClick={()=>void activate()}>Confirm tracking activation</button></div>
          : <div><button type="button" className="btn btn-soft" onClick={()=>setActivation(true)}>Start operating-day tracking</button></div>)}
      </> : null}
    </article>
    {data?.active && metrics && <article className="hotel-ops hotel-audit-sheet">
      <header><h3>Reconciliation</h3><p>Live assessment · Physical occupancy measured at assessment</p></header>
      <dl className="hotel-ops-metrics">
        {Object.entries({"Booked room nights":metrics.bookedNights,"Live occupied rooms":metrics.liveOccupiedRooms,"Active capacity":metrics.capacity,"Serviceable capacity":metrics.serviceableCapacity}).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        {Object.entries({"Booked room accrual":metrics.roomAccrual,"Hotel receipts":metrics.received,"Refunds paid":metrics.refunds,"Net receipts":metrics.netReceipts,"Assessed charges":metrics.assessedCharges,"Cancellation fees (net)":metrics.cancellationFees??0,"No-show fees (net)":metrics.noShowFees??0,"Signed adjustments":metrics.adjustments,"Outstanding at assessment":metrics.outstanding}).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value===null?"Unresolved frozen rates":formatPeso(value)}</dd></div>)}
      </dl>
      <details><summary>Calculation and posting notes</summary><p>Capacity uses closing active inventory. Booked nights and physical occupancy have separate bases. Receipts include server-stamped postings after tracking starts. Earlier payments retain their original calendar timestamps.</p></details>
      {recentCloses.length>0&&<details><summary>Immutable close history · {recentCloses.length}</summary><ul className="hotel-ops-list">{recentCloses.map(close=><li key={close.business_date}>
        <strong>{close.business_date} · Closed</strong><span>Booked accrual {close.snapshot.roomAccrual===null?"Unresolved":formatPeso(close.snapshot.roomAccrual)} · Receipts {formatPeso(close.snapshot.received)} · Refunds {formatPeso(close.snapshot.refunds)}</span><small>{formatHotelDateTime(close.closed_at)}</small>
      </li>)}</ul></details>}
    </article>}
    {data?.active && canClose && <div className="hotel-ops hotel-audit-sheet hotel-audit-signoff">
      <div><label className="hotel-ops-check"><input type="checkbox" checked={reviewed} disabled={loading||busy} onChange={event=>setAcknowledged(event.target.checked?assessment:"")} />I reviewed the assessment, ledger and carry-forward work.</label>
        <small>The close rechecks blockers, saves a permanent snapshot and advances the operating day.</small></div>
      <button type="button" className="btn btn-accent" disabled={busy||loading||Boolean(loadError)||!reviewed||data.blockers.length>0} onClick={()=>void close()}>Close operating day</button>
    </div>}
  </section>;
}
