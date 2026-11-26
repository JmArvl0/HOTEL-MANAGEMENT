"use client";

import { useState, type ReactNode } from "react";
import {
  Activity, ArrowDownToLine, BarChart3, Building2, CalendarDays,
  Check, CheckCircle2, ClipboardCheck, Clock3, FileText, LockKeyhole,
  RotateCcw, Send, ShieldCheck, Wallet,
  type LucideIcon,
} from "lucide-react";
import styles from "./reports-permission-prototype.module.css";

type ReportRole = "front_desk" | "manager" | "accounting" | "admin" | "owner";
type ReportStatus = "submitted" | "acknowledged" | "returned";

const roles: { id: ReportRole; label: string; detail: string; Icon: LucideIcon }[] = [
  { id: "front_desk", label: "Front Desk", detail: "Daily report", Icon: ClipboardCheck },
  { id: "manager", label: "Manager", detail: "Performance & review", Icon: BarChart3 },
  { id: "accounting", label: "Accounting", detail: "Financial analysis", Icon: Wallet },
  { id: "admin", label: "Admin", detail: "Account governance", Icon: ShieldCheck },
  { id: "owner", label: "Owner", detail: "Executive summary", Icon: Building2 },
];

const roleContent: Record<ReportRole, {
  title: string; description: string; scope: string; includes: string[]; actions: string[]; boundary: string;
}> = {
  front_desk: {
    title: "Daily operations report",
    description: "Prepare one clear shift snapshot, then send it to the Manager for review.",
    scope: "Selected-day Front Desk activity and your report submission history.",
    includes: ["Arrivals, departures and new reservations", "Settled collections summary", "Submitted report status"],
    actions: ["Generate preview", "Submit snapshot", "Export preview"],
    boundary: "Manager review controls and property-wide performance analytics are not shown.",
  },
  manager: {
    title: "Operations & review",
    description: "One workspace for property performance and the Front Desk reports that need your decision.",
    scope: "Property-level performance and submitted Front Desk snapshots.",
    includes: ["Occupancy and room readiness", "Daily report submissions and history", "Manager review status"],
    actions: ["Acknowledge report", "Return with a note", "Export summary"],
    boundary: "Front Desk submission controls and account-governance details are not shown.",
  },
  accounting: {
    title: "Financial performance",
    description: "Review collection and operating-day figures with the existing accounting controls kept separate.",
    scope: "Financial summaries, occupancy context and read-only Night Audit evidence.",
    includes: ["Collection and refund summaries", "Booked occupancy context", "Night Audit review"],
    actions: ["Export summary"],
    boundary: "Front Desk report submission and Manager review actions are not shown.",
  },
  admin: {
    title: "Account & configuration summary",
    description: "Monitor account distribution and hotel configuration without entering operational or financial workflows.",
    scope: "Account totals, role distribution and configuration counts.",
    includes: ["Accounts by role", "Account status totals", "Configuration summary"],
    actions: ["View role counts", "Export governance summary"],
    boundary: "Guest-level records, transaction values and operational execution controls are not shown.",
  },
  owner: {
    title: "Seven-day operating summary",
    description: "A concise executive view of occupancy, net receipts, serviceability and owner-level exceptions.",
    scope: "Property-wide operating and financial aggregates with day-by-day trends.",
    includes: ["Booked occupancy and collections trends", "Net revenue and blocked-room totals", "Pending Owner exceptions"],
    actions: ["Export executive summary"],
    boundary: "Account-level personal details and transaction-level execution controls are not shown.",
  },
};

const week = ["Nov 7", "Nov 8", "Nov 9", "Nov 10", "Nov 11", "Nov 12", "Nov 13"];
const fdTrend = [
  { label: "Arrivals", color: "#1b7b81", values: [5, 7, 6, 9, 8, 11, 12] },
  { label: "Departures", color: "#b98b46", values: [4, 6, 8, 5, 7, 9, 10] },
];
const collectionTrend = [
  { label: "Collected", color: "#1b7b81", values: [62, 78, 70, 96, 88, 113, 126] },
  { label: "Refunded", color: "#c46a62", values: [12, 8, 15, 7, 11, 16, 9] },
];
const occupancyTrend = [58, 62, 64, 69, 66, 71, 74];
const reportRows: { id: string; date: string; submitted: string; by: string; summary: string; status: ReportStatus }[] = [
  { id: "FD-1113", date: "Nov 13, 2026", submitted: "2:35 PM", by: "M. Santos", summary: "12 arrivals · 10 departures · ₱42,680 collected", status: "submitted" },
  { id: "FD-1112", date: "Nov 12, 2026", submitted: "11:58 PM", by: "A. Reyes", summary: "9 arrivals · 8 departures · ₱38,240 collected", status: "returned" },
  { id: "FD-1111", date: "Nov 11, 2026", submitted: "11:46 PM", by: "M. Santos", summary: "8 arrivals · 7 departures · ₱34,900 collected", status: "acknowledged" },
];
const roleCounts = [
  { label: "Front Desk", value: 12, color: "#1b7b81" },
  { label: "Housekeeping", value: 8, color: "#678e76" },
  { label: "Accounting", value: 4, color: "#b98b46" },
  { label: "Manager", value: 3, color: "#7589aa" },
  { label: "Admin & Owner", value: 2, color: "#9a7b9d" },
  { label: "Guest accounts", value: 19, color: "#9aa8a7" },
];

