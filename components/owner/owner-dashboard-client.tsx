"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { Activity, BarChart3, BedDouble, Building2, CarTaxiFront, ChevronDown, CircleDollarSign, ClipboardCheck, FileText, Image, KeyRound, LogOut, Settings, ShieldCheck, Sparkles, Users } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import RoomCatalogPanel from "@/components/catalog/room-catalog-panel";
import TransportServicesPanel from "@/components/catalog/transport-vehicle-types-panel";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import type { FormField } from "@/components/ui/FormDialog";

type Section = "overview" | "operations" | "financial" | "departments" | "admins" | "roles" | "policy" | "exceptions" | "audit" | "security" | "reports" | "room_types" | "transport_services";
type User = { id: string; name?: string | null; email?: string | null; role: "owner" };
type Row = Record<string, unknown>;
type ExecutiveData = { timeZone: string; today: string; metrics: Record<string, number>; financial: Record<string, number>; trend: Row[]; roleCounts: Record<string, number>; departmentSummary: Record<string, Record<string, number>>; risks: Record<string, Row[]>; recentAudit: Row[] };

const nav: [Section, string, React.ElementType][] = [
  ["overview", "Executive Overview", BarChart3], ["operations", "Executive Operations", BedDouble], ["financial", "Financial Overview", CircleDollarSign], ["departments", "Departments", Building2], ["admins", "Admin Governance", Users], ["roles", "Roles & Permissions", ShieldCheck], ["policy", "Critical Policies", Settings], ["exceptions", "Owner Exceptions", ClipboardCheck], ["room_types", "Room Types & Photos", Image], ["transport_services", "Transfer Vehicles", CarTaxiFront], ["audit", "System Audit", FileText], ["security", "Security Events", KeyRound], ["reports", "Executive Reports", Activity]
];
const label = (value: unknown) => String(value ?? "—").replaceAll("_", " ");
const money = (value: unknown) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value || 0));
const formatValue = (key: string, value: unknown) => /amount|balance|revenue|collected|refund|credit/i.test(key) ? money(value) : typeof value === "boolean" ? (value ? "Yes" : "No") : label(value);
const requiredText = (msg: string) => (value: unknown) => typeof value === "string" && value.trim() ? null : `${msg} is required`;
const requiredNumber = (msg: string) => (value: unknown) => { const n = value === "" ? NaN : Number(value); return Number.isFinite(n) ? null : `${msg} is required`; };
const emailField = (msg: string) => (value: unknown) => requiredText(msg)(value) ?? (typeof value === "string" && /^\S+@\S+\.\S+$/.test(value.trim()) ? null : "Enter a valid email address");
const timeField = (msg: string) => (value: unknown) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? null : `${msg} must be HH:MM (24-hour)`;
const STATUS_OPTIONS = [["active", "Active"], ["inactive", "Inactive"], ["suspended", "Suspended"]].map(([value, optLabel]) => ({ value, label: optLabel }));

