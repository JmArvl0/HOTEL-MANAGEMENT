"use client";

import { useMemo, useState } from "react";
import { BedDouble, ChevronDown, ClipboardCheck, Search, Sparkles, Wrench } from "lucide-react";
import type { RecordItem, Role } from "@/lib/types";

// Operational queue for the housekeeping workflow. Renders the same
// authoritative housekeeping_tasks rows the previous table showed (same
// payload, same RPC actions) grouped by what the room needs next — never a
// derived "available" claim: cards show the room's recorded state only.

const label = (value: unknown) => String(value ?? " ").replaceAll("_", " ");
const when = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? label(value) : date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" });
};
const day = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(date);
};
const time = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
};

const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const openTaskStatuses = ["pending", "assigned", "deferred"];

// Pure grouping + ordering so vitest can verify the queue's answer to
// "what should I clean next" without a rendered page. One group per task:
// the first match wins, so a card never appears twice.
export type QueueGroup = "blocked" | "needs_attention" | "my_tasks" | "in_progress" | "waiting_inspection" | "completed_today" | "other_open";

export function groupQueueTask(item: RecordItem, userId: string, today: string): QueueGroup | null {
  const status = String(item.status);
  if (status === "cancelled") return null;
  const maintenanceBlocked = item.maintenance_blocked === true;
  if (status === "completed") {
    if (String(item.inspection_status) === "pending") return "waiting_inspection";
    if (day(item.completed_at) === today) return "completed_today";
    return null; // older history — the room detail modal owns it
  }
  if (maintenanceBlocked && openTaskStatuses.concat("in_progress").includes(status)) return "blocked";
  if (openTaskStatuses.includes(status) && (!item.assigned_user_id || (priorityRank[String(item.priority)] ?? 3) <= 1)) return "needs_attention";
  if (userId && item.assigned_user_id === userId && [...openTaskStatuses, "in_progress"].includes(status)) return "my_tasks";
  if (status === "in_progress") return "in_progress";
  return "other_open";
}

export const queueTaskOrder = (a: RecordItem, b: RecordItem): number =>
  (priorityRank[String(a.priority)] ?? 3) - (priorityRank[String(b.priority)] ?? 3)
  || String(a.next_arrival ?? "9999").localeCompare(String(b.next_arrival ?? "9999"))
  || String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));

type GroupSpec = { key: QueueGroup; title: string; hint: string; icon: typeof BedDouble };

export default function HousekeepingQueuePanel({ role, userId, items, search, setSearch, housekeepingAction, coordinate, onViewMaintenance, onViewRoom }: {
  role: Role;
  userId: string;
  items: RecordItem[];
  search: string;
  setSearch: (value: string) => void;
  housekeepingAction: (item: RecordItem, action: "assign" | "start" | "complete" | "inspect" | "defer" | "maintenance") => void;
  coordinate: (item: RecordItem) => void;
  onViewMaintenance: () => void;
  onViewRoom: (item: RecordItem) => void;
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const today = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()), []);
  const mine = role === "housekeeping" ? userId : "";
  const canHousekeep = role === "housekeeping";
  const canCoordinate = role === "manager";

  const groups = useMemo(() => {
    const grouped: Record<QueueGroup, RecordItem[]> = { blocked: [], needs_attention: [], my_tasks: [], in_progress: [], waiting_inspection: [], completed_today: [], other_open: [] };
    for (const item of items) {
      const group = groupQueueTask(item, mine, today);
      if (group) grouped[group].push(item);
    }
    for (const key of Object.keys(grouped) as QueueGroup[]) grouped[key].sort(queueTaskOrder);
    return grouped;
  }, [items, mine, today]);

  const specs: GroupSpec[] = [
    { key: "needs_attention", title: "Needs attention", hint: "Unassigned or urgent open work — the next rooms to clean", icon: ClipboardCheck },
    { key: "my_tasks", title: "My tasks", hint: "Assigned to you and not yet finished", icon: BedDouble },
    { key: "in_progress", title: "Cleaning in progress", hint: "Active work by the rest of the team", icon: BedDouble },
    { key: "waiting_inspection", title: "Waiting for inspection", hint: "Cleaned — the room is not sellable until inspection passes", icon: Sparkles },
    { key: "blocked", title: "Blocked by Maintenance", hint: "A work order holds these rooms; Maintenance owns the repair", icon: Wrench },
    { key: "other_open", title: "Scheduled open work", hint: "Assigned routine work", icon: ClipboardCheck },
  ];

  const actionable = specs.filter((spec) => groups[spec.key].length > 0);
  const completed = groups.completed_today;

  return <>
    <div className="page-title module-title"><div><p className="eyebrow">Hotel operations</p><h1>Housekeeping</h1><p>A live, auditable room-care queue from turnover through inspection and readiness.</p></div></div>
    <div className="table-tools"><label><Search size={17} /><input placeholder="Search the room-care queue..." value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
    <div className="data-panel hk-queue" aria-label="Room care queue">
      {items.length === 0 && <div className="empty"><Search /><h3>No records found</h3><p>No matching operational records are available.</p></div>}
      {actionable.map(({ key, title, hint, icon: Icon }) => <section key={key} className="hk-queue-group" aria-label={title}>
        <header><h3><Icon size={14} aria-hidden="true" />{title}<i>{groups[key].length}</i></h3><p>{hint}</p></header>
        {groups[key].map((item) => <QueueCard key={String(item.id)} item={item} canHousekeep={canHousekeep} canCoordinate={canCoordinate} housekeepingAction={housekeepingAction} coordinate={coordinate} onViewMaintenance={onViewMaintenance} onViewRoom={onViewRoom} />)}
      </section>)}
      {completed.length > 0 && <section className="hk-queue-group" aria-label="Completed today">
        <header><button className="hk-queue-toggle" aria-expanded={showCompleted} onClick={() => setShowCompleted((value) => !value)}><h3><ClipboardCheck size={14} aria-hidden="true" />Completed today<i>{completed.length}</i><ChevronDown size={14} aria-hidden="true" className={showCompleted ? "open" : ""} /></h3></button><p>Finished work, with inspection outcome. Full history lives in the room detail.</p></header>
        {showCompleted && completed.map((item) => <QueueCard key={String(item.id)} item={item} canHousekeep={canHousekeep} canCoordinate={false} housekeepingAction={housekeepingAction} coordinate={coordinate} onViewMaintenance={onViewMaintenance} onViewRoom={onViewRoom} />)}
      </section>}
      {items.length > 0 && <div className="table-footer">Showing {items.length} task{items.length !== 1 ? "s" : ""}<span>Readiness is decided by the audited housekeeping workflow, not by this view.</span></div>}
    </div>
  </>;
}