type Metric = { label: string; value: string; note: string };

function MetricBand({ items }: { items: Metric[] }) {
  return <dl className={styles.metricBand}>{items.map((item) => <div key={item.label}>
    <dt>{item.label}</dt><dd>{item.value}</dd><small>{item.note}</small>
  </div>)}</dl>;
}

function SectionHeading({ title, note, action }: { title: string; note?: string; action?: ReactNode }) {
  return <div className={styles.sectionHeading}><div><h2>{title}</h2>{note && <p>{note}</p>}</div>{action}</div>;
}

function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`${styles.panel} ${className}`.trim()}>{children}</section>;
}

function MiniBarChart({
  title, note, labels, series, suffix = "", stacked = false,
}: {
  title: string; note: string; labels: string[];
  series: { label: string; color: string; values: number[] }[]; suffix?: string; stacked?: boolean;
}) {
  const max = Math.max(...series.flatMap((item) => item.values), 1);
  return <Panel>
    <SectionHeading title={title} note={note} />
    <div className={styles.chartLegend}>{series.map((item) => <span key={item.label}><i style={{ backgroundColor: item.color }} />{item.label}</span>)}</div>
    <div className={`${styles.barChart} ${stacked ? styles.barChartStacked : ""}`} role="img" aria-label={`${title}. ${series.map((item) => `${item.label}: ${item.values.join(", ")}`).join(". ")}`}>
      {labels.map((label, index) => <div className={styles.barColumn} key={label}>
        <div className={styles.barTrack}>
          {series.map((item) => <i key={item.label} title={`${item.label}: ${item.values[index]}${suffix}`} style={{ height: `${Math.max(4, item.values[index] / max * 100)}%`, backgroundColor: item.color }} />)}
        </div><small>{label}</small>
      </div>)}
    </div>
    <p className={styles.chartFootnote}>Illustrative values · no live records loaded</p>
  </Panel>;
}

function ScopePanel({ role }: { role: ReportRole }) {
  const content = roleContent[role];
  return <aside className={styles.scopePanel} aria-labelledby="role-scope-title">
    <div className={styles.scopeTitle}><span><LockKeyhole size={16} aria-hidden="true" /></span><div><h2 id="role-scope-title">Role scope</h2><p>{roles.find((item) => item.id === role)?.label} view</p></div></div>
    <p className={styles.scopeDescription}>{content.scope}</p>
    <h3>Included</h3>
    <ul className={styles.scopeList}>{content.includes.map((item) => <li key={item}><Check size={14} aria-hidden="true" />{item}</li>)}</ul>
    <h3>Available here</h3>
    <ul className={styles.actionList}>{content.actions.map((item) => <li key={item}>{item}</li>)}</ul>
    <p className={styles.boundaryNote}>{content.boundary}</p>
  </aside>;
}

function EmptySelection({ label }: { label: string }) {
  return <div className={styles.emptySelection}><FileText size={22} aria-hidden="true" /><strong>{label}</strong><span>Choose a report to see its summary and available review actions.</span></div>;
}