export default function OwnerDashboardClient({ user }: { user: User }) {
  const [section, setSection] = useState<Section>("overview");
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("haven-owner-sidebar-collapsed") === "true");
  const [menu, setMenu] = useState(false);
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3500); };
  const dialogs = useActionDialogs();
  const load = useCallback(async () => {
    if (section === "room_types" || section === "transport_services") { setLoading(false); return; }
    setLoading(true);
    const response = await fetch(`/api/owner/data?section=${section}`, { cache: "no-store" });
    const body = await response.json();
    if (response.ok) setData(body.data); else notify(body.error ?? "Unable to load executive data.");
    setLoading(false);
  }, [section]);
  useEffect(() => { const timer = window.setTimeout(load, 0); return () => window.clearTimeout(timer); }, [load]);


  async function send(url: string, payload: Row, method = "POST") {
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json();
    if (!response.ok) { notify(body.error ?? "Executive action failed."); return null; }
    await load(); return body;
  }
  async function createAdmin() {
    const data = await dialogs.askForm({
      title: "Create Admin account",
      description: "Admin starts inactive and requires a one-time secure recovery link to set a password.",
      submitText: "Create Admin",
      fields: [
        { key: "name", label: "Admin name", type: "text", required: true, validation: requiredText("Admin name") },
        { key: "email", label: "Admin email", type: "email", required: true, validation: emailField("Admin email") },
        { key: "department", label: "Department", type: "text", defaultValue: "Administration" },
        { key: "employeeReference", label: "Employee reference (optional)", type: "text" },
        { key: "reason", label: "Why is this Admin account required?", type: "textarea", required: true, validation: requiredText("Reason") },
      ],
    });
    if (!data) return;
    const email = String(data.email).trim();
    const body = await send("/api/admin/users", { name: String(data.name), email, role: "admin", department: String(data.department ?? ""), employeeReference: String(data.employeeReference ?? ""), reason: String(data.reason), idempotencyKey: crypto.randomUUID() });
    if (body) notify("Admin created inactive. Initiate secure recovery to issue a one-time setup link.");
  }
  async function adminAction(item: Row, action: "status" | "recovery") {
    const isStatus = action === "status";
    const fields: FormField[] = isStatus
      ? [
          { key: "status", label: "New status", type: "select", required: true, defaultValue: String(item.account_status ?? "active"), options: STATUS_OPTIONS },
          { key: "reason", label: "Reason for this Admin lifecycle change", type: "textarea", required: true, validation: requiredText("Reason") },
        ]
      : [{ key: "reason", label: "Reason for critical Admin recovery", type: "textarea", required: true, validation: requiredText("Reason") }];
    const data = await dialogs.askForm({
      title: isStatus ? "Change Admin lifecycle" : "Reset Admin access",
      description: `${label(item.name)} · ${label(item.email)}`,
      submitText: "Apply change",
      fields,
    });
    if (!data) return;
    const payload: Row = { action, reason: String(data.reason), version: item.auth_version };
    if (isStatus) payload.status = String(data.status);
    const body = await send(`/api/admin/users/${item.id}/action`, payload);
    if (body && action === "recovery") { await navigator.clipboard.writeText(String(body.data.recoveryUrl)); notify(`One-time recovery link copied. Expires ${new Date(body.data.expiresAt).toLocaleString()}.`); }
  }
  async function reviewException(item: Row, decision: "approve" | "reject") {
    const reason = await dialogs.askPrompt({
      title: decision === "approve" ? "Authorize exception" : "Reject exception",
      message: decision === "approve"
        ? "Authorizing permits the responsible department to execute this escalation. It does not perform their work."
        : "Rejecting records the decision and returns the exception to the responsible department.",
      label: `${decision === "approve" ? "Authorization" : "Rejection"} reason`,
      placeholder: "Record your executive justification…",
      required: true,
      submitText: decision === "approve" ? "Authorize" : "Reject",
    });
    if (!reason) return;
    const body = await send(`/api/owner/exceptions/${item.id}/review`, { decision, reason, version: item.version });
    if (body) notify(decision === "approve" ? "Exception authorized. The responsible department must execute it." : "Exception rejected and recorded.");
  }
  async function editPolicy(item: Row) {
    const time = (raw: unknown) => String(raw ?? "").slice(0, 5);
    const pct = Number(item.cancellation_partial_refund_basis_points) / 100;
    const data = await dialogs.askForm({
      title: "Update critical hotel policy",
      description: "Applies to future operations only — historical reservation and financial snapshots remain unchanged.",
      size: "lg",
      submitText: "Update policy",
      fields: [
        { key: "hotelTimezone", label: "Hotel timezone", type: "text", required: true, defaultValue: String(item.hotel_timezone ?? ""), validation: requiredText("Hotel timezone") },
        { key: "checkInTime", label: "Check-in time", type: "text", required: true, defaultValue: time(item.check_in_time), validation: timeField("Check-in time") },
        { key: "checkOutTime", label: "Checkout time", type: "text", required: true, defaultValue: time(item.check_out_time), validation: timeField("Checkout time") },
        { key: "noShowCutoffTime", label: "No-show cutoff", type: "text", required: true, defaultValue: time(item.no_show_cutoff_time), validation: timeField("No-show cutoff") },
        { key: "minimumBookingAge", label: "Minimum booking age", type: "number", required: true, defaultValue: Number(item.minimum_booking_age), min: 0, validation: requiredNumber("Minimum booking age") },
        { key: "full", label: "Full-refund days", type: "number", required: true, defaultValue: Number(item.cancellation_full_refund_days), min: 0, validation: requiredNumber("Full-refund days") },
        { key: "partial", label: "Partial-refund days", type: "number", required: true, defaultValue: Number(item.cancellation_partial_refund_days), min: 0, validation: requiredNumber("Partial-refund days") },
        { key: "percent", label: "Partial refund percent", type: "number", required: true, defaultValue: pct, min: 0, max: 100, step: 0.01, validation: requiredNumber("Partial refund percent") },
        { key: "modification", label: "Self-service modification days", type: "number", required: true, defaultValue: Number(item.self_service_modification_days), min: 0, validation: requiredNumber("Self-service modification days") },
        { key: "reason", label: "Reason for this critical policy change", type: "textarea", required: true, validation: requiredText("Reason") },
      ],
    });
    if (!data) return;
    const body = await send("/api/admin/policy", { hotelTimezone: String(data.hotelTimezone), checkInTime: String(data.checkInTime), checkOutTime: String(data.checkOutTime), noShowCutoffTime: String(data.noShowCutoffTime), validIdRequired: Boolean(item.valid_id_required), minimumBookingAge: Number(data.minimumBookingAge), cancellationFullRefundDays: Number(data.full), cancellationPartialRefundDays: Number(data.partial), cancellationPartialRefundBasisPoints: Math.round(Number(data.percent) * 100), selfServiceModificationDays: Number(data.modification), earlyCheckInAllowed: Boolean(item.early_check_in_allowed), housekeepingInspectionRequired: Boolean(item.housekeeping_inspection_required), reason: String(data.reason), version: item.version }, "PATCH");
    if (body) notify("Critical policy updated for future transactions; historical snapshots remain unchanged.");
  }

  const rows = Array.isArray(data) ? data as Row[] : [];
  const toggleSidebar = () => { if (window.matchMedia("(max-width: 1000px)").matches) setMenu(false); else { const next = !collapsed; setCollapsed(next); window.localStorage.setItem("haven-owner-sidebar-collapsed", String(next)); } };
  return <div className={`app-shell${collapsed ? " sidebar-collapsed" : ""}`}>
    <aside className={`sidebar${menu ? " open" : ""}${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-top"><button className="brand sidebar-brand-toggle" onClick={toggleSidebar} aria-label="Toggle navigation"><span className="brand-mark"><Sparkles size={17}/></span><span className="brand-copy">HAVEN<small>OWNER GOVERNANCE</small></span></button></div>
      <div className="property-pill"><span>HV</span><div className="property-copy"><b>Haven Makati</b><small>Executive authority</small></div><ChevronDown size={15}/></div>
      <p className="nav-caption">Executive</p><nav>{nav.map(([key, text, Icon]) => <button key={key} className={section === key ? "active" : ""} onClick={() => { setSection(key); setMenu(false); }}><Icon size={18}/><span className="nav-label">{text}</span></button>)}</nav>
      <div className="sidebar-bottom"><button onClick={() => signOut({ callbackUrl: "/" })}><LogOut size={18}/><span className="nav-label">Sign out</span></button><div className="profile"><span>{(user.name ?? "OW").slice(0, 2).toUpperCase()}</span><div className="profile-copy"><b>{user.name}</b><small>Owner / Super Admin</small></div></div></div>
    </aside>
    <main className="workspace"><header className="app-header"><button className="menu-btn brand-menu-btn" onClick={() => setMenu(true)} aria-label="Open navigation"><span className="brand-mark"><Sparkles size={16}/></span></button><div><p>{nav.find((item) => item[0] === section)?.[1]}</p><small>Provisional Owner / Super Admin Governance Baseline</small></div><div className="header-actions"><span className="mode-pill">Supabase live</span><ThemeToggle/></div></header>
      <div className="workspace-body">{section === "room_types" ? <RoomCatalogPanel/> : section === "transport_services" ? <TransportServicesPanel/> : loading ? <div className="empty"><Activity/><h3>Loading executive records…</h3></div> : section === "overview" ? <Overview data={data as ExecutiveData} setSection={setSection}/> : section === "operations" ? <Operations data={data as { metrics: Record<string, number>; departmentSummary: Record<string, Record<string, number>>; risks: Record<string, Row[]>; trend: Row[] }}/> : section === "financial" ? <Financial data={data as Row}/> : section === "departments" ? <Departments data={data as { departmentSummary: Record<string, Record<string, number>>; risks: Record<string, Row[]> }}/> : section === "admins" ? <Admins rows={rows} currentId={user.id} createAdmin={createAdmin} action={adminAction}/> : section === "roles" ? <Roles data={data as { catalogue: Record<string, string[]>; ownerPrinciples: string[] }}/> : section === "policy" ? <Policy item={data as Row} edit={editPolicy}/> : section === "exceptions" ? <Exceptions rows={rows} review={reviewException}/> : section === "audit" || section === "security" ? <Audit rows={rows} security={section === "security"}/> : <Reports data={data as ExecutiveData}/>}</div>
    </main>{toast && <div className="toast"><ShieldCheck size={18}/>{toast}</div>}{dialogs.view}
  </div>;
}

function Title({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) { return <div className="page-title"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>; }
function Cards({ items }: { items: [string, string | number, string][] }) { return <div className="metric-grid">{items.map(([name, value, hint]) => <article className="metric-card" key={name}><div><span>{name}</span><b>{value}</b><small>{hint}</small></div><i><ShieldCheck size={21}/></i></article>)}</div>; }
function Overview({ data, setSection }: { data: ExecutiveData; setSection: (section: Section) => void }) { const m = data.metrics ?? {}, f = data.financial ?? {}; return <><Title eyebrow="Executive command center" title="How is Haven performing—and what is at risk?" subtitle={`Live operational, financial, administrative, and security oversight for ${data.today} (${data.timeZone}).`} action={<button className="btn btn-accent" onClick={() => setSection("exceptions")}>Review exceptions</button>}/><Cards items={[["Occupancy", `${m.occupancy ?? 0}%`, `${m.occupied ?? 0} occupied rooms`], ["Available rooms", m.availableRooms ?? 0, `${m.blockedRooms ?? 0} technically blocked`], ["Net revenue", money(f.netRevenue), `${money(f.refundsIssued)} refunded`], ["Outstanding", money(f.outstandingBalance), "Authoritative folio balances"], ["Critical Maintenance", m.criticalMaintenance ?? 0, `${m.outOfServiceRooms ?? 0} out of service`], ["Overdue Housekeeping", m.overdueHousekeeping ?? 0, "Configured turnover threshold"], ["Owner exceptions", m.pendingOwnerExceptions ?? 0, "Awaiting executive authority"], ["Security warnings", m.securityWarnings ?? 0, "Suspended or recovery-required"]]}/><div className="dashboard-grid"><SummaryPanel title="Department posture" values={data.departmentSummary}/><Table title="Recent immutable audit" rows={data.recentAudit ?? []} columns={["created_at", "action", "entity_type", "entity_id"]}/></div></>; }
function Operations({ data }: { data: { metrics: Record<string, number>; departmentSummary: Record<string, Record<string, number>>; risks: Record<string, Row[]>; trend: Row[] } }) { return <><Title eyebrow="Cross-department visibility" title="Executive operations" subtitle="Read-only operational truth. Front Desk, Housekeeping, Maintenance, Accounting, and Manager retain execution ownership."/><Cards items={[["Occupancy", `${data.metrics.occupancy ?? 0}%`, "Serviceable room denominator"], ["Blocked rooms", data.metrics.blockedRooms ?? 0, "Maintenance technical truth"], ["Overdue room care", data.metrics.overdueHousekeeping ?? 0, "Housekeeping remains responsible"], ["Critical repairs", data.metrics.criticalMaintenance ?? 0, "Maintenance remains responsible"]]}/><div className="dashboard-grid"><SummaryPanel title="Current department queues" values={data.departmentSummary}/><RiskPanels risks={data.risks}/></div></>; }
function Departments({ data }: { data: { departmentSummary: Record<string, Record<string, number>>; risks: Record<string, Row[]> } }) { return <><Title eyebrow="Performance and risk" title="Department oversight" subtitle="Authoritative queue counts and high-risk drilldowns without duplicate operational task managers."/><SummaryPanel title="Department summary" values={data.departmentSummary}/><RiskPanels risks={data.risks}/></>; }
function Financial({ data }: { data: Row }) { const metrics = (data?.metrics ?? {}) as Record<string, number>, transactions = (data?.transactions ?? []) as Row[], refunds = (data?.refunds ?? []) as Row[]; return <><Title eyebrow="Executive financial visibility" title="Financial overview" subtitle="Read-only Accounting ledger. Corrections, refunds, shifts, and reconciliation remain Accounting workflows."/><Cards items={[["Gross collected", money(metrics.grossCollected), "Settled non-refund payments"], ["Refunds issued", money(metrics.refundsIssued), "Separate immutable transactions"], ["Net revenue", money(metrics.netRevenue), "Collected less refunded"], ["Outstanding", money(metrics.outstandingBalance), "Open folio balances"], ["Cash variance", money(metrics.cashVariance), "Closed shifts"], ["Reconciliation variance", money(metrics.openReconciliationVariance), "Unresolved statement variance"], ["Pending refunds", metrics.pendingRefunds ?? 0, "Accounting queue"], ["Failed refunds", metrics.failedRefunds ?? 0, "Accounting retry queue"]]}/><div className="dashboard-grid"><Table title="Recent transactions" rows={transactions.slice(0, 30)} columns={["created_at", "reservation_id", "purpose", "method", "amount", "status"]}/><Table title="Refund exceptions" rows={refunds.slice(0, 30)} columns={["created_at", "reservation_id", "eligible_amount", "status"]}/></div></>; }
function Admins({ rows, currentId, createAdmin, action }: { rows: Row[]; currentId: string; createAdmin: () => void; action: (item: Row, action: "status" | "recovery") => void }) { return <><Title eyebrow="Protected administration" title="Owner and Admin accounts" subtitle="Owner governs Admin accounts. Owner self-lockout and last-active-Owner protections are enforced server-side." action={<button className="btn btn-accent" onClick={createAdmin}>Create Admin</button>}/><div className="data-panel"><div className="table-scroll"><table aria-label="Staff accounts"><thead><tr>{["Name", "Email", "Role", "Status", "Recovery", "Version", "Actions"].map((value) => <th key={value}>{value}</th>)}</tr></thead><tbody>{rows.map((item) => <tr key={String(item.id)}><td><strong>{label(item.name)}</strong></td><td>{label(item.email)}</td><td>{label(item.role)}</td><td><span className={`badge ${item.account_status}`}>{label(item.account_status)}</span></td><td>{item.recovery_required ? "Required" : "No"}</td><td>{label(item.auth_version)}</td><td>{item.role === "admin" && item.id !== currentId ? <div className="reservation-actions"><button className="table-action" onClick={() => action(item, "status")}>Lifecycle</button><button className="table-action" onClick={() => action(item, "recovery")}>Recovery</button></div> : <small>Protected Owner</small>}</td></tr>)}</tbody></table></div></div></>; }
function Roles({ data }: { data: { catalogue: Record<string, string[]>; ownerPrinciples: string[] } }) { return <><Title eyebrow="Fixed permission catalogue" title="Authority hierarchy" subtitle="Owner controls protected governance but cannot inject arbitrary permissions or bypass departmental truth."/><div className="dashboard-grid">{Object.entries(data.catalogue ?? {}).map(([role, capabilities]) => <article className="panel" key={role}><h3>{label(role)}</h3>{capabilities.map((capability) => <p key={capability}>{capability}</p>)}</article>)}</div><article className="panel"><h3>Owner boundaries</h3>{(data.ownerPrinciples ?? []).map((item) => <p key={item}>{item}</p>)}</article></>; }
function Policy({ item, edit }: { item: Row; edit: (item: Row) => void }) { return <><Title eyebrow="Final policy authority" title="Critical hotel policy" subtitle="Updates affect future operations only. Historical reservation and financial snapshots remain unchanged." action={<button className="btn btn-accent" onClick={() => edit(item)}>Update critical policy</button>}/><div className="data-panel"><div className="admin-policy-grid">{Object.entries(item ?? {}).filter(([key]) => key !== "key").map(([key, value]) => <div key={key}><span>{label(key)}</span><strong>{formatValue(key, value)}</strong></div>)}</div></div></>; }
function Exceptions({ rows, review }: { rows: Row[]; review: (item: Row, decision: "approve" | "reject") => void }) { return <><Title eyebrow="Authorization, not execution" title="Owner-level exceptions" subtitle="High-risk Manager escalations. Approval authorizes the responsible department; it does not execute their work."/><div className="data-panel"><div className="table-scroll"><table aria-label="Owner exception requests"><thead><tr>{["Requested", "Type", "Reservation", "Department", "Severity", "Reason", "Escalation", "Status", "Actions"].map((value) => <th key={value}>{value}</th>)}</tr></thead><tbody>{rows.map((item) => <tr key={String(item.id)}><td>{label(item.requested_at)}</td><td><strong>{label(item.request_type)}</strong></td><td>{label(item.reservation_reference)}<br/><small>{label(item.guest_name)}</small></td><td>{label(item.department)}</td><td><span className={`badge ${item.severity}`}>{label(item.severity)}</span></td><td>{label(item.reason)}</td><td>{label(item.owner_escalation_reason)}<br/><small>{label(item.escalator_name)}</small></td><td><span className={`badge ${item.status}`}>{label(item.status)}</span><br/><small>{label(item.execution_status)}</small></td><td>{item.status === "pending" ? <div className="reservation-actions"><button className="table-action" onClick={() => review(item, "approve")}>Authorize</button><button className="table-action danger-action" onClick={() => review(item, "reject")}>Reject</button></div> : <small>{label(item.decision_reason)}</small>}</td></tr>)}</tbody></table></div>{rows.length === 0 && <div className="empty"><ClipboardCheck/><h3>No Owner-level exceptions</h3><p>Managers have not escalated a high-risk decision.</p></div>}</div></>; }
function Audit({ rows, security }: { rows: Row[]; security: boolean }) { return <><Title eyebrow={security ? "Actual security records" : "Immutable governance history"} title={security ? "Security events" : "System audit"} subtitle={security ? "Recorded account, role, password, and recovery events only—no fabricated threat telemetry." : "Broad Owner visibility without update or deletion authority."}/><Table title={security ? "Security-sensitive events" : "Audit events"} rows={rows} columns={["created_at", "action", "entity_type", "entity_id", "user_id"]}/></>; }
function Reports({ data }: { data: ExecutiveData }) { return <><Title eyebrow="Executive reporting" title="Seven-day operating summary" subtitle={`Real hotel records aligned to ${data.timeZone ?? "the configured hotel timezone"}.`}/><Cards items={[["Current occupancy", `${data.metrics?.occupancy ?? 0}%`, "Serviceable rooms"], ["Net revenue", money(data.financial?.netRevenue), "Settled collections less refunds"], ["Blocked rooms", data.metrics?.blockedRooms ?? 0, "Technical impact"], ["Owner exceptions", data.metrics?.pendingOwnerExceptions ?? 0, "Pending decisions"]]}/><Table title="Occupancy and collections trend" rows={data.trend ?? []} columns={["day", "occupancy", "collected", "refunded"]}/></>; }
function SummaryPanel({ title, values }: { title: string; values: Record<string, Record<string, number>> }) { return <article className="panel"><div className="panel-heading"><div><h3>{title}</h3><p>Live authoritative counts</p></div></div><div className="owner-summary-grid">{Object.entries(values ?? {}).map(([department, metrics]) => <div key={department}><h4>{label(department)}</h4>{Object.entries(metrics).map(([key, value]) => <p key={key}><span>{label(key)}</span><strong>{formatValue(key, value)}</strong></p>)}</div>)}</div></article>; }
function RiskPanels({ risks }: { risks: Record<string, Row[]> }) { return <div>{Object.entries(risks ?? {}).map(([name, rows]) => <Table key={name} title={label(name)} rows={rows} columns={name === "blockedRooms" || name === "criticalMaintenance" ? ["room_number", "issue", "priority", "serviceability_impact", "status", "created_at"] : ["room_number", "task", "department", "priority", "status", "created_at"]}/>)}</div>; }
function Table({ title, rows, columns }: { title: string; rows: Row[]; columns: string[] }) { return <article className="data-panel owner-table"><div className="panel-heading"><div><h3>{title}</h3><p>{rows.length} authoritative record{rows.length === 1 ? "" : "s"}</p></div></div><div className="table-scroll"><table aria-label="Owner records"><thead><tr>{columns.map((column) => <th key={column}>{label(column)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={String(row.id ?? `${title}-${index}`)}>{columns.map((column) => <td key={column}>{formatValue(column, row[column])}</td>)}</tr>)}</tbody></table></div>{rows.length === 0 && <div className="empty"><p>No matching records.</p></div>}</article>; }