"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Activity, AlertTriangle, BedDouble, Bell, Boxes, Building2, CalendarCheck, CalendarDays, CarTaxiFront, CheckCircle2, ChevronDown, ChevronRight, CircleDollarSign, ClipboardCheck, Clock, DoorClosed, Download, Eye, FileText, Gauge, Landmark, ListChecks, LogIn, LogOut, PanelLeftClose, Plus, QrCode, ReceiptText, Scale, Search, Settings, Sparkles, TrendingUp, Users, Wallet, Wrench } from "lucide-react";
import { approvalKind, compareApprovalUrgency, formatDetail, waitingSince } from "@/lib/approval-display";
import { ROOM_TYPE_CHANGE_REASONS, roomTypeChangeReasonLabel, financialDifference, type RoomTypeChangeFinancials } from "@/lib/room-type-change-reasons";
import { requestLabel } from "@/lib/request-options";
import { parseFrozenRates } from "@/lib/rate-plans";
import { depositAgeBand, depositAgeMinutes, formatDepositAge, DEFAULT_DEPOSIT_SLA_HOURS } from "@/lib/deposit-sla";
import { ASSET_DUE_WINDOWS, assetDueWindow, daysUntil, type MaintenanceAsset } from "@/lib/maintenance-assets";
import { ThemeToggle } from "@/components/theme-toggle";
import { Modal } from "@/components/ui/Modal";
import { RoomTypeBadge } from "@/components/ui/RoomTypeBadge";
import { QrScannerModal } from "@/components/qr/qr-scanner";
import { SettingsDialog } from "@/components/ui/SettingsDialog";
import { isRefundActionable, ratePercent } from "@/lib/accounting";
import type { AccountingLedger } from "@/lib/accounting";
import type { AccountingSection, DashboardData, ManagerSection, RecordItem, Resource, Role } from "@/lib/types";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import RoomCatalogPanel from "@/components/catalog/room-catalog-panel";
import TransportServicesPanel from "@/components/catalog/transport-vehicle-types-panel";
import RequestTypesPanel from "@/components/catalog/request-types-panel";
import TransportationPanel from "@/components/manager/transportation-panel";
import FrontDeskReportsPanel from "@/components/manager/front-desk-reports-panel";
import GuestRequestsPanel from "@/components/manager/guest-requests-panel";
import RoomDetailModal from "@/components/manager/room-detail-modal";
import RoomRosterPanel from "@/components/manager/room-roster-panel";
import HousekeepingQueuePanel from "@/components/manager/housekeeping-queue-panel";
import type { AssignmentSuggestion } from "@/lib/housekeeping-suggestions";
import FrontDeskArrivalDialog, { type ArrivalProgress } from "@/components/manager/front-desk-arrival-dialog";
import WalkInDialog from "@/components/manager/walk-in-dialog";
import ExtendStayDialog from "@/components/manager/extend-stay-dialog";
import PredictiveInsightsPanel from "@/components/manager/predictive-insights-panel";
import HavenAiPanel from "@/components/manager/haven-ai-panel";
import StaffDutyPanel from "@/components/manager/staff-duty-panel";
import { ManagerReservationsPanel } from "@/components/manager/manager-reservations-panel";
import { ModuleSummaryCards, type ModuleSummaryCard } from "@/components/manager/module-summary-cards";
import { ToastStack, useToasts } from "@/components/ui/toast-stack";

type ReservationDetail = { reservation: RecordItem; guest: RecordItem | null; invoice: RecordItem | null; payments: RecordItem[]; charges: RecordItem[]; adjustments: RecordItem[]; refunds: RecordItem[]; refundAttempts: RecordItem[]; documents: RecordItem[]; changeRequests: RecordItem[]; assignments: RecordItem[]; requests: RecordItem[]; room: RecordItem | null; maintenance: RecordItem[]; transportation?: RecordItem[]; approvals?: RecordItem[]; turnover?: RecordItem | null };
// Read-only consolidated guest profile (GET /api/staff/guests/[id]) — identity,
// stay history, service history, explicit preferences, and a financial summary
// that only roles allowed to see reservation financials ever receive.
type GuestProfile = { guest: RecordItem; stays: RecordItem[]; stayCounts: { current: number; upcoming: number; completed: number; cancelled: number; noShow: number }; requests: RecordItem[]; transportation: RecordItem[]; assignments: RecordItem[]; approvals: RecordItem[]; invoices: RecordItem[]; financial: { billed: number; paid: number; outstanding: number } | null; requestOptions: string[]; financialVisible: boolean };

type User = { id: string; name?: string | null; email?: string | null; role: Role };
// Roadmap Phase 7 — forecast shortage suggestion (GET /api/inventory/purchase-orders).
type ReplenishmentSuggestion = { itemId: string; name: string; unit: string; currentStock: number; reorderPoint: number; predictedConsumption: number | null; projectedShortage: number | null; suggestedQuantity: number; unitCost: number; riskBasis: string; risk: string };
type Section = "overview" | Resource | "reports" | AccountingSection | ManagerSection;
const accountingSections: AccountingSection[] = ["transactions", "folios", "cash_shifts", "reconciliation", "documents"];
const isAccountingSection=(value:Section):value is AccountingSection=>(accountingSections as string[]).includes(value);
const isResourceSection = (value: Section): value is Resource => value !== "overview" && value !== "reports" && value!=="approvals" && !isAccountingSection(value);

// Sidebar categories — presentation only. RBAC (the access map + per-item roles)
// is untouched; groupedNav simply drops a category whose items were all filtered out.
type NavGroupId = "workspace" | "front_office" | "operations" | "finance" | "management";
export const NAV_GROUPS: { id: NavGroupId; label: string }[] = [{ id: "workspace", label: "Workspace" }, { id: "front_office", label: "Front Office" }, { id: "operations", label: "Operations" }, { id: "finance", label: "Finance" }, { id: "management", label: "Management" }];
export const nav: { label: string; section: Section; icon: React.ElementType; roles?: Role[]; group: NavGroupId }[] = [
  { label: "Overview", section: "overview", icon: Gauge, group: "workspace" }, { label: "Reservations", section: "reservations", icon: CalendarDays, group: "front_office" }, { label: "Rooms", section: "rooms", icon: BedDouble, group: "front_office" }, { label: "Guests", section: "guests", icon: Users, group: "front_office" }, { label: "Guest Requests", section: "guest_requests", icon: Bell, group: "front_office" }, { label: "Transportation", section: "transportation", icon: CarTaxiFront, roles:["front_desk","manager","owner"], group: "front_office" }, { label: "Approvals & Escalations", section: "approvals", icon: ClipboardCheck, roles:["manager","front_desk","housekeeping","maintenance","accounting"], group: "operations" }, { label: "Housekeeping", section: "housekeeping_tasks", icon: ClipboardCheck, group: "operations" }, { label: "Maintenance", section: "maintenance_orders", icon: Wrench, group: "operations" }, { label: "Inventory", section: "inventory", icon: Boxes, group: "operations" }, { label: "Reports", section: "reports", icon: Activity, roles: ["manager", "accounting", "front_desk"], group: "operations" }, { label: "Billing", section: "invoices", icon: ReceiptText, group: "finance" }, { label: "Transactions", section: "transactions", icon: Activity, roles: ["front_desk", "accounting"], group: "finance" }, { label: "Guest Folios", section: "folios", icon: FileText, roles: ["front_desk", "accounting"], group: "finance" }, { label: "Deposit Verification", section: "payments", icon: CircleDollarSign, group: "finance" }, { label: "Refunds", section: "refunds", icon: CircleDollarSign, roles: ["accounting"], group: "finance" }, { label: "Cash & Shifts", section: "cash_shifts", icon: Wallet, roles: ["front_desk", "accounting"], group: "finance" }, { label: "Reconciliation", section: "reconciliation", icon: Scale, roles: ["accounting"], group: "finance" }, { label: "Financial Documents", section: "documents", icon: Landmark, roles: ["front_desk", "accounting"], group: "finance" }, { label: "Staff & Duty", section: "staff_duty", icon: Users, roles:["manager"], group: "management" }, { label: "Room Types & Photos", section: "room_types", icon: Building2, roles:["manager"], group: "management" }, { label: "Transfer Vehicles", section: "transport_services", icon: CarTaxiFront, roles:["manager"], group: "management" }, { label: "Request Types", section: "request_types", icon: ListChecks, roles:["manager"], group: "management" }, { label: "Predictive Insights", section: "insights", icon: TrendingUp, roles:["manager"], group: "management" }, { label: "HAVEN AI", section: "ai", icon: Sparkles, roles:["manager"], group: "management" }
];
// Exported for the pure grouping tests (manager-sidebar-nav.test.tsx).
export const groupedNav = (items: typeof nav) => NAV_GROUPS.map((group) => ({ ...group, items: items.filter((item) => item.group === group.id) })).filter((group) => group.items.length > 0);
// The active module's group is always open — its page can never be hidden inside a collapsed category.
export const isGroupOpen = (state: Record<string, boolean>, group: { id: string; items: { section: Section }[] }, section: Section) => (state[group.id] ?? false) || group.items.some((item) => item.section === section);

// Sidebar category dropdowns own their open/closed state here so a toggle
// re-renders only the nav — not the whole dashboard workspace (the root-level
// state made the dropdowns feel unresponsive on click).
// Module badges = outstanding actionable workload (0 renders nothing), never
// unread notifications — the bell owns that concept.
export function badgeLabel(count: number) { return count > 99 ? "99+" : String(count); }
// Alert-id prefixes that carry operational risk or a decision waiting →
// warning tone (longer auto-dismiss) instead of plain info.
const ALERT_TOAST_TONES = ["manager-maintenance-", "manager-escalation-", "manager-room-risk-", "manager-approval-", "refund-", "balance-", "room-block-"];
export function ManagerSidebarNav({ items, section, onSelect, badges }: { items: typeof nav; section: Section; onSelect: (section: Section) => void; badges: Partial<Record<Section, number>> }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    // Collapsed/expanded categories persist like the sidebar rail toggle does.
    window.setTimeout(()=>{try{const saved:unknown=JSON.parse(window.localStorage.getItem("haven-sidebar-groups") ?? "{}");if(saved&&typeof saved==="object")setOpenGroups(saved as Record<string,boolean>)}catch{}},0);
  }, []);
  return <nav aria-label="Modules">{groupedNav(items).map((group)=>{const open=isGroupOpen(openGroups,group,section);const groupBadge=group.items.reduce((sum,item)=>sum+(badges[item.section]??0),0);return <div className="nav-group-wrap" key={group.id}>
        <button className="nav-caption nav-group-header" aria-expanded={open} aria-controls={`nav-group-${group.id}`} onClick={()=>setOpenGroups((prev)=>{const next={...prev,[group.id]:!(prev[group.id]??false)};window.localStorage.setItem("haven-sidebar-groups",JSON.stringify(next));return next})}><span className="nav-group-label">{group.label}</span>{!open&&groupBadge>0&&<i className="nav-badge">{badgeLabel(groupBadge)}</i>}<ChevronRight size={13} className="nav-group-chevron" aria-hidden="true"/></button>
        <div className={`nav-group${open?" open":""}`} id={`nav-group-${group.id}`}><div className="nav-group-items">{group.items.map(({label: text,section: target,icon:Icon})=>{const count=badges[target]??0;return <button key={target} className={section===target?"active":""} onClick={()=>onSelect(target)} title={text}><Icon size={18}/><span className="nav-label">{text}</span>{count>0&&<i className="nav-badge">{badgeLabel(count)}</i>}</button>})}</div></div>
      </div>})}</nav>;
}

const config: Record<Resource, { title: string; subtitle: string; columns: { key: string; label: string; money?: boolean }[]; fields: { key: string; label: string; type?: string; value?: string | number }[]; statuses?: string[] }> = {
  reservations: { title: "Reservations", subtitle: "One queue for direct and website bookings, from confirmation through departure.", columns: [{key:"confirmation_number",label:"Reference"},{key:"guest_name",label:"Guest"},{key:"room_type",label:"Room type"},{key:"room_number",label:"Room"},{key:"check_in",label:"Check in"},{key:"check_out",label:"Check out"},{key:"total",label:"Total",money:true},{key:"folio_balance",label:"Balance",money:true},{key:"identity_status",label:"ID"},{key:"payment_status",label:"Payment"},{key:"source",label:"Source"},{key:"status",label:"Status"}], fields: [], statuses:["pending","confirmed","checked_in","checked_out","cancelled","no_show"] },
  rooms: { title: "Rooms & availability", subtitle: "A live view of every room and its readiness.", columns: [{key:"number",label:"Room"},{key:"floor",label:"Floor"},{key:"type",label:"Type"},{key:"rate",label:"Nightly rate",money:true},{key:"housekeeping",label:"Housekeeping"},{key:"status",label:"Status"}], fields: [{key:"number",label:"Room number"},{key:"floor",label:"Floor",type:"number",value:1},{key:"type",label:"Room type",value:"Deluxe King"},{key:"rate",label:"Nightly rate",type:"number",value:6400},{key:"housekeeping",label:"Housekeeping",value:"clean"},{key:"status",label:"Status",value:"available"}], statuses:["available","reserved","occupied","dirty","maintenance"] },
  guests: { title: "Guest profiles", subtitle: "Preferences, loyalty, and stay history in one place.", columns: [{key:"id",label:"Guest ID"},{key:"name",label:"Name"},{key:"email",label:"Email"},{key:"loyalty_tier",label:"Loyalty"},{key:"stays",label:"Stays"},{key:"preferences",label:"Preferences"}], fields: [{key:"name",label:"Full name"},{key:"email",label:"Email",type:"email"},{key:"phone",label:"Phone"},{key:"loyalty_tier",label:"Loyalty tier",value:"Member"},{key:"stays",label:"Past stays",type:"number",value:0},{key:"preferences",label:"Preferences"}] },
  guest_requests: { title: "Guest requests", subtitle: "Customer assistance routed to the appropriate hotel team.", columns: [{key:"id",label:"Request"},{key:"reservation_id",label:"Reservation"},{key:"request",label:"Guest need"},{key:"department",label:"Routed to"},{key:"priority",label:"Priority"},{key:"created_at",label:"Submitted"},{key:"status",label:"Status"}], fields: [{key:"reservation_id",label:"Reservation ID"},{key:"request",label:"Guest need"},{key:"department",label:"Department",value:"front_desk"},{key:"priority",label:"Priority",value:"normal"},{key:"status",label:"Status",value:"open"}], statuses:["open","in_progress","completed"] },  housekeeping_tasks: { title: "Housekeeping", subtitle: "A live, auditable room-care queue from turnover through inspection and readiness.", columns: [{key:"room_number",label:"Room"},{key:"room_type",label:"Type"},{key:"task_type",label:"Work type"},{key:"task",label:"Service"},{key:"assigned_to",label:"Assigned"},{key:"priority",label:"Priority"},{key:"due",label:"Due"},{key:"next_arrival",label:"Next arrival"},{key:"room_housekeeping",label:"Room state"},{key:"maintenance_blocked",label:"Maintenance"},{key:"inspection_status",label:"Inspection"},{key:"status",label:"Task status"}], fields: [] },
  maintenance_orders: { title: "Maintenance", subtitle: "Diagnose, repair, and restore technical serviceability without changing occupancy or Housekeeping ownership.", columns: [{key:"id",label:"Work order"},{key:"room_number",label:"Location"},{key:"issue",label:"Reported issue"},{key:"assignee",label:"Technician"},{key:"severity",label:"Severity"},{key:"serviceability_impact",label:"Serviceability"},{key:"parts_status",label:"Parts"},{key:"estimated_completion",label:"ETA"},{key:"status",label:"Status"}], fields: [] },
  invoices: { title: "Billing & payments", subtitle: "Review folios, deposits, balances, and payments.", columns: [{key:"id",label:"Invoice"},{key:"guest_name",label:"Guest"},{key:"reservation_id",label:"Booking"},{key:"amount",label:"Amount",money:true},{key:"paid",label:"Paid",money:true},{key:"balance",label:"Balance",money:true},{key:"status",label:"Status"}], fields: [{key:"reservation_id",label:"Reservation ID"},{key:"guest_name",label:"Guest name"},{key:"amount",label:"Amount",type:"number",value:0},{key:"paid",label:"Paid",type:"number",value:0},{key:"balance",label:"Balance",type:"number",value:0},{key:"method",label:"Payment method",value:"Cash"},{key:"status",label:"Status",value:"unpaid"}], statuses:["unpaid","deposit","partial","paid"] },
  payments: { title: "Deposit verification", subtitle: "Verify submitted reservation deposits before online bookings are confirmed.", columns: [{key:"reservation_id",label:"Reservation"},{key:"purpose",label:"Purpose"},{key:"method",label:"Method"},{key:"reference",label:"Reference"},{key:"amount",label:"Amount",money:true},{key:"submitted_at",label:"Submitted"},{key:"status",label:"Status"}], fields: [] },
  refunds: { title: "Refunds", subtitle: "Process policy-calculated refunds without deleting or rewriting original payments.", columns: [{key:"id",label:"Refund"},{key:"reservation_id",label:"Reservation"},{key:"reason",label:"Reason"},{key:"basis",label:"Basis"},{key:"eligible_amount",label:"Eligible",money:true},{key:"processed_amount",label:"Processed",money:true},{key:"reference",label:"Reference"},{key:"status",label:"Status"}], fields: [] },
  inventory: { title: "Inventory", subtitle: "Monitor supplies and reorder before stocks run low.", columns: [{key:"id",label:"Item ID"},{key:"name",label:"Item"},{key:"category",label:"Category"},{key:"quantity",label:"In stock"},{key:"reorder_point",label:"Reorder at"},{key:"unit",label:"Unit"},{key:"status",label:"Status"}], fields: [{key:"name",label:"Item name"},{key:"category",label:"Category"},{key:"quantity",label:"Quantity",type:"number",value:0},{key:"reorder_point",label:"Reorder point",type:"number",value:10},{key:"unit",label:"Unit",value:"pcs"},{key:"status",label:"Status",value:"healthy"}], statuses:["healthy","low","out"] },
  staff: { title: "Staff & shifts", subtitle: "Roles, attendance, and today s team schedule.", columns: [{key:"id",label:"Staff ID"},{key:"name",label:"Name"},{key:"role",label:"Role"},{key:"department",label:"Department"},{key:"shift",label:"Shift"},{key:"attendance",label:"Attendance"},{key:"status",label:"Status"}], fields: [{key:"name",label:"Full name"},{key:"role",label:"Role"},{key:"department",label:"Department"},{key:"shift",label:"Shift",value:"Morning"},{key:"attendance",label:"Attendance",value:"Scheduled"},{key:"status",label:"Status",value:"off_duty"}], statuses:["off_duty","on_duty","on_leave"] }
};

// Accounting workspaces read one ledger endpoint. Nothing here mutates a ledger table directly -
// every action posts to an accounting route that calls a security-definer RPC.
const accountingViews: Record<AccountingSection, { title: string; subtitle: string; source: "transactions" | "invoices" | "cashShifts" | "reconciliations" | "documents"; columns: { key: string; label: string; money?: boolean }[] }> = {
  transactions: { title: "Transactions", subtitle: "Every money movement in one ledger. Settled payments are immutable - corrections are made by reversal or adjustment, never by editing history.", source: "transactions", columns: [{key:"created_at",label:"Recorded"},{key:"reservation_id",label:"Reservation"},{key:"purpose",label:"Purpose"},{key:"method",label:"Method"},{key:"reference",label:"Reference"},{key:"amount",label:"Amount",money:true},{key:"status",label:"Status"}] },
  folios: { title: "Guest folios", subtitle: "One authoritative folio per reservation: room obligation, posted charges, adjustments, payments, balance, and credit.", source: "invoices", columns: [{key:"reservation_id",label:"Reservation"},{key:"guest_name",label:"Guest"},{key:"amount",label:"Folio total",money:true},{key:"paid",label:"Net paid",money:true},{key:"balance",label:"Balance",money:true},{key:"credit_balance",label:"Credit",money:true},{key:"status",label:"Status"}] },
  cash_shifts: { title: "Cash & shifts", subtitle: "Expected cash is recomputed from the payments recorded against each shift. A counted difference is stored as a variance, never used to rewrite a guest payment.", source: "cashShifts", columns: [{key:"opened_at",label:"Opened"},{key:"staff_name",label:"Cashier"},{key:"location",label:"Location"},{key:"opening_amount",label:"Float",money:true},{key:"collected",label:"Collected",money:true},{key:"expected_cash",label:"Expected",money:true},{key:"actual_cash",label:"Counted",money:true},{key:"variance",label:"Variance",money:true},{key:"status",label:"Status"}] },
  reconciliation: { title: "Reconciliation", subtitle: "Compare recorded collections against an external statement figure. Reconciliation records variance - it never edits a guest payment.", source: "reconciliations", columns: [{key:"period_start",label:"From"},{key:"period_end",label:"To"},{key:"payment_method",label:"Method"},{key:"expected_amount",label:"Recorded",money:true},{key:"settled_amount",label:"Statement",money:true},{key:"variance",label:"Variance",money:true},{key:"status",label:"Status"}] },
  documents: { title: "Financial documents", subtitle: "Immutable receipt and folio-statement snapshots generated server-side from authoritative records.", source: "documents", columns: [{key:"document_number",label:"Number"},{key:"document_type",label:"Type"},{key:"reservation_id",label:"Reservation"},{key:"payment_id",label:"Payment"},{key:"created_at",label:"Issued"}] }
};

const peso = (value: unknown) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number(value || 0));
const pesoExact = (value: unknown) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(value || 0));
const label = (value: unknown) => String(value ?? " ").replaceAll("_", " ");
// Display-only date formatting (queue filters keep comparing raw ISO strings).
const monthDay = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
const fmtDate = (value: unknown) => { const raw = String(value ?? ""); if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return label(value); const date = new Date(`${raw.slice(0, 10)}T00:00:00Z`); if (Number.isNaN(date.getTime())) return label(value); return monthDay.format(date); };
const nights = (checkIn: unknown, checkOut: unknown) => { const from = new Date(`${String(checkIn ?? "").slice(0, 10)}T00:00:00Z`); const to = new Date(`${String(checkOut ?? "").slice(0, 10)}T00:00:00Z`); if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0; return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000)); };
// Approval timestamps render as "Sep 8, 10:42 AM" in property time instead of the raw ISO string.
const requestStamp = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
const fmtStamp = (value: unknown) => { const date = new Date(String(value ?? "")); return Number.isNaN(date.getTime()) ? label(value) : requestStamp.format(date); };
// Refund basis: policy-computed refunds (no linked approval) are Accounting's to
// process directly; exception refunds carry the Manager approval that authorized
// the amount. Badges mirror the server-side distinction (exception_approval_id).
// Exported for the jsdom queue-badge test (approvals-view.test.tsx).
export const refundBasisBadge = (item: RecordItem) => {
  if (!item.exception_approval_id) return <span className="badge within-policy" title="Computed from the reservation's frozen cancellation policy — no Manager approval required">Within policy</span>;
  if (item.approval_status === "pending") return <span className="badge approval-required" title="Awaiting Manager review before this refund can exist">Manager approval required</span>;
  return <span className="badge approved-exception" title={`Manager-approved exception${Number(item.normal_policy_amount || 0) > 0 ? ` — policy amount was ${pesoExact(item.normal_policy_amount)}` : ""}`}>Approved exception</span>;
};
// Quick-overview cards for the operational modules: status counts derived purely
// from the already-loaded rows (the /api/resources list is unpaginated, so these
// ARE the module totals), computed with the same queue predicates the filters
// use — card count, filter chip count and visible rows can never disagree.
// Cards carrying `queue` are clickable and activate that existing filter;
// the rest are informational. Exported for module-summary.test.tsx.
export function moduleSummary(resource: Resource, items: RecordItem[], today: string, depositSlaHours = DEFAULT_DEPOSIT_SLA_HOURS): ModuleSummaryCard[] {
  const count = (predicate: (item: RecordItem) => boolean) => items.filter(predicate).length;
  const byStatus = (status: string) => count((item) => String(item.status) === status);
  switch (resource) {
    case "reservations":
      return [
        { label: "Active", value: count((item) => ["pending", "confirmed", "checked_in"].includes(String(item.status))), hint: "Pending, confirmed & in-house", icon: CalendarDays, tone: "today" },
        { label: "Arrivals today", value: count((item) => queueFilter(item, "arrivals", "all", today)), hint: "Expected check-ins", icon: LogIn, tone: "active", queue: "arrivals" },
        { label: "Departures today", value: count((item) => queueFilter(item, "departures", "all", today)), hint: "Due to check out", icon: LogOut, tone: "attention", queue: "departures" },
        { label: "In-house", value: count((item) => queueFilter(item, "in_house", "all", today)), hint: "Current stays", icon: BedDouble, tone: "done", queue: "in_house" },
        // Arrival readiness blockers (the retired ArrivalLane's logic): today's
        // confirmed arrivals still missing ID verification, a room, or settlement.
        // No filter maps to this set → informational.
        { label: "Arrivals needing prep", value: count((item) => String(item.check_in) === today && String(item.status) === "confirmed" && (!item.room_number || String(item.identity_status) !== "verified" || Number(item.folio_balance || 0) > 0)), hint: "ID, room or balance pending", icon: LogIn, tone: "attention" },
      ];
    case "maintenance_orders":
      return [
        { label: "Unclaimed", value: count((item) => ["open", "assigned"].includes(String(item.status))), hint: "Open or assigned", icon: Wrench, tone: "attention" },
        { label: "In progress", value: byStatus("in_progress"), hint: "Active repairs", icon: Wrench, tone: "today" },
        { label: "Waiting parts / deferred", value: count((item) => ["waiting_parts", "deferred"].includes(String(item.status))), hint: "Held work orders", icon: Wrench },
        { label: "Blocked rooms", value: count((item) => String(item.serviceability_impact) === "blocked"), hint: "Unsellable from diagnosis", icon: BedDouble, tone: "attention" },
        { label: "Urgent or critical", value: count((item) => ["high", "critical"].includes(String(item.severity))), hint: "High-severity orders", icon: Wrench, tone: "attention" },
      ];
    case "rooms":
      return [
        { label: "Available", value: byStatus("available"), hint: "Ready to assign", icon: BedDouble, tone: "done" },
        { label: "Dirty", value: byStatus("dirty"), hint: "Awaiting housekeeping", icon: BedDouble, tone: "attention" },
        { label: "Maintenance", value: byStatus("maintenance"), hint: "Blocked from sale", icon: Wrench, tone: "attention" },
        { label: "Occupied", value: byStatus("occupied"), hint: "Guests in house", icon: Users, tone: "today" },
        { label: "Reserved", value: byStatus("reserved"), hint: "Held for arrivals", icon: CalendarDays },
      ];
    case "inventory":
      return [
        { label: "Healthy", value: byStatus("healthy"), hint: "Stock above reorder point", icon: Boxes, tone: "done" },
        { label: "Low", value: byStatus("low"), hint: "At or near reorder point", icon: Boxes, tone: "attention" },
        { label: "Out of stock", value: byStatus("out"), hint: "Needs replenishment", icon: Boxes, tone: "attention" },
      ];
    case "payments":
      return [
        { label: "Pending verification", value: byStatus("pending_verification"), hint: "Deposits & stay payments", icon: CircleDollarSign, tone: "attention" },
        { label: "Past SLA", value: count((item) => item.status === "pending_verification" && depositAgeBand(item.submitted_at, depositSlaHours) === "breach"), hint: depositSlaHours > 0 ? `Waiting over ${depositSlaHours}h` : "SLA tracking off", icon: Clock, tone: "attention" },
        { label: "Failed or rejected", value: count((item) => ["failed", "rejected"].includes(String(item.status))), hint: "Needs resubmission", icon: CircleDollarSign },
      ];
    case "refunds":
      return [
        { label: "Within policy, to settle", value: count((item) => item.status !== "processed" && !item.exception_approval_id), hint: "Accounting settles directly", icon: CircleDollarSign, tone: "attention" },
        { label: "Awaiting Manager approval", value: count((item) => item.status !== "processed" && Boolean(item.exception_approval_id) && item.approval_status === "pending"), hint: "Exception amounts", icon: ClipboardCheck, tone: "attention" },
        { label: "Processed", value: byStatus("processed"), hint: "Settled refunds", icon: CheckCircle2, tone: "done" },
        { label: "Failed", value: byStatus("failed"), hint: "Retryable", icon: CircleDollarSign, tone: "attention" },
      ];
    case "invoices":
      return [
        { label: "Unpaid", value: byStatus("unpaid"), hint: "No payment recorded", icon: ReceiptText, tone: "attention" },
        { label: "Partial", value: byStatus("partial"), hint: "Balance remaining", icon: ReceiptText, tone: "attention" },
        { label: "Paid", value: byStatus("paid"), hint: "Settled folios", icon: CheckCircle2, tone: "done" },
        { label: "Outstanding balance", value: peso(items.reduce((sum, item) => sum + Number(item.balance || 0), 0)), hint: "Across all folios", icon: ReceiptText, tone: "today" },
      ];
    case "guest_requests":
      return [
        { label: "Open", value: byStatus("open"), hint: "Awaiting the department", icon: Bell, tone: "attention" },
        { label: "In progress", value: byStatus("in_progress"), hint: "Being handled", icon: Bell, tone: "today" },
        { label: "Completed", value: byStatus("completed"), hint: "Resolved requests", icon: CheckCircle2, tone: "done" },
        { label: "Escalated", value: count((item) => String(item.escalation_status) === "escalated"), hint: "Raised to Manager", icon: Bell, tone: "attention" },
      ];
    default:
      return [];
  }
}