function QueueCard({ item, canHousekeep, canCoordinate, housekeepingAction, coordinate, onViewMaintenance, onViewRoom }: {
  item: RecordItem;
  canHousekeep: boolean;
  canCoordinate: boolean;
  housekeepingAction: (item: RecordItem, action: "assign" | "start" | "complete" | "inspect" | "defer" | "maintenance") => void;
  coordinate: (item: RecordItem) => void;
  onViewMaintenance: () => void;
  onViewRoom: (item: RecordItem) => void;
}) {
  const status = String(item.status);
  const type = String(item.task_type);
  const isTurnover = type === "checkout_cleaning";
  const created = isTurnover ? `checked out ${when(item.created_at) ?? "recently"}` : `created ${time(item.created_at) ?? "recently"}`;
  const arrival = item.next_arrival ? `next arrival ${day(item.next_arrival)}` : null;
  return <article className="hk-queue-card">
    <div className="hk-queue-main">
      <header>
        <b>Room {label(item.room_number)}</b>
        <span className="hk-queue-type">{label(item.room_type)}</span>
        <span className={`badge ${String(item.priority)}`}>{label(item.priority)}</span>
        <span className={`badge ${status}`}>{label(status)}</span>
        {item.maintenance_blocked === true && <span className="badge maintenance">maintenance</span>}
      </header>
      <p className="hk-queue-service"><strong>{label(type)}</strong> · {label(item.task)}</p>
      <small>
        {created}{item.assigned_to && item.assigned_to !== "Unassigned" ? ` · ${label(item.assigned_to)}` : " · unassigned"}
        {item.started_at ? ` · started ${when(item.started_at)}` : ""}
        {item.completed_at ? ` · completed ${when(item.completed_at)}` : ""}
        {arrival ? ` · ${arrival}` : ""}
      </small>
      <small>
        Room state: <span className={`badge ${String(item.room_housekeeping)}`}>{label(item.room_housekeeping)}</span>
        {String(item.inspection_status) === "pending" ? " · awaiting inspection" : ""}
        {String(item.inspection_status) === "failed" ? ` · inspection failed: ${label(item.inspection_reason)}` : ""}
        {String(item.inspection_status) === "passed" ? " · inspection passed" : ""}
      </small>
    </div>
    <div className="hk-queue-actions">
      {canHousekeep && openTaskStatuses.includes(status) && type !== "inspection" && <button className="table-action view-action" onClick={() => housekeepingAction(item, "assign")}>{item.assigned_user_id ? "Reassign" : "Claim"}</button>}
      {canHousekeep && openTaskStatuses.includes(status) && type !== "inspection" && <button className="table-action view-action" onClick={() => housekeepingAction(item, "start")}>Start cleaning</button>}
      {canHousekeep && status === "in_progress" && <button className="table-action view-action" onClick={() => housekeepingAction(item, "complete")}>Complete</button>}
      {canHousekeep && String(item.inspection_status) === "pending" && <button className="table-action view-action" onClick={() => housekeepingAction(item, "inspect")}>Inspect</button>}
      {canHousekeep && status === "in_progress" && ["stayover_cleaning", "guest_request"].includes(type) && <button className="table-action" onClick={() => housekeepingAction(item, "defer")}>Defer</button>}
      {canHousekeep && status !== "cancelled" && <button className="table-action" onClick={() => housekeepingAction(item, "maintenance")}>Report issue</button>}
      {item.maintenance_blocked === true && <button className="table-action" onClick={onViewMaintenance}>View work order</button>}
      {canCoordinate && status !== "completed" && <button className="table-action" onClick={() => coordinate(item)}>Prioritize</button>}
      <button className="table-action view-action" onClick={() => onViewRoom(item)}>Room details</button>
      {!canHousekeep && !canCoordinate && <span>View only</span>}
    </div>
  </article>;
}
