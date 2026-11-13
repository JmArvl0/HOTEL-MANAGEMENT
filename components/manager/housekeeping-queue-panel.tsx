"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowUpRight, BedDouble, Bell, CalendarDays, Check, ChevronRight, CircleCheck, ClipboardCheck, ClipboardList, FileText, LockKeyhole, Search, UserRound, Users } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { HavenSearchInput } from "@/components/ui/haven-data-controls";
import { HavenSelect } from "@/components/ui/haven-select";
import { formatHotelDateTime, HOTEL_TIME_ZONE } from "@/lib/format";
import { groupQueueTask, housekeepingDay } from "@/lib/housekeeping-queue";
import { canCoordinateOperations, canPerformHousekeeping } from "@/lib/permissions";
import type { AssignmentSuggestion } from "@/lib/housekeeping-suggestions";
import type { RecordItem, Role } from "@/lib/types";
import "./housekeeping-queue.css";

type TaskAction = "assign" | "start" | "complete" | "inspect" | "defer" | "maintenance";
type QueueProps = {
  role: Role;
  userId: string;
  items: RecordItem[];
  allItems?: RecordItem[];
  search: string;
  setSearch: (value: string) => void;
  housekeepingAction: (item: RecordItem, action: TaskAction) => void;
  coordinate: (item: RecordItem) => void;
  applySuggestion?: (suggestion: AssignmentSuggestion) => void;
  suggestions?: AssignmentSuggestion[];
  onViewRoom: (item: RecordItem, tab?: "maintenance") => void;
  guestRequestOpen?: number;
  onOpenGuestRequests?: () => void;
  onServiceOutcome?: (item: RecordItem, outcome: "service_declined" | "late_service") => void;
  onSetDnd?: (item: RecordItem) => void;
};

const stages = {
  queued: { label: "To clean", status: "pending", icon: ClipboardList, tone: "warning" },
  cleaning: { label: "Cleaning", status: "cleaning", icon: BedDouble, tone: "info" },
  inspection: { label: "To inspect", status: "pending", icon: ClipboardCheck, tone: "warning" },
  hold: { label: "On hold", status: "blocked", icon: LockKeyhole, tone: "danger" },
  completed: { label: "Completed today", status: "completed", icon: CircleCheck, tone: "success" },
} as const;
type Stage = keyof typeof stages;
type QueueTask = { item: RecordItem; stage: Stage };

const openTaskStatuses = ["pending", "assigned", "deferred"];
const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const dateFormat = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: HOTEL_TIME_ZONE });
const clockFormat = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: HOTEL_TIME_ZONE });
const label = (value: RecordItem[string]) => {
  const text = String(value ?? "").replaceAll("_", " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const roomName = (item: RecordItem) => item.room_number && item.room_number !== "-" ? `Room ${item.room_number}` : "Room unassigned";
const workTypeName = (item: RecordItem) => label(item.task_type || item.task) || "Room care";
const assignee = (item: RecordItem) => String(item.assigned_to || item.assignee || "Unassigned");
const isUnassigned = (item: RecordItem) => !item.assigned_user_id && !item.assignee && assignee(item) === "Unassigned";
const hasDndHold = (item: RecordItem) => item.dnd_active === true && item.task_type === "stayover_cleaning";
const hasOpenTask = (item: RecordItem) => openTaskStatuses.includes(String(item.status));
const isClockTime = (text: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text);
const arrivalClock = (item: RecordItem) => {
  const text = String(item.next_arrival_time ?? "").trim();
  return isClockTime(text) ? text : "";
};
const arrivalTime = (item: RecordItem) => {
  const text = String(item.next_arrival_time ?? "").trim();
  return isClockTime(text) ? clockFormat.format(new Date(`2000-01-01T${text}:00+08:00`)) : text;
};

export const queueTaskOrder = (a: RecordItem, b: RecordItem): number =>
  (priorityRank[String(a.priority)] ?? 3) - (priorityRank[String(b.priority)] ?? 3)
  || String(a.next_arrival || "9999").localeCompare(String(b.next_arrival || "9999"))
  || (arrivalClock(a) || "99:99").localeCompare(arrivalClock(b) || "99:99")
  || String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));