// Real request_type categories from the backend — the only groups the type filter offers.
const approvalTypeGroups: [string, string[]][] = [["Operational", ["room_upgrade", "room_type_exception", "reservation_modification", "early_check_in", "late_checkout", "stay_extension"]], ["Financial", ["guest_compensation", "refund_exception", "checkout_exception"]], ["Escalation", ["guest_escalation"]]];
const access: Record<Role, Section[]> = { owner:[], admin:[], manager:["overview","reservations","rooms","guests","guest_requests","transportation","room_types","transport_services","request_types","staff_duty","housekeeping_tasks","maintenance_orders","inventory","approvals","reports","insights","ai"], front_desk:["overview","reservations","rooms","guests","guest_requests","transportation","housekeeping_tasks","invoices","payments","transactions","folios","cash_shifts","documents","approvals","reports"], housekeeping:["overview","rooms","guest_requests","housekeeping_tasks","inventory","approvals"], maintenance:["overview","rooms","guest_requests","maintenance_orders","inventory","approvals"], accounting:["overview","reservations","invoices","payments","refunds","reports","transactions","folios","cash_shifts","reconciliation","documents","approvals"], guest:["overview","reservations","invoices"] };

// Validators + option builders shared by the in-app dialog forms. FormDialog is
// noValidate and only validates fields that carry an explicit .validation callback,
// so every "required" field in these forms must supply one (see FormDialog.tsx).
const required = (message = "This field is required.") => (v: string | number | boolean) => (String(v ?? "").trim() ? null : message);
const positive = (message = "Amount must be greater than zero.") => (v: string | number | boolean) => { const s = String(v ?? "").trim(); const n = Number(s); return s !== "" && Number.isFinite(n) && n > 0 ? null : message; };
const nonNegative = (message = "Amount cannot be negative.") => (v: string | number | boolean) => { const s = String(v ?? "").trim(); const n = Number(s); return s !== "" && Number.isFinite(n) && n >= 0 ? null : message; };
const dateField = (message = "Enter a valid date (YYYY-MM-DD).") => (v: string | number | boolean) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "").trim()) ? null : message);
const options = (...values: string[]) => values.map((value) => ({ value, label: label(value) }));