export default function ReportsPermissionPrototype() {
  const [role, setRole] = useState<ReportRole>("front_desk");
  const [managerTab, setManagerTab] = useState<"performance" | "daily">("daily");
  const [selectedReport, setSelectedReport] = useState(reportRows[0].id);
  const [reportStatuses, setReportStatuses] = useState<Record<string, ReportStatus>>({});
  const [frontDeskSubmitted, setFrontDeskSubmitted] = useState(false);
  const [previewReady, setPreviewReady] = useState(true);
  const [reviewNote, setReviewNote] = useState("");
  const [notice, setNotice] = useState("");
  const copy = roleContent[role];
  const selected = reportRows.find((item) => item.id === selectedReport);
  const selectedStatus = selected ? reportStatuses[selected.id] ?? selected.status : undefined;

  function selectRole(nextRole: ReportRole) {
    setRole(nextRole);
    setNotice("");
    setReviewNote("");
  }

  function printPreview() {
    setNotice("Print preview contains sample figures only.");
    window.print();
  }

  function setManagerStatus(nextStatus: ReportStatus) {
    if (!selected) return;
    setReportStatuses((current) => ({ ...current, [selected.id]: nextStatus }));
    setNotice(nextStatus === "acknowledged" ? "Sample report acknowledged in this prototype." : "Sample report returned in this prototype.");
    setReviewNote("");
  }

  return <div className={styles.page}>
    <aside className={styles.sidebar}>
      <div className={styles.brand}><span className={styles.brandMark}><Building2 size={19} aria-hidden="true" /></span><div><strong>HAVEN</strong><small>REPORTS PREVIEW</small></div></div>
      <div className={styles.sidebarIntro}><h2>Choose an account view</h2><p>Each role gets one report workspace with only its permitted data and actions.</p></div>
      <div className={styles.roleLabel}>PREVIEW AS</div>
      <nav className={styles.roleList} aria-label="Report account prototypes">
        {roles.map(({ id, label, detail, Icon }) => <button type="button" key={id} onClick={() => selectRole(id)} className={role === id ? styles.roleActive : ""} aria-current={role === id ? "page" : undefined}>
          <span className={styles.roleIcon}><Icon size={17} aria-hidden="true" /></span><span className={styles.roleCopy}><strong>{label}</strong><small>{detail}</small></span>{role === id && <span className={styles.roleDot} aria-hidden="true" />}
        </button>)}
      </nav>
      <div className={styles.sidebarFoot}><ShieldCheck size={16} aria-hidden="true" /><span>Production authorization remains server-enforced.</span></div>
    </aside>

    <main className={styles.main}>
      <div className={styles.prototypeNotice}><span>UI PROTOTYPE</span><p>Sample figures only · no live data is read and no system action is submitted.</p></div>
      <header className={styles.topbar}><div className={styles.crumb}><span>Haven</span><b>/</b><strong>Reports</strong></div><div className={styles.currentRole}><ShieldCheck size={15} aria-hidden="true" /><span>{roles.find((item) => item.id === role)?.label} permissions</span></div></header>

      <div className={styles.workspace}>
        <section className={styles.pageHead}>
          <div><h1>{copy.title}</h1><p>{copy.description}</p></div>
          <div className={styles.headActions}>
            {role === "front_desk" && <label className={styles.dateControl}>Report date<input type="date" defaultValue="2026-11-13" /></label>}
            {role === "manager" && <span className={styles.rangeControl}><CalendarDays size={15} aria-hidden="true" />Nov 7–13, 2026</span>}
            <button type="button" className={styles.secondaryButton} onClick={printPreview}><ArrowDownToLine size={16} aria-hidden="true" />Export preview</button>
            {role === "front_desk" && <button type="button" className={styles.primaryButton} onClick={() => { setPreviewReady(true); setNotice("Daily preview refreshed with sample figures."); }}><Activity size={16} aria-hidden="true" />Generate preview</button>}
          </div>
        </section>

        {notice && <div className={styles.notice} role="status"><CheckCircle2 size={16} aria-hidden="true" />{notice}<button type="button" onClick={() => setNotice("")} aria-label="Dismiss message">×</button></div>}

        <div className={styles.contentGrid}>
          <div className={styles.primaryColumn}>
            {role === "front_desk" && <FrontDeskView previewReady={previewReady} submitted={frontDeskSubmitted} onSubmit={() => { setFrontDeskSubmitted(true); setNotice("Sample report submitted in this prototype only."); }} />}
            {role === "manager" && <ManagerView tab={managerTab} onTabChange={setManagerTab} selectedReport={selectedReport} onSelectReport={setSelectedReport} selected={selected} selectedStatus={selectedStatus} note={reviewNote} onNoteChange={setReviewNote} onDecision={setManagerStatus} statuses={reportStatuses} />}
            {role === "accounting" && <AccountingView />}
            {role === "admin" && <AdminView />}
            {role === "owner" && <OwnerView />}
          </div>
          <ScopePanel role={role} />
        </div>
        <footer className={styles.dataFoot}><LockKeyhole size={14} aria-hidden="true" /><span>Role selection only changes this local preview. Existing login, API and database permission checks are untouched.</span><span className={styles.sampleTag}>SAMPLE DATA</span></footer>
      </div>
    </main>
  </div>;
}