function stageFor(item: RecordItem, today: string): Stage | null {
  const group = groupQueueTask(item, "", today);
  if (!group) return null;
  if (group === "waiting_inspection") return "inspection";
  if (group === "completed_today") return "completed";
  if (group === "blocked" || item.status === "deferred" || (hasOpenTask(item) && hasDndHold(item))) return "hold";
  return item.status === "in_progress" ? "cleaning" : "queued";
}

function arrivalLabel(item: RecordItem, today: string) {
  const arrival = housekeepingDay(item.next_arrival);
  if (!arrival) return null;
  const day = arrival === today ? "Today" : dateFormat.format(new Date(`${arrival}T00:00:00+08:00`));
  const time = arrivalTime(item);
  return time ? `${day}, ${time}` : day;
}

function stageBadge({ item, stage }: QueueTask) {
  const spec = stages[stage];
  if (stage === "completed" && item.inspection_status === "failed") return <StatusBadge status="failed" label="Inspection failed" size="sm" />;
  if (stage === "hold" && item.maintenance_blocked === true) return <StatusBadge status="maintenance" label="Maintenance hold" size="sm" />;
  if (stage === "hold" && hasDndHold(item)) return <StatusBadge status="deferred" label="Do Not Disturb" size="sm" />;
  if (stage === "hold") return <StatusBadge status="deferred" label="Deferred" size="sm" />;
  return <StatusBadge status={spec.status} label={stage === "completed" ? "Completed" : spec.label} icon={<spec.icon size={13} />} size="sm" />;
}

