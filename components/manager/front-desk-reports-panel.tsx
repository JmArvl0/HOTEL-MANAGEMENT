"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, CalendarDays, ClipboardCheck, Download, FileText, Send, Sparkles, X } from "lucide-react";
import { AI_DISCLOSURE } from "@/lib/ai/prompts";
import { AccessibleChart } from "@/components/ui/AccessibleChart";
import { ModuleSummaryCards } from "@/components/manager/module-summary-cards";
import { TablePagination } from "@/components/ui/table-pagination";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import { HavenSkeletonCard, HavenErrorAlert } from "@/components/ui/haven-data-controls";
import { CHART_OCCUPANCY, CHART_FORECAST } from "@/lib/chart-tokens";
import { canGenerateFrontDeskReport, canReviewFrontDeskReports } from "@/lib/permissions";
import { REPORT_PAGE_SIZE } from "@/lib/front-desk-reports";
import type { DailyActivityTrendPoint, DailyReportSnapshot } from "@/lib/front-desk-reports";
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
const formatLongDate = (value: string) => new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
const formatStamp = (value: string | null) => value ? new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value)) : "—";
const required = (message: string) => (v: string | number | boolean) => (String(v ?? "").trim() ? null : message);

function CountList({ title, hint, entries }: { title: string; hint?: string; entries: Record<string, number | string> }) {
  const keys = Object.keys(entries);
  return <section><h3>{title}</h3>{hint && <p className="snapshot-hint">{hint}</p>}{keys.length ? <ul className="snapshot-list">{keys.map((key) => <li key={key}><span>{label(key)}</span><b>{entries[key]}</b></li>)}</ul> : <p className="snapshot-hint">Nothing recorded.</p>}</section>;
}

export function ReportSnapshotMetrics({ snapshot, className = "" }: { snapshot: DailyReportSnapshot; className?: string }) {
  const r = snapshot.reservations;
  return <dl className={`front-desk-report-metrics ${className}`.trim()}>
    <div><dt>Arrivals</dt><dd>{r.arrivals}</dd><small>Check-ins completed this day</small></div>
    <div><dt>Departures</dt><dd>{r.departures}</dd><small>Check-outs completed this day</small></div>
    <div><dt>New reservations</dt><dd>{r.created}</dd><small>Created on the selected day</small></div>
    <div><dt>Collections</dt><dd>{peso(snapshot.collections.total)}</dd><small>{snapshot.collections.count} settled payment{snapshot.collections.count !== 1 ? "s" : ""}</small></div>
  </dl>;
}

export function ReportSnapshotView({ snapshot, showHeader = true, showMetrics = true, collapseBreakdown = true }: { snapshot: DailyReportSnapshot; showHeader?: boolean; showMetrics?: boolean; collapseBreakdown?: boolean }) {
  const r = snapshot.reservations;
  const byMethod = snapshot.collections.byMethod ?? {};
  const cashTotal = byMethod.cash ?? 0;
  const shifts = snapshot.cashShifts;
  const breakdown = <div className="report-snapshot-breakdown">
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
    <CountList title="Reservation exceptions" entries={{ Cancellations: r.cancelled, "No-shows": r.noShow }} hint="Cancellations and no-shows recorded on this report date." />
    <CountList title="Guest requests" entries={{ Opened: snapshot.guestRequests.opened, Escalated: snapshot.guestRequests.escalated, ...snapshot.guestRequests.openByDepartment }} hint="Open requests grouped by department they are routed to." />
    {snapshot.housekeeping && <CountList title="Room care turnover" entries={{ "Tasks completed": snapshot.housekeeping.tasksCompleted, "Awaiting inspection": snapshot.housekeeping.awaitingInspection, "Avg turnaround (min)": snapshot.housekeeping.avgTurnaroundMinutes ?? "—", ...snapshot.housekeeping.byType }} hint="Completed housekeeping tasks this day, from the audited turnover workflow. Awaiting inspection counts rooms cleaned but not yet passed." />}
    <CountList title="Collections by purpose" entries={snapshot.collections.byPurpose} hint="Settled payments this day, by purpose — front-desk collections view only." />
    <CountList title="Transportation requests" entries={snapshot.transportation} hint="Requests created this day, by status." />
    <CountList title="Exception approvals raised" entries={snapshot.approvals} hint="Manager approval requests filed this day, by status." />
    <CountList title="Rooms at generation" entries={snapshot.rooms} hint="Rooms carry no per-day history — this is the live snapshot at generation time." />
  </div>;
  return <div className="report-snapshot">
    {showHeader && <header><div><p className="eyebrow">Daily Front Desk Operations Report</p><h2>{formatDate(snapshot.reportDate)}</h2></div><small>Generated {formatStamp(snapshot.generatedAt)}</small></header>}
    {showMetrics && <ReportSnapshotMetrics snapshot={snapshot}/>}
    {collapseBreakdown ? <details className="report-snapshot-details"><summary>View full daily breakdown</summary>{breakdown}</details> : breakdown}
  </div>;
}