function FrontDeskView({ previewReady, submitted, onSubmit }: { previewReady: boolean; submitted: boolean; onSubmit: () => void }) {
  return <>
    <MetricBand items={[
      { label: "Arrivals", value: "12", note: "Check-ins completed today" },
      { label: "Departures", value: "10", note: "Check-outs completed today" },
      { label: "New reservations", value: "4", note: "Created today" },
      { label: "Collections", value: "₱42,680", note: "Settled payments today" },
    ]} />
    <div className={styles.panelGrid}>
      <MiniBarChart title="Arrivals & departures" note="Daily guest movement across the selected hotel week." labels={week} series={fdTrend} />
      <Panel className={styles.dailyPreview}>
        <SectionHeading title="Daily report preview" note="A current snapshot, ready for your Manager." action={<span className={styles.statusPill}>{previewReady ? "Preview ready" : "Needs refresh"}</span>} />
        <div className={styles.snapshotSummary}><span>Friday · November 13, 2026</span><strong>Shift activity</strong><dl><div><dt>Open guest requests</dt><dd>6</dd></div><div><dt>Rooms occupied</dt><dd>34 / 48</dd></div><div><dt>Cash shift</dt><dd>Closed · balanced</dd></div></dl></div>
        <div className={styles.actionRow}><span className={`${styles.statusText} ${submitted ? styles.statusDone : ""}`}><span />{submitted ? "Submitted · prototype" : "Not submitted"}</span><button type="button" disabled={!previewReady || submitted} className={styles.primaryButton} onClick={onSubmit}><Send size={15} aria-hidden="true" />{submitted ? "Submitted" : "Submit to Manager"}</button></div>
      </Panel>
    </div>
    <Panel>
      <SectionHeading title="Submission history" note="Your daily snapshots and their Manager review status." action={<button type="button" className={styles.textButton} onClick={() => window.print()}>View printable history</button>} />
      <ReportTable rows={[
        { cells: ["Nov 12, 2026", "You", "Acknowledged", "9 arrivals · 8 departures · ₱38,240 collected"], status: "acknowledged" },
        { cells: ["Nov 11, 2026", "You", "Returned", "8 arrivals · 7 departures · Review note available"], status: "returned" },
      ]} />
    </Panel>
  </>;
}

