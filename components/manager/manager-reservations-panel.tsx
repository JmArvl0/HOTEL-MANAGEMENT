"use client";
import { useMemo, useState } from "react";
import { BedDouble, CalendarDays, Eye, LogIn, LogOut, QrCode, Search, ShieldAlert } from "lucide-react";
import { byAttentionThenStay, deriveReservationAttention, needsAttention, type AttentionRow } from "@/lib/manager-attention";
import { ModuleSummaryCards } from "@/components/manager/module-summary-cards";
import { TablePagination, useTablePagination } from "@/components/ui/table-pagination";
import type { RecordItem } from "@/lib/types";

const peso = (value: unknown) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number(value || 0));
const label = (value: unknown) => String(value ?? " ").replaceAll("_", " ");
const monthDay = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
const fmtDate = (value: unknown) => { const raw = String(value ?? ""); if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return label(value); return monthDay.format(new Date(`${raw.slice(0, 10)}T00:00:00Z`)); };
const nights = (checkIn: unknown, checkOut: unknown) => Math.max(0, Math.round((Date.parse(`${String(checkOut ?? "").slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(checkIn ?? "").slice(0, 10)}T00:00:00Z`)) / 86400000) || 0);

/**
 * MANAGER RESERVATION OVERSIGHT — read-only workspace.
 *
 * Every issue shown is derived by lib/manager-attention from server-authorized
 * data; nothing here mutates a reservation. The only action beyond View is
 * "Review Exception", which routes the reservation into the existing Manager
 * approval workflow (no Front Desk / Accounting shortcuts). The Front Desk
 * reservations view in manager-dashboard-client is untouched.
 */

const QUEUES: [string, string][] = [
  ["attention", "Attention Required"],
  ["arrivals", "Arrivals Today"],
  ["departures", "Departures Today"],
  ["in_house", "In-House"],
  ["upcoming", "Upcoming"],
  ["all", "All"],
  ["closed", "Closed"],
];
const CLOSED_STATUSES = ["checked_out", "cancelled", "no_show"];

// Same ISO-string comparison style as the front-desk queueFilter; today is
// hotel-local (Asia/Manila), never the browser's UTC day.
function managerQueueFilter(item: AttentionRow, queue: string, today: string) {
  const status = String(item.status);
  if (queue === "attention") return needsAttention(item, today);
  if (queue === "arrivals") return String(item.check_in) === today && ["confirmed", "checked_in"].includes(status);
  if (queue === "departures") return String(item.check_out) === today && ["confirmed", "checked_in"].includes(status);
  if (queue === "in_house") return status === "checked_in";
  if (queue === "upcoming") return String(item.check_in) > today && ["pending", "confirmed"].includes(status);
  if (queue === "closed") return CLOSED_STATUSES.includes(status);
  return true;
}

function IssueBadge({ issues }: { issues: ReturnType<typeof deriveReservationAttention> }) {
  const top = issues[0];
  if (!top) return <span className="mr-issue-none">—</span>;
  return <span className={`mr-issue ${top.severity}`} title={issues.map((issue) => `${issue.label}${issue.detail ? ` — ${issue.detail}` : ""}`).join("\n")}>
    {top.label}{issues.length > 1 && <small>+{issues.length - 1}</small>}
  </span>;
}

