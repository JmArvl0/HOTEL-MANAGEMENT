"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { Activity, BarChart3, BedDouble, Building2, CarTaxiFront, ChevronDown, ChevronRight, CircleDollarSign, ClipboardCheck, Eye, FileText, Image, KeyRound, LogOut, PanelLeftClose, QrCode, Settings, ShieldCheck, Sparkles, Users } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SessionExpiryGuard } from "@/components/auth/session-expiry-guard";
import { ToastStack, useToasts } from "@/components/ui/toast-stack";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/ui/Navigation";
import { AccessibleChart } from "@/components/ui/AccessibleChart";
import {
  OwnerToolbar,
  OwnerEmpty,
  OwnerSectionHead,
  OwnerCollapse,
  OwnerTabs,
  useOwnerSearch,
  formatOwnerDate,
  formatPolicyValue,
  OWNER_ROLE_META,
} from "@/components/owner/owner-primitives";
import { SettingsDialog } from "@/components/ui/SettingsDialog";
import RoomCatalogPanel from "@/components/catalog/room-catalog-panel";
import PaymentSettingsPanel from "@/components/owner/payment-settings-panel";
import TransportServicesPanel from "@/components/catalog/transport-vehicle-types-panel";
import TransportationPanel from "@/components/manager/transportation-panel";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import { TablePagination, sortTableRows, useTablePagination } from "@/components/ui/table-pagination";
import type { FormField } from "@/components/ui/FormDialog";

type Section = "overview" | "operations" | "financial" | "departments" | "admins" | "roles" | "policy" | "payments" | "exceptions" | "audit" | "security" | "reports" | "room_types" | "transport_services" | "transportation";
type User = { id: string; name?: string | null; email?: string | null; role: "owner" };
type Row = Record<string, unknown>;
type ExecutiveData = { timeZone: string; today: string; metrics: Record<string, number>; financial: Record<string, number>; trend: Row[]; roleCounts: Record<string, number>; departmentSummary: Record<string, Record<string, number>>; risks: Record<string, Row[]>; recentAudit: Row[] };

const nav: [Section, string, React.ElementType][] = [
  ["overview", "Executive Overview", BarChart3], ["operations", "Executive Operations", BedDouble], ["financial", "Financial Overview", CircleDollarSign], ["departments", "Departments", Building2], ["admins", "Admin Governance", Users], ["roles", "Roles & Permissions", ShieldCheck], ["policy", "Critical Policies", Settings], ["payments", "Payment Settings", QrCode], ["exceptions", "Owner Exceptions", ClipboardCheck], ["room_types", "Room Types & Photos", Image], ["transport_services", "Transfer Vehicles", CarTaxiFront], ["transportation", "Transportation", CarTaxiFront], ["audit", "System Audit", FileText], ["security", "Security Events", KeyRound], ["reports", "Executive Reports", Activity]
];
// Presentational grouping only — every section stays reachable; no RBAC here (owner sees all modules).
export const NAV_GROUPS: { id: string; label: string; sections: Section[] }[] = [
  { id: "executive", label: "Executive", sections: ["overview", "operations", "financial", "departments"] },
  { id: "governance", label: "Governance", sections: ["admins", "roles", "policy", "payments", "exceptions", "audit", "security", "reports"] },
  { id: "catalog", label: "Catalog", sections: ["room_types", "transport_services", "transportation"] }
];
const label = (value: unknown) => String(value ?? "—").replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
// System Administrator display name: internal role id stays "admin".
const roleLabel = (role: unknown) => String(role) === "admin" ? "System Administrator" : label(role);
const money = (value: unknown) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value || 0));
const badge = (value: unknown) => <span className={`badge ${String(value ?? "")}`}>{label(value)}</span>;
const shortId = (value: unknown) => { const text = String(value ?? ""); return text.length > 12 ? `${text.slice(0, 8)}…` : text; };
const sub = (main: unknown, secondary: unknown) => <>{label(main)}{secondary !== null && secondary !== undefined && String(secondary) !== "" ? <><br /><small>{String(secondary)}</small></> : null}</>;
// Presentation-only value formatting (delegates to the shared primitive so
// day/hour counts and basis points never render as currency). Stored values
// are never touched.
const formatValue = (key: string, value: unknown) => formatPolicyValue(key, value);
const requiredText = (msg: string) => (value: unknown) => typeof value === "string" && value.trim() ? null : `${msg} is required`;
const requiredNumber = (msg: string) => (value: unknown) => { const n = value === "" ? NaN : Number(value); return Number.isFinite(n) ? null : `${msg} is required`; };
const emailField = (msg: string) => (value: unknown) => requiredText(msg)(value) ?? (typeof value === "string" && /^\S+@\S+\.\S+$/.test(value.trim()) ? null : "Enter a valid email address");
const timeField = (msg: string) => (value: unknown) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? null : `${msg} must be HH:MM (24-hour)`;
const STATUS_OPTIONS = [["active", "Active"], ["inactive", "Inactive"], ["suspended", "Suspended"]].map(([value, optLabel]) => ({ value, label: optLabel }));