function ManagerView({
  tab, onTabChange, selectedReport, onSelectReport, selected, selectedStatus, note, onNoteChange, onDecision, statuses,
}: {
  tab: "performance" | "daily"; onTabChange: (tab: "performance" | "daily") => void;
  selectedReport: string; onSelectReport: (id: string) => void; selected: typeof reportRows[number] | undefined;
  selectedStatus: ReportStatus | undefined; note: string; onNoteChange: (value: string) => void;
  onDecision: (status: ReportStatus) => void; statuses: Record<string, ReportStatus>;
}) {
  return <>
    <MetricBand items={[
      { label: "Collections today", value: "₱126,400", note: "₱9,200 refunds · sample" },
      { label: "Booked occupancy", value: "74%", note: "+16 points across 7 days" },
      { label: "Operational readiness", value: "94%", note: "45 of 48 rooms serviceable" },
      { label: "Reports to review", value: String(reportRows.filter((row) => (statuses[row.id] ?? row.status) === "submitted").length), note: "Awaiting Manager decision" },
    ]} />
    <div className={styles.viewTabs} role="group" aria-label="Manager report views">
      <button type="button" aria-pressed={tab === "daily"} onClick={() => onTabChange("daily")}><FileText size={15} aria-hidden="true" />Daily report review <span>{reportRows.filter((row) => (statuses[row.id] ?? row.status) === "submitted").length}</span></button>
      <button type="button" aria-pressed={tab === "performance"} onClick={() => onTabChange("performance")}><BarChart3 size={15} aria-hidden="true" />Performance</button>
    </div>
    {tab === "performance" ? <div className={styles.panelGrid}>
      <MiniBarChart title="Booked occupancy" note="Room nights covered by reservations; this is not live room occupancy." labels={week} series={[{ label: "Booked occupancy", color: "#1b7b81", values: occupancyTrend }]} suffix="%" />
      <Panel>
        <SectionHeading title="Room readiness" note="Live inventory mix from the room rack." />
        <DistributionList rows={[{ label: "Ready", value: 36, total: 48, color: "#41856e" }, { label: "Needs turnover", value: 9, total: 48, color: "#bd8b3d" }, { label: "Out of service", value: 3, total: 48, color: "#bb625b" }]} />
        <div className={styles.inlineNote}><Clock3 size={15} aria-hidden="true" />Night Audit evidence remains in the separate read-only section.</div>
      </Panel>
    </div> : <div className={styles.reviewWorkspace}>
      <Panel className={styles.reportQueue}>
        <SectionHeading title="Report inbox" note="Submitted Front Desk snapshots." action={<span className={styles.countBadge}>{reportRows.filter((row) => (statuses[row.id] ?? row.status) === "submitted").length} pending</span>} />
        <div className={styles.queueList}>{reportRows.map((row) => {
          const status = statuses[row.id] ?? row.status;
          return <button type="button" key={row.id} className={selectedReport === row.id ? styles.queueSelected : ""} onClick={() => onSelectReport(row.id)}>
            <span className={styles.queueTop}><strong>{row.date}</strong><StatusBadge status={status} /></span><span>{row.by} · {row.submitted}</span><small>{row.summary}</small>
          </button>;
        })}</div>
      </Panel>
      <Panel className={styles.reportDetail}>
        {selected ? <>
          <SectionHeading title="Daily snapshot" note={`${selected.date} · submitted by ${selected.by}`} action={<StatusBadge status={selectedStatus ?? selected.status} />} />
          <div className={styles.reviewStats}><div><span>Arrivals</span><strong>12</strong></div><div><span>Departures</span><strong>10</strong></div><div><span>Collections</span><strong>₱42,680</strong></div></div>
          <div className={styles.reviewBasis}><strong>Review basis</strong><p>Snapshot values are fixed at submission. Review closes this version or returns it with a correction note.</p></div>
          {selectedStatus === "submitted" ? <div className={styles.reviewActions}>
            <label>Return note<textarea value={note} onChange={(event) => onNoteChange(event.target.value)} placeholder="Explain what Front Desk should correct…" rows={3} /></label>
            <div><button type="button" className={styles.secondaryButton} disabled={!note.trim()} onClick={() => onDecision("returned")}><RotateCcw size={15} aria-hidden="true" />Return with note</button><button type="button" className={styles.primaryButton} onClick={() => onDecision("acknowledged")}><CheckCircle2 size={15} aria-hidden="true" />Acknowledge</button></div>
          </div> : <p className={styles.closedNote}><CheckCircle2 size={16} aria-hidden="true" />This sample report is already {selectedStatus}.</p>}
        </> : <EmptySelection label="No report selected" />}
      </Panel>
    </div>}
  </>;
}

function AccountingView() {
  return <>
    <MetricBand items={[
      { label: "Settled collections", value: "₱1,284,620", note: "Selected month · sample" },
      { label: "Refunds paid", value: "₱36,400", note: "Recorded payouts" },
      { label: "Net receipts", value: "₱1,248,220", note: "Collections less refunds" },
      { label: "Reconciliation", value: "2 open", note: "Cash shifts needing review" },
    ]} />
    <div className={styles.panelGrid}>
      <MiniBarChart title="Collections & refunds" note="Settled amounts by day, separated to keep cash movement legible." labels={week} series={collectionTrend} />
      <Panel>
        <SectionHeading title="Night Audit" note="Read-only operating-day evidence for Accounting." action={<span className={styles.statusPill}>Read only</span>} />
        <div className={styles.auditDate}><span>Current operating day</span><strong>November 13, 2026</strong><small>Assessment complete · 3:02 PM</small></div>
        <DistributionList rows={[{ label: "Ledger checks complete", value: 8, total: 8, color: "#41856e" }, { label: "Close blockers", value: 0, total: 8, color: "#1b7b81" }]} />
        <div className={styles.inlineNote}><ShieldCheck size={15} aria-hidden="true" />Financial execution stays in its authorized ledger workflows.</div>
      </Panel>
    </div>
    <Panel><SectionHeading title="Collection breakdown" note="Illustrative settled-payment totals by method." /><ReportTable headers={["Method", "Source", "Status", "Settled total"]} rows={[{ cells: ["Cash", "Drawer close", "Settled", "₱442,800"] }, { cells: ["Card", "Payment provider", "Settled", "₱586,300"] }, { cells: ["Bank transfer", "Verified deposits", "Verified", "₱255,520"] }]} /></Panel>
  </>;
}