function DailyActivityTrend({ reportDate, points }: { reportDate: string; points: DailyActivityTrendPoint[] }) {
  if (!points.length) return null;
  const hasActivity = points.some((point) => point.arrivals > 0 || point.departures > 0);
  const description = hasActivity
    ? `Daily guest movement across the selected hotel week ending ${formatDate(reportDate)}.`
    : `No arrivals or departures were recorded across the seven hotel days ending ${formatDate(reportDate)}.`;
  if (!hasActivity) return <section className="panel front-desk-activity-empty" aria-labelledby="front-desk-activity-title">
    <header><div><h2 id="front-desk-activity-title">Arrivals &amp; departures</h2><p>{description}</p></div></header>
    <div className="front-desk-zero-legend" aria-hidden="true"><span><i/>Arrivals</span><span><i/>Departures</span></div>
    <ol className="front-desk-zero-days" aria-label="Arrivals and departures by hotel day">{points.map((point) => <li key={point.date} aria-label={`${point.day}: ${point.arrivals} arrivals and ${point.departures} departures`}>
      <span>{point.day}</span><b>{point.arrivals} <small>/</small> {point.departures}</b><small>arrivals / departures</small>
    </li>)}</ol>
  </section>;
  return <AccessibleChart
    className="front-desk-activity-chart"
    data={points.map(({ day, arrivals, departures }) => ({ day, arrivals, departures }))}
    xKey="day"
    chartType="bar"
    barOrientation="vertical"
    series={[
      { key: "arrivals", label: "Arrivals", color: CHART_OCCUPANCY },
      { key: "departures", label: "Departures", color: CHART_FORECAST },
    ]}
    title="Arrivals & departures"
    description={description}
    xAxisLabel="Hotel day"
    yAxisLabel="Guest count"
    showAxisLabels={false}
    showGrid={false}
    height={185}
  />;
}

type ExecutiveDigest = { executiveOverview: string; bottlenecks: string[]; actionPlan: string[] };

// AI Executive Digest — advisory narration over the authoritative snapshot.
// Manager/Owner/Admin only; degrades to a message when Gemini is unavailable.
function ExecutiveDigestCard({ reportDate }: { reportDate: string }) {
  const [open, setOpen] = useState(false);
  const [digest, setDigest] = useState<ExecutiveDigest | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  async function refresh() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/ai/report-summary", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: reportDate, mode: "digest" })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to build the digest.");
      if (!body.data) { setDigest(null); setMessage(body.message ?? "AI assistance is temporarily unavailable."); return; }
      setDigest(body.data);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Unable to build the digest.");
    }
    setLoading(false);
  }
  return (
    <details className="panel ai-digest" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary><Sparkles size={16} aria-hidden="true" /> AI Executive Digest · {formatDate(reportDate)}</summary>
      <div className="ai-digest-body">
        <button className="btn btn-soft" onClick={() => void refresh()} disabled={loading}>
          {loading ? "Reading the day…" : digest ? "Refresh digest" : "Generate digest"}
        </button>
        {loading && <HavenSkeletonCard hasHeader />}
        {message && <p role="status">{message}</p>}
        {digest && !loading && <>
          <h4>Executive overview</h4>
          <p>{digest.executiveOverview}</p>
          {digest.bottlenecks.length > 0 && <><h4>Operational bottlenecks</h4><ul>{digest.bottlenecks.map((b, i) => <li key={i}>{b}</li>)}</ul></>}
          {digest.actionPlan.length > 0 && <><h4>Manager action plan</h4><ul>{digest.actionPlan.map((a, i) => <li key={i}>{a}</li>)}</ul></>}
          <p className="concierge-disclosure">{AI_DISCLOSURE}</p>
        </>}
      </div>
    </details>
  );
}

