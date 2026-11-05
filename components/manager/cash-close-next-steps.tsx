"use client";
import { useEffect, useState } from "react";
import { cashDate, cashMoney, type CashRecord } from "@/lib/cash-shift-display";
import type { Role } from "@/lib/types";

type FollowUp = { handovers: { id: string; summary: string }[]; reportDate: string; report: { status: string } | null; includesClose: boolean | null };
type Props = { shift: CashRecord; role: Role; onCreateHandover: (shift: CashRecord) => void; onOpenHandovers: (id?: string) => void; onOpenReport: (date: string) => void };
export default function CashCloseNextSteps({ shift, role, onCreateHandover, onOpenHandovers, onOpenReport }: Props) {
  const [data, setData] = useState<FollowUp | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/accounting/cash-shifts/" + shift.id + "/follow-up", { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.data?.handovers) || typeof body.data?.reportDate !== "string") throw new Error(body.error || "Unavailable");
        if (!controller.signal.aborted) { setData(body.data); setError(""); }
      } catch { if (!controller.signal.aborted) { setData(null); setError("Next-step status unavailable. Retry before assuming follow-up or reporting is complete."); } }
    }
    void load(); return () => controller.abort();
  }, [shift.id, shift.status, role, retry]);
  return <section className="cash-surface cash-next-steps" aria-label="Drawer closed next steps">
    <header className="cash-panel-heading"><div><h2>Drawer closed — next steps</h2><p>#{String(shift.id).slice(0, 8)} · {cashDate(shift.closed_at)} · Recorded variance {cashMoney(shift.variance)}</p></div><button className="cash-text-action" onClick={() => setRetry(value => value + 1)}>Refresh next steps</button></header>
    <div className="cash-next-steps-body">
      <p><strong>Accounting review:</strong> {shift.status === "reconciled" ? "Reconciled" : "Awaiting reconciliation"}. The original count and variance remain recorded.</p>
      {error ? <p role="alert">{error}</p> : !data ? <p role="status">Checking saved follow-up and report status…</p> : <>
        <div><h3>Operational follow-up</h3><p>{data.handovers.length ? data.handovers.length + " unresolved handover(s) for this drawer in your department." : "No unresolved handover for this drawer in your department."}</p>
          {data.handovers.slice(0, 3).map(handover => <p key={handover.id}><button className="cash-text-action" onClick={() => onOpenHandovers(handover.id)}>{handover.summary}</button></p>)}
          <div className="btn-row"><button className="cash-button" onClick={() => onCreateHandover(shift)}>Add a concern</button><button className="cash-text-action" onClick={() => onOpenHandovers()}>View handovers</button></div>
        </div>
        <div><h3>Daily report · {data.reportDate}</h3>{role === "front_desk" ? <>
          <p>{data.report ? "Saved report: " + data.report.status.replaceAll("_", " ") : "Not submitted"}</p>
          {data.report && data.includesClose === false && <p>This drawer closed after the saved report snapshot. Open the report to review it with the Manager.</p>}
          {data.report && data.includesClose === null && <p>The saved snapshot time could not be confirmed.</p>}
          <button className="cash-button" onClick={() => onOpenReport(data.reportDate)}>Open daily report</button>
          <p className="cash-table-note">One report covers the hotel day. Preview and submit explicitly; Close does not submit it.</p>
        </> : <p>Front Desk submits the daily report. Closing this drawer does not submit it.</p>}</div>
      </>}
    </div>
  </section>;
}