function AdminView() {
  return <>
    <MetricBand items={[
      { label: "Accounts on record", value: "48", note: "Active and inactive" },
      { label: "Staff accounts", value: "29", note: "Operational & governance roles" },
      { label: "Guest accounts", value: "19", note: "Customer portal users" },
      { label: "Needs attention", value: "3", note: "Suspended or recovery-required" },
    ]} />
    <div className={styles.panelGrid}>
      <Panel>
        <SectionHeading title="Accounts by role" note="Current distribution across the fixed role catalogue." />
        <DistributionList rows={roleCounts.map((row) => ({ ...row, total: 48 }))} />
        <details className={styles.details}><summary>View exact account counts</summary><ReportTable headers={["Role", "Account type", "Accounts", "Share"]} rows={roleCounts.map((row) => ({ cells: [row.label, "Fixed role", String(row.value), `${Math.round(row.value / 48 * 100)}%`] }))} /></details>
      </Panel>
      <Panel>
        <SectionHeading title="Configuration summary" note="Administrative state only; no transaction values." />
        <dl className={styles.configList}><div><dt>Room types in catalogue</dt><dd>6</dd></div><div><dt>Inactive room types</dt><dd>1</dd></div><div><dt>Rooms administratively inactive</dt><dd>2</dd></div><div><dt>Unused recovery links</dt><dd>0</dd></div><div><dt>Accounts needing attention</dt><dd>3</dd></div></dl>
        <div className={styles.inlineNote}><LockKeyhole size={15} aria-hidden="true" />Account-level activity stays in Admin governance, not operational reports.</div>
      </Panel>
    </div>
  </>;
}

function OwnerView() {
  return <>
    <MetricBand items={[
      { label: "Current occupancy", value: "74%", note: "Live room rack · serviceable rooms" },
      { label: "Net revenue", value: "₱1,248,220", note: "Settled collections less refunds" },
      { label: "Blocked rooms", value: "3", note: "Technical impact" },
      { label: "Owner exceptions", value: "2", note: "Pending decisions" },
    ]} />
    <div className={styles.panelGrid}>
      <MiniBarChart title="Booked occupancy" note="Reservations covering each night, as a share of serviceable rooms." labels={week} series={[{ label: "Booked occupancy", color: "#1b7b81", values: occupancyTrend }]} suffix="%" />
      <MiniBarChart title="Collections & refunds" note="Settled collections against recorded payouts." labels={week} series={collectionTrend} />
    </div>
    <Panel><SectionHeading title="Day-by-day operating summary" note="Seven-day window · aggregate figures only." /><ReportTable headers={["Hotel day", "Booked occupancy", "Collected", "Refunded"]} rows={week.slice(-4).map((day, index) => ({ cells: [day, `${occupancyTrend[index + 3]}%`, `₱${(92 + index * 11).toFixed(0)},000`, `₱${(8 + index * 2).toFixed(0)},000`] }))} /></Panel>
  </>;
}

function DistributionList({ rows }: { rows: { label: string; value: number; total: number; color: string }[] }) {
  return <ul className={styles.distributionList}>{rows.map((row) => <li key={row.label}>
    <div><span>{row.label}</span><strong>{row.value}<small> / {row.total}</small></strong></div>
    <div className={styles.distributionTrack}><span style={{ width: `${row.value / Math.max(row.total, 1) * 100}%`, backgroundColor: row.color }} /></div>
  </li>)}</ul>;
}

function StatusBadge({ status }: { status: ReportStatus }) {
  const label = status === "submitted" ? "Submitted" : status === "acknowledged" ? "Acknowledged" : "Returned";
  return <span className={`${styles.statusBadge} ${styles[`status_${status}`]}`}>{label}</span>;
}

function ReportTable({ rows, headers = ["Date / source", "Submitted by", "Status", "Summary"] }: {
  rows: { cells: [string, string, string, string]; status?: ReportStatus }[];
  headers?: [string, string, string, string];
}) {
  return <div className={styles.tableScroll}><table className={styles.reportTable}><thead><tr>{headers.map((header) => <th scope="col" key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.cells[0]}-${index}`}>{row.cells.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`}>{cellIndex === 0 ? <strong>{cell}</strong> : cellIndex === 2 && row.status ? <StatusBadge status={row.status} /> : cell}</td>)}</tr>)}</tbody></table></div>;
}