export default function HousekeepingQueuePanel(props: QueueProps) {
  const { role, userId, items, allItems = items, search, setSearch, suggestions = [], applySuggestion, onOpenGuestRequests, guestRequestOpen = 0 } = props;
  const [today, setToday] = useState(() => housekeepingDay(new Date()) ?? "");
  const [stageFilter, setStageFilter] = useState<Stage | null>(null);
  const [workType, setWorkType] = useState("all");
  const [quickFilter, setQuickFilter] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [detailOpen, setDetailOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const rowTrigger = useRef<HTMLButtonElement | null>(null);
  const back = useRef<HTMLButtonElement>(null);
  const detailTitle = useRef<HTMLHeadingElement>(null);
  const queueTitle = useId();
  const isHousekeeping = canPerformHousekeeping(role);
  const isManager = canCoordinateOperations(role);
  const quick = isHousekeeping ? { label: "My tasks", Icon: UserRound, matches: (item: RecordItem) => item.assigned_user_id === userId }
    : isManager ? { label: "Unassigned", Icon: Users, matches: (item: RecordItem) => hasOpenTask(item) && isUnassigned(item) }
    : role === "front_desk" ? { label: "Arrivals today", Icon: CalendarDays, matches: (item: RecordItem) => housekeepingDay(item.next_arrival) === today } : null;

  useEffect(() => {
    const timer = window.setInterval(() => setToday(housekeepingDay(new Date()) ?? ""), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const counts: Record<Stage, number> = { queued: 0, cleaning: 0, inspection: 0, hold: 0, completed: 0 };
  for (const item of allItems) {
    const stage = stageFor(item, today);
    if (stage) counts[stage]++;
  }
  const queue = items.flatMap(item => {
    const stage = stageFor(item, today);
    return stage ? [{ item, stage }] : [];
  });
  const visible = queue.filter(({ item, stage }) =>
    (!stageFilter || stage === stageFilter)
    && (workType === "all" || (item.task_type || item.task) === workType)
    && (!quickFilter || !quick || quick.matches(item))
  );
  const rank: Record<Stage, number> = { queued: 0, cleaning: 0, inspection: 0, hold: 1, completed: 2 };
  visible.sort((a, b) => rank[a.stage] - rank[b.stage] || (a.stage === "completed"
    ? String(b.item.inspected_at ?? b.item.completed_at ?? "").localeCompare(String(a.item.inspected_at ?? a.item.completed_at ?? ""))
    : queueTaskOrder(a.item, b.item)));
  // User selection survives a server refresh that moves the task to a different stage.
  // Explicit filters reset selection below and choose the first matching row.
  const selectedItem = selectedId ? allItems.find(item => item.id === selectedId) : undefined;
  const selectedStage = selectedItem && stageFor(selectedItem, today);
  const selected = selectedItem && selectedStage ? { item: selectedItem, stage: selectedStage } : visible[0];
  const taskTypes = [...new Set(allItems.map(item => String(item.task_type || item.task || "")).filter(Boolean))].sort();
  const activeFilters = Boolean(search.trim()) || stageFilter !== null || workType !== "all" || quickFilter;
  const eligibleSuggestions = new Set(visible.filter(({ item, stage }) => stage === "queued" && isUnassigned(item) && hasOpenTask(item)).map(({ item }) => item.id));
  const liveSuggestions = isHousekeeping || isManager || role === "owner"
    ? suggestions.filter(suggestion => eligibleSuggestions.has(suggestion.taskId)) : [];

  function changeFilters() {
    setSelectedId(undefined);
    setDetailOpen(false);
  }

  function select(item: RecordItem, trigger: HTMLButtonElement, keyboard: boolean) {
    rowTrigger.current = trigger;
    setSelectedId(item.id);
    setDetailOpen(true);
    window.requestAnimationFrame(() => {
      const narrow = Boolean(back.current?.getClientRects().length);
      if (narrow) back.current?.scrollIntoView({ block: "start" });
      if (narrow || keyboard) detailTitle.current?.focus({ preventScroll: true });
    });
  }

  function returnToQueue() {
    setDetailOpen(false);
    window.requestAnimationFrame(() => {
      const row = rowTrigger.current;
      const target = row?.isConnected ? row : root.current?.querySelector<HTMLElement>('.hk-room-row[aria-pressed="true"]');
      (target ?? root.current?.querySelector<HTMLInputElement>('input[type="search"]'))?.focus();
    });
  }

  return <div className="housekeeping-workspace" ref={root} data-detail-open={detailOpen && Boolean(selected)}>
    <header className="hk-page-heading">
      <h1>Housekeeping</h1>
      {isHousekeeping && onOpenGuestRequests && <button type="button" className="btn btn-soft" onClick={onOpenGuestRequests}
        aria-label={`Guest requests, ${guestRequestOpen} open`}>
        <Bell size={16} aria-hidden="true" /> Guest requests <span className="hk-count">{guestRequestOpen}</span><ArrowUpRight size={14} aria-hidden="true" />
      </button>}
    </header>

    <div className="hk-stage-strip" role="group" aria-label="Filter by task stage">
      {(Object.keys(stages) as Stage[]).map(stage => {
        const { icon: Icon, label, tone } = stages[stage];
        return <button type="button" key={stage} aria-label={`${counts[stage]} ${label}`} aria-pressed={stageFilter === stage} onClick={() => {
          changeFilters(); setStageFilter(stageFilter === stage ? null : stage);
        }}><span className={`hk-stage-icon is-${tone}`}><Icon size={18} aria-hidden="true" /></span>
          <span><b>{counts[stage]}</b><small>{label}</small></span>
        </button>;
      })}
    </div>

    <div className="hk-workspace-grid">
      <section className="hk-workspace-panel hk-room-queue" aria-labelledby={queueTitle}>
        <div className="hk-queue-header">
          <div className="hk-queue-title">
            <div><h2 id={queueTitle}>Room queue</h2><span className="hk-count">{visible.length}</span></div>
            {quick && <button className="btn btn-soft hk-quick-filter" type="button" aria-pressed={quickFilter}
              onClick={() => { changeFilters(); setQuickFilter(!quickFilter); }}><quick.Icon size={15} aria-hidden="true" /> {quick.label}</button>}
          </div>
          <div className="hk-filters">
            <HavenSearchInput value={search} onValueChange={value => { changeFilters(); setSearch(value); }}
              label="Search the room queue" placeholder="Search rooms or staff" />
            <HavenSelect value={workType} onChange={value => { changeFilters(); setWorkType(value); }} ariaLabel="Filter by work type"
              options={[{ value: "all", label: "All work types" }, ...taskTypes.map(type => ({ value: type, label: label(type) }))]} />
          </div>
          {liveSuggestions.length > 0 && <details className="hk-suggestions">
            <summary>Suggested assignments <span className="hk-count">{liveSuggestions.length}</span></summary>
            <p>Suggestions are advisory and nothing is assigned automatically.</p>
            <ul>{liveSuggestions.map(suggestion => <li key={suggestion.taskId}>
              <div><b>Room {suggestion.roomNumber} · {suggestion.staffName}</b><small>{suggestion.reason}</small></div>
              {applySuggestion && (isHousekeeping || role === "owner") && <button type="button" className="btn btn-soft" onClick={() => applySuggestion(suggestion)}>
                {isHousekeeping ? "Assign to me" : `Assign to ${suggestion.staffName}`}
              </button>}
              {isManager && <small>Suggestion only — coordinate via Prioritize</small>}
            </li>)}</ul>
          </details>}
        </div>

        <div className="hk-room-columns hk-column-head" aria-hidden="true"><span>Room</span><span>Task</span><span className="hk-assignee">Assigned to</span><span>Status</span><span /></div>
        {visible.length ? <ul className="hk-room-list" aria-label="Room tasks">
          {visible.map(row => {
            const { item, stage } = row;
            const arrival = arrivalLabel(item, today);
            const priority = stage !== "completed" && (item.priority === "urgent" || item.priority === "high") ? label(item.priority) : null;
            const person = isHousekeeping && item.assigned_user_id === userId ? "You" : assignee(item);
            const rowStatus = `${queueTitle}-${item.id}-status`;
            return <li key={item.id}><button type="button" className="hk-room-row hk-room-columns" aria-pressed={selected?.item.id === item.id}
              aria-label={[roomName(item), workTypeName(item), priority && `${priority} priority`, arrival && `Arrival ${arrival}`, person].filter(Boolean).join(" · ")}
              aria-describedby={rowStatus}
              onClick={event => select(item, event.currentTarget, event.detail === 0)}>
              <span className="hk-room-number"><b>{item.room_number && item.room_number !== "-" ? item.room_number : "Unassigned"}</b>{item.room_floor != null && <small>Floor {item.room_floor}</small>}</span>
              <span className="hk-row-task"><b>{workTypeName(item)}</b>
                {(arrival || priority) && <small>
                  {priority && <strong>{priority}{arrival && " · "}</strong>}
                  {arrival && `Arrives ${arrival.replace(/^Today/, "today")}`}
                </small>}
                <small className="hk-assignee-compact">{person}</small>
              </span>
              <span className="hk-assignee">{person}</span>
              <span className="hk-row-status" id={rowStatus}>{stageBadge(row)}</span>
              <ChevronRight size={14} className="hk-row-chevron" aria-hidden="true" />
            </button></li>;
          })}
        </ul> : <div className="hk-empty">
          <Search size={19} aria-hidden="true" /><h3>{activeFilters ? "No matching tasks" : "No room tasks"}</h3>
          <p>{activeFilters ? "Clear the filters or try another search." : "Room-care tasks will appear here as they are created."}</p>
        </div>}
        <footer className="hk-queue-footer">
          <span role="status">{activeFilters ? `Showing ${visible.length} of ${Object.values(counts).reduce((sum, count) => sum + count, 0)} tasks` : `${visible.length} ${visible.length === 1 ? "task" : "tasks"} · Priority, then next arrival`}</span>
          {activeFilters && <button className="btn btn-soft" type="button" onClick={() => {
            changeFilters(); setStageFilter(null); setWorkType("all"); setQuickFilter(false); setSearch("");
            root.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
          }}>Clear filters</button>}
        </footer>
      </section>

      <section className="hk-workspace-panel hk-task-detail" aria-label="Selected room task">
        <button ref={back} type="button" className="btn btn-soft hk-back" onClick={returnToQueue}><ArrowLeft size={16} aria-hidden="true" /> Back to room queue</button>
        {selected ? <TaskDetail key={selected.item.id} row={selected} today={today} titleRef={detailTitle} props={props}
          keepSelected={() => setSelectedId(selected.item.id)} />
          : <div className="hk-empty"><ClipboardList size={20} aria-hidden="true" /><h3>Select a room task</h3><p>Room details and actions appear here.</p></div>}
      </section>
    </div>
  </div>;
}

function TaskDetail({ row, today, titleRef, props, keepSelected }: { row: QueueTask; today: string; titleRef: React.RefObject<HTMLHeadingElement>; props: QueueProps; keepSelected: () => void }) {
  const { item, stage } = row;
  const { role, userId, housekeepingAction, coordinate, onViewRoom, onSetDnd, onServiceOutcome } = props;
  const canHousekeep = canPerformHousekeeping(role);
  const canCoordinate = canCoordinateOperations(role);
  const assignedElsewhere = Boolean(item.assigned_user_id) && item.assigned_user_id !== userId;
  const canWork = canHousekeep && !assignedElsewhere;
  const open = hasOpenTask(item);
  const regularTask = item.task_type !== "inspection";
  const stayServiceTask = item.task_type === "stayover_cleaning" || item.task_type === "guest_request";
  const serviceControls = item.service_instructions_available !== false && canWork && stayServiceTask && open;
  const inspect = item.inspection_status === "pending" && item.status === "completed";
  const blocked = item.maintenance_blocked === true;
  const dnd = hasDndHold(item);
  const canStart = canWork && open && regularTask && !dnd && !blocked;
  const canClaim = canWork && open && regularTask && !item.assigned_user_id;
  const action = (text: string, key: TaskAction, primary = false) =>
    <button type="button" className={`btn ${primary ? "btn-accent hk-next-action" : "btn-soft"}`} onClick={() => { keepSelected(); housekeepingAction(item, key); }}>
      {text}{primary && <ChevronRight size={16} aria-hidden="true" />}
    </button>;
  let primary: ReactNode = null;
  if (canCoordinate && item.status !== "completed") {
    primary = <button type="button" className="btn btn-accent hk-next-action" onClick={() => { keepSelected(); coordinate(item); }}>Prioritize task <ChevronRight size={16} aria-hidden="true" /></button>;
  } else if (canHousekeep && inspect) {
    primary = action("Inspect room", "inspect", true);
  } else if (canWork && item.status === "in_progress") {
    primary = action("Complete cleaning", "complete", true);
  } else if (canClaim && !blocked && !dnd) {
    primary = action("Claim task", "assign", true);
  } else if (canStart) {
    primary = action("Start cleaning", "start", true);
  }

  const additional: ReactNode[] = [];
  if (canStart && canClaim) additional.push(action("Start cleaning", "start"));
  if (canWork && open && regularTask && (!canClaim || blocked || dnd)) additional.push(action(item.assigned_user_id ? "Reassign" : "Claim task", "assign"));
  if (canWork && item.status === "in_progress" && stayServiceTask) additional.push(action("Defer service", "defer"));
  if (serviceControls && item.dnd_active !== true && item.active_reservation_id && onSetDnd) additional.push(
    <button type="button" className="btn btn-soft" onClick={() => { keepSelected(); onSetDnd(item); }}>Set DND</button>);
  if (serviceControls && !item.service_outcome && onServiceOutcome) additional.push(
    <button type="button" className="btn btn-soft" onClick={() => { keepSelected(); onServiceOutcome(item, "service_declined"); }}>Guest declined</button>,
    <button type="button" className="btn btn-soft" onClick={() => { keepSelected(); onServiceOutcome(item, "late_service"); }}>Mark late</button>);
  if (canHousekeep) additional.push(action("Report maintenance issue", "maintenance"));

  const activity = [
    [item.inspected_at, item.inspection_status === "failed" ? "Inspection failed" : "Inspection passed"],
    [item.completed_at, "Cleaning completed"], [item.deferred_at, "Service deferred"],
    [item.started_at, "Cleaning started"], [item.created_at, "Task opened"],
  ].filter(([value]) => Boolean(value)).sort(([a], [b]) => String(b).localeCompare(String(a)));
  const notes = [
    item.task && item.task !== item.task_type && label(item.task) !== workTypeName(item) ? item.task : null,
    item.notes, item.inspection_reason, item.deferred_reason, item.service_outcome_note,
  ].filter(Boolean);
  const arrival = arrivalLabel(item, today);
  const next = inspect && !canHousekeep ? "Awaiting Housekeeping inspection before release."
    : inspect ? "Pass inspection to release the room when it is serviceable."
    : assignedElsewhere && canHousekeep && item.status !== "completed" ? "Assigned to another Housekeeping worker"
    : role === "front_desk" && item.status !== "completed" && !blocked && !dnd ? "Housekeeping updates this task as work progresses." : null;
  const housekeepingState = label(item.room_housekeeping);
  const inventoryState = item.room_status !== item.room_housekeeping ? label(item.room_status) : "";

  return <>
    <header className="hk-detail-heading">
      <div className="hk-detail-badges">
        {stageBadge(row)}
        {blocked && stage !== "hold" && <StatusBadge status="maintenance" label="Maintenance hold" size="sm" />}
        {item.dnd_active === true && !(stage === "hold" && dnd && !blocked) && <StatusBadge status="deferred" label="Do Not Disturb" size="sm" />}
        {item.priority && (item.priority !== "normal" || canCoordinate) && <StatusBadge status={String(item.priority)} size="sm" label={`${label(item.priority)} priority`} />}
      </div>
      <h2 ref={titleRef} tabIndex={-1}>{roomName(item)}</h2>
      {(item.room_type || item.room_floor != null) && <p>{[item.room_type, item.room_floor != null ? `Floor ${item.room_floor}` : null].filter(Boolean).join(" · ")}</p>}
    </header>
    <div className="hk-detail-body">
      <dl className="hk-room-facts">
        <div><dt>Work type</dt><dd>{workTypeName(item)}</dd></div>
        <div><dt>Assigned to</dt><dd>{assignee(item)}{canHousekeep && item.assigned_user_id === userId ? " (you)" : ""}</dd></div>
        <div><dt>Next arrival</dt><dd>{arrival ?? "None scheduled"}</dd></div>
        <div><dt>Room state</dt><dd>
          {housekeepingState || inventoryState || "Unavailable"}
          {housekeepingState && inventoryState && <small>Inventory status: <span>{inventoryState}</span></small>}
        </dd></div>
        {item.service_outcome && <div><dt>Service outcome</dt><dd>{label(item.service_outcome)}</dd></div>}
      </dl>
      {(notes.length > 0 || blocked || dnd) && <div className="hk-task-notes">
        <FileText size={16} aria-hidden="true" />
        <div><h3>{blocked || dnd ? "Service restrictions" : "Service notes"}</h3>
          {blocked && <p>An open maintenance work order holds this room.</p>}
          {dnd && <p>Wait for Front Desk to clear the guest’s Do Not Disturb instruction before starting routine cleaning.</p>}
          {[...new Set(notes)].map(note => <p key={String(note)}>{note}</p>)}
        </div>
      </div>}
      {stage !== "hold" && <TaskProgress row={row} />}
    </div>
    <div className="hk-detail-actions">
      {next && <p>{next}</p>}
      {primary}
      {additional.length > 0 && <details className="hk-more-actions"><summary>More actions</summary>
        <div>{additional.map((control, index) => <span key={index}>{control}</span>)}</div>
      </details>}
      {item.room_id && <div className="hk-room-links">
        {blocked && <button type="button" className="btn btn-soft" onClick={() => onViewRoom(item, "maintenance")}>View work order</button>}
        <button type="button" className="btn btn-soft" onClick={() => onViewRoom(item)}>Room details</button>
      </div>}
    </div>
    {activity.length > 0 && <details className="hk-task-activity"><summary>Task activity</summary>
      <ul>{activity.map(([value, event]) => <li key={String(event)}><time dateTime={String(value)}>{formatHotelDateTime(value as string)}</time><span>{event}</span></li>)}</ul>
    </details>}
  </>;
}

function TaskProgress({ row }: { row: QueueTask }) {
  const { item, stage } = row;
  const includeInspection = item.status === "completed"
    ? item.inspection_status === "pending" || item.inspection_status === "passed" || item.inspection_status === "failed"
    : item.task_type !== "stayover_cleaning" && item.room_status !== "occupied";
  const steps = [
    { key: "queued", label: "To clean" }, { key: "cleaning", label: "Cleaning" },
    ...(includeInspection ? [{ key: "inspection", label: item.status === "completed" ? "Inspection" : "Inspection if required" }] : []),
    { key: "completed", label: "Complete" },
  ];
  const current = item.inspection_status === "failed" ? "inspection" : stage;
  const active = steps.findIndex(step => step.key === current);
  return <div className="hk-task-progress"><h3>Task progress</h3>
    <ol aria-label="Task progress">{steps.map((step, index) => <li key={step.key} aria-current={step.key === current ? "step" : undefined} data-done={index < active}>
      <span aria-hidden="true">{index < active ? <Check size={13} /> : index + 1}</span>{step.label}
    </li>)}</ol>
  </div>;
}