export default function OwnerDashboardClient({ user, sessionExpiresAt }: { user: User; sessionExpiresAt?: string | null }) {
  const [section, setSection] = useState<Section>("overview");
  const [data, setData] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const toastController = useToasts();
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("haven-owner-sidebar-collapsed") === "true");
  const [menu, setMenu] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (id: string) => setOpenGroups((prev) => { const next = { ...prev, [id]: !(prev[id] ?? false) }; window.localStorage.setItem("haven-owner-sidebar-groups", JSON.stringify(next)); return next; });
  useEffect(() => { const timer = window.setTimeout(() => { try { const saved: unknown = JSON.parse(window.localStorage.getItem("haven-owner-sidebar-groups") ?? "{}"); if (saved && typeof saved === "object") setOpenGroups(saved as Record<string, boolean>); } catch {} }, 0); return () => window.clearTimeout(timer); }, []);
  const notify = (message: string) => { toastController.push({ title: message }); };
  const dialogs = useActionDialogs();
  const load = useCallback(async () => {
    if (section === "room_types" || section === "transport_services" || section === "transportation" || section === "payments") { setLoading(false); return; }
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
        { key: "vat", label: "VAT rate (%) — inclusive, shown on documents", type: "number", required: true, defaultValue: Number(item.vat_rate_bp ?? 1200) / 100, min: 0, max: 100, step: 0.01, validation: requiredNumber("VAT rate") },
        { key: "serviceCharge", label: "Service charge (%) — inclusive, shown on documents", type: "number", required: true, defaultValue: Number(item.service_charge_bp ?? 1000) / 100, min: 0, max: 100, step: 0.01, validation: requiredNumber("Service charge rate") },
        { key: "depositSla", label: "Deposit verification SLA (hours)", type: "number", required: true, defaultValue: Number(item.deposit_sla_hours ?? 4), min: 0, max: 72, validation: requiredNumber("Deposit SLA") },
        { key: "reason", label: "Reason for this critical policy change", type: "textarea", required: true, validation: requiredText("Reason") },
      ],
    });
    if (!data) return;
    const body = await send("/api/admin/policy", { hotelTimezone: String(data.hotelTimezone), checkInTime: String(data.checkInTime), checkOutTime: String(data.checkOutTime), noShowCutoffTime: String(data.noShowCutoffTime), validIdRequired: Boolean(item.valid_id_required), minimumBookingAge: Number(data.minimumBookingAge), cancellationFullRefundDays: Number(data.full), cancellationPartialRefundDays: Number(data.partial), cancellationPartialRefundBasisPoints: Math.round(Number(data.percent) * 100), selfServiceModificationDays: Number(data.modification), earlyCheckInAllowed: Boolean(item.early_check_in_allowed), housekeepingInspectionRequired: Boolean(item.housekeeping_inspection_required), vatRateBp: Math.round(Number(data.vat) * 100), serviceChargeBp: Math.round(Number(data.serviceCharge) * 100), depositSlaHours: Number(data.depositSla), reason: String(data.reason), version: item.version }, "PATCH");
    if (body) notify("Critical policy updated for future transactions; historical snapshots remain unchanged.");
  }

  const rows = Array.isArray(data) ? data as Row[] : [];
  const toggleSidebar = () => { if (window.matchMedia("(max-width: 1000px)").matches) setMenu(false); else { const next = !collapsed; setCollapsed(next); window.localStorage.setItem("haven-owner-sidebar-collapsed", String(next)); } };
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const profileMenu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!profileOpen) return;
    const outside = (event: Event) => { if (profileMenu.current && !profileMenu.current.contains(event.target as Node)) setProfileOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setProfileOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [profileOpen]);
  return <div className={`app-shell owner-workspace${collapsed ? " sidebar-collapsed" : ""}`}>
    <aside id="owner-navigation" className={`sidebar${menu ? " open" : ""}${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-top"><div className="brand"><button className="brand-mark sidebar-brand-toggle" onClick={toggleSidebar} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-controls="owner-navigation" aria-expanded={!collapsed} title={collapsed ? "Expand navigation" : "Collapse navigation"}><Sparkles size={17}/></button><Link href="/" className="brand-copy" aria-label="Hotel homepage" title="Hotel homepage">HAVEN<small>OWNER GOVERNANCE</small></Link><button className="sidebar-collapse-button" onClick={toggleSidebar} aria-label="Collapse navigation" aria-controls="owner-navigation" aria-expanded={!collapsed} title="Collapse navigation"><PanelLeftClose size={16}/></button></div></div>
      <div className="property-pill"><span>HV</span><div className="property-copy"><b>Haven Makati</b><small>Executive authority</small></div><ChevronDown size={15}/></div>
      <nav aria-label="Modules">{NAV_GROUPS.map((group) => { const open = (openGroups[group.id] ?? false) || group.sections.includes(section); return <div className="nav-group-wrap" key={group.id}>
        <button className="nav-caption nav-group-header" aria-expanded={open} aria-controls={`nav-group-${group.id}`} onClick={() => toggleGroup(group.id)}><span className="nav-group-label">{group.label}</span><ChevronRight size={13} className="nav-group-chevron" aria-hidden="true"/></button>
        <div className={`nav-group${open ? " open" : ""}`} id={`nav-group-${group.id}`}><div className="nav-group-items">{nav.filter(([key]) => group.sections.includes(key)).map(([key, text, Icon]) => <button key={key} className={section === key ? "active" : ""} onClick={() => { setSection(key); setMenu(false); }} title={text}><Icon size={18}/><span className="nav-label">{text}</span></button>)}</div></div>
      </div>; })}</nav>
    </aside>
    <main className="workspace"><header className="app-header"><button className="menu-btn brand-menu-btn" onClick={() => setMenu(true)} aria-label="Open navigation"><span className="brand-mark"><Sparkles size={16}/></span></button><div><p>{nav.find((item) => item[0] === section)?.[1]}</p><small>Provisional Owner / Super Admin Governance Baseline</small></div><div className="header-actions"><SessionExpiryGuard expiresAt={sessionExpiresAt}/><ThemeToggle/><div className="profile-menu-wrap" ref={profileMenu}><button className="profile-menu-btn" onClick={() => setProfileOpen((value) => !value)} aria-expanded={profileOpen} aria-haspopup="menu" aria-label="Account menu"><b>{(user.name ?? "OW").slice(0, 2).toUpperCase()}</b><span>{user.name}</span><ChevronDown size={14}/></button>{profileOpen && <div className="popover-gap"><div className="profile-popover"><p><strong>{user.name}</strong><small>{user.email}</small><small>Owner / Super Admin</small></p><button onClick={() => { setProfileOpen(false); setSettingsOpen(true); }}><Settings size={15}/>Settings</button><button onClick={() => signOut({ callbackUrl: "/" })}><LogOut size={15}/>Sign Out</button></div></div>}</div></div></header><ToastStack controller={toastController} />
      <div className="workspace-body owner-module">{section === "room_types" ? <RoomCatalogPanel role="owner"/> : section === "transport_services" ? <TransportServicesPanel/> : section === "transportation" ? <TransportationPanel role="owner"/> : section === "payments" ? <PaymentSettingsPanel notify={notify}/> : loading ? <div className="empty"><Activity/><h3>Loading executive records…</h3></div> : section === "overview" ? <Overview data={data as ExecutiveData} setSection={setSection}/> : section === "operations" ? <Operations data={data as { metrics: Record<string, number>; departmentSummary: Record<string, Record<string, number>>; risks: Record<string, Row[]>; trend: Row[] }}/> : section === "financial" ? <Financial data={data as Row}/> : section === "departments" ? <Departments data={data as { departmentSummary: Record<string, Record<string, number>>; risks: Record<string, Row[]> }}/> : section === "admins" ? <Admins rows={rows} currentId={user.id} createAdmin={createAdmin} action={adminAction}/> : section === "roles" ? <Roles data={data as { catalogue: Record<string, string[]>; ownerPrinciples: string[] }}/> : section === "policy" ? <Policy item={data as Row} edit={editPolicy}/> : section === "exceptions" ? <Exceptions rows={rows} review={reviewException}/> : section === "audit" || section === "security" ? <Audit rows={rows} security={section === "security"}/> : <Reports data={data as ExecutiveData}/>}</div>
    </main>{settingsOpen && <SettingsDialog isOpen onClose={()=>setSettingsOpen(false)}/>}{dialogs.view}
  </div>;
}

function Title({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle: string; action?: React.ReactNode }) { return <PageHeader variant="default" eyebrow={eyebrow} title={title} subtitle={subtitle} actions={action} />; }
function Cards({ items }: { items: [string, string | number, string, ("good" | "warn" | "bad")?][] }) { return <div className="metric-grid owner-metric-grid" role="list">{items.map(([name, value, hint, tone]) => <article className={`metric-card${tone ? ` tone-${tone}` : ""}`} key={name} role="listitem"><div><span>{name}</span><b>{value}</b><small>{hint}</small></div><i><ShieldCheck size={21} aria-hidden="true"/></i></article>)}</div>; }
function Overview({ data, setSection }: { data: ExecutiveData; setSection: (section: Section) => void }) { const m = data.metrics ?? {}, f = data.financial ?? {}; return <><Title eyebrow="Executive command center" title="How is Haven performing—and what is at risk?" subtitle={`Live operational, financial, administrative, and security oversight for ${data.today} (${data.timeZone}).`} action={<button className="btn btn-accent" onClick={() => setSection("exceptions")}>Review exceptions</button>}/><Cards items={[["Occupancy", `${m.occupancy ?? 0}%`, `${m.occupied ?? 0} occupied rooms`], ["Available rooms", m.availableRooms ?? 0, `${m.blockedRooms ?? 0} technically blocked`], ["Net revenue", money(f.netRevenue), `${money(f.refundsIssued)} refunded`, "good"], ["Outstanding", money(f.outstandingBalance), "Authoritative folio balances", (f.outstandingBalance ?? 0) > 0 ? "warn" : "good"], ["Critical Maintenance", m.criticalMaintenance ?? 0, `${m.outOfServiceRooms ?? 0} out of service`, (m.criticalMaintenance ?? 0) > 0 ? "bad" : "good"], ["Overdue Housekeeping", m.overdueHousekeeping ?? 0, "Configured turnover threshold", (m.overdueHousekeeping ?? 0) > 0 ? "warn" : "good"], ["Owner exceptions", m.pendingOwnerExceptions ?? 0, "Awaiting executive authority", (m.pendingOwnerExceptions ?? 0) > 0 ? "warn" : "good"], ["Security warnings", m.securityWarnings ?? 0, "Suspended or recovery-required", (m.securityWarnings ?? 0) > 0 ? "bad" : "good"]]}/><div className="dashboard-grid owner-insight-grid"><SummaryPanel title="Department pulse" values={data.departmentSummary}/><Table title="Recent governance activity" rows={data.recentAudit ?? []} columns={[{ key: "created_at", header: "Time", render: (row) => formatOwnerDate(row.created_at, data.timeZone) }, { key: "action", header: "Action", render: (row) => badge(row.action) }, { key: "entity_type", header: "Entity", render: (row) => label(row.entity_type) }, { key: "entity_id", header: "Record", render: (row) => <span className="owner-record-id">{shortId(row.entity_id)}</span> }]} noun="events" note="Newest first — full history stays immutable."/></div></>; }
function Operations({ data }: { data: { metrics: Record<string, number>; departmentSummary: Record<string, Record<string, number>>; risks: Record<string, Row[]>; trend: Row[] } }) { return <><Title eyebrow="Cross-department visibility" title="Executive operations" subtitle="Read-only operational truth. Front Desk, Housekeeping, Maintenance, Accounting, and Manager retain execution ownership."/><Cards items={[["Occupancy", `${data.metrics.occupancy ?? 0}%`, "Serviceable room denominator"], ["Blocked rooms", data.metrics.blockedRooms ?? 0, "Maintenance technical truth", (data.metrics.blockedRooms ?? 0) > 0 ? "bad" : "good"], ["Overdue room care", data.metrics.overdueHousekeeping ?? 0, "Housekeeping remains responsible", (data.metrics.overdueHousekeeping ?? 0) > 0 ? "warn" : "good"], ["Critical repairs", data.metrics.criticalMaintenance ?? 0, "Maintenance remains responsible", (data.metrics.criticalMaintenance ?? 0) > 0 ? "bad" : "good"]]}/><div className="dashboard-grid owner-insight-grid"><SummaryPanel title="Department workload" values={data.departmentSummary}/><section className="data-panel owner-panel" aria-label="Attention required"><div className="panel-heading"><div><h3>Attention required</h3><p>Grouped risk queues — expand a group for detail</p></div></div><RiskPanels risks={data.risks}/></section></div></>; }
function Departments({ data }: { data: { departmentSummary: Record<string, Record<string, number>>; risks: Record<string, Row[]> } }) { const tabs: { key: string; label: string; count: number }[] = RISK_GROUPS.map(([key, title]) => ({ key, label: title, count: (data.risks?.[key] ?? []).length })); const [active, setActive] = useState(() => tabs.find((tab) => tab.count > 0)?.key ?? tabs[0].key); const activeTitle = tabs.find((tab) => tab.key === active)?.label ?? tabs[0].label; return <><Title eyebrow="Performance and risk" title="Department oversight" subtitle="Authoritative queue counts and high-risk drilldowns without duplicate operational task managers."/><SummaryPanel title="Department status" values={data.departmentSummary}/><OwnerSectionHead title="Operational issues" note="One queue at a time — counts update live, no refetch on switch"/><OwnerTabs tabs={tabs} active={active} onChange={setActive} label="Operational issue queues"/><Table title={activeTitle} rows={data.risks?.[active] ?? []} columns={riskColumns(active)} noun="records" note="Executive source order retained."/></>; }
function Financial({ data }: { data: Row }) { const metrics = (data?.metrics ?? {}) as Record<string, number>, transactions = (data?.transactions ?? []) as Row[], refunds = (data?.refunds ?? []) as Row[]; const txn = [{ key: "created_at", header: "Time", render: (row: Row) => formatOwnerDate(row.created_at) }, { key: "reservation_id", header: "Reservation", render: (row: Row) => <span className="owner-record-id">{shortId(row.reservation_id)}</span> }, { key: "purpose", header: "Purpose", render: (row: Row) => label(row.purpose) }, { key: "method", header: "Method", render: (row: Row) => badge(row.method) }, { key: "amount", header: "Amount", render: (row: Row) => money(row.amount) }, { key: "status", header: "Status", render: (row: Row) => badge(row.status) }]; return <><Title eyebrow="Executive financial visibility" title="Financial overview" subtitle="Read-only Accounting ledger. Corrections, refunds, shifts, and reconciliation remain Accounting workflows."/><Cards items={[["Gross collected", money(metrics.grossCollected), "Settled non-refund payments", "good"], ["Refunds issued", money(metrics.refundsIssued), "Separate immutable transactions"], ["Net revenue", money(metrics.netRevenue), "Collected less refunded", "good"], ["Outstanding", money(metrics.outstandingBalance), "Open folio balances", (metrics.outstandingBalance ?? 0) > 0 ? "warn" : "good"], ["Cash variance", money(metrics.cashVariance), "Closed shifts", (metrics.cashVariance ?? 0) !== 0 ? "warn" : "good"], ["Reconciliation variance", money(metrics.openReconciliationVariance), "Unresolved statement variance", (metrics.openReconciliationVariance ?? 0) !== 0 ? "warn" : "good"], ["Pending refunds", metrics.pendingRefunds ?? 0, "Accounting queue", (metrics.pendingRefunds ?? 0) > 0 ? "warn" : "good"], ["Failed refunds", metrics.failedRefunds ?? 0, "Accounting retry queue", (metrics.failedRefunds ?? 0) > 0 ? "bad" : "good"]]}/><div className="dashboard-grid owner-dual-grid owner-finance-grid"><Table title="Recent transactions" rows={transactions} columns={txn} noun="transactions" note="Settled and pending ledger entries, newest first."/><Table title="Refund attention" rows={refunds} columns={[{ key: "created_at", header: "Time", render: (row: Row) => formatOwnerDate(row.created_at) }, { key: "reservation_id", header: "Reservation", render: (row: Row) => <span className="owner-record-id">{shortId(row.reservation_id)}</span> }, { key: "eligible_amount", header: "Amount", render: (row: Row) => money(row.eligible_amount) }, { key: "status", header: "Status", render: (row: Row) => badge(row.status) }]} noun="refunds" note="Accounting owns settlement — visibility only."/></div></>; }
function Admins({ rows, currentId, createAdmin, action }: { rows: Row[]; currentId: string; createAdmin: () => void; action: (item: Row, action: "status" | "recovery") => void }) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const searched = useOwnerSearch(rows, search);
  const visible = sortTableRows(searched.filter((item) => (role === "all" || String(item.role) === role) && (status === "all" || String(item.account_status) === status)), (item) => String(item.name ?? item.email ?? ""));
  const roleOptions = [{ value: "all", label: "All roles" }, ...Array.from(new Set(rows.map((item) => String(item.role ?? "")).filter(Boolean))).map((value) => ({ value, label: roleLabel(value) }))];
  const statusOptions = [{ value: "all", label: "All statuses" }, ...Array.from(new Set(rows.map((item) => String(item.account_status ?? "")).filter(Boolean))).map((value) => ({ value, label: label(value) }))];
  const clearAll = () => { setSearch(""); setRole("all"); setStatus("all"); };
  return <><Title eyebrow="Protected administration" title="Owner and Admin accounts" subtitle="Owner governs Admin accounts. Owner self-lockout and last-active-Owner protections are enforced server-side." action={<button className="btn btn-accent" onClick={createAdmin}>Create Admin</button>}/><Cards items={[["Owners", rows.filter((item) => item.role === "owner").length, "Protected executive authority"], ["System Administrators", rows.filter((item) => item.role === "admin").length, "Governed admin accounts"], ["Active privileged accounts", rows.filter((item) => item.active).length, "Can sign in today", "good"], ["Recovery required", rows.filter((item) => item.recovery_required).length, "Awaiting secure setup", rows.some((item) => item.recovery_required) ? "warn" : "good"]]}/><OwnerToolbar search={search} setSearch={setSearch} searchLabel="Search accounts" searchPlaceholder="Search by name or email…" filters={[{ label: "Role", value: role, onChange: setRole, options: roleOptions }, { label: "Status", value: status, onChange: setStatus, options: statusOptions }]} resultCount={visible.length} resultNoun="accounts" onClear={clearAll}/><Table title="Privileged accounts" rows={visible} columns={[{ key: "name", header: "Name", render: (item) => <strong>{label(item.name)}</strong> }, { key: "email", header: "Email", render: (item) => label(item.email) }, { key: "role", header: "Role", render: (item) => roleLabel(item.role) }, { key: "account_status", header: "Status", render: (item) => badge(item.account_status) }, { key: "recovery_required", header: "Recovery", render: (item) => (item.recovery_required ? "Required" : "No") }, { key: "actions", header: "Actions", render: (item) => (item.role === "admin" && item.id !== currentId ? <div className="reservation-actions"><button className="table-action" onClick={() => action(item, "status")}>Lifecycle</button><button className="table-action" onClick={() => action(item, "recovery")}>Recovery</button></div> : <span className="owner-protected">Protected Owner</span>) }]} noun="accounts" note="Alphabetical by account name."/></>;
}
function Roles({ data }: { data: { catalogue: Record<string, string[]>; ownerPrinciples: string[] } }) { const entries = Object.entries(data.catalogue ?? {}); const top = entries.filter(([role]) => role === "owner" || role === "admin"); const rest = entries.filter(([role]) => role !== "owner" && role !== "admin"); const allows = (data.ownerPrinciples ?? []).filter((item) => !/^no\s/i.test(item)); const limits = (data.ownerPrinciples ?? []).filter((item) => /^no\s/i.test(item)); const card = (role: string, capabilities: string[], featured: boolean) => { const meta = OWNER_ROLE_META[role]; const Icon = meta?.Icon ?? ShieldCheck; return <article className={`panel owner-role-card${featured ? " owner-role-featured" : ""}`} key={role}><header><span className="owner-role-icon" aria-hidden="true"><Icon size={18}/></span><div><h3>{roleLabel(role)}</h3><small>{meta?.summary ?? "Fixed system role"}</small></div><span className="owner-role-count">{capabilities.length}</span></header><ul>{capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul></article>; }; return <><Title eyebrow="Fixed permission catalogue" title="Authority hierarchy" subtitle="Who controls what in HAVEN. Owner controls protected governance but cannot inject arbitrary permissions or bypass departmental truth."/><OwnerSectionHead title="Highest authority" note="Protected executive roles"/><div className="dashboard-grid owner-role-grid owner-role-top">{top.map(([role, capabilities]) => card(role, capabilities, true))}</div><OwnerSectionHead title="Operational roles" note="Fixed capabilities — display only, never edited here"/><div className="dashboard-grid owner-role-grid">{rest.map(([role, capabilities]) => card(role, capabilities, false))}</div><article className="panel owner-boundaries" aria-label="Owner boundaries"><h3>Owner boundaries</h3><div className="owner-boundaries-grid"><ul>{allows.map((item) => <li className="is-allow" key={item}>{item}</li>)}</ul><ul>{limits.map((item) => <li className="is-deny" key={item}>{item}</li>)}</ul></div></article></>; }
const POLICY_GROUPS: { title: string; note: string; fields: [string, string][] }[] = [
  { title: "Stay & arrival", note: "Identity, schedule, and eligibility for every new reservation", fields: [["hotel_timezone", "Hotel timezone"], ["check_in_time", "Check-in time"], ["check_out_time", "Checkout time"], ["no_show_cutoff_time", "No-show cutoff"], ["minimum_booking_age", "Minimum booking age"], ["valid_id_required", "Valid ID required at check-in"]] },
  { title: "Cancellation & self-service", note: "Windows count back from the arrival date", fields: [["cancellation_full_refund_days", "Full-refund window"], ["cancellation_partial_refund_days", "Partial-refund window"], ["cancellation_partial_refund_basis_points", "Partial refund rate"], ["self_service_modification_days", "Self-service modification window"]] },
  { title: "Hotel operations", note: "What guests and staff may do without approval", fields: [["early_check_in_allowed", "Early check-in allowed"], ["housekeeping_inspection_required", "Inspection before re-occupancy"], ["incidentals_due", "Incidentals due"], ["pets_allowed", "Pets allowed"], ["smoking_allowed", "Smoking allowed"], ["special_requests_guaranteed", "Special requests guaranteed"], ["email_verification_required", "Email verification required"], ["deposit_sla_hours", "Deposit verification SLA"], ["manager_arrival_risk_minutes", "Arrival risk window"], ["guest_request_overdue_minutes", "Guest-request overdue threshold"], ["housekeeping_turnover_overdue_minutes", "Turnover overdue threshold"]] },
  { title: "Financial documents", note: "Inclusive rates — displayed prices are the full amount guests pay", fields: [["vat_rate_bp", "VAT rate"], ["service_charge_bp", "Service charge rate"]] },
  { title: "Transportation", note: "Hotel-side endpoints for transfer requests", fields: [["transfer_hotel_label", "Hotel label"], ["transfer_hotel_lat", "Hotel latitude"], ["transfer_hotel_lon", "Hotel longitude"]] },
  { title: "Payment destination", note: "Owner-controlled GCash configuration (managed in Payment Settings)", fields: [["gcash_enabled", "GCash deposits enabled"], ["gcash_account_name", "Account name"], ["gcash_mobile_number", "Mobile number"], ["gcash_qr_storage_path", "Official QR"]] },
];
function Policy({ item, edit }: { item: Row; edit: (item: Row) => void }) { const known = new Set(POLICY_GROUPS.flatMap((group) => group.fields.map(([key]) => key))); const extras = Object.entries(item ?? {}).filter(([key]) => !known.has(key) && !["key", "version", "updated_at"].includes(key)); const groups = [...POLICY_GROUPS, ...(extras.length ? [{ title: "Additional settings", note: "Recorded on the policy row", fields: extras.map(([key]) => [key, label(key)] as [string, string]) }] : [])]; const value = (key: string) => key === "gcash_qr_storage_path" ? (item?.[key] ? "Configured" : "Not configured") : formatValue(key, item?.[key]); return <><Title eyebrow="Final policy authority" title="Critical hotel policy" subtitle="Updates affect future operations only. Historical reservation and financial snapshots remain unchanged." action={<button className="btn btn-accent" onClick={() => edit(item)}>Update critical policy</button>}/>{item?.updated_at && <p className="owner-policy-meta">Version {label(item.version)} · updated {formatOwnerDate(item.updated_at)}</p>}<div className="owner-policy-groups">{groups.map((group) => <section className="data-panel owner-panel" key={group.title} aria-label={group.title}><div className="panel-heading"><div><h3>{group.title}</h3><p>{group.note}</p></div></div><dl>{group.fields.filter(([key]) => key in (item ?? {})).map(([key, name]) => <div key={key}><dt>{name}</dt><dd>{value(key)}</dd></div>)}</dl></section>)}</div></>; }
function Exceptions({ rows, review }: { rows: Row[]; review: (item: Row, decision: "approve" | "reject") => void }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [department, setDepartment] = useState("all");
  const searched = useOwnerSearch(rows, search);
  const visible = searched.filter((item) => (status === "all" || String(item.status) === status) && (severity === "all" || String(item.severity) === severity) && (department === "all" || String(item.department) === department));
  const options = (values: unknown[], all: string) => [{ value: "all", label: all }, ...Array.from(new Set(values.map((value) => String(value ?? "")).filter(Boolean))).sort().map((value) => ({ value, label: label(value) }))];
  const clearAll = () => { setSearch(""); setStatus("all"); setSeverity("all"); setDepartment("all"); };
  const pending = rows.filter((item) => item.status === "pending");
  return <><Title eyebrow="Authorization, not execution" title="Owner-level exceptions" subtitle="High-risk Manager escalations. Approval authorizes the responsible department; it does not execute their work."/><Cards items={[["Pending", pending.length, "Awaiting Owner decision", pending.length > 0 ? "warn" : "good"], ["Authorized", rows.filter((item) => item.status === "approved").length, "Departments may execute", "good"], ["Rejected", rows.filter((item) => item.status === "rejected").length, "Returned with reason"], ["High severity", pending.filter((item) => ["high", "critical"].includes(String(item.severity))).length, "Pending high-risk decisions", pending.some((item) => ["high", "critical"].includes(String(item.severity))) ? "bad" : "good"]]}/>{rows.length === 0 ? <OwnerEmpty icon={<ClipboardCheck size={22} aria-hidden="true" />} title="No Owner-level exceptions" body="No Manager escalation currently requires Owner authorization."/> : <><OwnerToolbar search={search} setSearch={setSearch} searchLabel="Search exceptions" searchPlaceholder="Search reservation, guest, reason…" filters={[{ label: "Status", value: status, onChange: setStatus, options: options(rows.map((item) => item.status), "All statuses") }, { label: "Severity", value: severity, onChange: setSeverity, options: options(rows.map((item) => item.severity), "All severities") }, { label: "Department", value: department, onChange: setDepartment, options: options(rows.map((item) => item.department), "All departments") }]} resultCount={visible.length} resultNoun="exceptions" onClear={clearAll}/>{visible.length === 0 ? <OwnerEmpty icon={<ClipboardCheck size={22} aria-hidden="true" />} title="No exceptions match" body="Try clearing the search and filters to see every escalation." action={<button type="button" className="table-action" onClick={clearAll}>Clear filters</button>}/> : <Table title="Owner exception requests" rows={visible} columns={[{ key: "requested_at", header: "Requested", render: (item) => formatOwnerDate(item.requested_at) }, { key: "request_type", header: "Type", render: (item) => <strong>{label(item.request_type)}</strong> }, { key: "reservation_reference", header: "Reservation", render: (item) => sub(item.reservation_reference, item.guest_name) }, { key: "department", header: "Department", render: (item) => label(item.department) }, { key: "severity", header: "Severity", render: (item) => badge(item.severity) }, { key: "reason", header: "Reason", render: (item) => label(item.reason) }, { key: "owner_escalation_reason", header: "Escalation", render: (item) => sub(item.owner_escalation_reason, item.escalator_name) }, { key: "status", header: "Status", render: (item) => <>{badge(item.status)}<br /><small>{label(item.execution_status)}</small></> }, { key: "actions", header: "Actions", render: (item) => (item.status === "pending" ? <div className="reservation-actions"><button className="table-action" onClick={() => review(item, "approve")}>Authorize</button><button className="table-action danger-action" onClick={() => review(item, "reject")}>Reject</button></div> : <small>{label(item.decision_reason)}</small>) }]} noun="exceptions" note="Executive escalation order retained."/>}</>}</>;
}
function Audit({ rows, security }: { rows: Row[]; security: boolean }) {
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("all");
  const [entity, setEntity] = useState("all");
  const [recency, setRecency] = useState("all");
  const [detail, setDetail] = useState<Row | null>(null);
  const dayMs = 86400000;
  const searched = useOwnerSearch(rows, search);
  const visible = searched.filter((item) => (eventType === "all" || String(item.action) === eventType) && (entity === "all" || String(item.entity_type) === entity) && (recency === "all" || (recency === "recent" ? new Date().getTime() - new Date(String(item.created_at)).getTime() < dayMs : new Date().getTime() - new Date(String(item.created_at)).getTime() >= dayMs)));
  const distinct = (pick: (row: Row) => unknown, all: string) => [{ value: "all", label: all }, ...Array.from(new Set(rows.map((row) => String(pick(row) ?? "")).filter(Boolean))).sort().map((value) => ({ value, label: label(value) }))];
  const clearAll = () => { setSearch(""); setEventType("all"); setEntity("all"); setRecency("all"); };
  const recent = rows.filter((item) => new Date().getTime() - new Date(String(item.created_at)).getTime() < dayMs);
  const privileged = rows.filter((item) => /^(admin_|owner_)/.test(String(item.action)));
  const recovery = rows.filter((item) => /recovery|password/i.test(String(item.action)));
  const accountChanges = rows.filter((item) => /status|role/i.test(String(item.action)));
  const meta = (value: unknown) => { try { const text = JSON.stringify(value, null, 2); return text.length > 3000 ? `${text.slice(0, 3000)}…` : text; } catch { return "—"; } };
  return <><Title eyebrow={security ? "Actual security records" : "Immutable governance history"} title={security ? "Security events" : "System audit"} subtitle={security ? "Recorded account, role, password, and recovery events only—no fabricated threat telemetry." : "Broad Owner visibility without update or deletion authority."}/><Cards items={security ? [["Events on record", rows.length, "Security-sensitive entries"], ["Recovery-related", recovery.length, "Recovery and password events", recovery.length > 0 ? "warn" : "good"], ["Account changes", accountChanges.length, "Role, status, and access updates"], ["Last 24 hours", recent.length, "Since this time yesterday", recent.length > 0 ? "warn" : "good"]] : [["Events on record", rows.length, "Immutable entries, newest first"], ["Last 24 hours", recent.length, "Since this time yesterday"], ["Privileged actions", privileged.length, "Admin and Owner operations"], ["Distinct action types", new Set(rows.map((item) => String(item.action))).size, "Recorded event vocabulary"]]}/><OwnerToolbar search={search} setSearch={setSearch} searchLabel={security ? "Search security events" : "Search audit events"} searchPlaceholder="Search action, entity, or record…" filters={[{ label: "Event type", value: eventType, onChange: setEventType, options: distinct((row) => row.action, "All event types") }, { label: "Entity", value: entity, onChange: setEntity, options: distinct((row) => row.entity_type, "All entities") }, { label: "Date", value: recency, onChange: setRecency, options: [{ value: "all", label: "All time" }, { value: "recent", label: "Last 24 hours" }, { value: "older", label: "Older" }] }]} resultCount={visible.length} resultNoun="events" onClear={clearAll}/>{visible.length === 0 ? <OwnerEmpty icon={<FileText size={22} aria-hidden="true" />} title={rows.length === 0 ? (security ? "No security events" : "No audit events") : "No events match"} body={rows.length === 0 ? "Recorded activity will appear here as it is written." : "Try clearing the search and filters to see every event."} action={rows.length > 0 ? <button type="button" className="table-action" onClick={clearAll}>Clear filters</button> : undefined}/> : <Table title={security ? "Security-sensitive events" : "Audit events"} rows={visible} columns={[{ key: "created_at", header: "Time", render: (item) => formatOwnerDate(item.created_at) }, { key: "action", header: "Action", render: (item) => badge(item.action) }, { key: "entity_type", header: "Entity", render: (item) => label(item.entity_type) }, { key: "user_id", header: "Actor", render: (item) => (item.user_id ? <span className="owner-record-id">{shortId(item.user_id)}</span> : <small>System</small>) }, { key: "detail", header: "Detail", render: (item) => <button type="button" className="table-action" onClick={() => setDetail(item)} aria-label={`View details for ${label(item.action)}`}><Eye size={13} aria-hidden="true" />View</button> }]} noun="events" note="Newest first — the full history stays immutable in the database."/>}<Modal isOpen={detail !== null} onClose={() => setDetail(null)} title={detail ? label(detail.action) : "Event detail"} description="Read-only evidence — nothing here can be edited." footer={<button type="button" className="btn btn-soft" onClick={() => setDetail(null)}>Close</button>}>{detail && <dl className="owner-audit-detail"><div><dt>Time</dt><dd>{formatOwnerDate(detail.created_at)}</dd></div><div><dt>Actor</dt><dd>{detail.user_id ? String(detail.user_id) : "System"}</dd></div><div><dt>Action</dt><dd>{label(detail.action)}</dd></div><div><dt>Entity type</dt><dd>{label(detail.entity_type)}</dd></div><div><dt>Record ID</dt><dd>{String(detail.entity_id ?? "—")}</dd></div><div><dt>IP address</dt><dd>{detail.ip_address ? String(detail.ip_address) : "—"}</dd></div>{detail.before_data !== null && detail.before_data !== undefined && <div><dt>Before</dt><dd><pre>{meta(detail.before_data)}</pre></dd></div>}{detail.after_data !== null && detail.after_data !== undefined && <div><dt>After</dt><dd><pre>{meta(detail.after_data)}</pre></dd></div>}</dl>}</Modal></>; }
function Reports({ data }: { data: ExecutiveData }) { const trend = (data.trend ?? []).map((row) => ({ day: String(row.day ?? ""), occupancy: Number(row.occupancy ?? 0), collected: Number(row.collected ?? 0), refunded: Number(row.refunded ?? 0) })); const dayLabel = (day: string) => { try { return new Date(`${day}T00:00:00`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric" }); } catch { return day; } }; return <><Title eyebrow="Executive reporting" title="Seven-day operating summary" subtitle={`Real hotel records aligned to ${data.timeZone ?? "the configured hotel timezone"}.`}/><Cards items={[["Current occupancy", `${data.metrics?.occupancy ?? 0}%`, "Serviceable rooms"], ["Net revenue", money(data.financial?.netRevenue), "Settled collections less refunds", "good"], ["Blocked rooms", data.metrics?.blockedRooms ?? 0, "Technical impact", (data.metrics?.blockedRooms ?? 0) > 0 ? "warn" : "good"], ["Owner exceptions", data.metrics?.pendingOwnerExceptions ?? 0, "Pending decisions", (data.metrics?.pendingOwnerExceptions ?? 0) > 0 ? "warn" : "good"]]}/><div className="owner-chart-grid"><section className="data-panel owner-panel" aria-label="Occupancy last 7 days"><div className="panel-heading"><div><h3>Occupancy — last 7 days</h3><p>Share of serviceable rooms occupied nightly</p></div></div><AccessibleChart data={trend} xKey="day" series={[{ key: "occupancy", label: "Occupancy %", color: "#4fc7ba", type: "area" }]} title="Occupancy last 7 days" description="Nightly share of serviceable rooms occupied." height={240}/></section><section className="data-panel owner-panel" aria-label="Collections last 7 days"><div className="panel-heading"><div><h3>Collections — last 7 days</h3><p>Settled payments versus refunds per day</p></div></div><AccessibleChart data={trend} xKey="day" series={[{ key: "collected", label: "Collected", color: "#65d3a5", type: "bar" }, { key: "refunded", label: "Refunded", color: "#ef797e", type: "bar" }]} title="Collections last 7 days" description="Settled collections and refunds per day." height={240}/></section></div><Table title="Day-by-day performance" rows={trend} columns={[{ key: "day", header: "Day", render: (row) => dayLabel(String(row.day)) }, { key: "occupancy", header: "Occupancy", render: (row) => `${Number(row.occupancy ?? 0)}%` }, { key: "collected", header: "Collected", render: (row) => money(row.collected) }, { key: "refunded", header: "Refunded", render: (row) => money(row.refunded) }]} noun="days" note="Seven-day window ending today."/></>; }
function SummaryPanel({ title, values }: { title: string; values: Record<string, Record<string, number>> }) { return <article className="panel owner-summary-panel"><div className="panel-heading"><div><h3>{title}</h3><p>Live authoritative counts</p></div></div><div className="owner-summary-grid">{Object.entries(values ?? {}).map(([department, metrics]) => <div key={department}><h4>{label(department)}</h4>{Object.entries(metrics).map(([key, value]) => <p key={key}><span>{label(key)}</span><strong>{formatValue(key, value)}</strong></p>)}</div>)}</div></article>; }
const RISK_GROUPS = [["blockedRooms", "Blocked rooms"], ["overdueHousekeeping", "Overdue housekeeping"], ["overdueGuestRequests", "Overdue guest requests"], ["criticalMaintenance", "Critical maintenance"]] as const;
type OwnerTableColumn = string | { key: string; header?: string; render: (row: Row) => ReactNode };
function riskColumns(key: string): OwnerTableColumn[] {
  if (key === "blockedRooms" || key === "criticalMaintenance") return ["room_number", "issue", { key: "priority", header: "Priority", render: (row) => badge(row.priority ?? row.severity) }, "serviceability_impact", { key: "status", header: "Status", render: (row) => badge(row.status) }, { key: "created_at", header: "Reported", render: (row) => formatOwnerDate(row.created_at) }];
  if (key === "overdueGuestRequests") return ["department", { key: "priority", header: "Priority", render: (row) => badge(row.priority) }, { key: "status", header: "Status", render: (row) => badge(row.status) }, "escalation_status", { key: "due_at", header: "Due", render: (row) => (row.due_at ? formatOwnerDate(row.due_at) : "—") }];
  return ["room_number", "task", { key: "priority", header: "Priority", render: (row) => badge(row.priority) }, { key: "status", header: "Status", render: (row) => badge(row.status) }, { key: "created_at", header: "Reported", render: (row) => formatOwnerDate(row.created_at) }];
}
function RiskPanels({ risks }: { risks: Record<string, Row[]> }) { const firstOpen = RISK_GROUPS.find(([key]) => (risks?.[key] ?? []).length > 0)?.[0]; return <div className="owner-risk-stack">{RISK_GROUPS.map(([key, title]) => { const rows = risks?.[key] ?? []; return <OwnerCollapse key={key} title={title} count={rows.length} defaultOpen={key === firstOpen}>{rows.length === 0 ? <p className="owner-collapse-note">Nothing in this queue.</p> : <Table title={title} rows={rows} columns={riskColumns(key)} bare pageSize={8} noun="records" note="Executive source order retained."/>}</OwnerCollapse>; })}</div>; }
function Table({ title, rows, columns, noun = "records", note = "Executive source order retained.", pageSize = 10, empty, bare = false }: { title: string; rows: Row[]; columns: OwnerTableColumn[]; noun?: string; note?: string; pageSize?: number; empty?: ReactNode; bare?: boolean }) {
  const page=useTablePagination(rows, pageSize);
  const cols = columns.map((column) => typeof column === "string" ? { key: column, header: label(column), render: (row: Row) => formatValue(column, row[column]) } : { key: column.key, header: column.header ?? label(column.key), render: column.render });
  const body = <>{rows.length === 0 ? (empty ?? <div className="empty"><p>No matching records.</p></div>) : <div className="table-scroll"><table aria-label={title}><thead><tr>{cols.map((column) => <th key={column.key} scope="col">{column.header}</th>)}</tr></thead><tbody>{page.rows.map((row, index) => <tr key={String(row.id ?? `${title}-${index}`)}>{cols.map((column) => <td key={column.key}>{column.render(row)}</td>)}</tr>)}</tbody></table></div>}{rows.length > 0 && <TablePagination {...page} onPageChange={page.setPage} noun={noun} note={note}/>}</>;
  if (bare) return <div className="owner-bare-table">{body}</div>;
  return <article className="data-panel owner-table"><div className="panel-heading"><div><h3>{title}</h3><p>{rows.length} authoritative {rows.length === 1 ? noun.replace(/s$/, "") : noun}</p></div></div>{body}</article>;
}
