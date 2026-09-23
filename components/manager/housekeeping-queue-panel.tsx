"use client";

import { useMemo, useState } from "react";
import { BedDouble, Bell, ChevronDown, ClipboardCheck, Search, Sparkles, Wand2, Wrench } from "lucide-react";
import { ModuleSummaryCards } from "@/components/manager/module-summary-cards";
import { HavenSelect } from "@/components/ui/haven-select";
import { HavenDataToolbar, HavenSearchInput } from "@/components/ui/haven-data-controls";
import type { AssignmentSuggestion } from "@/lib/housekeeping-suggestions";
import type { RecordItem, Role } from "@/lib/types";

// Operational queue for the housekeeping workflow. Renders the same
// authoritative housekeeping_tasks rows the previous table showed (same
// payload, same RPC actions) grouped by what the room needs next — never a
// derived "available" claim: cards show the room's recorded state only.
// Guest-service requests are worked in the Guest Requests module; this queue
// carries only a compact link strip there, never duplicate completion buttons.

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

export default function HousekeepingQueuePanel({ role, userId, items, search, setSearch, housekeepingAction, coordinate, applySuggestion, suggestions = [], onViewMaintenance, onViewRoom, guestRequestOpen = 0, onOpenGuestRequests }: {
  role: Role;
  userId: string;
  items: RecordItem[];
  search: string;
  setSearch: (value: string) => void;
  housekeepingAction: (item: RecordItem, action: "assign" | "start" | "complete" | "inspect" | "defer" | "maintenance") => void;
  coordinate: (item: RecordItem) => void;
  /** Applies an advisory assignment suggestion through the audited assign route. Housekeeping self-assigns; Owner assigns the suggested teammate. */
  applySuggestion?: (suggestion: AssignmentSuggestion) => void;
  /** Advisory plan from /api/housekeeping/assignment-suggestions — the parent owns data fetching, this panel stays presentational. */
  suggestions?: AssignmentSuggestion[];
  onViewMaintenance: () => void;
  onViewRoom: (item: RecordItem) => void;
  /** Open approved guest-service items routed to Housekeeping (parent's live badge metric) — display only; work happens in Guest Requests. */
  guestRequestOpen?: number;
  /** Navigates to the Guest Requests module. Rendered only for the housekeeping role. */
  onOpenGuestRequests?: () => void;
}) {
  const [showCompleted, setShowCompleted] = useState(false);
  const [workType, setWorkType] = useState("all");
  const [workStatus, setWorkStatus] = useState("all");
  const today = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()), []);
  const mine = role === "housekeeping" ? userId : "";
  const canHousekeep = role === "housekeeping";
  const canCoordinate = role === "manager";
  // Advisory assignment plan — Housekeeping sees it to claim, Manager to
  // coordinate, Owner to assign. Front Desk keeps its read-only queue.
  const canSeeSuggestions = ["housekeeping", "manager", "owner"].includes(role);
  const canApplySuggestion = canHousekeep || role === "owner";

  // Keep the plan honest against the live queue: a row disappears the moment
  // its task is no longer open unassigned work (claimed, reassigned, done).
  const liveSuggestions = useMemo(
    () => (canSeeSuggestions ? suggestions.filter((suggestion) => items.some((item) => String(item.id) === suggestion.taskId && !item.assigned_user_id && !item.assignee && openTaskStatuses.includes(String(item.status)))) : []),
    [canSeeSuggestions, suggestions, items]
  );

  const taskTypes = useMemo(() => Array.from(new Set(items.map((item) => String(item.task_type ?? "")).filter(Boolean))).sort(), [items]);
  const workStatuses = useMemo(() => Array.from(new Set(items.map((item) => String(item.status ?? "")).filter(Boolean))).sort(), [items]);
  const queueItems = useMemo(() => items.filter((item) =>
    (workType === "all" || String(item.task_type) === workType)
    && (workStatus === "all" || String(item.status) === workStatus)
  ), [items, workType, workStatus]);

  const groups = useMemo(() => {
    const grouped: Record<QueueGroup, RecordItem[]> = { blocked: [], needs_attention: [], my_tasks: [], in_progress: [], waiting_inspection: [], completed_today: [], other_open: [] };
    for (const item of queueItems) {
      const group = groupQueueTask(item, mine, today);
      if (group) grouped[group].push(item);
    }
    for (const key of Object.keys(grouped) as QueueGroup[]) grouped[key].sort(queueTaskOrder);
    return grouped;
  }, [queueItems, mine, today]);
  // Summary cards always describe the whole loaded queue — filters narrow the
  // sections below, never the snapshot above.
  const totals = useMemo(() => {
    const grouped: Record<QueueGroup, number> = { blocked: 0, needs_attention: 0, my_tasks: 0, in_progress: 0, waiting_inspection: 0, completed_today: 0, other_open: 0 };
    for (const item of items) {
      const group = groupQueueTask(item, mine, today);
      if (group) grouped[group] += 1;
    }
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

  // The first non-empty work group is the primary action target — rendered
  // with emphasis so active work dominates the page.
  const primaryKey = (["needs_attention", "my_tasks", "in_progress"] as QueueGroup[]).find((key) => groups[key].length > 0) ?? null;
  const actionable = specs.filter((spec) => groups[spec.key].length > 0);
  const completed = groups.completed_today;
  const showGuestStrip = role === "housekeeping" && onOpenGuestRequests;

  return <>
    <div className="hk-hero">
      <div><p className="hk-eyebrow">Hotel operations</p><h1>Housekeeping</h1><p>Live room-care queue from turnover through inspection and readiness.</p></div>
    </div>
    <ModuleSummaryCards cards={[
      { label: "Needs attention", value: totals.needs_attention, hint: "Unassigned or urgent", icon: ClipboardCheck, tone: "attention" },
      { label: "In progress", value: totals.in_progress, hint: "Being cleaned now", icon: BedDouble, tone: "today" },
      { label: "Waiting for inspection", value: totals.waiting_inspection, hint: "Not sellable until passed", icon: Sparkles, tone: "active" },
      { label: "Blocked by Maintenance", value: totals.blocked, hint: "Work order holds the room", icon: Wrench, tone: "attention" },
      { label: "Completed today", value: totals.completed_today, hint: "Finished this hotel day", icon: ClipboardCheck, tone: "done" },
    ]} ariaLabel="Housekeeping summary"/>
    {showGuestStrip && <section className="data-panel hk-guest-strip" aria-label="Guest service requests">
      <span className="hk-guest-icon" aria-hidden="true"><Bell size={16} /></span>
      <div><b>Guest service requests assigned to Housekeeping</b><small>{guestRequestOpen} open — start and complete them in Guest Requests</small></div>
      <button type="button" className="table-action action-neutral" onClick={onOpenGuestRequests}>Open Guest Requests</button>
    </section>}
    {canSeeSuggestions && liveSuggestions.length > 0 && <div className="data-panel hk-queue" aria-label="Suggested assignments">
      <section className="hk-queue-group">
        <header><h3><Wand2 size={14} aria-hidden="true" />Suggested assignments<i>{liveSuggestions.length}</i></h3><p>Suggestion — you decide. A balanced plan from open tasks and current workloads; nothing is assigned automatically.</p></header>
        {liveSuggestions.map((suggestion) => <article key={suggestion.taskId} className="hk-queue-card">
          <div className="hk-queue-main">
            <header>
              <b>Room {suggestion.roomNumber}</b>
              <span className="hk-queue-type">{suggestion.taskType}</span>
              <span className={`badge ${suggestion.priority}`}>{suggestion.priority}</span>
            </header>
            <p className="hk-queue-service"><strong>{suggestion.staffName}</strong></p>
            <small>{suggestion.reason}</small>
          </div>
          <div className="hk-queue-actions">
            {canApplySuggestion && applySuggestion && <button className="table-action action-primary" onClick={() => applySuggestion(suggestion)}>{canHousekeep ? "Assign to me" : `Assign to ${suggestion.staffName}`}</button>}
            {!canApplySuggestion && <span>Suggestion only — coordinate via Prioritize</span>}
          </div>
        </article>)}
      </section>
    </div>}
    <HavenDataToolbar
      label="Search and filter the room-care queue"
      filtersLayout="compact"
      search={<HavenSearchInput value={search} onValueChange={setSearch} label="Search the room-care queue" placeholder="Search the room-care queue..." />}
      advancedFilters={<>
        <div className="haven-filter"><span>Work type</span><HavenSelect value={workType} onChange={setWorkType} ariaLabel="Filter by work type" options={[{ value: "all", label: "All work types" }, ...taskTypes.map((type) => ({ value: type, label: label(type) }))]} /></div>
        <div className="haven-filter"><span>Task status</span><HavenSelect value={workStatus} onChange={setWorkStatus} ariaLabel="Filter by task status" options={[{ value: "all", label: "All statuses" }, ...workStatuses.map((status) => ({ value: status, label: label(status) }))]} /></div>
      </>}
      resultCount={queueItems.length}
      resultNoun="tasks"
      hasActiveFilters={Boolean(search.trim()) || workType !== "all" || workStatus !== "all"}
      onClearFilters={() => { setSearch(""); setWorkType("all"); setWorkStatus("all"); }}
    />
    <ol className="hk-flow" aria-label="Typical room-care path">
      <li>Pending</li><li>In progress</li><li>Inspection</li><li>Ready</li>
    </ol>
    <section className="data-panel hk-queue" aria-label="Room care queue">
      {queueItems.length === 0 && <div className="empty"><Search /><h3>No records found</h3><p>No matching operational records are available.</p></div>}
      {actionable.map(({ key, title, hint, icon: Icon }) => <section key={key} className={`hk-queue-group${key === primaryKey ? " hk-group-primary" : ""}`} aria-label={title}>
        <header><h3><Icon size={14} aria-hidden="true" />{title}<i>{groups[key].length}</i></h3><p>{hint}</p></header>
        {groups[key].map((item) => <QueueCard key={String(item.id)} item={item} canHousekeep={canHousekeep} canCoordinate={canCoordinate} housekeepingAction={housekeepingAction} coordinate={coordinate} onViewMaintenance={onViewMaintenance} onViewRoom={onViewRoom} />)}
      </section>)}
      {completed.length > 0 && <section className="hk-queue-group" aria-label="Completed today">
        <header><button className="hk-queue-toggle" aria-expanded={showCompleted} onClick={() => setShowCompleted((value) => !value)}><h3><ClipboardCheck size={14} aria-hidden="true" />Completed today<i>{completed.length}</i><ChevronDown size={14} aria-hidden="true" className={showCompleted ? "open" : ""} /></h3></button><p>Finished work, with inspection outcome. Full history lives in the room detail.</p></header>
        {showCompleted && completed.map((item) => <QueueCard key={String(item.id)} item={item} canHousekeep={canHousekeep} canCoordinate={false} housekeepingAction={housekeepingAction} coordinate={coordinate} onViewMaintenance={onViewMaintenance} onViewRoom={onViewRoom} />)}
      </section>}
      {queueItems.length > 0 && <div className="table-footer">Showing {queueItems.length} task{queueItems.length !== 1 ? "s" : ""}<span>Readiness is decided by the audited housekeeping workflow, not by this view.</span></div>}
    </section>
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
      {canHousekeep && status === "in_progress" && <button className="table-action action-primary" onClick={() => housekeepingAction(item, "complete")}>Complete Task</button>}
      {canHousekeep && String(item.inspection_status) === "pending" && <button className="table-action" onClick={() => housekeepingAction(item, "inspect")}>Inspect</button>}
      {canHousekeep && openTaskStatuses.includes(status) && type !== "inspection" && <button className="table-action action-primary" onClick={() => housekeepingAction(item, "assign")}>{item.assigned_user_id ? "Reassign" : "Claim"}</button>}
      {canHousekeep && openTaskStatuses.includes(status) && type !== "inspection" && <button className="table-action action-primary" onClick={() => housekeepingAction(item, "start")}>Start cleaning</button>}
      {canHousekeep && status === "in_progress" && ["stayover_cleaning", "guest_request"].includes(type) && <button className="table-action" onClick={() => housekeepingAction(item, "defer")}>Defer</button>}
      {canHousekeep && status !== "cancelled" && <button className="table-action" onClick={() => housekeepingAction(item, "maintenance")}>Report Issue</button>}
      {item.maintenance_blocked === true && <button className="table-action" onClick={onViewMaintenance}>View work order</button>}
      {canCoordinate && status !== "completed" && <button className="table-action" onClick={() => coordinate(item)}>Prioritize</button>}
      <button className="table-action" onClick={() => onViewRoom(item)}>Room Details</button>
      {!canHousekeep && !canCoordinate && <span>View only</span>}
    </div>
  </article>;
}
