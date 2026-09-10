"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, ClipboardCheck, Download, FileText, Send, X } from "lucide-react";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import { canGenerateFrontDeskReport, canReviewFrontDeskReports } from "@/lib/permissions";
import type { DailyReportSnapshot } from "@/lib/front-desk-reports";
import type { Role } from "@/lib/types";

// Centralized daily operations reporting. Front Desk previews, exports
// (print/PDF — never a submission), and submits one immutable snapshot per
// hotel day; the Manager acknowledges or returns it. Everything the buttons
// do is re-authorized server-side by the route guards and RPC role gates.
type ReportRow = {
  id: string; report_date: string; status: string; submitted_at: string; submitted_by_name?: string | null;
  reviewed_at: string | null; reviewed_by_name?: string | null; review_note: string | null;
  supersedes: string | null; version: number; snapshot: DailyReportSnapshot;
};

const label = (value: unknown) => String(value ?? "—").replaceAll("_", " ");
const peso = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number(value || 0));
const formatDate = (value: string) => new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
const formatStamp = (value: string | null) => value ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—";
const required = (message: string) => (v: string | number | boolean) => (String(v ?? "").trim() ? null : message);

function CountList({ title, hint, entries }: { title: string; hint?: string; entries: Record<string, number | string> }) {
  const keys = Object.keys(entries);
  return <section><h3>{title}</h3>{hint && <p className="snapshot-hint">{hint}</p>}{keys.length ? <ul className="snapshot-list">{keys.map((key) => <li key={key}><span>{label(key)}</span><b>{entries[key]}</b></li>)}</ul> : <p className="snapshot-hint">Nothing recorded.</p>}</section>;
}

export function ReportSnapshotView({ snapshot }: { snapshot: DailyReportSnapshot }) {
  const r = snapshot.reservations;
  const byMethod = snapshot.collections.byMethod ?? {};
  const cashTotal = byMethod.cash ?? 0;
  const shifts = snapshot.cashShifts;
  return <div className="report-snapshot">
    <header><div><p className="eyebrow">Daily Front Desk Operations Report</p><h2>{formatDate(snapshot.reportDate)}</h2></div><small>Generated {formatStamp(snapshot.generatedAt)}</small></header>
    <div className="metric-grid">
      <article className="metric-card"><div><span>New reservations</span><b>{r.created}</b><small>{Object.entries(r.bySource).map(([source, count]) => `${count} ${label(source)}`).join(" · ") || "None"}</small></div><i><CalendarDays size={21}/></i></article>
      <article className="metric-card"><div><span>Arrivals / departures</span><b>{r.arrivals} / {r.departures}</b><small>Check-ins and check-outs this day</small></div><i><CalendarDays size={21}/></i></article>
      <article className="metric-card"><div><span>Cancellations / no-shows</span><b>{r.cancelled} / {r.noShow}</b><small>Recorded this day</small></div><i><ClipboardCheck size={21}/></i></article>
      <article className="metric-card"><div><span>Collections</span><b>{peso(snapshot.collections.total)}</b><small>{snapshot.collections.count} settled payment{snapshot.collections.count !== 1 ? "s" : ""}</small></div><i><Send size={21}/></i></article>
    </div>
    <section>
      <h3>Payments &amp; cash collection</h3>
      <p className="snapshot-hint">Settled payments this day by method. Cash counts toward the shift&apos;s expected cash on hand.</p>
      {Object.keys(byMethod).length
        ? <ul className="snapshot-list">{Object.entries(byMethod).map(([method, total]) => <li key={method}><span>{label(method)}</span><b>{peso(total)}</b></li>)}</ul>
        : <p className="snapshot-hint">Cash breakdown not recorded in this snapshot.</p>}
      {cashTotal > 0 && <p className="snapshot-hint">Cash received: <b>{peso(cashTotal)}</b></p>}
      {shifts && (shifts.closed > 0
        ? <ul className="snapshot-list">
            <li><span>Shifts closed</span><b>{shifts.closed}</b></li>
            <li><span>Counted cash</span><b>{peso(shifts.counted)}</b></li>
            <li><span>Expected cash</span><b>{peso(shifts.expected)}</b></li>
            <li><span>Variance</span><b>{peso(shifts.variance)}</b></li>
          </ul>
        : <p className="snapshot-hint">No cash shifts were closed on this day.</p>)}
    </section>
    <CountList title="Guest requests" entries={{ Opened: snapshot.guestRequests.opened, Escalated: snapshot.guestRequests.escalated, ...snapshot.guestRequests.openByDepartment }} hint="Open requests grouped by department they are routed to." />
    {snapshot.housekeeping && <CountList title="Room care turnover" entries={{ "Tasks completed": snapshot.housekeeping.tasksCompleted, "Awaiting inspection": snapshot.housekeeping.awaitingInspection, "Avg turnaround (min)": snapshot.housekeeping.avgTurnaroundMinutes ?? "—", ...snapshot.housekeeping.byType }} hint="Completed housekeeping tasks this day, from the audited turnover workflow. Awaiting inspection counts rooms cleaned but not yet passed." />}
    <CountList title="Collections by purpose" entries={snapshot.collections.byPurpose} hint="Settled payments this day, by purpose — front-desk collections view only." />
    <CountList title="Transportation requests" entries={snapshot.transportation} hint="Requests created this day, by status." />
    <CountList title="Exception approvals raised" entries={snapshot.approvals} hint="Manager approval requests filed this day, by status." />
    <CountList title="Rooms at generation" entries={snapshot.rooms} hint="Rooms carry no per-day history — this is the live snapshot at generation time." />
  </div>;
}