export default function ManagerDashboardClient({ user }: { user: User }) {
  const [section, setSection] = useState<Section>("overview");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [ledger, setLedger] = useState<AccountingLedger | null>(null);
  const [items, setItems] = useState<RecordItem[]>([]);
  const [mode, setMode] = useState("demo");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(false);
  const [menu, setMenu] = useState(false);
  // Transient toast stack — one controller for both surfaces: new-alert toasts
  // (from the dashboard poll diff) and local action feedback (notify()).
  const toastController = useToasts();
  const [notificationsHover,setNotificationsHover]=useState(false);
  const [notificationsPinned,setNotificationsPinned]=useState(false);
  const [profileOpen,setProfileOpen]=useState(false);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [detail,setDetail]=useState<ReservationDetail|null>(null);
  const [guestProfile,setGuestProfile]=useState<GuestProfile|null>(null);
  const [roomDetail,setRoomDetail]=useState<RecordItem|null>(null);
  const [roster,setRoster]=useState(false);
  const [arrival,setArrival]=useState<{item:RecordItem;exceptionType?:string|null}|null>(null);
  // Wizard progress per reservation so closing and reopening Assign & Check In resumes
  // where the front desk left off (in-memory only; cleared on successful check-in).
  // One slot per reservation — peeking at another guest mid-arrival never clobbers it.
  const [arrivalResume,setArrivalResume]=useState<Record<string,ArrivalProgress>>({});
  const [walkIn,setWalkIn]=useState(false);
  // Extend-stay dialog state: the open reservation plus its departure trips
  // (flagged, never rescheduled) — populated from the detail modal.
  const [extendStayOpen,setExtendStayOpen]=useState<{reservation:RecordItem;transportation?:RecordItem[]}|null>(null);
  const [scanOpen,setScanOpen]=useState(false);
  const [verifyPayment,setVerifyPayment]=useState<RecordItem|null>(null);
  const [verifying,setVerifying]=useState(false);
  const [guestProfiles,setGuestProfiles]=useState<RecordItem[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [myShift, setMyShift] = useState<{ open: boolean; location: string | null; opened_at: string | null } | null>(null);
  // Roadmap Phase 7 — inventory replenishment suggestions + draft POs
  // (Manager/Owner/Admin; advisory strip + draft creation, never submission).
  const replenishmentRoles = ["manager", "owner", "admin"].includes(user.role);
  const [replenishment, setReplenishment] = useState<{ suggestions: ReplenishmentSuggestion[]; drafts: RecordItem[]; vendors: { id: string; name: string }[] } | null>(null);
  const refreshReplenishment = useCallback(async () => { try { const response = await fetch("/api/inventory/purchase-orders", { cache: "no-store" }); const body = await response.json(); if (response.ok && body?.data) setReplenishment({ suggestions: body.data.suggestions ?? [], drafts: body.data.drafts ?? [], vendors: body.data.vendors ?? [] }); } catch {} }, []);
  useEffect(() => { if (!replenishmentRoles) return; const initial = window.setTimeout(() => refreshReplenishment(), 0); return () => { window.clearTimeout(initial); }; }, [replenishmentRoles, refreshReplenishment]);
  // Roadmap Phase 8 — preventive maintenance asset registry (real assets the
  // hotel registers itself; due dates are derived facts, visibility only).
  const assetRoles = ["maintenance", "manager"].includes(user.role);
  const [maintenanceAssets, setMaintenanceAssets] = useState<MaintenanceAsset[] | null>(null);
  const refreshAssets = useCallback(async () => { try { const response = await fetch("/api/maintenance/assets", { cache: "no-store" }); const body = await response.json(); if (response.ok && body?.data) setMaintenanceAssets(body.data.assets ?? []); } catch {} }, []);
  useEffect(() => { if (!assetRoles) return; const initial = window.setTimeout(() => refreshAssets(), 0); return () => { window.clearTimeout(initial); }; }, [assetRoles, refreshAssets]);
  // Roadmap Phase 6 — advisory housekeeping assignment plan for the queue panel.
  const canSeeSuggestions = ["housekeeping","manager","owner"].includes(user.role);
  const [suggestions, setSuggestions] = useState<AssignmentSuggestion[]>([]);
  const refreshSuggestions = useCallback(async () => { try { const response = await fetch("/api/housekeeping/assignment-suggestions", { cache: "no-store" }); const body = await response.json(); if (response.ok && body?.data) setSuggestions(body.data.suggestions ?? []); } catch {} }, []);
  useEffect(() => { if (!canSeeSuggestions) return; const initial = window.setTimeout(() => refreshSuggestions(), 0); const timer = window.setInterval(refreshSuggestions, 30000); return () => { window.clearTimeout(initial); window.clearInterval(timer); }; }, [canSeeSuggestions, refreshSuggestions]);

  // Promise-based dialog bridge — renders the polished in-app dialogs once, then
  // every action below awaits a decision exactly like the old native prompt/confirm.
  const dialogs = useActionDialogs();
  const visibleNav = nav.filter((n) => access[user.role].includes(n.section) && (!n.roles || n.roles.includes(user.role)));
  // Mirrors of lib/permissions. Purely presentational - every one of these is re-checked server-side
  // by the route guard and again by the RPC's own role gate.
  const financialAuthority = ["accounting"].includes(user.role);
  const cashHandling = ["front_desk","accounting"].includes(user.role);
  const operational = ["front_desk"].includes(user.role);
  // Mirror of canManageCatalog in lib/admin-route (server-only module, so not
  // importable here). guardCatalog re-checks it and admin_create_room /
  // admin_update_room_metadata gate on it again.
  const catalogAuthority = ["owner","admin","manager"].includes(user.role);
  const load = useCallback(async (quiet=false) => { if(!quiet)setLoading(true); if(section==="room_types"||section==="transport_services"||section==="request_types"||section==="transportation"||section==="insights"||section==="ai"||section==="staff_duty"||(section==="guest_requests"&&["front_desk","manager","housekeeping"].includes(user.role))){if(!quiet)setLoading(false); return;} const accounting=isAccountingSection(section);const approvals=section==="approvals"; const url = section === "overview" || section === "reports" ? "/api/manager_dashboard" : accounting ? "/api/accounting/ledger" : approvals?"/api/manager/approvals":`/api/resources/${section}`; const res = await fetch(url,{cache:"no-store"}); const body = await res.json(); if (res.ok) { if (accounting) setLedger(body.data); else if (section === "overview" || section === "reports") { setDashboard(body.data); setMode(body.mode || "demo"); } else setItems(body.data); } if(!quiet)setLoading(false); }, [section, user.role]);
  // Header pill: the signed-in cash handler's own shift state, polled like the
  // section data and refreshed immediately after open/close below.
  const refreshShiftStatus=useCallback(async()=>{try{const response=await fetch("/api/accounting/cash-shifts",{cache:"no-store"});const body=await response.json();if(response.ok&&body.data)setMyShift({open:Boolean(body.data.open),location:body.data.shift?.location??null,opened_at:body.data.shift?.opened_at??null})}catch{}},[]);
  useEffect(()=>{if(!cashHandling)return;const initial=window.setTimeout(()=>refreshShiftStatus(),0);const timer=window.setInterval(refreshShiftStatus,30000);return()=>{window.clearTimeout(initial);window.clearInterval(timer)}},[cashHandling,refreshShiftStatus]);
  useEffect(() => { const initial=window.setTimeout(()=>load(),0); const timer=window.setInterval(()=>load(true),30000); return()=>{window.clearTimeout(initial);window.clearInterval(timer)}; }, [load]);
  // Alert/badge refresh: sections other than Overview/Reports don't load the
  // dashboard payload, so without this the bell and the sidebar badges would
  // freeze at whatever the last Overview visit fetched. Same 30s cadence as the
  // section data — never faster.
  const refreshAlerts = useCallback(async () => { try { const res = await fetch("/api/manager_dashboard",{cache:"no-store"}); if (!res.ok) return; const body = await res.json(); if (body.data) { setDashboard(body.data); setMode(body.mode || "demo"); } } catch {} }, []);
  useEffect(() => { if (section === "overview" || section === "reports") return; void refreshAlerts(); const timer=window.setInterval(()=>{void refreshAlerts()},30000); return()=>window.clearInterval(timer); }, [section, refreshAlerts]);
  useEffect(() => {
    window.setTimeout(()=>setCollapsed(window.localStorage.getItem("haven-sidebar-collapsed") === "true"),0);
  }, []);
  const notificationCenter = useRef<HTMLDivElement>(null);
  const profileMenu = useRef<HTMLDivElement>(null);
  const notificationsVisible = notificationsHover || notificationsPinned;
  useEffect(() => {
    if (!notificationsVisible && !profileOpen) return;
    const outside = (event: Event) => {
      if (notificationCenter.current && !notificationCenter.current.contains(event.target as Node)) { setNotificationsPinned(false); setNotificationsHover(false); }
      if (profileMenu.current && !profileMenu.current.contains(event.target as Node)) setProfileOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setNotificationsPinned(false); setNotificationsHover(false); setProfileOpen(false); }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [notificationsVisible, profileOpen]);
  function toggleNotifications() { setNotificationsPinned((value) => { if (value) setNotificationsHover(false); return !value; }); }
  function closeNotifications() { setNotificationsPinned(false); setNotificationsHover(false); }
  const filtered = useMemo(() => items.filter((item) => JSON.stringify(item).toLowerCase().includes(search.toLowerCase())), [items, search]);
  const notify = (message: string) => { toastController.push({ title: message, tone: "success" }); };

  // Sidebar module badges — pending workload per module, gated to what THIS
  // role can act on (server computes every count; nothing is exposed here the
  // role couldn't already query).
  const badges = useMemo(() => {
    const m = dashboard?.metrics;
    const map: Partial<Record<Section, number>> = {};
    if (!m) return map;
    if (m.openTasks) map.housekeeping_tasks = m.openTasks;
    if (m.openMaintenance) map.maintenance_orders = m.openMaintenance;
    if (user.role === "manager" && m.pendingApprovals) map.approvals = m.pendingApprovals;
    if (["front_desk", "manager"].includes(user.role) && m.pendingRequestBatches) map.guest_requests = m.pendingRequestBatches;
    if (["housekeeping", "maintenance"].includes(user.role) && m.departmentRequests) map.guest_requests = m.departmentRequests;
    if (["front_desk", "manager"].includes(user.role) && m.transportationRequested) map.transportation = m.transportationRequested;
    if (user.role === "accounting" && m.pendingVerifications) map.payments = m.pendingVerifications;
    if (user.role === "accounting" && m.pendingRefundCount) map.refunds = m.pendingRefundCount;
    return map;
  }, [dashboard, user.role]);

  // New-alert toasts: diff the live notification list by id. The first poll
  // seeds silently — a page refresh must never replay history as toasts; only
  // alerts that appear AFTER initialization toast. The id set also dedupes a
  // re-delivered poll, and a toast's disappearance never touches the underlying
  // work: the bell keeps listing it and the badge keeps counting it.
  const seenAlerts = useRef<Set<string> | null>(null);
  const pushToast = toastController.push;
  useEffect(() => {
    if (!dashboard) return;
    if (seenAlerts.current === null) { seenAlerts.current = new Set(dashboard.notifications.map((n) => n.id)); return; }
    for (const notice of dashboard.notifications) {
      if (seenAlerts.current.has(notice.id)) continue;
      seenAlerts.current.add(notice.id);
      pushToast({
        id: `alert-${notice.id}`,
        title: notice.title,
        detail: notice.detail,
        tone: ALERT_TOAST_TONES.some((prefix) => notice.id.startsWith(prefix)) ? "warning" : "info",
        actionLabel: "View",
        onAction: () => { setSection(notice.section); setMenu(false); },
      });
    }
  }, [dashboard, pushToast]);

  // Eligible-room picker shared by check-in, pre-arrival assignment, and room changes.
  // Fetches the server's authoritative list, then asks the operator to choose through the
  // in-app RoomSelectDialog (touch-friendly) - null means the operator cancelled.
  async function chooseEligibleRoom(item: RecordItem, promptText: string, includeUpgrades = false): Promise<string | null> {
    const response = await fetch(`/api/front-desk/reservations/${item.id}/eligible-rooms${includeUpgrades ? "?mode=change" : ""}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) { notify(body.error ?? "Unable to load eligible rooms."); return null; }
    const rooms = (body.data ?? []) as RecordItem[];
    if (!rooms.length) { notify("No clean, serviceable, conflict-free room of this type is currently eligible."); return null; }
    return dialogs.askRoom({
      title: "Select Room",
      message: `${promptText}\nEligible rooms: ${rooms.map((r) => `${r.number} (${r.type})`).join(", ")}`,
      rooms: rooms.map((r) => ({ number: String(r.number), type: String(r.type), id: String(r.id), colorKey: (r.badgeColorKey as string | null) ?? null })),
      currentRoom: String(item.room_number ?? rooms[0].number),
    });
  }
  // Guided arrival → room assignment → check-in. The wizard drives the same
  // server-authoritative gates as the one-shot flow it replaces.
  async function openArrival(item: RecordItem, exceptionType?: string | null) { setDetail(null); setArrival({ item, exceptionType: exceptionType ?? null }); }
  async function handleCheckedIn() {
    setArrival(null);
    setArrivalResume((prev) => { if (!arrival) return prev; const key = String(arrival.item.id)+":"+String(arrival.exceptionType ?? ""); if (!(key in prev)) return prev; const next = { ...prev }; delete next[key]; return next; });
    notify("Guest checked in and the active room assignment was recorded.");
    await load();
  }
  const arrivalKey = arrival ? String(arrival.item.id) + ":" + String(arrival.exceptionType ?? "") : "";
  // Progress reported by the wizard, keyed to the open reservation. The shallow-equality
  // bail-out keeps unchanged reports from re-rendering the dashboard.
  const handleArrivalProgress = useCallback((p: ArrivalProgress) => {
    setArrivalResume((prev) => { const old = prev[arrivalKey]; return old && old.step === p.step && old.selected === p.selected && old.exceptionMode === p.exceptionMode ? prev : { ...prev, [arrivalKey]: p }; });
  }, [arrivalKey]);

  // Walk-in guest at the desk: staged dialog → POST /api/front-desk/reservations with
  // source fixed to "Walk-In" (server-authoritative, atomic RPC) → hand the created
  // reservation straight to the guided arrival workflow for ID, payment, room, check-in.
  async function openWalkInDialog() {
    setWalkIn(true);
    if (guestProfiles.length) return;
    const res = await fetch("/api/resources/guests", { cache: "no-store" });
    if (res.ok) { const body = await res.json(); setGuestProfiles((body.data ?? []) as RecordItem[]); }
  }
  async function handleWalkInCreated(reservation: { id: string; guest_name: string; total: number | string; confirmation_number?: string | null }) {
    setWalkIn(false);
    notify(`Walk-in reservation created${reservation.confirmation_number ? ` (${reservation.confirmation_number})` : ""} · ${peso(reservation.total)} due at check-in.`);
    await load(true);
    await openArrival({ id: reservation.id, guest_name: reservation.guest_name });
  }
  // New (future) reservation: front-desk or phone booking through the same atomic
  // creation endpoint. Source is a fixed select of the authorized staff channels —
  // never a free-typed value.
  async function createReservation() {
    const data = await dialogs.askForm({
      title: "New reservation",
      description: "Create a front-desk or phone reservation. The reservation, folio, and audit entry are created in one server transaction.",
      fields: [
        { key: "guestName", label: "Guest full name", type: "text", required: true, validation: required("Enter the guest's name.") },
        { key: "email", label: "Guest email", type: "email", required: true, validation: required("Enter the guest's email.") },
        { key: "phone", label: "Guest phone", type: "tel", required: true, validation: required("Enter the guest's phone.") },
        { key: "roomType", label: "Room type", type: "text", required: true, defaultValue: "Deluxe King", validation: required("Enter the room type.") },
        { key: "checkIn", label: "Check-in date", type: "date", required: true, validation: dateField() },
        { key: "checkOut", label: "Check-out date", type: "date", required: true, validation: dateField() },
        { key: "guests", label: "Guests", type: "number", required: true, defaultValue: 2, validation: positive("At least one guest is required.") },
        { key: "source", label: "Booking source", type: "select", required: true, defaultValue: "Front Desk", options: options("Front Desk", "Phone"), validation: required("Choose the booking source.") },
        { key: "specialRequests", label: "Special requests (optional)", type: "textarea" },
      ],
      submitText: "Create reservation",
    });
    if (!data) return;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
    const checkIn = String(data.checkIn), checkOut = String(data.checkOut);
    if (checkIn < today || checkOut <= checkIn) { notify("Check-in cannot be in the past and check-out must be after check-in."); return; }
    const res = await fetch("/api/front-desk/reservations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guestName: String(data.guestName), email: String(data.email), phone: String(data.phone), roomType: String(data.roomType), checkIn, checkOut, guests: Number(data.guests), source: String(data.source), specialRequests: String(data.specialRequests ?? "") || undefined, idempotencyKey: crypto.randomUUID() }) });
    const body = await res.json();
    if (!res.ok) { notify(body.error ?? "Unable to create the reservation."); return; }
    notify(`Reservation created${body.data?.confirmation_number ? ` (${body.data.confirmation_number})` : ""}.`);
    await load(true);
  }
  async function executeException(item: RecordItem): Promise<boolean> { const reservationId = String(item.reservation_id ?? ""); if (!reservationId) { notify("This approval has no linked reservation to check in."); return false; } const action = (item.requested_action ?? {}) as Record<string, unknown>; const roomType = typeof action.roomType === "string" && action.roomType ? action.roomType : null; await openArrival({ id: reservationId, guest_name: item.guest_name ?? "Guest" }, roomType); return true; }
  async function assignRoom(item: RecordItem) {
    const room = await chooseEligibleRoom(item, "Choose a pre-arrival room assignment:");
    if (!room) return;
    const reason = (await dialogs.askPrompt({ title: "Assign room", message: `Pre-assign room ${room} to ${label(item.guest_name)}?`, label: "Assignment note (optional)", placeholder: "Optional note recorded in the assignment history" })) ?? "";
    const res = await fetch(`/api/front-desk/reservations/${item.id}/assign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room, reason }) });
    const body = await res.json();
    if (!res.ok) { notify(body.error ?? "Unable to assign room."); return; }
    notify("Room assigned with history and conflict protection.");
    await viewReservation(item); await load(true);
  }
  async function changeRoom(item: RecordItem) {
    const room = await chooseEligibleRoom(item, "Choose a ready replacement room (Manager-authorized upgrades are labeled):", true);
    if (!room) return;
    const reason = await dialogs.askPrompt({ title: "Change room", label: "Required reason for the room change", required: true, validation: required("A reason is required for the room change.") });
    if (!reason) return;
    const res = await fetch(`/api/front-desk/reservations/${item.id}/change-room`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ room, reason }) });
    const body = await res.json();
    if (!res.ok) { notify(body.error ?? "Unable to change rooms."); return; }
    notify("Guest transferred; the old assignment and turnover history were preserved.");
    await viewReservation(item); await load(true);
  }
  // Extend stay opens the guided dialog: every figure is server-previewed, and a
  // refused normal extension (room conflict) hands off to the stay_extension
  // Manager exception instead of dead-ending.
  function extendStay(item: RecordItem) { setExtendStayOpen({ reservation: item, transportation: detail?.transportation }); }
  async function updateGuest(item: RecordItem) {
    const data = await dialogs.askForm({
      title: "Update guest details",
      description: "Operational contact and stay notes for this reservation.",
      fields: [
        { key: "phone", label: "Guest phone (leave blank to keep current)", type: "tel", defaultValue: String(item.guest_phone ?? "") },
        { key: "expectedArrival", label: "Expected arrival / operational arrival note", type: "text", defaultValue: String(item.expected_arrival ?? "") },
        { key: "notes", label: "Operational guest notes / requests", type: "textarea", rows: 4, defaultValue: String(item.special_requests ?? "") },
      ],
      submitText: "Save details",
    });
    if (!data) return;
    const phone = String(data.phone); const expectedArrival = String(data.expectedArrival); const notes = String(data.notes);
    if (!phone && !expectedArrival && !notes) return;
    const res = await fetch(`/api/front-desk/reservations/${item.id}/guest`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: phone || undefined, expectedArrival: expectedArrival || undefined, notes: notes || undefined }) });
    const body = await res.json();
    if (!res.ok) { notify(body.error ?? "Unable to update guest information."); return; }
    notify("Guest operational information updated and audited.");
    await viewReservation(item);
  }
  async function routeRequest(item: RecordItem) {
    const data = await dialogs.askForm({
      title: "Route guest request",
      description: "Log and route a guest need to the responsible hotel team.",
      fields: [
        { key: "department", label: "Route to", type: "select", required: true, defaultValue: "front_desk", options: options("front_desk", "housekeeping", "maintenance"), validation: required("Choose a department.") },
        { key: "description", label: "Describe the guest request", type: "textarea", required: true, validation: required("Describe the guest request.") },
        { key: "priority", label: "Priority", type: "select", required: true, defaultValue: "normal", options: options("normal", "high", "urgent"), validation: required("Choose a priority.") },
      ],
      submitText: "Route request",
    });
    if (!data) return;
    const department = String(data.department); const description = String(data.description); const priority = String(data.priority);
    const res = await fetch(`/api/front-desk/reservations/${item.id}/requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ department, description, priority }) });
    const body = await res.json();
    if (!res.ok) { notify(body.error ?? "Unable to route request."); return; }
    notify(`Request routed to ${label(department)}.`);
    await viewReservation(item);
  }
  // Verify opens a preview modal (DepositVerifyDialog) so Accounting can
  // cross-reference the submitted proof against the reservation before
  // deciding — it never approves straight from the table row.
  function verifyDeposit(item: RecordItem) { setVerifying(false); setVerifyPayment(item); }
  async function confirmVerifyDeposit(item: RecordItem) {
    const stayPayment = item.purpose === "stay_payment";
    setVerifying(true);
    const res = await fetch(stayPayment ? `/api/accounting/payments/${item.id}/verify` : `/api/front-desk/deposits/${item.id}/verify`, stayPayment ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "approve" }) } : { method: "POST" });
    const body = await res.json();
    setVerifying(false);
    if (!res.ok) { notify(body.error ?? "Unable to verify payment."); return; }
    setVerifyPayment(null);
    notify(stayPayment ? "Stay payment verified and applied to the folio." : "Reservation deposit verified and booking confirmed.");
    await load();
  }
  async function collectPayment(item: RecordItem) {
    const data = await dialogs.askForm({
      title: "Collect payment",
      description: "Record a payment against this guest's folio.",
      fields: [
        { key: "amount", label: "Payment amount (PHP)", type: "number", required: true, min: 0.01, step: 0.01, validation: positive("Enter a payment amount greater than zero.") },
        { key: "method", label: "Method", type: "select", required: true, defaultValue: "cash", options: options("cash", "card", "bank_transfer", "gcash"), validation: required("Choose a payment method.") },
        { key: "reference", label: "Transaction reference", type: "text", dependsOn: "method", showWhen: (v) => String(v) !== "cash", validation: required("Enter the payment reference.") },
      ],
      submitText: "Record payment",
    });
    if (!data) return;
    const amount = Number(data.amount); const method = String(data.method);
    const idempotencyKey = crypto.randomUUID();
    const send = async (allowOverpayment: boolean) => { const res = await fetch(`/api/front-desk/reservations/${item.id}/payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, method, reference: method === "cash" ? null : String(data.reference), idempotencyKey, allowOverpayment }) }); return { res, body: await res.json() }; };
    let { res, body } = await send(false);
    // The server decides whether an overpayment may be kept as folio credit; this only re-asks.
    if (!res.ok && financialAuthority && String(body.error ?? "").includes("folio credit")) {
      const keep = await dialogs.askConfirm({ title: "Keep as folio credit?", message: `${body.error} Record the excess as a folio credit?`, confirmText: "Keep as credit" });
      if (keep) ({ res, body } = await send(true));
    }
    if (!res.ok) { notify(body.error ?? "Unable to record payment."); return; }
    notify(Number(body.data?.folio_credit ?? 0) > 0 ? `Payment recorded. Folio credit: ${pesoExact(body.data.folio_credit)}.` : "Payment recorded in the folio.");
    await viewReservation(item); await load(true);
  }
  async function postCharge(item: RecordItem) {
    const data = await dialogs.askForm({
      title: "Post folio charge",
      description: "Add a charge to the guest folio. Folio corrections belong to Accounting adjustments, not charges.",
      fields: [
        { key: "description", label: "Charge description", type: "text", required: true, validation: required("Describe the charge.") },
        { key: "category", label: "Category", type: "select", required: true, defaultValue: "incidental", options: options("incidental", "room_service", "laundry", "minibar", "extension"), validation: required("Choose a supported folio category.") },
        { key: "amount", label: "Charge amount (PHP)", type: "number", required: true, min: 0.01, step: 0.01, validation: positive("Enter a charge amount greater than zero.") },
      ],
      submitText: "Post charge",
    });
    if (!data) return;
    const description = String(data.description); const category = String(data.category); const amount = Number(data.amount);
    const res = await fetch(`/api/front-desk/reservations/${item.id}/charge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ description, category, amount, idempotencyKey: crypto.randomUUID() }) });
    const body = await res.json();
    if (!res.ok) { notify(body.error ?? "Unable to post charge."); return; }
    notify("Charge posted to the folio.");
    await viewReservation(item); await load(true);
  }
  async function checkOut(item: RecordItem) {
    const ok = await dialogs.askConfirm({ title: "Check out guest", message: "Check out this guest? The room will be marked dirty and a turnover task will be created.", confirmText: "Check out", variant: "danger" });
    if (!ok) return;
    const res = await fetch(`/api/front-desk/reservations/${item.id}/checkout`, { method: "POST" });
    const body = await res.json();
    if (!res.ok) { notify(body.error ?? "Unable to complete checkout."); return; }
    setDetail(null); notify("Guest checked out; room turnover was created."); await load();
  }
  const post=async(url:string,payload:unknown,method="POST")=>{const res=await fetch(url,{method,headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});return{ok:res.ok,body:await res.json()}};
  async function processRefund(item: RecordItem) {
    const reference = await dialogs.askPrompt({ title: item.status === "failed" ? "Retry refund" : "Process refund", message: item.status === "failed" ? "This refund attempt failed. Provide a new transaction reference to retry." : "Record the refund transaction reference.", label: "Refund transaction reference", required: true, validation: required("Enter the transaction reference.") });
    if (!reference) return;
    const { ok, body } = await post(`/api/accounting/refunds/${item.id}/process`, { reference });
    if (!ok) { notify(body.error ?? "Unable to process refund."); return; }
    notify("Refund recorded without altering the original payment.");
    await load();
  }
  async function failRefund(item: RecordItem) {
    const reason = await dialogs.askPrompt({ title: "Record refund failure", message: "Why did this refund attempt fail? The request stays retryable.", label: "Reason", multiline: true, rows: 3, required: true, validation: required("Explain why the attempt failed.") });
    if (!reason) return;
    const { ok, body } = await post(`/api/accounting/refunds/${item.id}/fail`, { reason });
    if (!ok) { notify(body.error ?? "Unable to record this refund failure."); return; }
    notify(`Failed attempt recorded. Attempts: ${body.data?.attempts ?? 1}.`);
    await load();
  }
  async function rejectDeposit(item: RecordItem) {
    const stayPayment = item.purpose === "stay_payment";
    const reason = await dialogs.askPrompt({ title: stayPayment ? "Reject stay payment" : "Reject deposit", message: `Why is this ${stayPayment ? "stay payment" : "deposit"} being rejected? The submitted payment record is kept, never deleted.`, label: "Reason", multiline: true, rows: 3, required: true, validation: required("Explain the rejection.") });
    if (!reason) return;
    const { ok, body } = await post(stayPayment ? `/api/accounting/payments/${item.id}/verify` : `/api/accounting/payments/${item.id}/reject`, stayPayment ? { decision: "reject", reason } : { reason });
    if (!ok) { notify(body.error ?? "Unable to reject this payment."); return; }
    notify(stayPayment ? "Stay payment proof rejected and preserved for audit." : "Deposit rejected. The submission was preserved and the reservation released.");
    await load();
  }
  async function reverseCharge(item: RecordItem) {
    const data = await dialogs.askForm({
      title: "Reverse folio charge",
      description: `The original charge stays on record; this reversal nets it out. Leaving the amount blank reverses the whole remaining ${pesoExact(item.amount)}.`,
      fields: [
        { key: "amount", label: "Reversal amount (PHP) - blank reverses the full amount", type: "number", min: 0.01, step: 0.01, validation: (v: string | number | boolean) => { const s = String(v ?? "").trim(); return s === "" ? null : (Number.isFinite(Number(s)) && Number(s) > 0 ? null : "Enter a positive amount or leave it blank."); } },
        { key: "reason", label: "Required reason for this reversal", type: "textarea", required: true, validation: required("A reason is required for the reversal.") },
      ],
      submitText: "Reverse charge",
    });
    if (!data) return;
    const amount = String(data.amount).trim() ? Number(data.amount) : undefined;
    const reason = String(data.reason);
    const { ok, body } = await post(`/api/accounting/charges/${item.id}/reverse`, { amount, reason, idempotencyKey: crypto.randomUUID() });
    if (!ok) { notify(body.error ?? "Unable to reverse this charge."); return; }
    notify(`Charge reversed by ${pesoExact(body.data?.amount)}; the original charge was preserved.`);
    await load(true); if (detail) await viewReservation(detail.reservation);
  }
  async function recordAdjustment(reservationId: string) {
    const data = await dialogs.askForm({
      title: "Adjust folio",
      description: "Financial corrections are recorded as new entries - nothing is overwritten.",
      fields: [
        { key: "transactionType", label: "Type", type: "select", required: true, defaultValue: "adjustment", options: options("adjustment", "credit", "write_off"), validation: required("Choose adjustment, credit, or write_off.") },
        { key: "direction", label: "Direction (debit increases the folio, credit reduces it)", type: "select", required: true, defaultValue: "credit", options: options("debit", "credit"), dependsOn: "transactionType", showWhen: (v: string | number | boolean) => v === "adjustment", validation: required("Choose debit or credit.") },
        { key: "amount", label: "Amount (PHP)", type: "number", required: true, min: 0.01, step: 0.01, validation: positive("Enter an amount greater than zero.") },
        { key: "reason", label: "Required reason for this adjustment", type: "textarea", required: true, validation: required("A reason is required.") },
      ],
      submitText: "Record adjustment",
    });
    if (!data) return;
    const transactionType = String(data.transactionType); const direction = String(data.direction); const amount = Number(data.amount); const reason = String(data.reason);
    const { ok, body } = await post("/api/accounting/adjustments", { reservationId, transactionType, direction, amount, reason, idempotencyKey: crypto.randomUUID() });
    if (!ok) { notify(body.error ?? "Unable to record this adjustment."); return; }
    notify(`${label(transactionType)} recorded. Folio balance: ${pesoExact(body.data?.balance)}.`);
    await load(true); if (detail) await viewReservation(detail.reservation);
  }
  async function openCashShift() {
    const data = await dialogs.askForm({
      title: "Open cash shift",
      fields: [
        { key: "openingAmount", label: "Opening cash float (PHP)", type: "number", required: true, defaultValue: 0, min: 0, step: 0.01, validation: nonNegative("The opening float cannot be negative.") },
        { key: "location", label: "Cash point / location (optional)", type: "text" },
      ],
      submitText: "Open shift",
    });
    if (!data) return;
    const openingAmount = Number(data.openingAmount); const location = String(data.location).trim();
    const { ok, body } = await post("/api/accounting/cash-shifts", { openingAmount, location: location || undefined });
    if (!ok) { notify(body.error ?? "Unable to open a cash shift."); return; }
    notify("Cash shift opened.");
    await load(true); await refreshShiftStatus();
  }
  async function closeCashShift(item: RecordItem) {
    const data = await dialogs.askForm({
      title: "Close & count cash shift",
      description: "Count the cash in the drawer. Expected cash is recomputed from the shift's own recorded payments.",
      fields: [
        { key: "actualCash", label: "Counted cash in the drawer (PHP)", type: "number", required: true, min: 0, step: 0.01, validation: nonNegative("The counted cash cannot be negative.") },
        { key: "notes", label: "Closing notes (optional)", type: "textarea", rows: 3 },
      ],
      submitText: "Close & count",
    });
    if (!data) return;
    const actualCash = Number(data.actualCash); const notes = String(data.notes).trim();
    const { ok, body } = await post(`/api/accounting/cash-shifts/${item.id}`, { action: "close", actualCash, notes: notes || undefined, idempotencyKey: crypto.randomUUID() }, "PATCH");
    if (!ok) { notify(body.error ?? "Unable to close this cash shift."); return; }
    notify(`Shift closed. Expected ${pesoExact(body.data?.expectedCash)}, variance ${pesoExact(body.data?.variance)}.`);
    await load(true); await refreshShiftStatus();
  }
  async function reconcileCashShift(item: RecordItem) {
    const hasVariance = Number(item.variance || 0) !== 0;
    const notes = (await dialogs.askPrompt({
      title: "Reconcile cash shift",
      message: hasVariance ? `Explain the ${pesoExact(item.variance)} variance (required):` : "Reconciliation notes (optional):",
      label: "Notes",
      multiline: true,
      rows: 3,
      required: hasVariance,
      validation: hasVariance ? required("A variance must be explained before it can be reconciled.") : undefined,
    })) ?? "";
    if (hasVariance && !notes.trim()) return;
    const { ok, body } = await post(`/api/accounting/cash-shifts/${item.id}`, { action: "reconcile", notes: notes.trim() || undefined }, "PATCH");
    if (!ok) { notify(body.error ?? "Unable to reconcile this cash shift."); return; }
    notify("Cash shift reconciled; the variance was recorded, not corrected away.");
    await load(true);
  }
  async function recordReconciliation() {
    const data = await dialogs.askForm({
      title: "Record reconciliation",
      description: "Compare recorded collections against an external statement figure. Variance is recorded - never used to edit a guest payment.",
      fields: [
        { key: "periodStart", label: "Period start (YYYY-MM-DD)", type: "date", required: true, validation: dateField() },
        { key: "periodEnd", label: "Period end (YYYY-MM-DD)", type: "date", required: true, validation: dateField() },
        { key: "method", label: "Payment method as recorded", type: "select", required: true, defaultValue: "cash", options: options("cash", "card", "bank_transfer", "gcash"), validation: required("Choose the payment method.") },
        { key: "settledAmount", label: "Settled amount from the external statement (PHP)", type: "number", required: true, min: 0, step: 0.01, validation: nonNegative("Enter the settled amount from the statement.") },
        { key: "notes", label: "Variance explanation / notes", type: "textarea", rows: 3 },
      ],
      submitText: "Record reconciliation",
    });
    if (!data) return;
    const periodStart = String(data.periodStart); const periodEnd = String(data.periodEnd); const method = String(data.method); const settledAmount = Number(data.settledAmount); const notes = String(data.notes).trim();
    const { ok, body } = await post("/api/accounting/reconciliations", { periodStart, periodEnd, method, settledAmount, notes: notes || undefined, idempotencyKey: crypto.randomUUID() });
    if (!ok) { notify(body.error ?? "Unable to record this reconciliation."); return; }
    notify(`Reconciliation ${label(body.data?.status)}: recorded ${pesoExact(body.data?.expectedAmount)} against ${pesoExact(settledAmount)}.`);
    await load(true);
  }
  async function generateDocument(payload:{documentType:"receipt";paymentId:string}|{documentType:"folio";reservationId:string}){const{ok,body}=await post("/api/accounting/documents",{...payload,idempotencyKey:crypto.randomUUID()});if(!ok){notify(body.error??"Unable to generate this document.");return}notify(`${payload.documentType==="receipt"?"Receipt":"Folio statement"} ${label(body.data?.documentNumber)} issued.`);await load(true)}
  async function requestManagerApproval(item: RecordItem) {
    // Upgrade targets come from the live rooms list (distinct types). Roles without
    // rooms access (e.g. Accounting) fall back to free text — the RPC still validates
    // the type and derives every financial figure server-side.
    const typesRes = await fetch("/api/resources/rooms", { cache: "no-store" }).catch(() => null);
    const typesBody = typesRes && typesRes.ok ? await typesRes.json().catch(() => ({})) : {};
    const upgradeTypes = Array.from(new Set(((typesBody.data ?? []) as RecordItem[]).map((room) => String(room.type || "")).filter(Boolean))).sort();
    const roomTypeField = upgradeTypes.length
      ? { key: "requestedRoomType", label: "Requested upgrade room type", type: "select" as const, dependsOn: "type", showWhen: (v: string | number | boolean) => v === "room_upgrade", required: true, options: upgradeTypes.map((value) => ({ value, label: label(value) })), validation: required("Choose the requested upgrade room type.") }
      : { key: "requestedRoomType", label: "Requested upgrade room type", type: "text" as const, dependsOn: "type", showWhen: (v: string | number | boolean) => v === "room_upgrade", required: true, validation: required("Enter the requested upgrade room type.") };
    // Dropdown labels name the business case — "late checkout" and "stay
    // extension" differ only by one letter otherwise, and the generic labels
    // made staff pick the wrong one.
    const exceptionTypeOptions = [
      { value: "room_upgrade", label: "Room type change (mid-stay)" },
      { value: "stay_extension", label: "Stay extension (extra nights)" },
      { value: "reservation_modification", label: "Reservation modification (dates/type)" },
      { value: "early_check_in", label: "Early check-in" },
      { value: "late_checkout", label: "Late checkout (same day)" },
      { value: "guest_compensation", label: "Guest compensation" },
      { value: "refund_exception", label: "Refund exception" },
      { value: "checkout_exception", label: "Checkout exception (folio override)" },
    ];
    const data = await dialogs.askForm({
      title: "Request Manager exception",
      description: "Management authorization for an exception to current operations or policy. The responsible department executes only after review. Financial responsibility is derived from the chosen reason — never set manually.",
      fields: [
        { key: "type", label: "Exception type", type: "select", required: true, options: exceptionTypeOptions, validation: required("Choose a supported Manager exception type.") },
        { key: "reason", label: "Why is management authorization required?", type: "textarea", required: true, validation: required("Explain why management authorization is required.") },
        { key: "reasonCode", label: "Reason for the room-type change", type: "select", dependsOn: "type", showWhen: (v: string | number | boolean) => v === "room_upgrade", required: true, groups: [
          { label: "Hotel-caused — the hotel absorbs the difference", options: ROOM_TYPE_CHANGE_REASONS.filter((reason) => reason.responsibility === "hotel").map((reason) => ({ value: reason.code, label: reason.label })) },
          { label: "Guest-requested — the guest pays the difference", options: ROOM_TYPE_CHANGE_REASONS.filter((reason) => reason.responsibility === "guest").map((reason) => ({ value: reason.code, label: reason.label })) },
        ], validation: required("Choose a room-type change reason — it determines who pays.") },
        roomTypeField,
        { key: "checkIn", label: "Requested check-in (YYYY-MM-DD)", type: "date", defaultValue: String(item.check_in ?? ""), dependsOn: "type", showWhen: (v: string | number | boolean) => v === "reservation_modification", required: true, validation: dateField() },
        { key: "checkOut", label: "Requested check-out (YYYY-MM-DD)", type: "date", defaultValue: String(item.check_out ?? ""), dependsOn: "type", showWhen: (v: string | number | boolean) => v === "reservation_modification", required: true, validation: dateField() },
        { key: "roomType", label: "Requested room type", type: "text", defaultValue: String(item.room_type ?? ""), dependsOn: "type", showWhen: (v: string | number | boolean) => v === "reservation_modification" },
        { key: "requestedTime", label: "Requested early check-in time", type: "text", defaultValue: "12:00", dependsOn: "type", showWhen: (v: string | number | boolean) => v === "early_check_in", required: true, validation: required("Enter the requested time.") },
        { key: "requestedUntil", label: "Requested checkout timestamp (ISO format)", type: "text", placeholder: "YYYY-MM-DDTHH:MM", dependsOn: "type", showWhen: (v: string | number | boolean) => v === "late_checkout", required: true, validation: required("Enter the requested checkout timestamp.") },
        { key: "requestedCheckOut", label: "Requested new checkout (YYYY-MM-DD)", type: "date", dependsOn: "type", showWhen: (v: string | number | boolean) => v === "stay_extension", required: true, validation: dateField() },
        { key: "amount", label: "Requested financial value (PHP)", type: "number", defaultValue: 0, min: 0, step: 0.01, dependsOn: "type", showWhen: (v: string | number | boolean) => v === "guest_compensation" || v === "refund_exception", validation: nonNegative("The financial value cannot be negative.") },
        { key: "arrangement", label: "Requested financial treatment / arrangement", type: "text", defaultValue: "Accounting review required", dependsOn: "type", showWhen: (v: string | number | boolean) => v === "checkout_exception" },
      ],
      submitText: "Request approval",
    });
    if (!data) return;
    const type = String(data.type); const reason = String(data.reason);
    const requestedAction: Record<string, string | number | boolean | null> = {};
    if (type === "room_upgrade") { requestedAction.requestedRoomType = String(data.requestedRoomType); requestedAction.reasonCode = String(data.reasonCode); }
    if (type === "reservation_modification") { requestedAction.checkIn = String(data.checkIn); requestedAction.checkOut = String(data.checkOut); requestedAction.roomType = String(data.roomType ?? String(item.room_type ?? "")); }
    if (type === "early_check_in") requestedAction.requestedTime = String(data.requestedTime || "12:00");
    if (type === "late_checkout") requestedAction.requestedUntil = String(data.requestedUntil);
    if (type === "stay_extension") requestedAction.requestedCheckOut = String(data.requestedCheckOut);
    if (type === "guest_compensation" || type === "refund_exception") requestedAction.amount = Number(data.amount ?? 0);
    if (type === "checkout_exception") requestedAction.arrangement = String(data.arrangement || "Accounting review required");
    // room_type_exception is intentionally absent: it is created only from the guided
    // arrival dialog, where the target room type and physical room are chosen from the
    // server's live eligible inventory with structured IDs.
    const { ok, body } = await post("/api/manager/approvals", { type, relatedEntityType: "reservation", relatedEntityId: item.id, reservationId: item.id, department: "front_desk", severity: ["refund_exception", "checkout_exception"].includes(type) ? "high" : "normal", reason, requestedAction });
    if (!ok) { notify(body.error ?? "Unable to request Manager approval."); return; }
    notify(`Manager exception requested (${body.data?.id ?? "reference pending"}); the responsible department will execute after review.`);
    if (section === "approvals") await load(true);
  }
  async function escalateGuestRequest(item: RecordItem) {
    const data = await dialogs.askForm({
      title: "Escalate guest issue",
      description: "Raise an unresolved guest request to the Manager for coordination.",
      fields: [
        { key: "reason", label: "Escalation reason", type: "textarea", required: true, validation: required("Explain the escalation.") },
        { key: "severity", label: "Severity", type: "select", required: true, defaultValue: "high", options: options("normal", "high", "critical"), validation: required("Choose a valid severity.") },
      ],
      submitText: "Escalate to Manager",
    });
    if (!data) return;
    const reason = String(data.reason); const severity = String(data.severity);
    const { ok, body } = await post("/api/manager/approvals", { type: "guest_escalation", relatedEntityType: "guest_request", relatedEntityId: item.id, reservationId: item.reservation_id || null, guestRequestId: item.id, department: String(item.department || "front_desk"), severity, reason, requestedAction: { requestedResolution: "Manager coordination" } });
    if (!ok) { notify(body.error ?? "Unable to escalate this request."); return; }
    notify("Guest issue escalated to Manager.");
    await load(true);
  }
  async function reviewManagerApproval(item: RecordItem, decision: "approve" | "reject"): Promise<boolean> {
    const reason = await dialogs.askPrompt({ title: decision === "approve" ? "Approve request" : "Reject request", message: decision === "approve" ? "Approving authorizes the responsible department to execute. It does not perform their work." : "Rejecting records the decision and keeps the request closed.", label: `${decision === "approve" ? "Approval" : "Rejection"} reason`, multiline: true, rows: 3, required: true, validation: required(`A ${decision} reason is required.`) });
    if (!reason) return false;
    const { ok, body } = await post(`/api/manager/approvals/${item.id}/review`, { decision, reason, version: item.version });
    if (!ok) { notify(body.error ?? "Unable to review this request."); return false; }
    notify(`Request ${decision === "approve" ? "approved" : "rejected"}; ${body.data?.executionStatus === "awaiting_execution" ? "the responsible department must now execute it." : "the decision was recorded."}`);
    await load(true);
    return true;
  }
  async function escalateOwner(item: RecordItem): Promise<boolean> {
    const reason = await dialogs.askPrompt({ title: "Escalate to Owner", message: "Why does this high-risk exception exceed Manager authority?", label: "Reason", multiline: true, rows: 3, required: true, validation: required("Explain why this exceeds Manager authority.") });
    if (!reason) return false;
    const { ok, body } = await post(`/api/manager/approvals/${item.id}/escalate-owner`, { reason, version: item.version });
    if (!ok) { notify(body.error ?? "Unable to escalate this exception to Owner."); return false; }
    notify("Exception escalated to Owner. Owner authorization will not execute the department action.");
    await load(true);
    return true;
  }
  async function executeManagerApproval(item: RecordItem): Promise<boolean> {
    const room = item.request_type === "room_upgrade" ? await dialogs.askPrompt({ title: "Execute room upgrade", message: "Select the currently eligible replacement room number or ID for the approved upgrade.", label: "Room number or ID", required: true, validation: required("Enter the replacement room number or ID.") }) : null;
    if (item.request_type === "room_upgrade" && !room) return false;
    const send = (roomId: string | null) => post(`/api/manager/approvals/${item.id}/execute`, { room: roomId });
    let { ok, body } = await send(room);
    // A stay extension whose room is taken needs a same-type move at execution
    // time — ask once and retry; the server revalidates everything atomically.
    if (!ok && item.request_type === "stay_extension" && String(body.error ?? "").includes("conflicts with the extended stay")) {
      const moveRoom = await dialogs.askPrompt({ title: "Same-type room move required", message: `Room ${label(item.current_room)} is taken during the added nights. Enter a ${label(item.current_room_type)} room number or ID to move the guest to — the server revalidates availability before extending.`, label: "Room number or ID", required: true, validation: required("Enter the replacement room number or ID.") });
      if (!moveRoom) return false;
      ({ ok, body } = await send(moveRoom));
    }
    if (!ok) { notify(body.error ?? "Unable to execute this approved exception."); return false; }
    notify(`${label(body.data?.requestType)} executed by Front Desk after revalidation.`);
    await load(true);
    return true;
  }
  async function executeManagerFinancialApproval(item: RecordItem): Promise<boolean> {
    const ok = await dialogs.askConfirm({ title: "Apply service-recovery credit", message: "Apply this approved service-recovery credit to the guest folio?", confirmText: "Apply credit", variant: "warning" });
    if (!ok) return false;
    const { ok: posted, body } = await post(`/api/manager/approvals/${item.id}/financial-execute`, {});
    if (!posted) { notify(body.error ?? "Unable to execute this approved financial exception."); return false; }
    notify(`Service-recovery credit applied by Accounting. Folio balance: ${pesoExact(body.data?.folioBalance)}.`);
    await load(true);
    return true;
  }
  async function coordinateHousekeeping(item: RecordItem) {
    const data = await dialogs.askForm({
      title: "Prioritize housekeeping task",
      description: "Manager reprioritization. Housekeeping remains responsible for completing the task.",
      fields: [
        { key: "priority", label: "Priority", type: "select", required: true, defaultValue: "high", options: options("normal", "high", "urgent"), validation: required("Choose a priority.") },
        { key: "reason", label: "Coordination reason", type: "textarea", required: true, validation: required("Explain the reason.") },
      ],
      submitText: "Prioritize",
    });
    if (!data) return;
    const priority = String(data.priority); const reason = String(data.reason);
    const { ok, body } = await post(`/api/manager/housekeeping/${item.id}/prioritize`, { priority, reason });
    if (!ok) { notify(body.error ?? "Unable to reprioritize this task."); return; }
    notify("Housekeeping priority updated; Housekeeping remains responsible for completion.");
    await load(true);
  }
  async function coordinateMaintenance(item: RecordItem) {
    const data = await dialogs.askForm({
      title: "Escalate maintenance priority",
      description: "Manager escalation. Maintenance remains responsible for completing the repair.",
      fields: [
        { key: "priority", label: "Escalation priority", type: "select", required: true, defaultValue: "urgent", options: options("high", "urgent"), validation: required("Choose an escalation priority.") },
        { key: "reason", label: "Escalation reason", type: "textarea", required: true, validation: required("Explain the reason.") },
      ],
      submitText: "Escalate",
    });
    if (!data) return;
    const priority = String(data.priority); const reason = String(data.reason);
    const { ok, body } = await post(`/api/manager/maintenance/${item.id}/escalate`, { priority, reason });
    if (!ok) { notify(body.error ?? "Unable to escalate this work order."); return; }
    notify("Maintenance issue escalated; Maintenance remains responsible for repair completion.");
    await load(true);
  }
  async function createMaintenance() {
    const data = await dialogs.askForm({
      title: "Report maintenance issue",
      description: "Blank room works on the facility / equipment. Room issues are tied to the room for serviceability tracking.",
      fields: [
        { key: "roomId", label: "Room number or room ID (leave blank for a facility/equipment issue)", type: "text" },
        { key: "description", label: "Describe the maintenance issue", type: "textarea", required: true, validation: required("Describe the maintenance issue.") },
        { key: "category", label: "Category", type: "text", defaultValue: "General" },
        { key: "priority", label: "Priority", type: "select", required: true, defaultValue: "normal", options: options("low", "normal", "high", "urgent", "critical"), validation: required("Choose a valid priority.") },
      ],
      submitText: "Create work order",
    });
    if (!data) return;
    const roomId = String(data.roomId).trim(); const description = String(data.description); const category = String(data.category || "General"); const priority = String(data.priority);
    const { ok, body } = await post("/api/maintenance/orders", { roomId: roomId || null, targetType: roomId ? "room" : "facility", targetLabel: roomId || "Hotel facility", description, category, priority, idempotencyKey: crypto.randomUUID() });
    if (!ok) { notify(body.error ?? "Unable to create the work order."); return; }
    notify(`Work order ${body.data?.id ?? ""} created for Maintenance assessment.`);
    await load(true);
  }
  async function operateMaintenance(item: RecordItem, action: "assign" | "start" | "diagnose" | "defer" | "progress" | "resolve" | "close" | "cancel") {
    let payload: Record<string, unknown> = {};
    if (action === "diagnose") {
      const data = await dialogs.askForm({
        title: "Diagnose work order",
        description: "Record the technical diagnosis and serviceability decision.",
        fields: [
          { key: "diagnosis", label: "Technical diagnosis", type: "textarea", required: true, validation: required("Enter the technical diagnosis.") },
          { key: "severity", label: "Severity", type: "select", required: true, defaultValue: "normal", options: options("low", "normal", "high", "critical"), validation: required("Choose a valid severity.") },
          { key: "serviceabilityImpact", label: "Technical serviceability", type: "select", required: true, defaultValue: "serviceable", options: options("serviceable", "blocked", "out_of_service"), validation: required("Choose a serviceability decision.") },
          { key: "serviceabilityReason", label: "Why must this room or asset be blocked?", type: "textarea", dependsOn: "serviceabilityImpact", showWhen: (v: string | number | boolean) => v !== "serviceable", required: true, validation: required("Explain the blocked or out-of-service decision.") },
          { key: "partsStatus", label: "Parts status", type: "select", required: true, defaultValue: "none", options: options("none", "required", "ordered", "available"), validation: required("Choose a valid parts status.") },
          { key: "externalServiceRequired", label: "An external service provider is required", type: "checkbox", defaultValue: false },
        ],
        submitText: "Record diagnosis",
      });
      if (!data) return;
      const partsStatus = String(data.partsStatus);
      payload = { diagnosis: String(data.diagnosis), severity: String(data.severity), serviceabilityImpact: String(data.serviceabilityImpact), serviceabilityReason: String(data.serviceabilityReason ?? ""), partsRequired: partsStatus !== "none", partsStatus, externalServiceRequired: Boolean(data.externalServiceRequired) };
    }
    if (action === "defer") {
      const data = await dialogs.askForm({
        title: "Defer work order",
        fields: [
          { key: "status", label: "Deferred state", type: "select", required: true, defaultValue: "waiting_parts", options: options("waiting_parts", "deferred"), validation: required("Choose a deferred state.") },
          { key: "reason", label: "Reason and next action", type: "textarea", required: true, validation: required("Enter a reason and next action.") },
          { key: "partsStatus", label: "Parts status", type: "select", required: true, defaultValue: "ordered", options: options("none", "required", "ordered", "available"), validation: required("Choose a valid parts status.") },
        ],
        submitText: "Defer",
      });
      if (!data) return;
      payload = { status: String(data.status), reason: String(data.reason), partsStatus: String(data.partsStatus) };
    }
    if (action === "progress") {
      const data = await dialogs.askForm({
        title: "Progress update",
        fields: [
          { key: "note", label: "Progress update", type: "textarea", required: true, validation: required("Enter a progress update.") },
          { key: "partsStatus", label: "Parts status", type: "select", required: true, defaultValue: String(item.parts_status ?? "none"), options: options("none", "required", "ordered", "available"), validation: required("Choose a valid parts status.") },
        ],
        submitText: "Save progress",
      });
      if (!data) return;
      payload = { note: String(data.note), partsStatus: String(data.partsStatus) };
    }
    if (action === "resolve") {
      const data = await dialogs.askForm({
        title: "Resolve work order",
        fields: [
          { key: "resolution", label: "Repair resolution and verification", type: "textarea", required: true, validation: required("Describe the resolution.") },
          { key: "cleanupRequired", label: "Housekeeping needs to clean after this repair", type: "checkbox", defaultValue: false },
        ],
        submitText: "Resolve",
      });
      if (!data) return;
      payload = { resolution: String(data.resolution), cleanupRequired: Boolean(data.cleanupRequired) };
    }
    if (action === "cancel") {
      const reason = await dialogs.askPrompt({ title: "Cancel work order", label: "Cancellation reason", multiline: true, rows: 3, required: true, validation: required("Enter a cancellation reason.") });
      if (!reason) return;
      payload = { reason };
    }
    const { ok, body } = await post(`/api/maintenance/orders/${item.id}/${action}`, payload);
    if (!ok) { notify(body.error ?? `Unable to ${action} this work order.`); return; }
    notify(`Maintenance ${action} action recorded.`);
    await load(true);
  }
  async function operateHousekeeping(item:RecordItem,action:"assign"|"start"|"complete"|"inspect"|"defer"|"maintenance"){
    let payload:Record<string,unknown>={};
    if(action==="assign")payload={reason:"Self-claimed from Housekeeping queue"}
    if(action==="complete"){
      const data = await dialogs.askForm({
        title: "Complete housekeeping task",
        description: "Confirm each checklist item before marking the room ready.",
        fields: [
          { key: "bed_and_linen", label: "Bed and linen complete", type: "checkbox", defaultValue: false },
          { key: "bathroom", label: "Bathroom complete", type: "checkbox", defaultValue: false },
          { key: "amenities", label: "Amenities replenished", type: "checkbox", defaultValue: false },
          { key: "safety_check", label: "Final safety check complete", type: "checkbox", defaultValue: false },
          { key: "notes", label: "Completion notes (optional)", type: "textarea" },
        ],
        submitText: "Complete task",
      });
      if (!data) return;
      payload = { checklist: { bed_and_linen: Boolean(data.bed_and_linen), bathroom: Boolean(data.bathroom), amenities: Boolean(data.amenities), safety_check: Boolean(data.safety_check) }, notes: String(data.notes ?? "") };
    }
    if(action==="inspect"){
      const data = await dialogs.askForm({
        title: "Inspect room",
        description: "Pass the room for release, or fail it to create a reclean task.",
        fields: [
          { key: "result", label: "Inspection result", type: "select", required: true, defaultValue: "passed", options: options("passed", "failed"), validation: required("Choose passed or failed.") },
          { key: "reason", label: "Why did inspection fail? A reclean task will be created.", type: "textarea", dependsOn: "result", showWhen: (v: string | number | boolean) => v === "failed", required: true, validation: required("Enter the reason the inspection failed.") },
        ],
        submitText: "Record inspection",
      });
      if (!data) return;
      payload = { result: String(data.result), reason: String(data.reason ?? undefined) || undefined, idempotencyKey: crypto.randomUUID() };
    }
    if(action==="defer"){const reason=await dialogs.askPrompt({title:"Defer housekeeping task",message:"Why is this task being deferred?",label:"Deferral reason (for example DND or guest refusal)",multiline:true,rows:3,required:true,validation:required("Enter a deferral reason.")});if(!reason)return;payload={reason}}
    if(action==="maintenance"){
      const data = await dialogs.askForm({
        title: "Report maintenance issue",
        description: "Send this to Maintenance as a work order so a technician owns the repair.",
        fields: [
          { key: "category", label: "Maintenance category", type: "text", required: true, defaultValue: "General", validation: required("Category is required.") },
          { key: "description", label: "Describe the maintenance issue", type: "textarea", required: true, validation: required("Describe the maintenance issue.") },
          { key: "priority", label: "Priority", type: "select", required: true, defaultValue: "normal", options: options("normal", "high", "urgent"), validation: required("Choose a valid priority.") },
        ],
        submitText: "Report issue",
      });
      if (!data) return;
      payload = { category: String(data.category), description: String(data.description), priority: String(data.priority), idempotencyKey: crypto.randomUUID() };
    }
    const{ok,body}=await post(`/api/housekeeping/tasks/${item.id}/${action}`,payload);if(!ok){notify(body.error??`Unable to ${action} this Housekeeping task.`);return}notify(action==="maintenance"?"Maintenance issue reported; Maintenance owns the repair workflow.":`Housekeeping task ${action} action recorded.`);await load(true)
  }  // Roadmap Phase 7 — turn a forecast shortage into a DRAFT purchase order.
  // Quantity is editable (default = the forecast's recommended reorder); the
  // server re-reads unit cost and recomputes the total. Draft means draft:
  // nothing is submitted or sent to any vendor, and the draft stays editable
  // for Manager review.
  async function createDraftPo(suggestion: ReplenishmentSuggestion) {
    const vendorOptions = [{ value: "", label: "No vendor yet" }, ...(replenishment?.vendors ?? []).map((vendor) => ({ value: vendor.id, label: vendor.name }))];
    const data = await dialogs.askForm({
      title: "Create draft purchase order",
      description: `${suggestion.name} — current stock ${suggestion.currentStock} ${suggestion.unit}, predicted 3-day need ${suggestion.predictedConsumption ?? "—"} ${suggestion.unit}. The draft is created for Manager review; nothing is ordered or sent automatically.`,
      fields: [
        { key: "quantity", label: `Quantity (${suggestion.unit})`, type: "number", required: true, defaultValue: suggestion.suggestedQuantity, validation: positive("Enter a quantity greater than zero.") },
        { key: "vendorId", label: "Vendor", type: "select", required: true, defaultValue: "", options: vendorOptions, validation: required("Choose a vendor or leave unassigned.") },
        { key: "note", label: "Note for the reviewer (optional)", type: "textarea" },
      ],
      submitText: "Create draft PO",
    });
    if (!data) return;
    const { ok, body } = await post("/api/inventory/purchase-orders", {
      items: [{ itemId: suggestion.itemId, name: suggestion.name, quantity: Number(data.quantity), unit: suggestion.unit }],
      vendorId: String(data.vendorId) || null,
      note: String(data.note ?? "") || undefined
    });
    if (!ok) { notify(body.error ?? "Unable to create the draft purchase order."); return; }
    notify(`Draft purchase order created (₱${Number(body.data?.total ?? 0).toLocaleString("en-PH")}) — awaiting Manager review. Nothing was ordered.`);
    await refreshReplenishment();
  }
  // Roadmap Phase 8 — register a REAL asset the hotel owns (nothing is seeded).
  // The due schedule is derived server-side from the last service + interval.
  async function registerAsset() {
    const data = await dialogs.askForm({
      title: "Register a maintenance asset",
      description: "Register real equipment the hotel actually maintains. The next service date is derived from the recorded last service plus the interval — no sample assets.",
      fields: [
        { key: "name", label: "Asset name", type: "text", required: true, placeholder: "e.g. Aircon — Room 204", validation: required("Enter the asset name.") },
        { key: "category", label: "Category", type: "text", required: true, placeholder: "e.g. HVAC, Plumbing, Elevator", validation: required("Enter a category.") },
        { key: "roomId", label: "Room (optional)", type: "text", placeholder: "Room number, for in-room equipment" },
        { key: "location", label: "Location (optional)", type: "text", placeholder: "e.g. Rooftop, Lobby" },
        { key: "lastServicedAt", label: "Last serviced (optional)", type: "date", helpText: "Leave blank until the first service is recorded." },
        { key: "serviceIntervalDays", label: "Service interval (days)", type: "number", required: true, defaultValue: 90, min: 1, validation: positive("Enter an interval of 1 or more days.") },
        { key: "notes", label: "Notes (optional)", type: "textarea" }
      ],
      submitText: "Register asset"
    });
    if (!data) return;
    const { ok, body } = await post("/api/maintenance/assets", {
      name: String(data.name),
      category: String(data.category),
      roomId: String(data.roomId ?? "").trim() || null,
      location: String(data.location ?? "").trim() || null,
      lastServicedAt: String(data.lastServicedAt ?? "") || null,
      serviceIntervalDays: Number(data.serviceIntervalDays),
      notes: String(data.notes ?? "").trim() || null
    });
    if (!ok) { notify(body.error ?? "Unable to register this asset."); return; }
    notify("Asset registered."); await refreshAssets();
  }
  // Record a service, update registry fields, or retire an asset — each runs
  // through its audited RPC; none of them ever touches a room.
  async function assetAction(asset: MaintenanceAsset, action: "record-service" | "update" | "deactivate") {
    if (action === "record-service") {
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
      const data = await dialogs.askForm({
        title: `Record service — ${asset.name}`,
        description: `Recording a service advances the derived schedule. Last serviced ${asset.last_serviced_at ? fmtDate(asset.last_serviced_at) : "never"} · next service ${asset.next_service_date ? fmtDate(asset.next_service_date) : "unscheduled"}.`,
        fields: [
          { key: "serviceDate", label: "Service date", type: "date", required: true, defaultValue: today },
          { key: "note", label: "Service note (optional)", type: "textarea" }
        ],
        submitText: "Record service"
      });
      if (!data) return;
      const { ok, body } = await post(`/api/maintenance/assets/${asset.id}/record-service`, { serviceDate: String(data.serviceDate), note: String(data.note ?? "").trim() || null });
      if (!ok) { notify(body.error ?? "Unable to record the service."); return; }
      notify(`Service recorded — next service ${body.data ? fmtDate(body.data) : "scheduled"}.`); await refreshAssets();
      return;
    }
    if (action === "update") {
      const data = await dialogs.askForm({
        title: `Update asset — ${asset.name}`,
        description: "Registry fields only — the service schedule comes from recorded services.",
        fields: [
          { key: "name", label: "Asset name", type: "text", required: true, defaultValue: asset.name, validation: required("Enter the asset name.") },
          { key: "category", label: "Category", type: "text", required: true, defaultValue: asset.category, validation: required("Enter a category.") },
          { key: "roomId", label: "Room (optional)", type: "text", defaultValue: asset.room_number ?? "" },
          { key: "location", label: "Location (optional)", type: "text", defaultValue: asset.location ?? "" },
          { key: "serviceIntervalDays", label: "Service interval (days)", type: "number", required: true, defaultValue: asset.service_interval_days, min: 1, validation: positive("Enter an interval of 1 or more days.") },
          { key: "notes", label: "Notes (optional)", type: "textarea", defaultValue: asset.notes ?? "" }
        ],
        submitText: "Save changes"
      });
      if (!data) return;
      const { ok, body } = await post(`/api/maintenance/assets/${asset.id}/update`, {
        name: String(data.name),
        category: String(data.category),
        roomId: String(data.roomId ?? "").trim() || null,
        location: String(data.location ?? "").trim() || null,
        serviceIntervalDays: Number(data.serviceIntervalDays),
        notes: String(data.notes ?? "").trim() || null
      });
      if (!ok) { notify(body.error ?? "Unable to update this asset."); return; }
      notify("Asset updated."); await refreshAssets();
      return;
    }
    const reason = await dialogs.askPrompt({ title: `Deactivate ${asset.name}?`, message: "Deactivated assets keep their history but drop out of the due windows.", label: "Reason", multiline: true, rows: 3, required: true, validation: required("Enter a reason for deactivating this asset.") });
    if (!reason) return;
    const { ok, body } = await post(`/api/maintenance/assets/${asset.id}/deactivate`, { reason });
    if (!ok) { notify(body.error ?? "Unable to deactivate this asset."); return; }
    notify("Asset deactivated."); await refreshAssets();
  }
  async function applySuggestion(s: AssignmentSuggestion) {
    const self = user.role === "housekeeping";
    const payload = self ? { reason: "Self-assigned from the suggested plan" } : { assignedUserId: s.staffId, reason: `Assigned from the suggested plan — ${s.reason}` };
    const { ok, body } = await post(`/api/housekeeping/tasks/${s.taskId}/assign`, payload);
    if (!ok) { notify(body.error ?? "Unable to assign this task."); return; }
    notify(`Suggestion applied: Room ${s.roomNumber} → ${self ? "you" : s.staffName}.`);
    await Promise.all([load(true), refreshSuggestions()]);
  }
  async function viewReservation(item:RecordItem){const res=await fetch(`/api/staff/reservations/${item.id}`,{cache:"no-store"});const body=await res.json();if(!res.ok){notify(body.error??"Unable to load reservation.");return}setDetail(body.data)}
  // Consolidated guest profile — read-only dossier from the staff guests endpoint.
  async function viewGuestProfile(id:string){const res=await fetch(`/api/staff/guests/${id}`,{cache:"no-store"});const body=await res.json();if(!res.ok){notify(body.error??"Unable to load guest profile.");return}setGuestProfile(body.data)}
  // Manager oversight shortcut: leave the detail modal, jump to the Approvals
  // queue with this reservation's reference pre-filled. The decision itself is
  // made in the existing review workflow — nothing here touches the reservation.
  function reviewReservationException(item:RecordItem){setDetail(null);setSearch(String(item.confirmation_number||item.id));setSection("approvals")}
  // QR scan outcome CTA: stay in the dashboard — jump to the section the code
  // points at, or open the resolved reservation's detail modal directly.
  function scanCta(action:string,reservationId?:string){setScanOpen(false);if(action==="check_in"&&reservationId){void viewReservation({id:reservationId})}else if(action==="room_tasks"){setSection("housekeeping_tasks")}else if(action==="work_orders"){setSection("maintenance_orders")}}
  async function closeReservation(status:"cancelled"|"no_show"){if(!detail)return;const reason=await dialogs.askPrompt({title:status==="cancelled"?"Cancel reservation":"Mark reservation as no-show",message:status==="cancelled"?"Provide a reason for cancelling this reservation.":"Add a note explaining the no-show.",label:status==="cancelled"?"Cancellation reason":"No-show note",multiline:true,rows:3,required:true,validation:required("Enter a reason for this change.")});if(!reason)return;const res=await fetch(`/api/staff/reservations/${detail.reservation.id}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status,reason})});const body=await res.json();if(!res.ok){notify(body.error??"Unable to update reservation.");return}setDetail(null);notify(status==="cancelled"?"Reservation cancelled.":"Reservation marked as no-show.");await load()}
  async function add(payload:Record<string,string|number>){if(!isResourceSection(section))return;const{ok,body}=await post(`/api/resources/${section}`,payload);if(!ok){notify(body.error??"Unable to create this record.");return}setModal(false);notify("Record created.");await load(true)}
  async function advance(item:RecordItem){if(!isResourceSection(section))return;const statuses=config[section].statuses??[];const index=statuses.indexOf(String(item.status));if(index<0||index+1>=statuses.length){notify("This record is already in its final status.");return}const next=statuses[index+1];const okToMove=await dialogs.askConfirm({title:"Advance record",message:`Move this record from ${label(item.status)} to ${label(next)}?`,confirmText:"Move",cancelText:"Keep as is"});if(!okToMove)return;const{ok,body}=await post(`/api/resources/${section}`,{id:item.id,status:next},"PATCH");if(!ok){notify(body.error??"Unable to update this record.");return}notify(`Record moved to ${label(next)}.`);await load(true)}
  // Cash handlers cannot sign out with an open shift: the drawer must be counted
  // and closed first. UI-level guard — closing the tab or a hand-made POST to
  // /api/auth/signout still bypasses it; intercepting that server-side is the
  // upgrade path if staff ever bypass it deliberately. Fails open on a check
  // error so a DB hiccup can never trap someone at sign-out.
  async function signOutGuarded(){
    if(cashHandling){
      try{
        const response=await fetch("/api/accounting/cash-shifts",{cache:"no-store"});
        const body=await response.json();
        if(response.ok&&body.data?.open){
          const shift=body.data.shift;
          const go=await dialogs.askConfirm({title:"Close your cash shift first",message:`Your cash shift${shift?.location?` at ${shift.location}`:""} is still open. Count and close it in Cash & Shifts so the drawer is accounted for before you sign out.`,confirmText:"Go to Cash & Shifts",cancelText:"Not now"});
          if(go){setSection("cash_shifts");setProfileOpen(false)}
          return;
        }
      }catch{}
    }
    signOut({callbackUrl:"/"});
  }
  return <div className={`app-shell${collapsed ? " sidebar-collapsed" : ""}`}>
    {menu && <button className="sidebar-backdrop" onClick={()=>setMenu(false)} aria-label="Close navigation" />}
    <aside id="staff-navigation" className={`sidebar${menu ? " open" : ""}${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-top">
        <div className="brand">
          <button className="brand-mark sidebar-brand-toggle" onClick={()=>{if(window.matchMedia("(max-width: 1000px)").matches){setMenu(false)}else{const next=!collapsed;setCollapsed(next);window.localStorage.setItem("haven-sidebar-collapsed",String(next))}}} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-controls="staff-navigation" aria-expanded={!collapsed} title={collapsed ? "Expand navigation" : "Collapse navigation"}><Sparkles size={17}/></button>
          <Link href="/" className="brand-copy" aria-label="Hotel homepage" title="Hotel homepage">HAVEN<small>HOTEL MANAGEMENT</small></Link>
          <button className="sidebar-collapse-button" onClick={()=>{const next=!collapsed;setCollapsed(next);window.localStorage.setItem("haven-sidebar-collapsed",String(next))}} aria-label="Collapse navigation" aria-controls="staff-navigation" aria-expanded={!collapsed} title="Collapse navigation"><PanelLeftClose size={16}/></button>
        </div>
      </div>
      <div className="property-pill" title="Haven Makati"><span>HV</span><div className="property-copy"><b>Haven Makati</b><small>48 rooms   Main property</small></div><ChevronDown className="property-chevron" size={15}/></div>
      <ManagerSidebarNav items={visibleNav} section={section} onSelect={(target)=>{setSection(target);setMenu(false)}} badges={badges}/>
    </aside>    <main className="workspace"><header className="app-header"><button className="menu-btn brand-menu-btn" onClick={()=>setMenu(true)} aria-label="Open navigation" title="Open navigation"><span className="brand-mark"><Sparkles size={16}/></span></button><div><p>{section === "overview" ? "Good morning" : section === "reports" ? (user.role === "front_desk" ? "Daily operations report" : "Performance center") : section === "approvals" ? "Approvals & Escalations" : section === "room_types" ? "Room Types & Photos" : section === "transport_services" ? "Transfer Vehicles" : section === "request_types" ? "Request Types" : section === "transportation" ? "Transportation" : section === "insights" ? "Predictive Insights" : section === "ai" ? "HAVEN AI" : section === "staff_duty" ? "Staff & Duty" : isResourceSection(section) ? config[section].title : accountingViews[section].title}</p><small suppressHydrationWarning>{new Intl.DateTimeFormat("en-PH",{weekday:"long",month:"long",day:"numeric",year:"numeric",timeZone:"Asia/Manila"}).format(new Date())}</small></div><div className="header-actions"><span className="mode-pill">{mode === "demo" ? "Demo data" : "Supabase live"}</span>{cashHandling&&myShift&&<span className={`mode-pill shift-pill ${myShift.open?"open":"closed"}`} title={myShift.open?`Cash shift open${myShift.location?` at ${myShift.location}`:""}${myShift.opened_at?` since ${new Date(myShift.opened_at).toLocaleString("en-PH",{dateStyle:"medium",timeStyle:"short"})}`:""}`:undefined}>Cash shift: {myShift.open?"Open":"Closed"}</span>}<ThemeToggle /><div className="notification-center" ref={notificationCenter} onMouseEnter={()=>setNotificationsHover(true)} onMouseLeave={()=>setNotificationsHover(false)}><button className="icon-button" aria-label={dashboard?.notifications.length?`Notifications, ${dashboard?.notifications.length} current`:"Notifications"} aria-expanded={notificationsVisible} onClick={toggleNotifications}><Bell size={19}/>{Boolean(dashboard?.notifications.length)&&<i className="nav-badge">{badgeLabel(dashboard?.notifications.length??0)}</i>}</button>{notificationsVisible&&<div className="popover-gap"><div className="notification-popover"><div><b>Operations alerts</b><small>{dashboard?.notifications.length??0} current</small></div>{dashboard?.notifications.length?dashboard.notifications.map((notice)=><button key={notice.id} onClick={()=>{setSection(notice.section);closeNotifications()}}><strong>{notice.title}</strong><span>{notice.detail}</span></button>):<p>No new operational alerts.</p>}</div></div>}</div><div className="profile-menu-wrap" ref={profileMenu}><button className="profile-menu-btn" onClick={()=>setProfileOpen((value)=>!value)} aria-expanded={profileOpen} aria-haspopup="menu" aria-label="Account menu"><b>{(user.name||"H").split(" ").map(x=>x[0]).join("").slice(0,2)}</b><span>{user.name}</span><ChevronDown size={14}/></button>{profileOpen&&<div className="popover-gap"><div className="profile-popover"><p><strong>{user.name}</strong><small>{user.email}</small><small>{label(user.role)}</small></p><button onClick={()=>{setProfileOpen(false);setSettingsOpen(true)}}><Settings size={15}/>Settings</button><button onClick={signOutGuarded}><LogOut size={15}/>Sign Out</button></div></div>}</div></div></header>
      <div className="workspace-body">{section === "room_types" ? <RoomCatalogPanel role={user.role}/> : section === "transport_services" ? <TransportServicesPanel/> : section === "request_types" ? <RequestTypesPanel/> : section === "transportation" ? <TransportationPanel role={user.role}/> : section === "insights" ? <PredictiveInsightsPanel/> : section === "ai" ? <HavenAiPanel/> : section === "staff_duty" ? <StaffDutyPanel/> : section === "guest_requests" && ["front_desk","manager","housekeeping"].includes(user.role) ? <GuestRequestsPanel role={user.role} onEscalate={user.role === "housekeeping" ? (request) => escalateGuestRequest(request as unknown as RecordItem) : undefined}/> : loading ? <Loading/>: section === "overview" ? <Overview data={dashboard!} setSection={setSection} allowed={access[user.role]} role={user.role} onScan={()=>setScanOpen(true)}/> : section === "reports" ? (user.role === "front_desk" ? <FrontDeskReportsPanel role={user.role}/> : user.role === "accounting" ? <Reports data={dashboard!} role={user.role}/> : <><Reports data={dashboard!} role={user.role}/><FrontDeskReportsPanel role={user.role}/></>) : section==="approvals"?<ManagerApprovalView items={filtered} search={search} setSearch={setSearch} review={reviewManagerApproval} execute={executeManagerApproval} financialExecute={executeManagerFinancialApproval} escalateOwner={escalateOwner} executeException={executeException} canReview={user.role==="manager"} canExecute={operational} canFinancialExecute={financialAuthority}/>:isAccountingSection(section) ? <AccountingView section={section} ledger={ledger} search={search} setSearch={setSearch} rejectDeposit={rejectDeposit} reverseCharge={reverseCharge} recordAdjustment={recordAdjustment} openCashShift={openCashShift} closeCashShift={closeCashShift} reconcileCashShift={reconcileCashShift} recordReconciliation={recordReconciliation} generateDocument={generateDocument} canVerify={financialAuthority} canAdjust={financialAuthority} canReconcile={financialAuthority} canOperateShift={cashHandling} canIssueDocument={cashHandling} actorId={user.id}/> : section==="housekeeping_tasks" ? <HousekeepingQueuePanel role={user.role} userId={user.id} items={filtered} search={search} setSearch={setSearch} housekeepingAction={operateHousekeeping} coordinate={coordinateHousekeeping} applySuggestion={applySuggestion} suggestions={suggestions} onViewMaintenance={()=>setSection("maintenance_orders")} onViewRoom={(item)=>setRoomDetail({id:String(item.room_id),number:item.room_number,type:item.room_type,floor:null,status:item.room_status,housekeeping:item.room_housekeeping})}/> : section==="reservations"&&user.role==="manager" ? <ManagerReservationsPanel items={filtered} search={search} setSearch={setSearch} viewReservation={viewReservation} onReviewException={reviewReservationException} onScan={()=>setScanOpen(true)}/> : <ResourceView resource={section} items={filtered} depositSlaHours={dashboard?.metrics?.depositSlaHours ?? DEFAULT_DEPOSIT_SLA_HOURS} replenishment={replenishmentRoles ? replenishment : null} createDraftPo={createDraftPo} assets={assetRoles ? maintenanceAssets : null} registerAsset={registerAsset} assetAction={assetAction} search={search} setSearch={setSearch} open={section==="maintenance_orders"?createMaintenance:()=>setModal(true)} advance={advance} checkIn={openArrival} verifyDeposit={verifyDeposit} rejectDeposit={rejectDeposit} viewReservation={viewReservation} viewRoom={(item)=>setRoomDetail(item)} viewGuest={(item)=>viewGuestProfile(String(item.id))} processRefund={processRefund} failRefund={failRefund} canProcessRefund={financialAuthority} canVerify={financialAuthority} canCheckIn={operational} requestApproval={requestManagerApproval} escalateGuestRequest={escalateGuestRequest} coordinateHousekeeping={coordinateHousekeeping} coordinateMaintenance={coordinateMaintenance} housekeepingAction={operateHousekeeping} maintenanceAction={operateMaintenance} createReservation={createReservation} openWalkIn={openWalkInDialog} canMaintain={user.role==="maintenance"} canAssignOthers={false} canHousekeep={user.role==="housekeeping"} canCoordinate={user.role==="manager"} canRequestApproval={user.role==="front_desk"||user.role==="housekeeping"||user.role==="maintenance"||user.role==="accounting"} manageRooms={catalogAuthority?()=>setRoster(true):null} onScan={section==="reservations"?()=>setScanOpen(true):null} canCreate={section!=="maintenance_orders"&&user.role!=="accounting"&&user.role!=="manager"&&!(user.role==="front_desk"&&["rooms","guests","housekeeping_tasks","invoices","payments"].includes(section))} canAdvance={section!=="maintenance_orders"&&user.role!=="manager"&&!(user.role==="front_desk"&&["rooms","housekeeping_tasks","invoices"].includes(section))}/>}</div>
    </main>
    {modal && isResourceSection(section) && <CreateModal resource={section} close={()=>setModal(false)} submit={add}/>}
    {settingsOpen && <SettingsDialog isOpen onClose={()=>setSettingsOpen(false)}/>}
      {roomDetail&&<RoomDetailModal key={String(roomDetail.id)} room={roomDetail} onClose={()=>setRoomDetail(null)} onViewReservation={(id)=>{setRoomDetail(null);viewReservation({id})}}/>}
      {verifyPayment&&<DepositVerifyDialog item={verifyPayment} busy={verifying} onClose={()=>setVerifyPayment(null)} onConfirm={()=>confirmVerifyDeposit(verifyPayment)} onReject={()=>{const item=verifyPayment;setVerifyPayment(null);rejectDeposit(item)}}/>}
      {scanOpen&&<QrScannerModal onClose={()=>setScanOpen(false)} onCta={scanCta}/>}
      {roster&&<RoomRosterPanel onClose={()=>{setRoster(false);void load(true)}}/>}
      {detail&&<ReservationDetailModal detail={detail} close={()=>setDetail(null)} checkIn={openArrival} closeReservation={closeReservation} collectPayment={collectPayment} postCharge={postCharge} assignRoom={assignRoom} changeRoom={changeRoom} extendStay={extendStay} updateGuest={updateGuest} routeRequest={routeRequest} checkOut={checkOut} reverseCharge={reverseCharge} recordAdjustment={recordAdjustment} generateDocument={generateDocument} canFinancial={cashHandling} canManage={operational} canAdjust={financialAuthority} canIssueDocument={cashHandling} oversight={user.role==="manager"||user.role==="owner"} canViewTransportation={user.role==="front_desk"||user.role==="manager"||user.role==="owner"} onReviewException={reviewReservationException} viewGuestProfile={viewGuestProfile}/>}
      {guestProfile&&<GuestProfileModal profile={guestProfile} close={()=>setGuestProfile(null)} onViewReservation={(id)=>{setGuestProfile(null);viewReservation({id})}}/>}
      {arrival&&<FrontDeskArrivalDialog key={arrivalKey} reservationId={String(arrival.item.id)} guestName={String(arrival.item.guest_name??"Guest")} exceptionType={arrival.exceptionType} askForm={dialogs.askForm} resume={arrivalResume[arrivalKey]??null} onProgress={handleArrivalProgress} onClose={()=>setArrival(null)} onCheckedIn={handleCheckedIn}/>}
      {walkIn&&<WalkInDialog key="walk-in" guests={guestProfiles} hotelToday={new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila"}).format(new Date())} onClose={()=>setWalkIn(false)} onCreated={handleWalkInCreated}/>}
      {extendStayOpen&&<ExtendStayDialog reservation={extendStayOpen.reservation} transportation={extendStayOpen.transportation} onClose={()=>setExtendStayOpen(null)} onDone={async(message)=>{notify(message);await viewReservation(extendStayOpen.reservation);await load(true)}}/>}
      <ToastStack controller={toastController}/>

      {dialogs.view}
    </div>;
}

function Overview({data,setSection,allowed,role,onScan}:{data:DashboardData;setSection:(s:Section)=>void;allowed:Section[];role:Role;onScan:()=>void}) { const m=data.metrics; const trend=data.occupancyTrend; const delta=trend.length>1?trend[trend.length-1].occupancy-trend[0].occupancy:0; const cards=role==="manager"?[{label:"Occupancy today",value:`${m.occupancy}%`,hint:`${m.inHouse} in-house guests`,icon:BedDouble},{label:"Arrivals / departures",value:`${m.arrivals} / ${m.departures}`,hint:`${m.unassignedArrivals} arrivals unassigned`,icon:CalendarDays},{label:"Rooms ready",value:m.availableRooms,hint:`${m.dirtyRooms} dirty · ${m.outOfServiceRooms} out of service`,icon:BedDouble},{label:"Pending approvals",value:m.pendingApprovals,hint:`${m.escalatedIssues} escalated guest issues`,icon:ClipboardCheck},{label:"Critical Maintenance",value:m.criticalMaintenance,hint:`${m.openMaintenance} open work orders`,icon:Wrench},{label:"Overdue workload",value:m.overdueHousekeeping+m.overdueRequests,hint:`${m.overdueHousekeeping} Housekeeping · ${m.overdueRequests} requests`,icon:Activity},{label:"Collections today",value:peso(m.collectionsToday),hint:`${peso(m.depositsReceived)} deposits`,icon:CircleDollarSign},{label:"Outstanding balances",value:peso(m.outstandingBalances),hint:`${peso(m.refundSummary)} refunds today`,icon:ReceiptText}]:role==="front_desk"?[{label:"Arrivals today",value:m.arrivals,hint:`${m.unassignedArrivals} need room assignment`,icon:CalendarDays},{label:"Departures today",value:m.departures,hint:`${m.balancesAttention} balances need attention`,icon:LogOut},{label:"In-house guests",value:m.inHouse,hint:`${m.openRequests} open guest requests`,icon:Users},{label:"Rooms ready",value:m.availableRooms,hint:`${m.dirtyRooms} awaiting readiness`,icon:BedDouble},{label:"Cash this shift",value:peso(m.cashThisShift??0),hint:m.shiftOpen?`Open shift · float ${peso(m.shiftFloat??0)} · closes into expected cash`:"No shift open — open one in Cash & Shifts before collecting cash",icon:CircleDollarSign}]:role==="housekeeping"?[{label:"Dirty rooms",value:m.dirtyRooms,hint:`${m.openTasks} open room-care tasks`,icon:BedDouble},{label:"Cleaning now",value:m.roomsCleaning,hint:"Exclusive active tasks",icon:ClipboardCheck},{label:"Awaiting inspection",value:m.roomsAwaitingInspection,hint:`${m.overdueHousekeeping} overdue tasks`,icon:Search},{label:"Rooms ready",value:m.availableRooms,hint:`${m.openMaintenance} maintenance blocks`,icon:Sparkles}]:role==="maintenance"?[{label:"Active work orders",value:m.openMaintenance,hint:`${m.criticalMaintenance} urgent or critical`,icon:Wrench},{label:"Rooms technically blocked",value:m.outOfServiceRooms,hint:"Based on Maintenance diagnosis",icon:BedDouble},{label:"Maintenance guest requests",value:m.openRequests,hint:"Routed operational requests",icon:Bell},{label:"Rooms ready",value:m.availableRooms,hint:"Clean and technically serviceable",icon:Sparkles}]:[{label:"Occupancy",value:`${m.occupancy}%`,hint:"Across all rooms",icon:BedDouble},{label:"Arrivals today",value:m.arrivals,hint:"Expected check-ins",icon:CalendarDays},{label:"Departures",value:m.departures,hint:"Due to check out",icon:LogOut},{label:"Revenue collected",value:peso(m.revenue),hint:"Current folios",icon:CircleDollarSign}]; return <><div className="page-title"><div><p className="eyebrow">{role==="manager"?"Management command center":role==="housekeeping"?"Housekeeping operations":role==="maintenance"?"Maintenance operations":"Operations overview"}</p><h1>{role==="manager"?"What is at risk right now?":role==="housekeeping"?"Room readiness for this shift":role==="maintenance"?"Technical serviceability for this shift":"Here's what's happening today."}</h1><p>{role==="manager"?"Cross-department exceptions, readiness, workload, and authorized summaries.":role==="maintenance"?"Claim, diagnose, repair, and restore assets through an auditable workflow.":"Everything your team needs for a smooth shift."}</p></div>{allowed.includes("reservations")&&<div className="title-actions"><button className="btn btn-soft" onClick={onScan}><QrCode size={17}/> Scan QR</button><button className="btn btn-accent" onClick={()=>setSection("reservations")}><Plus size={17}/> New reservation</button></div>}{!allowed.includes("reservations")&&<button className="btn btn-soft" onClick={onScan}><QrCode size={17}/> Scan QR</button>}</div><div className="metric-grid">{cards.map(({label:txt,value,hint,icon:Icon})=><article className="metric-card" key={txt}><div><span>{txt}</span><b>{value}</b><small>{hint}</small></div><i><Icon size={21}/></i></article>)}</div><div className="dashboard-grid"><article className="panel chart-panel"><div className="panel-heading"><div><h3>Occupancy this week</h3><p>Room utilization across the property</p></div><span className="trend">{delta>=0?"+":""}{delta}%</span></div><ResponsiveContainer width="100%" height={240}><AreaChart data={data.occupancyTrend}><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#176773" stopOpacity={.28}/><stop offset="95%" stopColor="#176773" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e8e7e2"/><XAxis dataKey="day" axisLine={false} tickLine={false}/><Tooltip/><Area type="monotone" dataKey="occupancy" stroke="#176773" strokeWidth={2.5} fill="url(#fill)"/></AreaChart></ResponsiveContainer></article><article className="panel room-mix"><div className="panel-heading"><div><h3>Room status</h3><p>Live inventory at a glance</p></div></div><div className="donut-wrap"><ResponsiveContainer width="52%" height={190}><PieChart><Pie data={data.roomMix} innerRadius={58} outerRadius={78} paddingAngle={3} dataKey="value">{data.roomMix.map((x)=><Cell key={x.name} fill={x.color}/>)}</Pie></PieChart></ResponsiveContainer><div>{data.roomMix.map(x=><p key={x.name}><i style={{background:x.color}}/><span>{x.name}</span><b>{x.value}</b></p>)}</div></div></article>{allowed.includes("reservations")?<article className="panel arrivals"><div className="panel-heading"><div><h3>Recent reservations</h3><p>Latest guest activity</p></div><button onClick={()=>setSection("reservations")}>View all</button></div>{data.recentReservations.map(r=><div className="arrival-row" key={r.id}><span className="avatar">{String(r.guest_name).split(" ").map(x=>x[0]).join("")}</span><div><b>{r.guest_name}</b><small>{r.room_type}   {r.check_in}</small></div><span className={`badge ${r.status}`}>{label(r.status)}</span></div>)}</article>:<article className="panel quick-panel room-activity-panel"><div className="panel-heading"><div><h3>Room readiness activity</h3><p>{role==="housekeeping"?"Room-care states requiring action":"Live room states requiring attention"}</p></div><button onClick={()=>setSection("rooms")}>View rooms</button></div>{role==="housekeeping"?<><button onClick={()=>setSection("rooms")}><span className="quick-icon amber"><BedDouble/></span><span><b>{m.dirtyRooms} dirty rooms</b><small>Waiting for cleaning or recleaning</small></span><ChevronDown/></button><button onClick={()=>setSection("housekeeping_tasks")}><span className="quick-icon green"><ClipboardCheck/></span><span><b>{m.roomsCleaning} cleaning in progress</b><small>Currently claimed room-care work</small></span><ChevronDown/></button><button onClick={()=>setSection("housekeeping_tasks")}><span className="quick-icon amber"><Search/></span><span><b>{m.roomsAwaitingInspection} awaiting inspection</b><small>Completed rooms waiting for release</small></span><ChevronDown/></button><button onClick={()=>setSection("rooms")}><span className="quick-icon rose"><Wrench/></span><span><b>{m.outOfServiceRooms} technically blocked rooms</b><small>Visible for coordination; Maintenance owns repair</small></span><ChevronDown/></button></>:data.roomMix.filter(item=>item.name!=="Available").map(item=><button key={item.name} onClick={()=>setSection("rooms")}><span className="quick-icon amber"><BedDouble/></span><span><b>{item.value} {item.name.toLowerCase()} rooms</b><small>Open the room inventory for details</small></span><ChevronDown/></button>)}</article>}<article className="panel quick-panel"><div className="panel-heading"><div><h3>Needs attention</h3><p>Priority actions for this shift</p></div></div>{allowed.includes("housekeeping_tasks")&&<button onClick={()=>setSection("housekeeping_tasks")}><span className="quick-icon amber"><ClipboardCheck/></span><span><b>{m.openTasks} housekeeping tasks</b><small>Open room-care work</small></span><ChevronDown/></button>}{allowed.includes("rooms")&&<button onClick={()=>setSection("rooms")}><span className="quick-icon green"><BedDouble/></span><span><b>{m.availableRooms} rooms ready</b><small>Available for assignment now</small></span><ChevronDown/></button>}{allowed.includes("maintenance_orders")&&<button onClick={()=>setSection("maintenance_orders")}><span className="quick-icon rose"><Wrench/></span><span><b>Maintenance work orders</b><small>Review open repair priorities</small></span><ChevronDown/></button>}{allowed.includes("approvals")&&<button onClick={()=>setSection("approvals")}><span className="quick-icon rose"><ClipboardCheck/></span><span><b>{m.pendingApprovals} pending approvals</b><small>{m.escalatedIssues} escalated guest issues</small></span><ChevronDown/></button>}</article></div></> }

// Queue predicates shared by the reservation filter chips (counts) and the
// visible rows, so the two can never drift. Filters compare raw ISO strings.
function queueFilter(item: RecordItem, queue: string, source: string, today: string) {
  if (source !== "all" && String(item.source) !== source) return false;
  const status = String(item.status);
  if (queue === "upcoming") return String(item.check_in) > today && ["pending", "confirmed"].includes(status);
  if (queue === "arrivals") return String(item.check_in) === today && ["confirmed", "checked_in"].includes(status);
  if (queue === "departures") return String(item.check_out) === today && ["confirmed", "checked_in"].includes(status);
  if (queue === "in_house") return status === "checked_in";
  if (queue === "cancelled") return status === "cancelled";
  if (queue === "no_show") return status === "no_show";
  return true;
}

// Header split action for reservations: one compact control, two authorized creation
// channels. "New reservation" covers front-desk/phone bookings for future dates;
// "Walk-in guest" opens the staged same-day flow. Source is set by the chosen
// workflow, never typed. Closes on outside pointer, Escape, and selection.
function NewReservationMenu({ onNew, onWalkIn }: { onNew: () => void; onWalkIn: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <div className="new-reservation-menu" ref={ref}>
    <button className="btn btn-accent" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}><Plus size={17}/> New reservation <ChevronDown size={15} className="menu-chevron"/></button>
    {open && <div className="popover-gap"><div className="new-reservation-popover" role="menu" aria-label="Create a reservation">
      <button role="menuitem" onClick={() => { setOpen(false); onNew(); }}><CalendarDays size={16}/><span><b>New reservation</b><small>Front desk or phone booking for future dates</small></span></button>
      <button role="menuitem" onClick={() => { setOpen(false); onWalkIn(); }}><LogIn size={16}/><span><b>Walk-in guest</b><small>Guest at the desk, checking in today</small></span></button>
    </div></div>}
  </div>;
}

// Dedicated front-desk reservations table: 8 consolidated columns instead of
// the 13 the generic resource table renders, so dates and actions never wrap.
function ReservationsTable({ items, canCheckIn, canRequestApproval, viewReservation, checkIn, requestApproval }: { items: RecordItem[]; canCheckIn: boolean; canRequestApproval: boolean; viewReservation: (item: RecordItem) => void; checkIn: (item: RecordItem) => void; requestApproval: (item: RecordItem) => void }) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  return <table className="reservations-table" aria-label="Reservations records">
    <thead><tr><th>Reference</th><th>Guest</th><th>Room</th><th>Stay</th><th>Folio</th><th>Payment</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>{items.map((item) => {
      const status = String(item.status);
      const actionable = canCheckIn && status === "confirmed";
      const room = item.room_number ? <><b>{label(item.room_number)}</b><small>{label(item.room_type)}</small></> : <b className="unassigned-room">Not assigned</b>;
      const balance = Number(item.folio_balance || 0);
      const stay = <div className={`stay-cell${String(item.check_in) === today ? " today" : ""}`} title={`Check in ${label(item.check_in)} · Check out ${label(item.check_out)}`}><b>{fmtDate(item.check_in)} <i>→</i> {fmtDate(item.check_out)}</b><small>{nights(item.check_in, item.check_out)} night{nights(item.check_in, item.check_out) !== 1 ? "s" : ""}</small></div>;
      return <tr key={item.id} tabIndex={0} onClick={() => viewReservation(item)} onKeyDown={(event) => { if (event.key === "Enter") viewReservation(item); }}>
        <td><div className="cell-stack"><b>{label(item.confirmation_number || item.id)}</b><small className={`source-badge ${String(item.source || "direct").toLowerCase()}`}>{label(item.source || "Direct")}</small></div></td>
        <td><div className="cell-stack"><b>{label(item.guest_name)}</b><span className={`badge identity ${String(item.identity_status || "unverified")}`}>{label(item.identity_status || "unverified")}</span></div></td>
        <td><div className="cell-stack">{room}</div></td>
        <td>{stay}</td>
        <td><div className="cell-stack"><b>{peso(item.total)}</b>{balance > 0 ? <small className="balance-due">{peso(balance)} due</small> : <small className="balance-clear">Settled</small>}</div></td>
        <td><span className={`badge ${item.payment_status}`}>{label(item.payment_status)}</span></td>
        <td><span className={`badge ${status}`}>{label(status)}</span></td>
        <td><div className="reservation-actions">
          <button className="table-action view-action" onClick={(event) => { event.stopPropagation(); viewReservation(item); }}><Eye size={13}/> View</button>
          {actionable && <button className="table-action check-in-action" onClick={(event) => { event.stopPropagation(); checkIn(item); }}><LogIn size={13}/> Assign & check in</button>}
          {canRequestApproval && <button className="table-action" onClick={(event) => { event.stopPropagation(); requestApproval(item); }}><ClipboardCheck size={13}/> Exception</button>}
        </div></td>
      </tr>; })}</tbody>
  </table>;
}

// Operational scan order for the rooms grid: sellable first, turnover/blockers next,
// committed and in-use last; room number ascending inside each group.
const roomStatusRank: Record<string, number> = { available: 0, dirty: 1, maintenance: 2, reserved: 3, occupied: 4 };

function ResourceView({resource,items,depositSlaHours,replenishment,createDraftPo,assets,registerAsset,assetAction,search,setSearch,open,advance,checkIn,verifyDeposit,rejectDeposit,viewReservation,viewRoom,viewGuest,processRefund,failRefund,requestApproval,escalateGuestRequest,coordinateHousekeeping,coordinateMaintenance,housekeepingAction,maintenanceAction,createReservation,openWalkIn,canMaintain,canAssignOthers,canHousekeep,canCheckIn,canVerify,canProcessRefund,canCreate,canAdvance,canCoordinate,canRequestApproval,manageRooms,onScan}:{resource:Resource;items:RecordItem[];depositSlaHours:number;replenishment:{suggestions:ReplenishmentSuggestion[];drafts:RecordItem[]}|null;createDraftPo:(s:ReplenishmentSuggestion)=>void;assets:MaintenanceAsset[]|null;registerAsset:()=>void;assetAction:(a:MaintenanceAsset,action:"record-service"|"update"|"deactivate")=>void;search:string;setSearch:(s:string)=>void;open:()=>void;advance:(x:RecordItem)=>void;checkIn:(x:RecordItem)=>void;verifyDeposit:(x:RecordItem)=>void;rejectDeposit:(x:RecordItem)=>void;viewReservation:(x:RecordItem)=>void;viewRoom:(x:RecordItem)=>void;viewGuest:(x:RecordItem)=>void;processRefund:(x:RecordItem)=>void;failRefund:(x:RecordItem)=>void;requestApproval:(x:RecordItem)=>void;escalateGuestRequest:(x:RecordItem)=>void;coordinateHousekeeping:(x:RecordItem)=>void;coordinateMaintenance:(x:RecordItem)=>void;housekeepingAction:(x:RecordItem,action:"assign"|"start"|"complete"|"inspect"|"defer"|"maintenance")=>void;maintenanceAction:(x:RecordItem,action:"assign"|"start"|"diagnose"|"defer"|"progress"|"resolve"|"close"|"cancel")=>void;createReservation:()=>void;openWalkIn:()=>void;canMaintain:boolean;canAssignOthers:boolean;canHousekeep:boolean;canCheckIn:boolean;canVerify:boolean;canProcessRefund:boolean;canCreate:boolean;canAdvance:boolean;canCoordinate:boolean;canRequestApproval:boolean;manageRooms:(()=>void)|null;onScan:(()=>void)|null}) {
  const c=config[resource];
  const [queue,setQueue]=useState("all");
  const [source,setSource]=useState("all");
  const [roomType,setRoomType]=useState("all");
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila"}).format(new Date());
  const sources=resource==="reservations"?Array.from(new Set(items.map((item)=>String(item.source||"Direct")))):[];
  const roomTypes=resource==="rooms"?Array.from(new Set(items.map((item)=>String(item.type)))).sort():[];
  const queueCounts=resource==="reservations"?new Map([["all",items.length],...[["upcoming"],["arrivals"],["departures"],["in_house"],["cancelled"],["no_show"]].map(([value])=>[value as string,items.filter((item)=>queueFilter(item,value as string,"all",today)).length] as [string,number])]):null;
  const visible=resource!=="reservations"?resource==="rooms"?items.filter((item)=>roomType==="all"||String(item.type)===roomType).sort((a,b)=>(roomStatusRank[String(a.status)]??9)-(roomStatusRank[String(b.status)]??9)||String(a.number).localeCompare(String(b.number),undefined,{numeric:true})):items:items.filter((item)=>queueFilter(item,queue,source,today));
  return <><div className="page-title module-title"><div><p className="eyebrow">Hotel operations</p><h1>{c.title}</h1><p>{c.subtitle}</p></div>{resource==="reservations"&&<div className="title-actions">{onScan&&<button className="btn btn-soft" onClick={onScan}><QrCode size={17}/> Scan QR</button>}{canCheckIn&&<NewReservationMenu onNew={createReservation} onWalkIn={openWalkIn}/>}</div>}{!["payments","refunds","reservations"].includes(resource)&&canCreate&&<button className="btn btn-accent" onClick={open}><Plus size={17}/> Add {c.title.split(" ")[0].toLowerCase()}</button>}</div>
  <ModuleSummaryCards cards={moduleSummary(resource,items,today,depositSlaHours)} activeQueue={resource==="reservations"?queue:undefined} onSelect={resource==="reservations"?(target)=>setQueue(target):undefined} ariaLabel={`${c.title} summary`}/>
  {resource==="inventory"&&replenishment&&replenishment.suggestions.length>0&&<div className="data-panel hk-queue" aria-label="Replenishment suggestions">
    <section className="hk-queue-group">
      <header><h3><TrendingUp size={14} aria-hidden="true"/>Replenishment suggestions<i>{replenishment.suggestions.length}</i></h3><p>Suggestion — you decide. Predicted 3-day consumption from recorded usage; drafts await Manager review and nothing is ordered or sent automatically.</p></header>
      {replenishment.suggestions.map((suggestion)=><article key={suggestion.itemId} className="hk-queue-card">
        <div className="hk-queue-main">
          <header><b>{suggestion.name}</b><span className="hk-queue-type">{label(suggestion.unit)}</span><span className={`badge ${suggestion.risk}`}>{label(suggestion.risk)}</span></header>
          <p className="hk-queue-service"><strong>Stock {suggestion.currentStock}</strong> · reorder at {suggestion.reorderPoint} · predicted need {suggestion.predictedConsumption ?? "—"}{suggestion.projectedShortage ? ` · shortage ${suggestion.projectedShortage}` : ""}</p>
          <small>Suggested reorder {suggestion.suggestedQuantity} {label(suggestion.unit)}{suggestion.unitCost > 0 ? ` · est. ${peso(suggestion.suggestedQuantity * suggestion.unitCost)}` : " · unit cost not set"}</small>
        </div>
        <div className="hk-queue-actions"><button className="table-action view-action" onClick={()=>createDraftPo(suggestion)}>Create draft PO</button></div>
      </article>)}
    </section>
    {replenishment.drafts.length>0&&<section className="hk-queue-group" aria-label="Draft purchase orders">
      <header><h3><Boxes size={14} aria-hidden="true"/>Draft purchase orders<i>{replenishment.drafts.length}</i></h3><p>Read-only drafts for Manager review. Nothing here is submitted or sent to any vendor.</p></header>
      {replenishment.drafts.map((draft)=><article key={String(draft.id)} className="hk-queue-card">
        <div className="hk-queue-main">
          <header><b>Draft PO {String(draft.id).slice(0,8)}</b><span className={`badge ${String(draft.status)}`}>{label(draft.status)}</span></header>
          <p className="hk-queue-service"><strong>{Array.isArray(draft.items)?(draft.items as { name: string; quantity: number; unit: string }[]).map((line)=>`${line.name} × ${line.quantity}`).join(", "):""}</strong></p>
          <small>Created {fmtStamp(draft.created_at)} · est. total {peso(draft.total)}</small>
        </div>
        <div className="hk-queue-actions"><span>Draft only — review before any order</span></div>
      </article>)}
    </section>}
  </div>}
  {resource==="maintenance_orders"&&assets!==null&&<div className="data-panel hk-queue" aria-label="Preventive maintenance">
    <section className="hk-queue-group">
      <header><h3><CalendarCheck size={14} aria-hidden="true"/>Preventive maintenance<i>{assets.length}</i></h3><p>Real assets the hotel registered, grouped by their derived due date (last service + interval). Due dates are visibility only — a room is never blocked because a service is due.</p><button className="table-action view-action" onClick={registerAsset}><Plus size={13}/> Register asset</button></header>
      {assets.length===0&&<p className="hk-queue-service">No assets registered yet. Register the equipment the hotel actually maintains — no sample assets are created.</p>}
    </section>
    {ASSET_DUE_WINDOWS.map(({key:windowKey,label:windowLabel,hint})=>{const group=assets.filter((asset)=>assetDueWindow(asset,today)===windowKey);return group.length===0?null:<section key={windowKey} className="hk-queue-group" aria-label={windowLabel}>
      <header><h3>{windowLabel}<i>{group.length}</i></h3><p>{hint}</p></header>
      {group.map((asset)=>{const days=asset.next_service_date?daysUntil(today,asset.next_service_date):null;return <article key={asset.id} className="hk-queue-card">
        <div className="hk-queue-main">
          <header><b>{asset.name}</b><span className="hk-queue-type">{label(asset.category)}</span>{asset.room_number?<span className="hk-queue-type">Room {asset.room_number}</span>:null}{days===null?<span className="badge">No history</span>:days<0?<span className="badge sla-breach">Overdue {Math.abs(days)}d</span>:days<=7?<span className="badge sla-attention">In {days}d</span>:<span className="badge">{fmtDate(asset.next_service_date)}</span>}</header>
          <p className="hk-queue-service"><strong>Every {asset.service_interval_days} day{asset.service_interval_days!==1?"s":""}</strong> · last serviced {asset.last_serviced_at?fmtDate(asset.last_serviced_at):"never"} · next service {asset.next_service_date?fmtDate(asset.next_service_date):"unscheduled"}</p>
          <small>{[asset.location?`Location: ${asset.location}`:null,asset.notes??null].filter(Boolean).join(" · ") || "—"}</small>
        </div>
        <div className="hk-queue-actions"><button className="table-action view-action" onClick={()=>assetAction(asset,"record-service")}>Record service</button><button className="table-action" onClick={()=>assetAction(asset,"update")}>Update</button><button className="table-action" onClick={()=>assetAction(asset,"deactivate")}>Deactivate</button></div>
      </article>;})}
    </section>;})}
  </div>}
  {resource==="reservations"&&<div className="reservation-filters"><div>{[["all","All"],["upcoming","Upcoming"],["arrivals","Arrivals today"],["departures","Departures today"],["in_house","In-house"],["cancelled","Cancelled"],["no_show","No-shows"]].map(([value,text])=><button key={value} className={queue===value?"active":""} onClick={()=>setQueue(value)}>{text}{queueCounts&&<i className="chip-count">{queueCounts.get(value)??0}</i>}</button>)}</div><label>Source<select value={source} onChange={(event)=>setSource(event.target.value)}><option value="all">All sources</option>{sources.map((value)=><option value={value} key={value}>{value}</option>)}</select></label></div>}
  {resource==="rooms"&&<div className="reservation-filters"><div>{[["all","All types"],...roomTypes.map((value)=>[value,label(value)] as [string,string])].map(([value,text])=><button key={value} className={roomType===value?"active":""} onClick={()=>setRoomType(value)}>{text}</button>)}</div>{manageRooms&&<button className="btn btn-accent" onClick={manageRooms}><DoorClosed size={15}/> Manage rooms</button>}</div>}
  <div className="table-tools"><label><Search size={17}/><input placeholder={`Search ${c.title.toLowerCase()}...`} value={search} onChange={event=>setSearch(event.target.value)}/></label></div>
  {resource==="rooms"&&<div className="data-panel"><div className="room-card-grid" aria-label="Rooms records">{visible.map((item)=><article key={item.id} className={`room-card ${String(item.status)}`} role="button" tabIndex={0} aria-label={`View room details for Room ${label(item.number)}`} onClick={()=>viewRoom(item)} onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();viewRoom(item)}}}><header><b>Room {label(item.number)}</b>{canAdvance?<button className={`badge ${item.status}`} onClick={(event)=>{event.stopPropagation();advance(item)}} title="Click to move to next status">{label(item.status)}</button>:<span className={`badge ${item.status}`}>{label(item.status)}</span>}</header><RoomTypeBadge name={label(item.type)} colorKey={item.room_type_color == null ? null : String(item.room_type_color)}/><dl><div><dt>Floor</dt><dd>{label(item.floor)}</dd></div><div><dt>Rate</dt><dd>{peso(item.rate)}</dd></div><div><dt>Housekeeping</dt><dd><span className={`badge ${String(item.housekeeping)}`}>{label(item.housekeeping)}</span></dd></div></dl></article>)}</div>{visible.length===0&&<div className="empty"><Search/><h3>No records found</h3><p>No matching operational records are available.</p></div>}<div className="table-footer">Showing {visible.length} record{visible.length!==1?"s":""}<span>Room readiness is saved to the shared hotel database.</span></div></div>}
  {resource==="reservations"&&<div className="data-panel"><div className="table-scroll"><ReservationsTable items={visible} canCheckIn={canCheckIn} canRequestApproval={canRequestApproval} viewReservation={viewReservation} checkIn={checkIn} requestApproval={requestApproval}/></div>{visible.length===0&&<div className="empty"><Search/><h3>No records found</h3><p>No matching operational records are available.</p></div>}<div className="table-footer">Showing {visible.length} record{visible.length!==1?"s":""}<span>Website and staff bookings share this live queue.</span></div></div>}
  {resource!=="rooms"&&resource!=="reservations"&&<div className="data-panel"><div className="table-scroll"><table aria-label={`${label(resource)} records`}><thead><tr>{c.columns.map((column)=><th key={column.key}>{column.label}</th>)}{["refunds","guest_requests","housekeeping_tasks","maintenance_orders","guests"].includes(resource)&&<th>Actions</th>}</tr></thead><tbody>{visible.map((item)=><tr key={item.id}>{c.columns.map((column)=><td key={column.key}>{column.key==="status"?(resource==="payments"?<div className="reservation-actions"><span className={`badge ${item.status}`}>{label(item.status)}</span>{item.status==="pending_verification"&&(()=>{const age=depositAgeMinutes(item.submitted_at);const band=depositAgeBand(item.submitted_at,depositSlaHours);return band==="normal"?null:<span className={`badge sla-${band}`} title={`Waiting ${formatDepositAge(age)}${depositSlaHours>0?` — SLA ${depositSlaHours}h`:""}`}>{band==="breach"?"Past SLA ":"Waiting "}{formatDepositAge(age)}</span>;})()}{canVerify&&item.status==="pending_verification"&&<><button className="table-action" onClick={()=>verifyDeposit(item)}>Verify {item.purpose==="stay_payment"?"payment":"deposit"}</button><button className="table-action" onClick={()=>rejectDeposit(item)}>Reject</button></>}{item.status==="failed"&&item.decision_reason&&<small>{label(item.decision_reason)}</small>}</div>:canAdvance?<button className={`badge ${item.status}`} onClick={()=>advance(item)} title="Click to move to next status">{label(item.status)}</button>:<span className={`badge ${item.status}`}>{label(item.status)}</span>):column.key==="basis"?refundBasisBadge(item):column.key==="payment_status"?<span className={`badge ${item.payment_status}`}>{label(item.payment_status)}</span>:column.key==="source"?<span className={`source-badge ${String(item.source).toLowerCase()}`}>{label(item.source)}</span>:column.money?<strong>{peso(item[column.key])}</strong>:column.key==="guest_name"||column.key==="name"?<strong>{label(item[column.key])}</strong>:label(item[column.key])}</td>)}{resource==="guests"&&<td><button className="table-action view-action" onClick={()=>viewGuest(item)}><Eye size={13}/> Profile</button></td>}{resource==="guest_requests"&&<td>{canRequestApproval&&item.status!=="completed"&&item.escalation_status!=="escalated"?<button className="table-action" onClick={()=>escalateGuestRequest(item)}>Escalate</button>:<span className={`badge ${item.escalation_status??"none"}`}>{label(item.escalation_status??"normal")}</span>}</td>}{resource==="housekeeping_tasks"&&<td><div className="reservation-actions">{canHousekeep&&["pending","assigned","deferred"].includes(String(item.status))&&item.task_type!=="inspection"&&(!item.assigned_user_id||canAssignOthers)&&<button className="table-action" onClick={()=>housekeepingAction(item,"assign")}>{item.assigned_user_id?"Reassign":"Claim"}</button>}{canHousekeep&&["pending","assigned","deferred"].includes(String(item.status))&&item.task_type!=="inspection"&&<button className="table-action view-action" onClick={()=>housekeepingAction(item,"start")}>Start</button>}{canHousekeep&&item.status==="in_progress"&&<button className="table-action view-action" onClick={()=>housekeepingAction(item,"complete")}>Complete</button>}{canHousekeep&&item.inspection_status==="pending"&&<button className="table-action view-action" onClick={()=>housekeepingAction(item,"inspect")}>Inspect</button>}{canHousekeep&&item.status==="in_progress"&&["stayover_cleaning","guest_request"].includes(String(item.task_type))&&<button className="table-action" onClick={()=>housekeepingAction(item,"defer")}>Defer</button>}{canHousekeep&&item.status!=="cancelled"&&<button className="table-action" onClick={()=>housekeepingAction(item,"maintenance")}>Report issue</button>}{canCoordinate&&item.status!=="completed"&&<button className="table-action" onClick={()=>coordinateHousekeeping(item)}>Prioritize</button>}{!canHousekeep&&!canCoordinate&&<span>View only</span>}</div></td>}{resource==="maintenance_orders"&&<td><div className="reservation-actions">{canMaintain&&item.status==="open"&&<button className="table-action" onClick={()=>maintenanceAction(item,"assign")}>Claim / assign</button>}{canMaintain&&["assigned","waiting_parts","deferred"].includes(String(item.status))&&<button className="table-action view-action" onClick={()=>maintenanceAction(item,"start")}>Start / resume</button>}{canMaintain&&["assigned","in_progress","waiting_parts","deferred"].includes(String(item.status))&&<button className="table-action" onClick={()=>maintenanceAction(item,"diagnose")}>Diagnose</button>}{canMaintain&&item.status==="in_progress"&&<button className="table-action" onClick={()=>maintenanceAction(item,"progress")}>Progress</button>}{canMaintain&&item.status==="in_progress"&&<button className="table-action" onClick={()=>maintenanceAction(item,"defer")}>Wait / defer</button>}{canMaintain&&["in_progress","waiting_parts","deferred"].includes(String(item.status))&&<button className="table-action view-action" onClick={()=>maintenanceAction(item,"resolve")}>Resolve</button>}{canMaintain&&item.status==="resolved"&&<button className="table-action view-action" onClick={()=>maintenanceAction(item,"close")}>Close</button>}{canMaintain&&["open","assigned","waiting_parts","deferred"].includes(String(item.status))&&<button className="table-action" onClick={()=>maintenanceAction(item,"cancel")}>Cancel</button>}{canCoordinate&&!["resolved","completed","cancelled"].includes(String(item.status))&&<button className="table-action" onClick={()=>coordinateMaintenance(item)}>Escalate priority</button>}{!canMaintain&&!canCoordinate&&<span>View only</span>}</div></td>}{resource==="refunds"&&<td>{canProcessRefund&&isRefundActionable(String(item.status))?<div className="reservation-actions"><button className="table-action view-action" onClick={()=>processRefund(item)}>{item.status==="failed"?"Retry refund":"Process refund"}</button><button className="table-action" onClick={()=>failRefund(item)}>Record failure</button>{Number(item.attempts||0)>0&&<small>{item.attempts} attempt{Number(item.attempts)!==1?"s":""}{item.last_failure?` - ${label(item.last_failure)}`:""}</small>}</div>:<span>{item.status==="processed"?"Complete":item.exception_approval_id&&item.approval_status==="pending"?"Manager approval required":"Not actionable"}</span>}</td>}</tr>)}</tbody></table></div>{visible.length===0&&<div className="empty"><Search/><h3>No records found</h3><p>No matching operational records are available.</p></div>}<div className="table-footer">Showing {visible.length} record{visible.length!==1?"s":""}<span>{resource==="payments"?"Payment verification is audited and idempotent.":"Updates are saved to the shared hotel database."}</span></div></div>}
  </>
}

// Compact read-only lifecycle: every stage shows a real timestamp or an
// explicit "Pending"/"Upcoming" — nothing is fabricated. "Reservation
// Confirmed" has no column in the reservations table, so it is status-gated
// only. Deposit timestamps come from the payments history, room assignment
// from reservation_room_assignments, turnover from the checkout_cleaning task.
function ReservationLifecycle({detail}:{detail:ReservationDetail}){
  const reservation=detail.reservation;
  const status=String(reservation.status);
  const deposit=detail.payments.filter((payment)=>payment.purpose==="reservation_deposit")[0];
  const depositSubmitted=deposit?.submitted_at;
  const depositVerified=detail.payments.find((payment)=>payment.purpose==="reservation_deposit"&&payment.status==="paid")?.verified_at;
  const assignment=detail.assignments.find((entry)=>!entry.released_at&&entry.status==="active")??detail.assignments[0];
  const turnover=detail.turnover;
  const reached=status==="checked_in"||status==="checked_out";
  const stamp=(value:unknown)=>{const raw=String(value??"");return /^\d{4}/.test(raw)?raw:undefined};
  const stages:[string,string|undefined,boolean][]=[
    ["Booking created",stamp(reservation.created_at),true],
    ["Deposit submitted",stamp(depositSubmitted),Boolean(depositSubmitted)],
    ["Deposit verified",stamp(depositVerified),Boolean(depositVerified)],
    ["Confirmed",undefined,["confirmed","checked_in","checked_out"].includes(status)],
    ["Room assigned",stamp(assignment?.assigned_at),Boolean(assignment)],
    ["Checked in",stamp(reservation.checked_in_at),reached],
    ["In house",undefined,status==="checked_in"||status==="checked_out"],
    ["Checked out",stamp(reservation.checked_out_at),status==="checked_out"],
    ["Room turnover",stamp(turnover?.completed_at),Boolean(turnover)],
  ];
  return <div className="mr-lifecycle" aria-label="Reservation lifecycle">
    {stages.map(([name,stamp,done])=><span key={name} className={`mr-lifecycle-step${done?" done":""}`} title={stamp?`${label(name)}: ${fmtStamp(stamp)}`:`${label(name)}: not yet reached`}>
      <i/><b>{label(name)}</b><small>{stamp?fmtStamp(stamp):done?"Recorded":"Pending"}</small>
    </span>)}
  </div>;
}

function ReservationDetailModal({detail,close,checkIn,closeReservation,collectPayment,postCharge,assignRoom,changeRoom,extendStay,updateGuest,routeRequest,checkOut,reverseCharge,recordAdjustment,generateDocument,canFinancial,canManage,canAdjust,canIssueDocument,oversight,canViewTransportation,onReviewException,viewGuestProfile}:{detail:ReservationDetail;close:()=>void;checkIn:(item:RecordItem)=>void;closeReservation:(status:"cancelled"|"no_show")=>void;collectPayment:(item:RecordItem)=>void;postCharge:(item:RecordItem)=>void;assignRoom:(item:RecordItem)=>void;changeRoom:(item:RecordItem)=>void;extendStay:(item:RecordItem)=>void;updateGuest:(item:RecordItem)=>void;routeRequest:(item:RecordItem)=>void;checkOut:(item:RecordItem)=>void;reverseCharge:(item:RecordItem)=>void;recordAdjustment:(reservationId:string)=>void;generateDocument:(payload:{documentType:"receipt";paymentId:string}|{documentType:"folio";reservationId:string})=>void;canFinancial:boolean;canManage:boolean;canAdjust:boolean;canIssueDocument:boolean;oversight?:boolean;canViewTransportation?:boolean;onReviewException?:(item:RecordItem)=>void;viewGuestProfile?:(id:string)=>void}){
  const reservation=detail.reservation;const active=["pending","confirmed"].includes(String(reservation.status));const confirmed=reservation.status==="confirmed";const inHouse=reservation.status==="checked_in";const balance=Number(detail.invoice?.balance??Number(reservation.total||0)-Number(reservation.deposit||0));
  // What the guest asked for at booking (chips) — the derived guest_requests rows
  // only exist once the reservation is confirmed, so this is the only view for pending ones.
  const requestOptions=(Array.isArray(reservation.request_options)?reservation.request_options:[]).map(String);
  // Frozen nightly rates (rate plans) — uniform stays show one rate, mixed-rate
  // stays show each night. Legacy rows have none and fall back to the total.
  const frozenNightly=parseFrozenRates(reservation.nightly_rates);
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila"}).format(new Date());
  const arrivalToday=String(reservation.check_in)===today&&["confirmed","checked_in"].includes(String(reservation.status));
  const departureToday=String(reservation.check_out)===today&&["confirmed","checked_in"].includes(String(reservation.status));
  return <Modal isOpen onClose={close} title={label(reservation.confirmation_number||reservation.id)} description={`${label(reservation.source)} reservation`} size="xl" headerVariant="branded" className="reservation-detail-modal" footer={<div className="reservation-detail-actions">{viewGuestProfile&&reservation.guest_id&&<button className="btn btn-soft" onClick={()=>viewGuestProfile(String(reservation.guest_id))}>Guest profile</button>}{canManage&&active&&<><button className="btn btn-soft danger-action" onClick={()=>closeReservation("cancelled")}>Cancel reservation</button>{confirmed&&<button className="btn btn-soft" onClick={()=>closeReservation("no_show")}>Mark no-show</button>}</>}{canManage&&confirmed&&<button className="btn btn-soft" onClick={()=>assignRoom(reservation)}>{reservation.room_number?"Reassign room":"Pre-assign room"}</button>}{canManage&&["confirmed","checked_in"].includes(String(reservation.status))&&<button className="btn btn-soft" onClick={()=>updateGuest(reservation)}>Update guest details</button>}{canManage&&["confirmed","checked_in"].includes(String(reservation.status))&&<button className="btn btn-soft" onClick={()=>routeRequest(reservation)}>Route request</button>}{canFinancial&&inHouse&&balance>0&&<button className="btn btn-soft" onClick={()=>collectPayment(reservation)}>Collect payment</button>}{canManage&&inHouse&&<button className="btn btn-soft" onClick={()=>postCharge(reservation)}>Post charge</button>}{canAdjust&&<button className="btn btn-soft" onClick={()=>recordAdjustment(String(reservation.id))}>Adjust folio</button>}{canIssueDocument&&detail.invoice&&<button className="btn btn-soft" onClick={()=>generateDocument({documentType:"folio",reservationId:String(reservation.id)})}>Folio statement</button>}{canManage&&confirmed&&<button className="btn btn-accent" onClick={()=>checkIn(reservation)}>Assign & check in</button>}{canManage&&inHouse&&<button className="btn btn-soft" onClick={()=>changeRoom(reservation)}>Change room</button>}{canManage&&inHouse&&<button className="btn btn-soft" onClick={()=>extendStay(reservation)}>Extend stay</button>}{canManage&&inHouse&&<button className="btn btn-accent" onClick={()=>checkOut(reservation)}>Complete checkout</button>}</div>}>
  <span className={`badge ${reservation.status}`}>{label(reservation.status)}</span>{arrivalToday&&<span className="arrival-chip warn">Arrival today</span>}{departureToday&&<span className="arrival-chip warn">Departure today</span>}
  {oversight&&<ReservationLifecycle detail={detail}/>}
  <div className="reservation-detail-grid"><section><h3>Stay summary</h3><dl><div><dt>Guest</dt><dd>{label(reservation.guest_name)}</dd></div><div><dt>Room type</dt><dd>{label(reservation.room_type)}</dd></div><div><dt>Dates</dt><dd>{label(reservation.check_in)} to {label(reservation.check_out)}</dd></div>{frozenNightly.length>0&&(frozenNightly.some(night=>night.rate!==frozenNightly[0].rate)?frozenNightly.map(night=><div key={night.date}><dt>{night.date}</dt><dd>{peso(night.rate)}</dd></div>):<div><dt>Nightly rate</dt><dd>{peso(frozenNightly[0].rate)}</dd></div>)}<div><dt>Guests</dt><dd>{label(reservation.guests)}</dd></div><div><dt>Room assignment</dt><dd>{label(reservation.room_number||"Not assigned")}</dd></div><div><dt>Expected arrival</dt><dd>{label(reservation.expected_arrival||"Not provided")}</dd></div><div><dt>Identity</dt><dd><span className={`badge ${reservation.identity_status}`}>{label(reservation.identity_status||"unverified")}</span></dd></div></dl></section>
  {detail.guest&&<section><h3>Guest contact</h3><dl><div><dt>Email</dt><dd>{label(detail.guest.email)}</dd></div><div><dt>Phone</dt><dd>{label(detail.guest.phone)}</dd></div><div><dt>Nationality</dt><dd>{label(detail.guest.nationality||"Not provided")}</dd></div><div><dt>Address</dt><dd>{label(detail.guest.address||"Not provided")}</dd></div><div><dt>Loyalty</dt><dd>{label(detail.guest.loyalty_tier)}</dd></div><div><dt>Preferences</dt><dd>{label(detail.guest.preferences||"None")}</dd></div></dl></section>}
  <section><h3>Payment summary</h3><dl><div><dt>Original stay total</dt><dd>{peso(reservation.total)}</dd></div><div><dt>Current folio total</dt><dd>{peso(detail.invoice?.amount??reservation.total)}</dd></div><div><dt>Required deposit</dt><dd>{peso(reservation.deposit_required)}</dd></div><div><dt>Net paid</dt><dd>{peso(detail.invoice?.paid??reservation.deposit)}</dd></div><div><dt>Balance</dt><dd>{peso(balance)}</dd></div><div><dt>Folio credit</dt><dd>{pesoExact(detail.invoice?.credit_balance)}</dd></div><div><dt>Status</dt><dd><span className={`badge ${detail.invoice?.status??reservation.payment_status}`}>{label(detail.invoice?.status??reservation.payment_status)}</span></dd></div></dl></section>
  <section><h3>Requests and notes</h3>{requestOptions.length>0&&<div className="detail-request-chips"><b>Requested at booking:</b><ul className="chip-row">{requestOptions.map((option)=><li key={option}>{requestLabel(option)}</li>)}</ul></div>}<p>{label(reservation.special_requests||detail.guest?.special_requests||"No special requests")}</p>{reservation.cancellation_reason&&<p><strong>Closure note:</strong> {label(reservation.cancellation_reason)}</p>}</section></div>
  {detail.charges.length>0&&<section className="reservation-payment-history"><h3>Folio charges</h3>{detail.charges.map((charge)=><p key={charge.id}><span>{label(charge.description)} - {label(charge.category)}</span><strong>{peso(charge.amount)}</strong><span className={`badge ${charge.status??"posted"}`}>{label(charge.status??"posted")}</span>{canAdjust&&charge.status!=="reversed"&&<button className="table-action" onClick={()=>reverseCharge(charge)}>Reverse</button>}</p>)}</section>}
  {detail.adjustments.length>0&&<section className="reservation-payment-history"><h3>Adjustments, credits and write-offs</h3>{detail.adjustments.map((adjustment)=><p key={adjustment.id}><span>{label(adjustment.transaction_type)} - {label(adjustment.reason)}</span><strong>{adjustment.direction==="credit"?"-":"+"}{pesoExact(adjustment.amount)}</strong></p>)}</section>}
  {detail.payments.length>0&&<section className="reservation-payment-history"><h3>Payment history</h3>{detail.payments.map((payment)=><p key={payment.id}><span>{label(payment.purpose)} - {label(payment.method)} - {label(payment.reference)}{payment.decision_reason?` - ${label(payment.decision_reason)}`:""}</span><strong>{payment.purpose==="refund"?"-":""}{peso(payment.amount)}</strong><span className={`badge ${payment.status}`}>{label(payment.status)}</span>{canIssueDocument&&payment.status==="paid"&&<button className="table-action" onClick={()=>generateDocument({documentType:"receipt",paymentId:String(payment.id)})}>Receipt</button>}</p>)}</section>}
  {detail.refunds.length>0&&<section className="reservation-payment-history"><h3>Refunds</h3>{detail.refunds.map((refund)=><p key={refund.id}><span>{label(refund.reference||"Awaiting Accounting reference")}</span><strong>{peso(refund.eligible_amount)}</strong><span className={`badge ${refund.status}`}>{label(refund.status)}</span></p>)}{detail.refundAttempts.map((attempt)=><p key={attempt.id}><span>Attempt - {label(attempt.reason||attempt.reference||"recorded")}</span><span>{label(attempt.attempted_at)}</span><span className={`badge ${attempt.status}`}>{label(attempt.status)}</span></p>)}</section>}
  {detail.documents.length>0&&<section className="reservation-payment-history"><h3>Financial documents</h3>{detail.documents.map((document)=><p key={document.id}><span>{label(document.document_number)} - {label(document.document_type)}</span><span>{label(document.created_at)}</span></p>)}</section>}
  {detail.changeRequests.length>0&&<section className="reservation-payment-history"><h3>Guest change requests</h3>{detail.changeRequests.map((request)=><p key={request.id}><span>{label(request.reason)} · {label(request.requested_check_in||"same check-in")} to {label(request.requested_check_out||"same check-out")} · {label(request.requested_room_type||"same room type")}</span><span className={`badge ${request.status}`}>{label(request.status)}</span></p>)}</section>}
  {detail.assignments.length>0&&<section className="reservation-payment-history"><h3>Room assignment history</h3>{detail.assignments.map((assignment)=><p key={assignment.id}><span>{label(assignment.room_id)} · {label(assignment.reason||"Room assignment")}</span><span>{label(assignment.check_in)} to {label(assignment.check_out)}</span><span className={`badge ${assignment.status}`}>{label(assignment.status)}</span></p>)}</section>}
  {detail.requests.length>0&&<section className="reservation-payment-history"><h3>Guest requests</h3>{detail.requests.map((request)=><p key={request.id}><span>{label(request.department)} · {label(request.request)}</span><span className={`badge ${request.status}`}>{label(request.status)}</span></p>)}</section>}
  {oversight&&<section className="reservation-payment-history"><h3>Room &amp; readiness</h3><p><span>Reserved type: {label(reservation.room_type)}</span></p><p><span>Physical room: {reservation.room_number?`Room ${label(reservation.room_number)} · ${label(detail.room?.housekeeping??"unknown housekeeping")}`:"Not assigned"}</span>{reservation.room_number&&detail.room&&<span className={`badge ${detail.room.status}`}>{label(detail.room.status)}</span>}</p>{detail.maintenance.map(order=><p key={order.id}><span>Maintenance block: {label(order.issue)}</span><span className={`badge ${order.status}`}>{label(order.status)}</span></p>)}</section>}
  {oversight&&canViewTransportation&&detail.transportation&&detail.transportation.length>0&&<section className="reservation-payment-history"><h3>Transportation</h3>{detail.transportation.map((trip)=><p key={trip.id}><span>{label(trip.service_type)} · {label(trip.pickup_location)} → {label(trip.dropoff_location)} · {label(trip.pickup_date)}{trip.pickup_time?` ${label(trip.pickup_time)}`:""}</span><span>{label(trip.driver_name||"No driver assigned")}{Number(trip.fare_amount||0)>0?` · ${peso(trip.fare_amount)}`:""}</span><span className={`badge ${String(trip.status).toLowerCase()}`}>{label(trip.status)}</span></p>)}</section>}
  {oversight&&detail.approvals&&detail.approvals.length>0&&<section className="reservation-payment-history"><h3>Manager approvals</h3>{detail.approvals.map((request)=><p key={request.id}><span>{label(request.request_type)} · {label(request.reason||"—")}</span><span>{fmtStamp(request.requested_at)}</span><span className={`badge ${request.status}`}>{label(request.status)}</span>{request.status==="pending"&&onReviewException&&<button className="table-action" onClick={()=>onReviewException(reservation)}><Eye size={13}/> Review Exception</button>}</p>)}</section>}
  {detail.room&&<section className="reservation-payment-history"><h3>Assigned room readiness</h3><p><span>Room {label(detail.room.number)} · {label(detail.room.housekeeping)}</span><span className={`badge ${detail.room.status}`}>{label(detail.room.status)}</span></p>{detail.maintenance.map(order=><p key={order.id}><span>Maintenance block: {label(order.issue)}</span><span className={`badge ${order.status}`}>{label(order.status)}</span></p>)}</section>}
  </Modal>
}
// Exported for the jsdom render test (approvals-view.test.tsx); the dashboard
// itself uses it internally.
export function ManagerApprovalView({items,search,setSearch,review,execute,executeException,financialExecute,escalateOwner,canReview,canExecute,canFinancialExecute}:{items:RecordItem[];search:string;setSearch:(value:string)=>void;review:(item:RecordItem,decision:"approve"|"reject")=>Promise<boolean>;execute:(item:RecordItem)=>Promise<boolean>;executeException:(item:RecordItem)=>Promise<boolean>;financialExecute:(item:RecordItem)=>Promise<boolean>;escalateOwner:(item:RecordItem)=>Promise<boolean>;canReview:boolean;canExecute:boolean;canFinancialExecute:boolean}){
 const[status,setStatus]=useState("all");const[type,setType]=useState("all");const[severity,setSeverity]=useState("all");const[department,setDepartment]=useState("all");const[reviewing,setReviewing]=useState<RecordItem|null>(null);const types=Array.from(new Set(items.map(item=>String(item.request_type))));const departments=Array.from(new Set(items.map(item=>String(item.department))));
 const visible=items.filter(item=>(status==="all"||item.status===status)&&(type==="all"||item.request_type===type)&&(severity==="all"||item.severity===severity)&&(department==="all"||item.department===department)&&JSON.stringify(item).toLowerCase().includes(search.toLowerCase()));
 // Pending queue reads severity-first, longest-waiting next; decision history keeps the API's newest-first order.
 const queue=status==="pending"?[...visible].sort(compareApprovalUrgency):visible;
 const pending=items.filter(item=>item.status==="pending");const highPending=pending.filter(item=>["high","critical"].includes(String(item.severity))).length;const openEscalations=pending.filter(item=>approvalKind(item.request_type)==="escalation").length;const awaitingAccounting=items.filter(item=>item.status==="approved"&&item.execution_status==="awaiting_execution"&&["guest_compensation","refund_exception"].includes(String(item.request_type))).length;const oldestWaiting=pending.length?waitingSince(pending.map(item=>String(item.requested_at??"")).filter(Boolean).sort()[0]):"—";
 const hasFilters=type!=="all"||severity!=="all"||department!=="all"||search.trim()!=="";
 const clearFilters=()=>{setType("all");setSeverity("all");setDepartment("all");setSearch("")};
 return <><div className="page-title module-title"><div><p className="eyebrow">Management control</p><h1>Approvals &amp; Escalations</h1><p>Review exceptions against current operations and policy. Approval authorizes the responsible department; it does not perform their work.</p></div></div>
 <ModuleSummaryCards cards={[
   { label: "Pending", value: pending.length, hint: "Awaiting a decision", icon: ClipboardCheck, tone: "attention", queue: "pending" },
   { label: "High priority", value: highPending, hint: "High or critical severity", icon: AlertTriangle, tone: "attention" },
   { label: "Escalations", value: openEscalations, hint: "Guest issues raised to Manager", icon: Bell, tone: "today" },
   { label: "Awaiting Accounting", value: awaitingAccounting, hint: "Approved, not yet executed", icon: CircleDollarSign, tone: "active" },
   { label: "Oldest waiting", value: oldestWaiting, hint: "Longest pending request", icon: Activity, tone: "today" },
 ]} activeQueue={status==="pending"||status==="approved"||status==="rejected"?status:undefined} onSelect={(target)=>setStatus(target)} ariaLabel="Approvals queue summary"/>
 <div className="reservation-filters approval-toolbar"><div className="approval-pills" role="group" aria-label="Filter by status">{["pending","approved","rejected","all"].map(value=><button key={value} className={status===value?"active":""} aria-pressed={status===value} onClick={()=>setStatus(value)}>{label(value)}</button>)}</div><div className="approval-filters"><label>Type<select value={type} onChange={event=>setType(event.target.value)}><option value="all">All types</option>{approvalTypeGroups.map(([group,values])=><optgroup key={group} label={group}>{values.filter(value=>types.includes(value)).map(value=><option key={value} value={value}>{label(value)}</option>)}</optgroup>)}</select></label><label>Department<select value={department} onChange={event=>setDepartment(event.target.value)}><option value="all">All departments</option>{departments.map(value=><option key={value} value={value}>{label(value)}</option>)}</select></label><label>Severity<select value={severity} onChange={event=>setSeverity(event.target.value)}><option value="all">All severities</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label><label className="approval-search"><Search size={15}/><input value={search} onChange={event=>setSearch(event.target.value)} aria-label="Search approvals" placeholder="Search reservation, guest, reason, type, or requester..."/></label></div></div>
 <div className="data-panel approval-queue"><div className="table-scroll approval-table-wrap"><table aria-label="Approvals and escalations"><thead><tr><th>Requested</th><th>Type</th><th>Reservation / guest</th><th>Department</th><th>Request</th><th>Status</th><th>Actions</th></tr></thead><tbody>{queue.map(item=><tr key={item.id}><td><div className="cell-stack"><b>{fmtStamp(item.requested_at)}</b>{item.status==="pending"&&<small className="approval-waiting">Waiting {waitingSince(item.requested_at)}</small>}</div></td><td><div className="cell-stack"><span className={`approval-kind ${approvalKind(item.request_type)}`}>{approvalKind(item.request_type)==="escalation"?"Escalation":"Approval"}</span><b>{label(item.request_type)}</b><span className={`badge ${item.severity}`}>{label(item.severity)}</span></div></td><td><div className="cell-stack"><b>{label(item.reservation_reference||item.related_entity_id)}</b><small>{label(item.guest_name||"Operational issue")}</small>{item.stay_dates&&<small>{label(item.stay_dates)}</small>}</div></td><td>{label(item.department)}</td><td><div className="approval-request-cell"><p>{label(item.reason)}</p>{formatDetail(item.requested_action)&&<small>{formatDetail(item.requested_action)}</small>}</div></td><td><div className="cell-stack"><span className={`badge ${item.status}`}>{label(item.status)}</span>{item.status==="approved"&&item.execution_status&&<small>{label(item.execution_status)}</small>}</div></td><td><button className="table-action view-action" onClick={()=>setReviewing(item)}><Eye size={13}/> Review</button></td></tr>)}</tbody></table></div>
 {visible.length>0&&<div className="approval-card-list" aria-label="Approvals and escalations">{queue.map(item=><article key={item.id} className="approval-card"><header><span className={`approval-kind ${approvalKind(item.request_type)}`}>{approvalKind(item.request_type)==="escalation"?"Escalation":"Approval"}</span><span className={`badge ${item.severity}`}>{label(item.severity)}</span></header><div className="approval-card-lead"><b>{label(item.reservation_reference||item.related_entity_id)}</b><small>{label(item.guest_name||"Operational issue")}</small></div><span className="approval-card-meta">{label(item.department)} · {label(item.request_type)}</span><p>{label(item.reason)}</p><footer><small>{item.status==="pending"?`Waiting ${waitingSince(item.requested_at)}`:fmtStamp(item.requested_at)}</small><span className={`badge ${item.status}`}>{label(item.status)}</span><button className="table-action view-action" onClick={()=>setReviewing(item)}>Review</button></footer></article>)}</div>}
 {visible.length===0&&<div className="empty approval-empty">{!hasFilters&&status==="pending"?<><CheckCircle2/><h3>No approvals need attention</h3><p>You&apos;re all caught up.</p></>:!hasFilters?<><ClipboardCheck/><h3>Nothing decided yet</h3><p>Approved and rejected requests will appear here as they are reviewed.</p></>:<><Search/><h3>No requests match these filters</h3><p>Try clearing the filters to see the full queue.</p><button className="table-action" onClick={clearFilters}>Clear filters</button></>}</div>}
 <div className="table-footer">Showing {visible.length} request{visible.length!==1?"s":""}<span>Every decision and execution is server-authorized and audited.</span></div></div>
 {reviewing&&<ApprovalReviewModal key={String(reviewing.id)} item={reviewing} close={()=>setReviewing(null)} review={review} execute={execute} executeException={executeException} financialExecute={financialExecute} escalateOwner={escalateOwner} canReview={canReview} canExecute={canExecute} canFinancialExecute={canFinancialExecute}/>}</>
}

// Full decision context for one request. Footer actions call the same handlers the
// old inline row buttons used — authority, reason requirement, versioning and the
// audit trail all stay server-side, unchanged.
function ApprovalReviewModal({item,close,review,execute,executeException,financialExecute,escalateOwner,canReview,canExecute,canFinancialExecute}:{item:RecordItem;close:()=>void;review:(item:RecordItem,decision:"approve"|"reject")=>Promise<boolean>;execute:(item:RecordItem)=>Promise<boolean>;executeException:(item:RecordItem)=>Promise<boolean>;financialExecute:(item:RecordItem)=>Promise<boolean>;escalateOwner:(item:RecordItem)=>Promise<boolean>;canReview:boolean;canExecute:boolean;canFinancialExecute:boolean}){
 const kind=approvalKind(item.request_type);const pending=item.status==="pending";
 const actionable=pending&&canReview&&item.authority_level!=="owner";
 const canExecuteNow=canExecute&&item.status==="approved"&&item.execution_status==="awaiting_execution"&&["room_upgrade","room_type_exception","reservation_modification","early_check_in","late_checkout","checkout_exception","stay_extension"].includes(String(item.request_type));
 const canApplyFinancial=canFinancialExecute&&item.status==="approved"&&item.execution_status==="awaiting_execution"&&item.request_type==="guest_compensation";
 const action=formatDetail(item.requested_action);const policy=formatDetail(item.normal_policy_result);
 // Server-stamped financial snapshot for room-type changes: the reason code decides
 // who pays; the reviewer never sees (or sets) a manual payer control.
 const isRoomTypeChange=["room_type_exception","room_upgrade"].includes(String(item.request_type));
 const fin=(isRoomTypeChange?(item.requested_action as Record<string,unknown>|null|undefined)?.financials:null) as RoomTypeChangeFinancials|null;
 const finDiff=fin?financialDifference(fin):0;
 // Server-stamped stay-extension snapshot: nights, rate, and totals were computed
 // at request time by the RPC — the reviewer decides, never re-derives.
 const isStayExtension=String(item.request_type)==="stay_extension";
 const stayExt=(isStayExtension?(item.requested_action as Record<string,unknown>|null|undefined)?.stayExtension:null) as {currentCheckOut:string;requestedCheckOut:string;nights:number;rate:number|null;nightlyRates?:{date:string;rate:number}[];additionalAmount:number;projectedTotal:number;roomConflict:boolean;roomNumber:string;roomType:string}|null;
 const decide=async(decision:"approve"|"reject")=>{if(await review(item,decision))close()};
 const run=async(fn:(item:RecordItem)=>Promise<boolean>)=>{if(await fn(item))close()};
 return <Modal isOpen onClose={close} title={kind==="escalation"?"Review escalation":"Review request"} description={`${label(item.request_type)} · ${label(item.severity)} priority · ${label(item.status)}`} size="lg" headerVariant="branded" className="approval-review-modal" footer={<div className="reservation-detail-actions">{actionable?<><button className="btn btn-soft danger-action" onClick={()=>decide("reject")}>Reject</button><button className="btn btn-accent" onClick={()=>decide("approve")}>Approve</button>{["high","critical"].includes(String(item.severity))&&<button className="btn btn-soft" onClick={()=>run(escalateOwner)}>Escalate to Owner</button>}</>:canExecuteNow?<button className="btn btn-accent" onClick={()=>run(item.request_type==="room_type_exception"?executeException:execute)}>Execute as Front Desk</button>:canApplyFinancial?<button className="btn btn-accent" onClick={()=>run(financialExecute)}>Apply as Accounting</button>:<button className="btn btn-soft" onClick={close}>Close</button>}</div>}>
 <div className="approval-review-grid"><section><h3>Request</h3><dl><div><dt>{kind==="escalation"?"Escalation type":"Request type"}</dt><dd>{label(item.request_type)}</dd></div><div><dt>Requested by</dt><dd>{label(item.requester_name)} · {label(item.department)}</dd></div><div><dt>Requested</dt><dd>{fmtStamp(item.requested_at)}</dd></div>{pending&&<div><dt>Waiting</dt><dd>{waitingSince(item.requested_at)}</dd></div>}<div><dt>Severity</dt><dd><span className={`badge ${item.severity}`}>{label(item.severity)}</span></dd></div></dl></section>
 {(item.reservation_reference||item.guest_name)&&<section><h3>Reservation / guest</h3><dl><div><dt>Reservation</dt><dd>{label(item.reservation_reference||item.related_entity_id)}</dd></div>{item.guest_name&&<div><dt>Guest</dt><dd>{label(item.guest_name)}</dd></div>}{item.stay_dates&&<div><dt>Stay dates</dt><dd>{label(item.stay_dates)}</dd></div>}{item.reservation_status&&<div><dt>Current status</dt><dd><span className={`badge ${item.reservation_status}`}>{label(item.reservation_status)}</span></dd></div>}</dl></section>}</div>
 <section className="approval-review-section"><h3>Requested action</h3><p>{action||"Manager coordination requested."}</p></section>
 {isRoomTypeChange&&fin&&<section className="approval-review-section"><h3>Financial responsibility</h3><dl><div><dt>Reason</dt><dd>{roomTypeChangeReasonLabel(String(fin.reasonCode??""))}</dd></div><div><dt>Payer</dt><dd><b>{fin.responsibility==="hotel"?"Hotel absorbs the difference":"Guest pays the difference"}</b></dd></div><div><dt>Original total</dt><dd>{pesoExact(fin.originalTotal)}</dd></div><div><dt>Target stay total</dt><dd>{pesoExact(fin.targetTotal)}{fin.targetRate!=null?` (${pesoExact(fin.targetRate)} × ${label(fin.nights)} night${Number(fin.nights)===1?"":"s"})`:""}</dd></div><div><dt>Difference</dt><dd>{pesoExact(fin.difference)}</dd></div></dl>{finDiff<0&&<p className="approval-review-note">Rate difference is negative — no automatic refund applies; review before approving.</p>}</section>}
 {isRoomTypeChange&&!fin&&<section className="approval-review-section"><h3>Financial responsibility</h3><p className="muted">This request predates reason-coded financial responsibility and cannot be approved — reject it and ask for a new request with a chosen reason.</p></section>}
 {isStayExtension&&stayExt&&<section className="approval-review-section"><h3>Stay extension</h3><dl><div><dt>Current checkout</dt><dd>{label(stayExt.currentCheckOut)}</dd></div><div><dt>Requested checkout</dt><dd><b>{label(stayExt.requestedCheckOut)}</b> · {stayExt.nights} added night{stayExt.nights!==1?"s":""}</dd></div><div><dt>Room</dt><dd>Room {label(stayExt.roomNumber)} · {label(stayExt.roomType)}</dd></div><div><dt>Room availability</dt><dd><span className={`badge ${stayExt.roomConflict?"cancelled":"paid"}`}>{stayExt.roomConflict?"Conflict during added nights":"Available through new checkout"}</span></dd></div><div><dt>Additional lodging</dt><dd>{stayExt.rate!=null?`${pesoExact(stayExt.rate)} × ${stayExt.nights} = `:""}<b>{pesoExact(stayExt.additionalAmount)}</b>{stayExt.rate==null&&stayExt.nightlyRates?.length?` (${stayExt.nightlyRates.map((night)=>pesoExact(night.rate)).join(" · ")})`:""}</dd></div><div><dt>Projected folio total</dt><dd>{pesoExact(stayExt.projectedTotal)}</dd></div></dl>{stayExt.roomConflict&&<p className="approval-review-note">Room {label(stayExt.roomNumber)} is taken during the added nights — approving authorizes the plan; Front Desk chooses a same-type room (or extends in place if the conflict cleared) at execution. An overlap is never created.</p>}</section>}
 {isStayExtension&&!stayExt&&<section className="approval-review-section"><h3>Stay extension</h3><p className="muted">This request has no server-stamped extension snapshot and cannot be approved — reject it and request it again from the Extend stay dialog.</p></section>}
 <section className="approval-review-section"><h3>Reason</h3><p>{label(item.reason)}</p></section>
 {(policy||item.reservation_status)&&<section className="approval-review-section"><h3>Policy / current state</h3>{policy&&<p>{policy}</p>}<p className="muted">Reservation status: {label(item.reservation_status||"—")}</p></section>}
 {item.status!=="pending"&&<section className="approval-review-section"><h3>Decision</h3><dl><div><dt>Decision</dt><dd><span className={`badge ${item.status}`}>{label(item.status)}</span></dd></div>{item.reviewer_name&&<div><dt>Decided by</dt><dd>{label(item.reviewer_name)}</dd></div>}{item.reviewed_at&&<div><dt>Decided at</dt><dd>{fmtStamp(item.reviewed_at)}</dd></div>}{item.decision_reason&&<div><dt>Decision reason</dt><dd>{label(item.decision_reason)}</dd></div>}{item.execution_status&&<div><dt>Execution</dt><dd>{label(item.execution_status)}</dd></div>}</dl></section>}
 {actionable&&<p className="approval-review-note">Approving authorizes the responsible department to execute. It does not perform their work.</p>}
 </Modal>
}

function AccountingView({section,ledger,search,setSearch,rejectDeposit,reverseCharge,recordAdjustment,openCashShift,closeCashShift,reconcileCashShift,recordReconciliation,generateDocument,canVerify,canAdjust,canReconcile,canOperateShift,canIssueDocument,actorId}:{section:AccountingSection;ledger:AccountingLedger|null;search:string;setSearch:(s:string)=>void;rejectDeposit:(x:RecordItem)=>void;reverseCharge:(x:RecordItem)=>void;recordAdjustment:(reservationId:string)=>void;openCashShift:()=>void;closeCashShift:(x:RecordItem)=>void;reconcileCashShift:(x:RecordItem)=>void;recordReconciliation:()=>void;generateDocument:(payload:{documentType:"receipt";paymentId:string}|{documentType:"folio";reservationId:string})=>void;canVerify:boolean;canAdjust:boolean;canReconcile:boolean;canOperateShift:boolean;canIssueDocument:boolean;actorId:string}){
  const [viewing,setViewing]=useState<RecordItem|null>(null);
  const view=accountingViews[section];
  if(!ledger)return <div className="empty"><Search/><h3>Ledger unavailable</h3><p>The financial ledger requires the shared hotel database. Configure Supabase to open the Accounting workspaces.</p></div>;
  const m=ledger.metrics;
  const cards:Record<AccountingSection,{label:string;value:string;hint:string}[]>={
    transactions:[{label:"Gross collected",value:pesoExact(m.grossCollected),hint:"Settled payments"},{label:"Refunds issued",value:pesoExact(m.refundsIssued),hint:"Settled refunds"},{label:"Net revenue",value:pesoExact(m.netRevenue),hint:"Collected less refunded"},{label:"Awaiting verification",value:String(m.pendingVerification),hint:"Submitted deposits"}],
    folios:[{label:"Outstanding balance",value:pesoExact(m.outstandingBalance),hint:"Across open folios"},{label:"Folio credit",value:pesoExact(m.folioCredit),hint:"Overpayment held"},{label:"Net revenue",value:pesoExact(m.netRevenue),hint:"Collected less refunded"},{label:"Open folios",value:String(ledger.invoices.filter((row)=>Number(row.balance||0)>0).length),hint:"With a balance due"}],
    cash_shifts:[{label:"Open shifts",value:String(m.openCashShifts),hint:"Currently collecting cash"},{label:"Awaiting reconciliation",value:String(m.unreconciledShifts),hint:"Closed, not reconciled"},{label:"Recorded variance",value:pesoExact(m.cashVariance),hint:"Counted less expected"},{label:"Shifts on record",value:String(ledger.cashShifts.length),hint:"Full shift history"}],
    reconciliation:[{label:"Unexplained variance",value:pesoExact(m.openReconciliationVariance),hint:"Flagged periods"},{label:"Periods recorded",value:String(ledger.reconciliations.length),hint:"Manual statement checks"},{label:"Cash variance",value:pesoExact(m.cashVariance),hint:"From closed shifts"},{label:"Failed refunds",value:String(m.failedRefunds),hint:"Retryable"}],
    documents:[{label:"Documents issued",value:String(ledger.documents.length),hint:"Receipts and statements"},{label:"Receipts",value:String(ledger.documents.filter((row)=>row.document_type==="receipt").length),hint:"Settled payments"},{label:"Folio statements",value:String(ledger.documents.filter((row)=>row.document_type==="folio").length),hint:"Point-in-time snapshots"},{label:"Net revenue",value:pesoExact(m.netRevenue),hint:"Collected less refunded"}]
  };
  const rows=(ledger[view.source] as Record<string,unknown>[]).filter((row)=>JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));
  const actions=(row:Record<string,unknown>)=>{
    if(section==="transactions")return <div className="reservation-actions">{canVerify&&row.status==="pending_verification"&&<button className="table-action" onClick={()=>rejectDeposit(row as RecordItem)}>Reject</button>}{canIssueDocument&&row.status==="paid"&&<button className="table-action" onClick={()=>generateDocument({documentType:"receipt",paymentId:String(row.id)})}>Receipt</button>}{row.status==="failed"&&<small>{label(row.decision_reason)}</small>}</div>;
    if(section==="folios")return <div className="reservation-actions">{canAdjust&&row.status!=="cancelled"&&<button className="table-action" onClick={()=>recordAdjustment(String(row.reservation_id))}>Adjust</button>}{canIssueDocument&&<button className="table-action" onClick={()=>generateDocument({documentType:"folio",reservationId:String(row.reservation_id)})}>Statement</button>}</div>;
    if(section==="cash_shifts")return <div className="reservation-actions">{canOperateShift&&row.status==="open"&&(String(row.staff_user_id)===actorId||canReconcile)&&<button className="table-action" onClick={()=>closeCashShift(row as RecordItem)}>Close &amp; count</button>}{canReconcile&&row.status==="closed"&&<button className="table-action" onClick={()=>reconcileCashShift(row as RecordItem)}>Reconcile</button>}{row.reconciliation_notes?<small>{label(row.reconciliation_notes)}</small>:row.close_notes?<small>{label(row.close_notes)}</small>:null}</div>;
    if(section==="reconciliation")return <div className="reservation-actions">{row.notes?<small>{label(row.notes)}</small>:<span>No variance note</span>}</div>;
    if(section==="documents")return <div className="reservation-actions"><button className="table-action" onClick={()=>setViewing(row as RecordItem)}>View</button></div>;
    return <span>{label(row.created_at)}</span>;
  };
  return <><div className="page-title module-title"><div><p className="eyebrow">Accounting</p><h1>{view.title}</h1><p>{view.subtitle}</p></div>{section==="cash_shifts"&&canOperateShift&&<button className="btn btn-accent" onClick={openCashShift}><Plus size={17}/> Open cash shift</button>}{section==="reconciliation"&&canReconcile&&<button className="btn btn-accent" onClick={recordReconciliation}><Plus size={17}/> Record reconciliation</button>}</div>
  <ModuleSummaryCards cards={cards[section].map((card)=>({label:card.label,value:card.value,hint:card.hint}))} ariaLabel={`${view.title} summary`}/>
  <div className="table-tools"><label><Search size={17}/><input placeholder={`Search ${view.title.toLowerCase()}...`} value={search} onChange={(event)=>setSearch(event.target.value)}/></label></div>
  <div className="data-panel"><div className="table-scroll"><table aria-label="Ledger records"><thead><tr>{view.columns.map((column)=><th key={column.key}>{column.label}</th>)}<th>Actions</th></tr></thead><tbody>{rows.map((row)=><tr key={String(row.id)}>{view.columns.map((column)=><td key={column.key}>{column.key==="status"?<span className={`badge ${row.status}`}>{label(row.status)}</span>:column.money?<strong>{pesoExact(row[column.key])}</strong>:label(row[column.key] as string)}</td>)}<td>{actions(row)}</td></tr>)}</tbody></table></div>{rows.length===0&&<div className="empty"><Search/><h3>Nothing recorded yet</h3><p>No financial records match this workspace.</p></div>}<div className="table-footer">Showing {rows.length} record{rows.length!==1?"s":""}<span>{section==="transactions"?"Settled payments are immutable; corrections are reversals or adjustments.":section==="folios"?"Every folio figure is recomputed server-side from payments, charges and adjustments.":section==="cash_shifts"?"Expected cash is derived from the shift's own payments, never typed in.":section==="reconciliation"?"Statement figures are recorded manually - no external provider is connected.":"Documents are immutable snapshots and are never edited after issue."}</span></div></div>
  {section==="folios"&&ledger.charges.length>0&&<article className="panel"><div className="panel-heading"><div><h3>Recent folio charges</h3><p>Posted by hotel operations; reversible by Accounting only</p></div></div><div className="table-scroll"><table aria-label="Recent folio charges"><thead><tr><th>Reservation</th><th>Description</th><th>Category</th><th>Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>{ledger.charges.slice(0,40).map((charge)=><tr key={String(charge.id)}><td>{label(charge.reservation_id as string)}</td><td>{label(charge.description as string)}</td><td>{label(charge.category as string)}</td><td><strong>{pesoExact(charge.amount)}</strong></td><td><span className={`badge ${charge.status}`}>{label(charge.status)}</span></td><td>{canAdjust&&charge.status!=="reversed"&&<button className="table-action" onClick={()=>reverseCharge(charge as RecordItem)}>Reverse</button>}</td></tr>)}</tbody></table></div></article>}
  {section==="reconciliation"&&ledger.refundAttempts.length>0&&<article className="panel"><div className="panel-heading"><div><h3>Refund settlement attempts</h3><p>No external refund provider is connected - every attempt is operator-recorded</p></div></div><div className="table-scroll"><table aria-label="Recent refund attempts"><thead><tr><th>Attempted</th><th>Refund</th><th>Reference</th><th>Detail</th><th>Status</th></tr></thead><tbody>{ledger.refundAttempts.slice(0,40).map((attempt)=><tr key={String(attempt.id)}><td>{label(attempt.attempted_at as string)}</td><td>{label(attempt.refund_request_id as string)}</td><td>{label(attempt.reference as string)}</td><td>{label(attempt.reason as string)}</td><td><span className={`badge ${attempt.status}`}>{label(attempt.status)}</span></td></tr>)}</tbody></table></div></article>}
  {section==="folios"&&ledger.adjustments.length>0&&<article className="panel"><div className="panel-heading"><div><h3>Adjustments, credits and write-offs</h3><p>Financial corrections recorded as new entries - nothing is overwritten</p></div></div><div className="table-scroll"><table aria-label="Recent folio adjustments"><thead><tr><th>Reservation</th><th>Type</th><th>Direction</th><th>Amount</th><th>Reason</th><th>Recorded</th></tr></thead><tbody>{ledger.adjustments.slice(0,40).map((adjustment)=><tr key={String(adjustment.id)}><td>{label(adjustment.reservation_id as string)}</td><td>{label(adjustment.transaction_type as string)}</td><td>{label(adjustment.direction as string)}</td><td><strong>{adjustment.direction==="credit"?"-":"+"}{pesoExact(adjustment.amount)}</strong></td><td>{label(adjustment.reason as string)}</td><td>{label(adjustment.created_at as string)}</td></tr>)}</tbody></table></div></article>}
  {viewing&&<DocumentViewerModal item={viewing} close={()=>setViewing(null)}/>}
  </>;
}

// Immutable financial-document viewer. Everything shown was frozen server-side at issue
// time — this renders the snapshot, it never recomputes. The tax breakdown lines were
// derived from the reservation's frozen rates at generation; documents issued before
// tax configuration simply have no breakdown section.
function DocumentViewerModal({item,close}:{item:RecordItem;close:()=>void}){
 const snap=(item.snapshot??{})as Record<string,unknown>;
 const tax=snap.taxBreakdown as {vatRateBp:number;serviceChargeBp:number;netSubtotal:number;serviceCharge:number;vatAmount:number;grossTotal:number}|null|undefined;
 const list=(key:string)=>Array.isArray(snap[key])?snap[key] as Record<string,unknown>[]:[];
 const isReceipt=String(snap.documentType??"")==="receipt";
 const money=(value:unknown)=>pesoExact(Number(value??0));
 return <Modal isOpen onClose={close} title={`${isReceipt?"Payment receipt":"Folio statement"} ${label(item.document_number)}`} description={`Immutable snapshot · issued ${fmtStamp(String(snap.generatedAt??""))} · never edited after issue`} size="lg" headerVariant="branded" className="approval-review-modal" footer={<button className="btn btn-soft" onClick={close}>Close</button>}>
 <div className="approval-review-grid"><section><h3>Document</h3><dl><div><dt>Number</dt><dd>{label(item.document_number)}</dd></div><div><dt>Guest</dt><dd>{label(snap.guestName)}</dd></div><div><dt>Stay</dt><dd>{label(snap.roomType)} · {label(snap.checkIn)} → {label(snap.checkOut)}</dd></div><div><dt>Reservation</dt><dd>{label(snap.confirmationNumber||snap.reservationId)}</dd></div></dl></section>
 <section><h3>Financial position at issue</h3><dl><div><dt>Folio amount</dt><dd><b>{money(snap.folioAmount)}</b></dd></div><div><dt>Paid</dt><dd>{money(snap.paid)}</dd></div><div><dt>Balance</dt><dd>{money(snap.balance)}</dd></div>{Number(snap.creditBalance??0)>0&&<div><dt>Credit held</dt><dd>{money(snap.creditBalance)}</dd></div>}<div><dt>Status</dt><dd><span className={`badge ${String(snap.folioStatus??"")}`}>{label(snap.folioStatus)}</span></dd></div></dl></section></div>
 {tax&&<section className="approval-review-section"><h3>Tax breakdown · VAT-inclusive</h3><dl><div><dt>Net subtotal</dt><dd>{money(tax.netSubtotal)}</dd></div><div><dt>Service charge ({ratePercent(tax.serviceChargeBp)})</dt><dd>{money(tax.serviceCharge)}</dd></div><div><dt>VAT ({ratePercent(tax.vatRateBp)})</dt><dd>{money(tax.vatAmount)}</dd></div><div><dt>Gross total</dt><dd><b>{money(tax.grossTotal)}</b></dd></div></dl><p className="muted">Derived from the frozen rates at issue: displayed prices already include service charge and VAT; the lines above always sum to the gross.</p></section>}
 {list("charges").length>0&&<section className="approval-review-section"><h3>Charges</h3><dl>{list("charges").map((charge,index)=><div key={index}><dt>{label(String(charge.description??""))} <small>{label(String(charge.category??""))}</small></dt><dd>{money(charge.amount)}</dd></div>)}</dl></section>}
 {list("payments").length>0&&<section className="approval-review-section"><h3>Payments</h3><dl>{list("payments").map((payment,index)=><div key={index}><dt>{label(String(payment.purpose??""))} · {label(String(payment.method??""))}{payment.reference?` · ${label(String(payment.reference))}`:""}</dt><dd>{money(payment.amount)}</dd></div>)}</dl></section>}
 {list("adjustments").length>0&&<section className="approval-review-section"><h3>Adjustments</h3><dl>{list("adjustments").map((adjustment,index)=><div key={index}><dt>{label(String(adjustment.transactionType??""))} · {label(String(adjustment.reason??""))}</dt><dd>{adjustment.direction==="credit"?"-":"+"}{money(adjustment.amount)}</dd></div>)}</dl></section>}
 </Modal>
}

// Consolidated guest dossier: everything comes from authoritative records — no
// inferred preferences, no invented tiers. The financial summary renders only
// when the server attached one (roles allowed to see reservation financials).
function GuestProfileModal({profile,close,onViewReservation}:{profile:GuestProfile;close:()=>void;onViewReservation:(id:string)=>void}){
 const guest=profile.guest;
 const counts=profile.stayCounts;
 const identity=profile.stays.find((stay)=>stay.identity_status)?.identity_status;
 const active=profile.stays.filter((stay)=>["pending","confirmed","checked_in"].includes(String(stay.status)));
 const past=profile.stays.filter((stay)=>!["pending","confirmed","checked_in"].includes(String(stay.status))).slice(0,10);
 return <Modal isOpen onClose={close} title={label(guest.name)} description={`Guest profile · ${label(guest.loyalty_tier)} member`} size="lg" headerVariant="branded" className="approval-review-modal" footer={<button className="btn btn-soft" onClick={close}>Close</button>}>
 <div className="approval-review-grid"><section><h3>Identity</h3><dl><div><dt>Guest ID</dt><dd>{label(guest.id)}</dd></div><div><dt>Email</dt><dd>{label(guest.email)}</dd></div><div><dt>Phone</dt><dd>{label(guest.phone)}</dd></div><div><dt>Nationality</dt><dd>{label(guest.nationality||"Not provided")}</dd></div><div><dt>Address</dt><dd>{label(guest.address||"Not provided")}</dd></div><div><dt>ID verification</dt><dd><span className={`badge ${String(identity??"unverified")}`}>{label(identity??"unverified")}</span></dd></div><div><dt>Guest since</dt><dd>{label(guest.created_at)}</dd></div></dl></section>
 <section><h3>Stay history</h3><dl><div><dt>Current stay</dt><dd>{counts.current}</dd></div><div><dt>Upcoming</dt><dd>{counts.upcoming}</dd></div><div><dt>Completed stays</dt><dd>{counts.completed}</dd></div><div><dt>Cancelled</dt><dd>{counts.cancelled}</dd></div><div><dt>No-shows</dt><dd>{counts.noShow}</dd></div><div><dt>Loyalty points</dt><dd>{label(guest.loyalty_points)}</dd></div></dl></section></div>
 {active.length>0&&<section className="approval-review-section"><h3>Current &amp; upcoming stays</h3>{active.map((stay)=><p key={String(stay.id)}><span><b>{label(stay.confirmation_number||stay.id)}</b> · {label(stay.room_type)} · {label(stay.check_in)} → {label(stay.check_out)} · {label(stay.guests)} guest{Number(stay.guests)!==1?"s":""}{stay.room_number?` · Room ${label(stay.room_number)}`:""}</span><span className={`badge ${String(stay.status)}`}>{label(stay.status)}</span><button className="table-action view-action" onClick={()=>onViewReservation(String(stay.id))}><Eye size={13}/> Open</button></p>)}</section>}
 {past.length>0&&<section className="approval-review-section"><h3>Past stays</h3>{past.map((stay)=><p key={String(stay.id)}><span>{label(stay.confirmation_number||stay.id)} · {label(stay.room_type)} · {label(stay.check_in)} → {label(stay.check_out)}</span><span className={`badge ${String(stay.status)}`}>{label(stay.status)}</span></p>)}</section>}
 <section className="approval-review-section"><h3>Preferences</h3>{(guest.preferences||guest.special_requests||profile.requestOptions.length>0)?<><dl>{guest.preferences&&<div><dt>Saved preferences</dt><dd>{label(guest.preferences)}</dd></div>}{guest.special_requests&&<div><dt>Saved special requests</dt><dd>{label(guest.special_requests)}</dd></div>}</dl>{profile.requestOptions.length>0&&<div className="detail-request-chips"><b>Requested across bookings:</b><ul className="chip-row">{profile.requestOptions.map((option)=><li key={option}>{requestLabel(option)}</li>)}</ul></div>}</>:<p className="muted">No explicit preferences on record.</p>}<p className="muted">Only what guests explicitly saved or requested — nothing is inferred.</p></section>
 {profile.requests.length>0&&<section className="approval-review-section"><h3>Service history</h3>{profile.requests.slice(0,12).map((request)=><p key={String(request.id)}><span>Request · {label(request.department)} · {label(request.request)}</span><span className={`badge ${String(request.status)}`}>{label(request.status)}</span></p>)}{profile.transportation.map((trip)=><p key={String(trip.id)}><span>Transport · {label(trip.service_type)} · {label(trip.pickup_date)}{trip.pickup_time?` ${label(trip.pickup_time)}`:""}</span><span className={`badge ${String(trip.status).toLowerCase()}`}>{label(trip.status)}</span></p>)}{profile.assignments.filter((entry)=>entry.released_at||String(entry.status)!=="active").slice(0,8).map((entry)=><p key={String(entry.id)}><span>Room change · {label(entry.reason||"Room assignment")} · {label(entry.check_in)} → {label(entry.check_out)}{entry.is_upgrade?" · upgrade":""}</span><span className={`badge ${String(entry.status)}`}>{label(entry.status)}</span></p>)}{profile.approvals.slice(0,8).map((request)=><p key={String(request.id)}><span>Approval · {label(request.request_type)} · {label(request.reason)}</span><span className={`badge ${String(request.status)}`}>{label(request.status)}</span></p>)}</section>}
 {profile.financialVisible&&profile.financial&&<section className="approval-review-section"><h3>Financial summary</h3><dl><div><dt>Total billed</dt><dd>{pesoExact(profile.financial.billed)}</dd></div><div><dt>Total paid</dt><dd>{pesoExact(profile.financial.paid)}</dd></div><div><dt>Outstanding balance</dt><dd><b>{pesoExact(profile.financial.outstanding)}</b></dd></div></dl><p className="muted">Across all stays of this guest — visible to roles authorized for reservation financials only.</p></section>}
 </Modal>
}

function CreateModal({resource,close,submit}:{resource:Resource;close:()=>void;submit:(p:Record<string,string|number>)=>void}) { const c=config[resource]; const [form,setForm]=useState<Record<string,string|number>>(()=>Object.fromEntries(c.fields.map(f=>[f.key,f.value??""]))); return <Modal isOpen onClose={close} title={`Add to ${c.title.toLowerCase()}`} description="Create a new record — saved through the standard resource endpoint." size="md" headerVariant="branded"><form onSubmit={e=>{e.preventDefault();submit(form)}} className="form-dialog"><div className="form-grid">{c.fields.map(f=><div key={f.key} className="form-field"><label htmlFor={f.key} className="form-label">{f.label}</label><input id={f.key} name={f.key} type={f.type||"text"} className="form-input" value={form[f.key]} required={!['special_requests','expected_arrival'].includes(f.key)} onChange={e=>setForm({...form,[f.key]:f.type==="number"?Number(e.target.value):e.target.value})}/></div>)}</div><div className="form-actions"><button type="button" className="btn btn-soft" onClick={close}>Cancel</button><button className="btn btn-accent">Create record</button></div></form></Modal> }

function Reports({data,role}:{data:DashboardData;role:Role}) { const totalRooms=data.roomMix.reduce((total,slice)=>total+slice.value,0); const outOfService=data.roomMix.find((slice)=>slice.name==="Service")?.value??0; const readiness=Math.round(((totalRooms-outOfService)/Math.max(totalRooms,1))*100); return <><div className="page-title"><div><p className="eyebrow">Administration & analytics</p><h1>Performance reports</h1><p>A concise view of the property&apos;s operating health.</p></div><button className="btn btn-accent" onClick={()=>window.print()}><Download size={17}/> Export report</button></div><div className="report-banner"><div><p>{role==="manager"?"Collections today":"Estimated room revenue"}</p><h2>{peso(role==="manager"?data.metrics.collectionsToday:data.metrics.revenue)}</h2><span>{role==="manager"?`${peso(data.metrics.depositsReceived)} deposits · ${peso(data.metrics.refundSummary)} refunds`:"Based on current folios"}</span></div><div><p>Average occupancy</p><h2>{Math.round(data.occupancyTrend.reduce((a,b)=>a+b.occupancy,0)/Math.max(data.occupancyTrend.length,1))}%</h2><span>Trailing seven days</span></div><div><p>Operational readiness</p><h2>{readiness}%</h2><span>{totalRooms-outOfService} of {totalRooms} rooms serviceable</span></div></div><article className="panel report-chart"><div className="panel-heading"><div><h3>Seven-day occupancy</h3><p>Daily percentage of occupied and reserved rooms</p></div></div><ResponsiveContainer width="100%" height={330}><AreaChart data={data.occupancyTrend}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="day"/><Tooltip/><Area dataKey="occupancy" stroke="#176773" fill="#d8ebe4" strokeWidth={3}/></AreaChart></ResponsiveContainer></article></> }
function Loading(){return <div className="loading"><span/><span/><span/></div>}

// Deposit / stay-payment verification preview. Everything Accounting needs to
// cross-reference a submitted payment against the reservation — guest, stay,
// method, reference, amount vs the expected deposit — before deciding. The
// table's Verify button only ever opens this; nothing approves on click.
// When a payment proof is on file, a preview image is fetched on open via a
// 60-second signed URL (owner/Accounting only). Nothing is uploaded here and
// no second verification path exists — Verify/Reject hit the same endpoints.
function ProofPreview({ paymentId, name }: { paymentId: string; name: string | null }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/booking/payments/${paymentId}/proof`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
      .then((body: { url?: string }) => { if (cancelled) return; if (body.url) { setUrl(body.url); setState("ready"); } else setState("error"); })
      .catch(() => { if (!cancelled) setState("error"); });
    return () => { cancelled = true; };
  }, [paymentId]);
  return <div className="deposit-proof">
    {state === "ready" && url ? <a href={url} target="_blank" rel="noreferrer" title="Open full-size payment proof">{/* eslint-disable-next-line @next/next/no-img-element -- signed 60s URLs can't be pre-optimized and must never hit the Next image cache */}
      <img src={url} alt={`Payment proof${name ? ` — ${name}` : ""} for payment ${paymentId}`} /></a>
      : state === "loading" ? <div className="deposit-proof-loading" role="status"><span className="sr-only">Loading payment proof…</span></div>
      : <div className="deposit-proof-missing"><AlertTriangle size={16} aria-hidden="true" /><span>Proof could not be loaded.</span></div>}
  </div>;
}
function DepositVerifyDialog({ item, busy, onClose, onConfirm, onReject }: { item: RecordItem; busy: boolean; onClose: () => void; onConfirm: () => void; onReject: () => void }) {
  const stayPayment = item.purpose === "stay_payment";
  const reservation = item.reservation as RecordItem | null | undefined;
  const expected = Number(reservation?.deposit_required ?? 0);
  const difference = expected ? Number(item.amount ?? 0) - expected : 0;
  const when = (value: unknown) => { const date = new Date(String(value ?? "")); return Number.isNaN(date.getTime()) ? label(value) : date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" }); };
  const hasProof = Boolean(item.proof_original_name || item.proof_size_bytes);
  const proofMeta = hasProof ? `${label(item.proof_original_name)} · ${Number(item.proof_size_bytes ?? 0) / (1024 * 1024) >= 1 ? `${(Number(item.proof_size_bytes) / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(Number(item.proof_size_bytes) / 1024))} KB`}${item.proof_uploaded_at ? ` · ${when(item.proof_uploaded_at)}` : ""}` : "";
  const rows: [string, React.ReactNode][] = [
    ["Guest", label(reservation?.guest_name)],
    ["Reservation", `${label(reservation?.confirmation_number ?? item.reservation_id)}${reservation?.room_type ? ` · ${label(reservation.room_type)}` : ""}`],
    ["Stay", `${label(reservation?.check_in)} → ${label(reservation?.check_out)} · ${label(reservation?.status)}`],
    ["Purpose", label(item.purpose)],
    ["Method", label(item.method)],
    ["Reference", label(item.reference)],
    ["Proof of payment", hasProof ? proofMeta : <span key="no-proof" className="deposit-proof-none">No proof image submitted</span>],
    ["Submitted", when(item.submitted_at)],
    ["Amount submitted", <strong key="amount">{pesoExact(item.amount)}</strong>],
  ];
  if (!stayPayment) rows.push(["Expected deposit", <span key="expected">{pesoExact(expected)}{difference !== 0 && <small className={difference > 0 ? "deposit-difference over" : "deposit-difference under"}>{difference > 0 ? " over" : " under"} by {pesoExact(Math.abs(difference))}</small>}</span>]);
  return <Modal isOpen onClose={onClose} title={stayPayment ? "Verify stay payment" : "Verify deposit"} description="Cross-reference the submitted payment against the reservation and your statement before deciding." size="md" headerVariant="branded">
    <div className="deposit-verify">
      <dl>{rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
      {hasProof && String(item.id).length > 0 && <ProofPreview paymentId={String(item.id)} name={item.proof_original_name ? String(item.proof_original_name) : null} />}
      <p className="deposit-verify-note">Verifying settles the payment{stayPayment ? " and applies it to the folio" : " and confirms the booking"}. Rejecting keeps the submitted record for audit and {stayPayment ? "flags the proof as rejected" : "releases the reservation"}.</p>
      <div className="form-actions">
        <button type="button" className="btn btn-soft" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-soft" onClick={onReject}>Reject…</button>
        <button type="button" className="btn btn-accent" disabled={busy} onClick={onConfirm}>{busy ? "Verifying…" : "Verify & confirm"}</button>
      </div>
    </div>
  </Modal>;
}