export function ManagerReservationsPanel({ items, search, setSearch, viewReservation, onReviewException, onScan }: {
  items: RecordItem[];
  search: string;
  setSearch: (value: string) => void;
  viewReservation: (item: RecordItem) => void;
  onReviewException: (item: RecordItem) => void;
  onScan: (() => void) | null;
}) {
  const [queue, setQueue] = useState("all");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  const rows = items as AttentionRow[];
  const counts = useMemo(() => new Map(QUEUES.map(([value]) => [value, rows.filter((item) => managerQueueFilter(item, value, today)).length] as [string, number])), [rows, today]);
  const visible = useMemo(() => (queue === "attention" ? rows.filter((item) => managerQueueFilter(item, queue, today)).sort(byAttentionThenStay(today)) : rows.filter((item) => managerQueueFilter(item, queue, today))), [rows, queue, today]);
  const page = useTablePagination(visible);

  const openRow = (item: RecordItem) => viewReservation(item);

  // Quick-overview snapshot before the queue chips. Counts call the SAME
  // managerQueueFilter predicates as the chips/table, so the three can never
  // disagree; attention uses the authoritative needsAttention derivation.
  const summaryCards = [
    { label: "Attention required", value: counts.get("attention") ?? 0, hint: "Derived operational issues", icon: ShieldAlert, tone: "attention" as const, queue: "attention" },
    { label: "Arrivals today", value: counts.get("arrivals") ?? 0, hint: "Expected check-ins", icon: LogIn, tone: "active" as const, queue: "arrivals" },
    { label: "Departures today", value: counts.get("departures") ?? 0, hint: "Due to check out", icon: LogOut, tone: "today" as const, queue: "departures" },
    { label: "In-house", value: counts.get("in_house") ?? 0, hint: "Current stays", icon: BedDouble, tone: "done" as const, queue: "in_house" },
  ];

  return <>
    <div className="page-title module-title">
      <div>
        <p className="eyebrow">Hotel operations</p>
        <h1>Reservations</h1>
        <p>Monitor reservation activity, operational risks, room readiness, and exceptions requiring management attention.</p>
      </div>
      {onScan && <div className="title-actions"><button className="btn btn-soft" onClick={onScan}><QrCode size={17} /> Scan QR</button></div>}
    </div>
    <ModuleSummaryCards cards={summaryCards} activeQueue={queue} onSelect={setQueue} ariaLabel="Reservations summary"/>
    <div className="reservation-filters">
      <div>{QUEUES.map(([value, text]) => <button key={value} className={queue === value ? "active" : ""} aria-pressed={queue === value} onClick={() => setQueue(value)}>{text}<i className="chip-count">{counts.get(value) ?? 0}</i></button>)}</div>
    </div>
    <div className="table-tools"><label><Search size={17} /><input placeholder="Search reservations..." value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search reservations" /></label></div>
    <div className="data-panel">
      <div className="table-scroll mr-table-wrap">
        <table className="reservations-table mr-table" aria-label="Manager reservations oversight">
          <thead><tr><th>Reference</th><th>Guest</th><th>Room</th><th>Stay</th><th>Financial</th><th>Status</th><th>Operational Issue</th><th>Action</th></tr></thead>
          <tbody>{page.rows.map((item) => {
            const status = String(item.status);
            const issues = deriveReservationAttention(item, today);
            const unassignedToday = !item.room_number && String(item.check_in) === today && status === "confirmed";
            const balance = Number(item.folio_balance || 0);
            const stay = <div className={`stay-cell${String(item.check_in) === today ? " today" : ""}`} title={`Check in ${label(item.check_in)} · Check out ${label(item.check_out)}`}><b>{fmtDate(item.check_in)} <i>→</i> {fmtDate(item.check_out)}</b><small>{nights(item.check_in, item.check_out)} night{nights(item.check_in, item.check_out) !== 1 ? "s" : ""}</small></div>;
            return <tr key={item.id} tabIndex={0} onClick={() => openRow(item)} onKeyDown={(event) => { if (event.key === "Enter") openRow(item); }}>
              <td><div className="cell-stack"><b>{label(item.confirmation_number || item.id)}</b><small className={`source-badge ${String(item.source || "direct").toLowerCase()}`}>{label(item.source || "Direct")}</small></div></td>
              <td><div className="cell-stack"><b>{label(item.guest_name)}</b></div></td>
              <td><div className="cell-stack">{item.room_number ? <><b>Room {label(item.room_number)}</b><small>{label(item.room_type)}</small></> : <b className={unassignedToday ? "mr-unassigned" : "unassigned-room"}>Not assigned</b>}{unassignedToday && <small className="mr-unassigned-note">Arrival today</small>}</div></td>
              <td>{stay}</td>
              <td><div className="cell-stack"><b>{peso(item.total)}</b>{balance > 0 ? <small className="balance-due">{peso(balance)} due</small> : <small className="balance-clear">Settled</small>}</div></td>
              <td><span className={`badge ${status}`}>{label(status)}</span></td>
              <td>{issues.length ? <IssueBadge issues={issues} /> : <span className="mr-issue-none">—</span>}</td>
              <td><div className="reservation-actions">
                <button className="table-action view-action" onClick={(event) => { event.stopPropagation(); openRow(item); }}><Eye size={13} /> View</button>
                {item.pending_approval_type && <button className="table-action" onClick={(event) => { event.stopPropagation(); onReviewException(item); }}><ShieldAlert size={13} /> Review Exception</button>}
              </div></td>
            </tr>; })}</tbody>
        </table>
      </div>
      <div className="mr-card-list" aria-label="Manager reservations oversight">{page.rows.map((item) => {
        const issues = deriveReservationAttention(item, today);
        const top = issues[0];
        const balance = Number(item.folio_balance || 0);
        return <article key={item.id} className="mr-card" role="button" tabIndex={0} onClick={() => openRow(item)} onKeyDown={(event) => { if (event.key === "Enter") openRow(item); }}>
          <header><b>{label(item.confirmation_number || item.id)}</b><span className={`badge ${String(item.status)}`}>{label(item.status)}</span></header>
          <div className="mr-card-lead"><b>{label(item.guest_name)}</b><small>{fmtDate(item.check_in)} → {fmtDate(item.check_out)} · {label(item.room_type)}</small></div>
          <div className="mr-card-meta">
            {item.room_number ? <span>Room {label(item.room_number)}</span> : <span className={String(item.check_in) === today && String(item.status) === "confirmed" ? "mr-unassigned" : ""}>Not assigned</span>}
            <span>{peso(item.total)}{balance > 0 ? ` · ${peso(balance)} due` : " · Settled"}</span>
          </div>
          {top && <IssueBadge issues={issues} />}
          <footer>
            <button className="table-action view-action" onClick={(event) => { event.stopPropagation(); openRow(item); }}><Eye size={13} /> View</button>
            {item.pending_approval_type && <button className="table-action" onClick={(event) => { event.stopPropagation(); onReviewException(item); }}><ShieldAlert size={13} /> Review Exception</button>}
          </footer>
        </article>; })}</div>
      {visible.length === 0 && <div className="empty">{queue === "attention" ? <><CalendarDays /><h3>No reservations need attention</h3><p>Every active reservation is on track. Switch filters to browse the full list.</p></> : <><Search /><h3>No records found</h3><p>No matching operational records are available.</p></>}</div>}
      <TablePagination {...page} onPageChange={page.setPage} noun="reservations" note="Issues retain operational priority and are derived from live reservation, room, approval, and payment data." />
    </div>
  </>;
}

export default ManagerReservationsPanel;