export default function FrontDeskReportsPanel({ role, initialDate, showHeader = true }: { role: Role; initialDate?: string; showHeader?: boolean }) {
  const [date, setDate] = useState(() => initialDate ?? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()));
  const [preview, setPreview] = useState<DailyReportSnapshot | null>(null);
  const [activityTrend, setActivityTrend] = useState<DailyActivityTrendPoint[]>([]);
  const [viewing, setViewing] = useState<ReportRow | null>(null);
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [previewError, setPreviewError] = useState("");
  const [toast, setToast] = useState("");
  const previewRequest = useRef(0);
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
      setRows(body.data.rows ?? []); setPage(body.data.page ?? 0); setPageCount(body.data.pageCount ?? 1); setTotal(body.data.total ?? 0);
      setHistoryError("");
    } catch (cause) {
      setHistoryError(cause instanceof Error ? cause.message : "Unable to load report history.");
    }
  }, [page]);
  useEffect(() => {
    let current = true;
    const initial = window.setTimeout(() => {
      void load().finally(() => { if (current) setLoading(false); });
    }, 0);
    return () => { current = false; window.clearTimeout(initial); };
  }, [load]);
  useEffect(() => {
    if (!canReview || loading) return;
    const matching = rows.filter((row) => status === "all" || row.status === status);
    setViewing((current) => matching.find((row) => row.id === current?.id) ?? matching[0] ?? null);
  }, [canReview, loading, rows, status]);

  const generate = useCallback(async (reportDate: string) => {
    const request = ++previewRequest.current;
    setBuilding(true);
    setPreviewError("");
    try {
      const response = await fetch(`/api/front-desk/reports?date=${reportDate}&trend=7d`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to build this report.");
      if (request !== previewRequest.current) return;
      setPreview(body.data); setActivityTrend(body.trend ?? []); setViewing(null);
    } catch (cause) {
      if (request === previewRequest.current) setPreviewError(cause instanceof Error ? cause.message : "Unable to build this report.");
    } finally {
      if (request === previewRequest.current) setBuilding(false);
    }
  }, []);

  useEffect(() => {
    if (!canGenerate) return;
    const initial = window.setTimeout(() => void generate(date), 0);
    return () => { window.clearTimeout(initial); previewRequest.current += 1; };
  }, [canGenerate, date, generate]);

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
  const openGuestRequests = preview ? Object.values(preview.guestRequests.openByDepartment).reduce((sum, count) => sum + Number(count || 0), 0) : 0;
  const roomsAtGeneration = preview ? Object.values(preview.rooms).reduce((sum, count) => sum + Number(count || 0), 0) : 0;
  const occupiedAtGeneration = Number(preview?.rooms.occupied ?? 0);
  const cashShiftSummary = !preview?.cashShifts
    ? "Not recorded"
    : preview.cashShifts.closed === 0
      ? "No shift closed"
      : preview.cashShifts.variance === 0
        ? `${preview.cashShifts.closed} closed · balanced`
        : `${preview.cashShifts.closed} closed · ${peso(preview.cashShifts.variance)} variance`;
  return <div className="front-desk-reports">
    {showHeader && <header className="front-desk-report-heading">
      <div className="front-desk-report-heading-copy">
        <h1>{canGenerate ? "Daily operations report" : "Front desk reports"}</h1>
        <p>{canGenerate ? "Review live daily figures, export a copy, or submit a shift snapshot to your Manager." : "Review submitted Front Desk snapshots and their current status."}</p>
      </div>
      {canGenerate && <div className="front-desk-report-heading-actions">
        <label className="front-desk-report-date">Report date<input type="date" value={date} max={today} onChange={(event) => { setDate(event.target.value); setPreview(null); setActivityTrend([]); setViewing(null); }}/></label>
        {(preview || viewing) && <button className="btn btn-soft" type="button" onClick={() => window.print()}><Download size={16} aria-hidden="true"/>Export preview</button>}
        <button className="btn btn-accent" type="button" onClick={() => void generate(date)} disabled={building}>{building ? "Building…" : <><Activity size={16} aria-hidden="true"/>Generate preview</>}</button>
      </div>}
    </header>}
    {previewError && <HavenErrorAlert title="Daily preview unavailable" body={previewError} variant="internal" />}
    {historyError && <HavenErrorAlert title="Report history unavailable" body={historyError} variant="internal" />}
    {canGenerate && building && !preview && !viewing && <HavenSkeletonCard hasHeader />}
    {canGenerate && preview && !viewing && <ReportSnapshotMetrics snapshot={preview}/>}
    {canGenerate && preview && !viewing && <div className="front-desk-report-overview-grid">
      <DailyActivityTrend reportDate={date} points={activityTrend}/>
      <article className="panel report-preview front-desk-daily-preview" aria-labelledby="front-desk-daily-preview-title">
        <div className="front-desk-preview-heading"><div><h2 id="front-desk-daily-preview-title">Daily report preview</h2><p>A current snapshot, ready for your Manager.</p></div><span className="report-preview-ready">Preview ready</span></div>
        <div className="front-desk-preview-summary">
          <span>{formatLongDate(preview.reportDate)} <small>· Generated {formatStamp(preview.generatedAt)}</small></span>
          <strong>Shift activity</strong>
          <dl aria-label="Daily shift activity">
            <div><dt>Open guest requests</dt><dd>{openGuestRequests}</dd></div>
            <div><dt>Rooms occupied</dt><dd>{occupiedAtGeneration} / {roomsAtGeneration}</dd></div>
            <div><dt>Cash shift</dt><dd>{cashShiftSummary}</dd></div>
          </dl>
        </div>
        <div className="front-desk-preview-action-row">
          <span className="front-desk-preview-submit-status"><i aria-hidden="true"/>Not submitted</span>
          <button className="btn btn-accent" type="button" onClick={() => void submit(date)}><Send size={16} aria-hidden="true"/>Submit to Manager</button>
        </div>
        <details className="report-preview-breakdown"><summary>View full report details</summary><ReportSnapshotView snapshot={preview} showHeader={false} showMetrics={false} collapseBreakdown={false}/></details>
      </article>
    </div>}
    {canGenerate && viewing && <article className="panel report-preview">
      <div className="panel-heading"><div><h3>{viewing ? `Submitted snapshot · ${formatDate(viewing.report_date)}` : "Daily report preview"}</h3><p>{viewing ? `Submitted by ${viewing.submitted_by_name ?? "Front Desk"} · ${formatStamp(viewing.submitted_at)}` : "Current figures from live hotel records for the selected hotel day."}</p></div>
      <div className="report-actions">
        <button className="btn btn-soft" type="button" onClick={() => window.print()}><Download size={16} aria-hidden="true"/>Export</button>
        <button className="btn btn-soft" type="button" onClick={() => setViewing(null)}><X size={16} aria-hidden="true"/>Close</button>
      </div></div>
      <p className="export-note">Export prints or saves this preview. It does not submit anything to the Manager.</p>
      <ReportSnapshotView snapshot={viewing.snapshot}/>
    </article>}
    {canReview && <ExecutiveDigestCard reportDate={viewing ? viewing.report_date.slice(0, 10) : date} />}
    {canReview ? <section className="manager-report-review" aria-label="Front Desk report review">
      {loading ? <HavenSkeletonCard hasHeader /> : !historyError && <>
        <ModuleSummaryCards cards={[
          { label: "Submitted", value: rows.filter((row) => row.status === "submitted").length, hint: "On this page · awaiting review", icon: Send, tone: "attention", queue: "submitted" },
          { label: "Acknowledged", value: rows.filter((row) => row.status === "acknowledged").length, hint: "On this page · reviewed and closed", icon: ClipboardCheck, tone: "done", queue: "acknowledged" },
          { label: "Returned", value: rows.filter((row) => row.status === "returned").length, hint: "On this page · needs resubmission", icon: FileText, tone: "today", queue: "returned" },
          { label: "On record", value: total, hint: "All stored snapshots", icon: CalendarDays },
        ]} activeQueue={["submitted", "acknowledged", "returned"].includes(status) ? status : undefined} onSelect={(target) => setStatus(target)} ariaLabel="Report review summary"/>
        <div className="manager-report-review-grid">
          <section className="data-panel manager-report-inbox" aria-labelledby="manager-report-inbox-title">
            <header className="report-history-heading"><div><h2 id="manager-report-inbox-title">Report inbox</h2><p>Submitted Front Desk snapshots and their current review status.</p></div></header>
            <div className="reservation-filters"><div>{["all", "submitted", "acknowledged", "returned"].map((value) => <button key={value} className={status === value ? "active" : ""} aria-pressed={status === value} onClick={() => setStatus(value)}>{value === "all" ? "All" : label(value)}</button>)}</div></div>
            <div className="manager-report-queue">{visible.map((row) => <button type="button" key={row.id} className="manager-report-queue-item" aria-pressed={viewing?.id === row.id} onClick={() => setViewing(row)}>
              <span className="manager-report-queue-top"><strong>{formatDate(row.report_date)}</strong><span className={`badge ${row.status}`}>{label(row.status)}</span></span>
              <span className="manager-report-queue-meta">{label(row.submitted_by_name)} · {formatStamp(row.submitted_at)}</span>
              <small>{row.snapshot.reservations.arrivals} arrivals · {row.snapshot.reservations.departures} departures · {peso(row.snapshot.collections.total)} collected</small>
            </button>)}</div>
            {!visible.length && <div className="empty"><FileText/><h3>No reports</h3><p>{status === "all" ? "No daily operations reports have been submitted yet." : `No ${label(status)} reports.`}</p></div>}
            <TablePagination page={page + 1} pageCount={pageCount} start={rows.length ? page * REPORT_PAGE_SIZE + 1 : 0} end={page * REPORT_PAGE_SIZE + rows.length} total={total} onPageChange={(next) => void load(next - 1)} noun="reports" note="Submitted snapshots are immutable evidence — they are never edited after submission." />
          </section>
          <section className="panel manager-report-detail" aria-labelledby="manager-report-detail-title">
            {viewing ? <>
              <div className="panel-heading"><div><p className="report-section-label">Selected submission</p><h2 id="manager-report-detail-title">Daily snapshot</h2><p>{formatDate(viewing.report_date)} · submitted by {viewing.submitted_by_name ?? "Front Desk"} · {formatStamp(viewing.submitted_at)}</p></div><span className={`badge ${viewing.status}`}>{label(viewing.status)}</span></div>
              {viewing.review_note && <p className="manager-report-review-note"><strong>Review note</strong><br/>{viewing.review_note}<br/><small>{label(viewing.reviewed_by_name)} · {formatStamp(viewing.reviewed_at)}</small></p>}
              {viewing.status === "submitted" ? <div className="manager-report-review-actions"><button className="btn btn-soft" type="button" onClick={() => void review(viewing, "return")}>Return with note</button><button className="btn btn-accent" type="button" onClick={() => void review(viewing, "acknowledge")}><ClipboardCheck size={16} aria-hidden="true"/>Acknowledge report</button></div> : <p className="manager-report-closed-note">This snapshot is {label(viewing.status)}. Its submitted values remain unchanged.</p>}
              <div className="manager-report-snapshot"><ReportSnapshotView snapshot={viewing.snapshot}/></div>
            </> : <div className="empty"><FileText/><h3 id="manager-report-detail-title">Select a report</h3><p>Choose a Front Desk submission to review its immutable snapshot.</p></div>}
          </section>
        </div>
      </>}
    </section> : <section className="front-desk-history-panel" aria-labelledby="front-desk-report-history-title">
      <header className="front-desk-history-heading">
        <div><h2 id="front-desk-report-history-title">Submission history</h2><p>Your daily snapshots and their Manager review status.</p></div>
        <div className="front-desk-history-filters" role="group" aria-label="Filter reports by status">{["all", "submitted", "acknowledged", "returned"].map((value) => <button type="button" key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{value === "all" ? "All reports" : label(value)}</button>)}</div>
      </header>
      {loading ? <HavenSkeletonCard hasHeader /> : !historyError && <div className="data-panel front-desk-history-table"><div className="table-scroll"><table aria-label="Front desk report history"><thead><tr><th>Report date</th><th>Submitted</th><th>By</th><th>Status</th><th>Review</th><th>Actions</th></tr></thead>
      <tbody>{visible.map((row) => <tr key={row.id}>
        <td><strong>{formatDate(row.report_date)}</strong>{row.supersedes && <><br/><small>Resubmission</small></>}</td>
        <td>{formatStamp(row.submitted_at)}</td>
        <td>{label(row.submitted_by_name)}</td>
        <td><span className={`badge ${row.status}`}>{label(row.status)}</span></td>
        <td>{row.review_note ? <small>{row.review_note}<br/>{label(row.reviewed_by_name)} · {formatStamp(row.reviewed_at)}</small> : "—"}</td>
        <td><div className="reservation-actions">
          <button className="table-action action-neutral" onClick={() => { setViewing(row); window.scrollTo({ top: 0, behavior: "smooth" }); }}>View snapshot</button>
          {canGenerate && row.status === "returned" && <button className="table-action" onClick={() => void submit(row.report_date, row.id)}>Resubmit</button>}
        </div></td>
      </tr>)}</tbody></table></div>
      {!loading && !historyError && !visible.length && <div className="empty front-desk-history-empty"><FileText/><h3>No reports</h3><p>{status === "all" ? "No daily operations reports have been submitted yet." : `No ${label(status)} reports.`}</p></div>}
      <TablePagination page={page + 1} pageCount={pageCount} start={rows.length ? page * REPORT_PAGE_SIZE + 1 : 0} end={page * REPORT_PAGE_SIZE + rows.length} total={total} onPageChange={(next) => void load(next - 1)} noun="reports" note="Submitted snapshots are immutable evidence — they are never edited after submission." /></div>}
    </section>}
    {toast && <div className="toast"><ClipboardCheck size={18}/>{toast}</div>}
    {dialogs.view}
  </div>;
}