export default function FrontDeskReportsPanel({ role }: { role: Role }) {
  const [date, setDate] = useState(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()));
  const [preview, setPreview] = useState<DailyReportSnapshot | null>(null);
  const [viewing, setViewing] = useState<ReportRow | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const dialogs = useActionDialogs();
  const canGenerate = canGenerateFrontDeskReport(role);
  const canReview = canReviewFrontDeskReports(role);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2600); };

  const load = useCallback(async (nextPage = page) => {
    try {
      const response = await fetch(`/api/front-desk/reports?page=${nextPage}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to load report history.");
      setRows(body.data.rows ?? []); setPage(body.data.page ?? 0); setPageCount(body.data.pageCount ?? 1);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load report history.");
    }
  }, [page]);
  useEffect(() => { void load(); setLoading(false); }, [load]);

  async function generate() {
    setBuilding(true);
    try {
      const response = await fetch(`/api/front-desk/reports?date=${date}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to build this report.");
      setPreview(body.data); setViewing(null); setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to build this report.");
    }
    setBuilding(false);
  }

  async function submit(reportDate: string, supersedes?: string) {
    const ok = await dialogs.askConfirm({
      title: supersedes ? "Resubmit report to Manager" : "Submit report to Manager",
      message: `This stores an immutable snapshot of the ${formatDate(reportDate)} report and notifies the Manager for review. Exporting beforehand never submits anything.`,
      confirmText: "Submit to Manager", cancelText: "Not yet"
    });
    if (!ok) return;
    const response = await fetch("/api/front-desk/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reportDate, supersedes }) });
    const body = await response.json();
    if (!response.ok) { notify(body.error ?? "Unable to submit this report."); return; }
    notify(supersedes ? "Report resubmitted to the Manager." : "Report submitted to the Manager."); await load();
  }

  async function review(row: ReportRow, decision: "acknowledge" | "return") {
    let note = "";
    if (decision === "return") {
      const data = await dialogs.askForm({
        title: "Return report to Front Desk", description: `${formatDate(row.report_date)} · submitted ${formatStamp(row.submitted_at)}.`,
        fields: [{ key: "note", label: "What needs to be corrected before resubmission?", type: "textarea", rows: 3, required: true, validation: required("A note is required when returning a report.") }],
        submitText: "Return report"
      });
      if (!data) return;
      note = String(data.note).trim();
    } else {
      const ok = await dialogs.askConfirm({ title: "Acknowledge report", message: `Acknowledge the ${formatDate(row.report_date)} daily operations report from ${row.submitted_by_name ?? "Front Desk"}?`, confirmText: "Acknowledge", cancelText: "Cancel" });
      if (!ok) return;
    }
    const response = await fetch(`/api/front-desk/reports/${row.id}/review`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note, version: row.version }) });
    const body = await response.json();
    if (!response.ok) { notify(body.error ?? "Unable to review this report."); return; }
    notify(decision === "acknowledge" ? "Report acknowledged." : "Report returned to Front Desk."); await load();
  }

  const visible = rows.filter((row) => status === "all" || row.status === status);
  return <>
    <div className="page-title module-title">
      <div><p className="eyebrow">{canGenerate ? "Hotel operations" : "Management control"}</p><h1>{canGenerate ? "Daily operations report" : "Front desk reports"}</h1>
      <p>{canGenerate ? "One daily snapshot of front desk operations. Export prints or saves the preview — it never submits. Submitting stores an immutable snapshot for Manager review." : "Daily front desk operations snapshots submitted for review. Acknowledge to close, or return with a note for resubmission."}</p></div>
      {canGenerate && <div className="report-tools"><label>Report date<input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)}/></label><button className="btn btn-accent" onClick={() => void generate()} disabled={building}>{building ? "Building…" : "Generate preview"}</button></div>}
    </div>
    {error && <div className="empty"><FileText/><h3>Reports unavailable</h3><p>{error}</p></div>}
    {(preview || viewing) && <article className="panel report-preview">
      <div className="panel-heading"><div><h3>{viewing ? `Submitted snapshot · ${formatDate(viewing.report_date)}` : "Preview"}</h3><p>{viewing ? `Submitted by ${viewing.submitted_by_name ?? "Front Desk"} · ${formatStamp(viewing.submitted_at)}` : "Auto-generated from live hotel records for the selected hotel day."}</p></div>
      <div className="report-actions">
        <button className="btn btn-soft" onClick={() => window.print()}><Download size={16}/> Export</button>
        {canGenerate && preview && <button className="btn btn-accent" onClick={() => void submit(date)}><Send size={16}/> Submit to Manager</button>}
        {viewing && <button className="btn btn-soft" onClick={() => setViewing(null)}><X size={16}/> Close</button>}
      </div></div>
      <p className="export-note">Export prints or saves this preview. It does not submit anything to the Manager.</p>
      <ReportSnapshotView snapshot={viewing ? viewing.snapshot : preview!}/>
    </article>}
    <div className="reservation-filters"><div>{["all", "submitted", "acknowledged", "returned"].map((value) => <button key={value} className={status === value ? "active" : ""} onClick={() => setStatus(value)}>{label(value)}</button>)}</div></div>
    <div className="data-panel"><div className="table-scroll"><table aria-label="Front desk report history"><thead><tr><th>Report date</th><th>Submitted</th><th>By</th><th>Status</th><th>Review</th><th>Actions</th></tr></thead>
      <tbody>{visible.map((row) => <tr key={row.id}>
        <td><strong>{formatDate(row.report_date)}</strong>{row.supersedes && <><br/><small>Resubmission</small></>}</td>
        <td>{formatStamp(row.submitted_at)}</td>
        <td>{label(row.submitted_by_name)}</td>
        <td><span className={`badge ${row.status}`}>{label(row.status)}</span></td>
        <td>{row.review_note ? <small>{row.review_note}<br/>{label(row.reviewed_by_name)} · {formatStamp(row.reviewed_at)}</small> : "—"}</td>
        <td><div className="reservation-actions">
          <button className="table-action view-action" onClick={() => { setViewing(row); setPreview(null); window.scrollTo({ top: 0, behavior: "smooth" }); }}>View snapshot</button>
          {canGenerate && row.status === "returned" && <button className="table-action" onClick={() => void submit(row.report_date, row.id)}>Resubmit</button>}
          {canReview && row.status === "submitted" && <><button className="table-action view-action" onClick={() => void review(row, "acknowledge")}>Acknowledge</button><button className="table-action" onClick={() => void review(row, "return")}>Return</button></>}
        </div></td>
      </tr>)}</tbody></table></div>
      {!visible.length && <div className="empty"><FileText/><h3>No reports</h3><p>{status === "all" ? "No daily operations reports have been submitted yet." : `No ${label(status)} reports.`}</p></div>}
      <div className="table-footer">Page {page + 1} of {pageCount} · {rows.length} on this page
        <span className="report-pager"><button className="table-action" disabled={page <= 0} onClick={() => void load(page - 1)}>Previous</button><button className="table-action" disabled={page + 1 >= pageCount} onClick={() => void load(page + 1)}>Next</button></span>
        <span>Submitted snapshots are immutable evidence — they are never edited after submission.</span>
      </div></div>
    {loading && <div className="empty"><ClipboardCheck/><h3>Loading reports…</h3></div>}
    {toast && <div className="toast"><ClipboardCheck size={18}/>{toast}</div>}
    {dialogs.view}
  </>;
}
