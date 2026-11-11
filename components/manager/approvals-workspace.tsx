"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowUp, ClipboardCheck, DoorOpen, FileText, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/Navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { HavenSearchInput } from "@/components/ui/haven-data-controls";
import { HavenSelect } from "@/components/ui/haven-select";
import { paginateTableRows, TablePagination } from "@/components/ui/table-pagination";
import { approvalKind, compareApprovalUrgency, formatDetail, waitingSince } from "@/lib/approval-display";
import { formatHotelDateTime } from "@/lib/format";
import { financialDifference, roomTypeChangeReasonLabel, type RoomTypeChangeFinancials } from "@/lib/room-type-change-reasons";
import type { RecordItem } from "@/lib/types";
import "./approvals-workspace.css";

type Action = (item: RecordItem) => Promise<boolean>;

type Props = {
  items: RecordItem[];
  search: string;
  setSearch: (value: string) => void;
  review: (item: RecordItem, decision: "approve" | "reject") => Promise<boolean>;
  execute: Action;
  executeException: Action;
  financialExecute: Action;
  escalateOwner: Action;
  openRefunds?: () => void;
  canReview: boolean;
  canExecute: boolean;
  canFinancialExecute: boolean;
  actorId?: string;
};

const stages = [
  { id: "decision", title: "Needs decision", hint: "Manager review", icon: ClipboardCheck },
  { id: "owner", title: "With Owner", hint: "Escalated authority", icon: Users },
  { id: "execution", title: "Awaiting execution", hint: "Authorized department", icon: DoorOpen },
  { id: "history", title: "History", hint: "Completed decisions", icon: FileText },
] as const;

type Stage = (typeof stages)[number]["id"];
const pageSize = 4;
const frontDeskTypes = new Set([
  "room_upgrade", "room_type_exception", "reservation_modification", "early_check_in",
  "late_checkout", "checkout_exception", "stay_extension",
]);
const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const text = (value: unknown, fallback = "") => value == null || value === "" ? fallback : String(value);
const title = (value: unknown) => text(value).replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
const caseTitle = (item: RecordItem) => {
  if (item.request_type === "stay_extension") return "Stay extension exception";
  return title(item.request_type) || "Exception request";
};
const peso = (value: unknown) => value == null ? "—" : currency.format(Number(value));
const timestamp = (value: RecordItem[string]) => Date.parse(text(value)) || 0;
const reference = (item: RecordItem) => text(item.reservation_reference || item.related_entity_id, item.id);
const caseSubject = (item: RecordItem) => [item.guest_name, reference(item)].filter(Boolean).join(" · ");
const severityBadge = (item: RecordItem) => (
  <StatusBadge status={text(item.severity, "normal")} label={title(item.severity) || "Normal"} size="sm" showIcon={false} />
);

function stageOf(item: RecordItem): Stage {
  if (item.status === "pending") return item.authority_level === "owner" ? "owner" : "decision";
  if (item.status === "approved" && item.execution_status === "awaiting_execution") return "execution";
  return "history";
}

function compareDecisions(a: RecordItem, b: RecordItem) {
  const latest = (item: RecordItem) =>
    timestamp(item.executed_at || item.owner_reviewed_at || item.reviewed_at || item.updated_at || item.requested_at);
  return latest(b) - latest(a);
}

function stageBadge(item: RecordItem, stage: Stage) {
  if (stage === "decision") return <StatusBadge status="pending" label="Awaiting decision" size="sm" />;
  if (stage === "owner") return <StatusBadge status="info" label="Owner review" size="sm" />;
  if (stage === "execution") return <StatusBadge status="info" label="Approved · Awaiting execution" size="sm" />;
  const executed = item.execution_status === "executed";
  const label = executed ? (item.request_type === "guest_escalation" ? "Decision recorded" : "Executed") : title(item.status);
  return <StatusBadge status={executed ? "completed" : text(item.status)} label={label} size="sm" />;
}

export function ManagerApprovalView(props: Props) {
  const { items, search, setSearch, canReview, actorId } = props;
  const [view, setView] = useState<{ stage: Stage; page: number; selectedId?: string; follow?: boolean }>({ stage: "decision", page: 1 });
  const [filters, setFilters] = useState({ type: "", severity: "", department: "" });
  const [busy, setBusy] = useState(false);
  const [actionErrorId, setActionErrorId] = useState<string>();
  const actionInProgress = useRef(false);
  const docketHeading = useRef<HTMLHeadingElement>(null);
  const caseHeading = useRef<HTMLHeadingElement>(null);

  const scoped = items.filter(item => canReview || !actorId || item.requested_by === actorId);
  const query = search.trim().toLowerCase();
  const filtered = scoped.filter(item =>
    (!filters.type || filters.type === item.request_type) &&
    (!filters.severity || filters.severity === item.severity) &&
    (!filters.department || filters.department === item.department) &&
    (!query || [JSON.stringify(item), caseTitle(item), title(item.department)].join(" ").toLowerCase().includes(query)),
  );
  const followed = view.follow && filtered.find(item => item.id === view.selectedId);
  const stage = followed ? stageOf(followed) : view.stage;
  const queue = filtered.filter(item => stageOf(item) === stage)
    .sort(stage === "decision" || stage === "owner" ? compareApprovalUrgency : compareDecisions);
  const selectedIndex = queue.findIndex(item => item.id === view.selectedId);
  const page = paginateTableRows(queue, selectedIndex < 0 ? view.page : Math.floor(selectedIndex / pageSize) + 1, pageSize);
  const selected = queue[selectedIndex] ?? page.rows[0];
  const hasFilters = Boolean(query || filters.type || filters.severity || filters.department);
  const move = (pageNumber = 1, selectedId?: string) => setView({ stage, page: pageNumber, selectedId });
  const clearFilters = () => {
    setFilters({ type: "", severity: "", department: "" });
    setSearch("");
    move();
  };
  const options = (field: "request_type" | "department") => [...new Set(scoped.map(item => text(item[field])).filter(Boolean))]
    .sort((a, b) => title(a).localeCompare(title(b)))
    .map(value => ({ value, label: title(value) }));
  const selectFilter = (key: keyof typeof filters, value: string) => {
    setFilters(current => ({ ...current, [key]: value }));
    move();
  };
  const run = async (action: Action) => {
    if (!selected || actionInProgress.current) return;
    actionInProgress.current = true;
    setBusy(true);
    setActionErrorId(undefined);
    try {
      if (await action(selected)) setView({ stage, page: page.page, selectedId: selected.id, follow: true });
    } catch {
      setActionErrorId(selected.id);
    } finally {
      actionInProgress.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="approval-workspace">
      <PageHeader
        eyebrow="Management control"
        title="Approvals & Escalations"
        subtitle="Compare each exception with hotel policy and see who decides, who pays, and who acts next."
      />
      <div className="approval-stages" role="group" aria-label="Approval stages">
        {stages.map(({ id, title, hint, icon: Icon }) => (
          <button key={id} type="button" aria-pressed={id === stage} disabled={busy} onClick={() => setView({ stage: id, page: 1 })}>
            <span><Icon size={16} aria-hidden="true" /> <span>{title}</span> <b>{filtered.filter(item => stageOf(item) === id).length}</b></span>
            <small>{hint}</small>
          </button>
        ))}
      </div>
      <div className="approval-controls">
        <HavenSearchInput
          value={search}
          onValueChange={value => { setSearch(value); move(); }}
          label="Search approvals"
          placeholder="Search guest, reservation, or request…"
        />
        <div className="approval-selects">
          <HavenSelect value={filters.type} onChange={value => selectFilter("type", value)} ariaLabel="Filter by approval type"
            options={[{ value: "", label: "All types" }, ...options("request_type")]} />
          <HavenSelect value={filters.severity} onChange={value => selectFilter("severity", value)} ariaLabel="Filter by severity"
            options={[{ value: "", label: "All severities" }, ...["normal", "high", "critical"].map(value => ({ value, label: title(value) }))]} />
          <HavenSelect value={filters.department} onChange={value => selectFilter("department", value)} ariaLabel="Filter by department"
            options={[{ value: "", label: "All departments" }, ...options("department")]} />
        </div>
      </div>
      <section className="approval-docket" aria-labelledby="approval-docket-title">
        <header>
          <h2 id="approval-docket-title" ref={docketHeading} tabIndex={-1}>Case docket</h2>
          <p aria-live="polite">{queue.length} {queue.length === 1 ? "case" : "cases"} {canReview ? "in view" : "filed by you"}</p>
        </header>
        {selected ? (
          <>
            <div className="approval-case-list">
              {page.rows.map(item => (
                <button key={item.id} type="button" aria-current={item.id === selected.id} disabled={busy}
                  onClick={() => {
                    move(page.page, item.id);
                    if (window.matchMedia("(max-width: 640px)").matches) caseHeading.current?.focus();
                  }}>
                  <span className="approval-case-meta">
                    {severityBadge(item)}
                    <small>{stage === "decision" || stage === "owner" ? waitingLabel(item) : title(item.status)}</small>
                  </span>
                  <strong>{caseTitle(item)}</strong>
                  <small>{caseSubject(item)}</small>
                </button>
              ))}
            </div>
            {page.pageCount > 1 && <TablePagination {...page} onPageChange={move} noun="cases" />}
          </>
        ) : (
          <div className="approval-docket-empty">
            <h3>{hasFilters ? "No cases match these filters" : "No cases in this stage"}</h3>
            <p>{hasFilters ? "Try another stage or clear your filters." : "Choose another stage to see its cases."}</p>
            {hasFilters && <button type="button" className="btn btn-soft" onClick={clearFilters}>Clear filters</button>}
          </div>
        )}
      </section>
      {selected && (
        <article className="approval-dossier" aria-label="Case details">
          <header>
            <div className="approval-docket-back">
              <button type="button" className="btn btn-soft" onClick={() => docketHeading.current?.focus()}>
                <ArrowUp size={16} aria-hidden="true" /> Back to docket
              </button>
            </div>
            <div>
              <p className="approval-reference">{reference(selected)}</p>
              <h2 ref={caseHeading} tabIndex={-1}>{caseTitle(selected)}</h2>
              <p>{[selected.guest_name, title(selected.department), selected.requested_at && "Filed " + formatHotelDateTime(text(selected.requested_at))].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="approval-dossier-state">
              {severityBadge(selected)}
              {stageBadge(selected, stage)}
              {selected.status === "pending" && <small>{waitingLabel(selected)}</small>}
            </div>
          </header>
          <CaseEvidence key={selected.id} item={selected} />
          <CaseWorkflow item={selected} stage={stage} props={props} busy={busy} actionError={actionErrorId === selected.id} run={run} />
        </article>
      )}
    </div>
  );
}

function waitingLabel(item: RecordItem) {
  const elapsed = waitingSince(item.requested_at);
  return elapsed === "just now" ? "Filed just now" : elapsed === "—" ? "Waiting" : "Waiting " + elapsed;
}

type StayExtension = {
  currentCheckOut: string;
  requestedCheckOut: string;
  nights: number;
  rate: number | null;
  nightlyRates?: { date: string; rate: number }[];
  additionalAmount: number;
  projectedTotal: number;
  roomConflict: boolean;
  roomNumber: string;
  roomType: string;
};

function requestSnapshots(item: RecordItem) {
  const action = item.requested_action as unknown as { financials?: RoomTypeChangeFinancials; stayExtension?: StayExtension } | null;
  const roomChange = item.request_type === "room_type_exception" || item.request_type === "room_upgrade";
  const extension = item.request_type === "stay_extension";
  return { roomChange, extension, financials: roomChange ? action?.financials : undefined, stay: extension ? action?.stayExtension : undefined };
}

function Facts({ fields }: { fields: [string, ReactNode][] }) {
  return <dl className="approval-facts">{fields.map(([label, value]) => (
    <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
  ))}</dl>;
}

function recordedActivity(item: RecordItem) {
  const accounting = item.request_type === "refund_exception" || item.request_type === "guest_compensation";
  const decisionActor = text(item.reviewer_name, item.owner_reviewed_at ? "Owner" : "Manager");
  const decision = item.status === "rejected" ? "Rejected" : item.status === "approved" ? "Approved" : "Decision recorded";
  return [
    { title: "Request filed", actor: text(item.requester_name, title(item.department)), at: item.requested_at, note: "" },
    { title: "Escalated to Owner", actor: "Manager", at: item.owner_escalated_at, note: item.owner_escalation_reason },
    { title: decision, actor: decisionActor, at: item.owner_reviewed_at || item.reviewed_at, note: item.decision_reason },
    { title: "Guest acceptance recorded", actor: "Front Desk", at: item.guest_accepted_at, note: "" },
    {
      title: item.request_type === "guest_escalation" ? "Response recorded" : "Executed",
      actor: item.request_type === "guest_escalation" ? decisionActor : accounting ? "Accounting" : "Front Desk",
      at: item.executed_at,
      note: "",
    },
  ].filter(event => event.at).reverse().sort((a, b) => timestamp(b.at) - timestamp(a.at));
}

function CaseEvidence({ item }: { item: RecordItem }) {
  const { roomChange, extension, financials, stay } = requestSnapshots(item);
  const activity = recordedActivity(item);
  const latest = activity.find(event => event.title !== "Request filed");
  return (
    <div className="approval-evidence">
      <section>
        <h3>Reason for request</h3>
        <p>{text(item.reason, "No reason recorded.")}</p>
      </section>
      <div className="approval-compare">
        <section>
          <h3>Normal policy</h3>
          <p>{formatDetail(item.normal_policy_result) || "No separate policy result was recorded."}</p>
          {item.reservation_status && <p className="approval-muted">Reservation status · {title(item.reservation_status)}</p>}
          {item.stay_dates && <p className="approval-muted">Stay dates · {item.stay_dates}</p>}
        </section>
        <section>
          <h3>Requested action</h3>
          <p>{formatDetail(item.requested_action) || "Manager coordination requested."}</p>
        </section>
      </div>
      {roomChange && (
        <section>
          <h3>Financial responsibility</h3>
          {financials ? (
            <>
              <Facts fields={[
                ["Reason", roomTypeChangeReasonLabel(text(financials.reasonCode)) || "—"],
                ["Payer", financials.responsibility === "hotel" ? "Hotel absorbs the difference" : financials.responsibility === "guest" ? "Guest pays the difference" : "—"],
                ["Agreed stay total", peso(financials.originalTotal)],
                ["Target room total", financials.targetRate == null ? peso(financials.targetTotal)
                  : peso(financials.targetTotal) + " (" + peso(financials.targetRate) + " × " + financials.nights + " nights)"],
                ["Difference", peso(financials.difference)],
              ]} />
              {financialDifference(financials) < 0 && <p className="approval-note is-attention">The target rate is lower. Review any refund separately.</p>}
            </>
          ) : <p className="approval-muted">{item.status === "pending"
            ? "This request predates recorded financial responsibility. Reject it and ask for a new request with a reason."
            : "Financial responsibility was unavailable in this request."}</p>}
        </section>
      )}
      {extension && (
        <section>
          <h3>Stay extension</h3>
          {stay ? (
            <>
              <Facts fields={[
                ["Current room", [stay.roomNumber, stay.roomType].filter(Boolean).join(" · ")],
                ["Current checkout", stay.currentCheckOut],
                ["Requested checkout", <>{stay.requestedCheckOut} · {stay.nights} added {stay.nights === 1 ? "night" : "nights"}</>],
                ["Room availability", <StatusBadge key="availability" status={stay.roomConflict ? "cancelled" : "available"} size="sm"
                  label={stay.roomConflict ? "Conflict during added nights" : "Available through new checkout"} />],
                ["Additional lodging", stay.rate != null ? peso(stay.rate) + " × " + stay.nights + " = " + peso(stay.additionalAmount)
                  : [peso(stay.additionalAmount), stay.nightlyRates?.map(night => peso(night.rate)).join(" · ")].filter(Boolean).join(" · ")],
                ["Projected folio total", peso(stay.projectedTotal)],
              ]} />
              {stay.roomConflict && <p className="approval-note is-attention">The current room is taken during the added nights. Front Desk revalidates a same-type room before executing, or extends in place if the conflict clears.</p>}
            </>
          ) : <p className="approval-muted">{item.status === "pending"
            ? "No extension calculation was recorded. Reject it and request the extension again."
            : "The extension calculation was unavailable in this request."}</p>}
        </section>
      )}
      {latest && <p className="approval-note"><strong>{[latest.title, latest.actor].filter(Boolean).join(" · ")}</strong>
        {latest.note && <>{" "}<span>{latest.note}</span></>}
      </p>}
      <details className="approval-activity">
        <summary>Activity history · {activity.length}</summary>
        <ol>
          {activity.map(event => (
            <li key={event.title}>
              <strong>{[event.title, event.actor].filter(Boolean).join(" · ")}</strong>
              <small>{formatHotelDateTime(text(event.at))}</small>
              {event.note && <p>{event.note}</p>}
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function CaseWorkflow({ item, stage, props, busy, actionError, run }: { item: RecordItem; stage: Stage; props: Props; busy: boolean; actionError: boolean; run: (action: Action) => Promise<void> }) {
  const { canReview, canExecute, canFinancialExecute } = props;
  let heading = "Recorded in history";
  let detail = item.execution_status === "executed" ? "Execution recorded." : title(item.status);
  let actions: ReactNode;
  if (stage === "decision") {
    const escalation = approvalKind(item.request_type) === "escalation";
    const own = Boolean(props.actorId && item.requested_by === props.actorId);
    const purchaseOrder = item.request_type === "purchase_order_approval";
    const { roomChange, extension, financials, stay } = requestSnapshots(item);
    const needsSnapshot = (roomChange && !financials) || (extension && !stay);
    heading = purchaseOrder ? "Inventory decision" : "Manager decision";
    detail = purchaseOrder ? "Owner or Admin reviews this purchase order in Inventory."
      : own && canReview ? "Another Manager must review this request."
        : !canReview ? "A Manager will record the decision and reason."
          : escalation ? "Record the response to the guest escalation and the reason for the decision."
            : "Approval authorizes the next step. The responsible department executes it.";
    if (canReview && !purchaseOrder) {
      actions = <>
        {!own && <button type="button" className="btn btn-soft danger-action" disabled={busy} onClick={() => void run(row => props.review(row, "reject"))}>Reject</button>}
        {["high", "critical"].includes(text(item.severity)) && <button type="button" className="btn btn-soft" disabled={busy} onClick={() => void run(props.escalateOwner)}>Escalate to Owner</button>}
        {!own && <button type="button" className="btn btn-accent" disabled={busy || needsSnapshot} onClick={() => void run(row => props.review(row, "approve"))}>
          {escalation ? "Approve response" : "Approve exception"}
        </button>}
      </>;
    }
  } else if (stage === "owner") {
    heading = "Awaiting Owner decision";
    detail = "The Owner reviews this case in Owner Exceptions.";
  } else if (stage === "execution") {
    const refund = item.request_type === "refund_exception";
    const credit = item.request_type === "guest_compensation";
    const checkIn = item.request_type === "room_type_exception";
    const frontDesk = frontDeskTypes.has(text(item.request_type));
    heading = refund || credit ? "Next step · Accounting" : frontDesk ? "Next step · Front Desk" : "Execution pending";
    detail = checkIn ? "Front Desk revalidates the authorized room during check-in."
      : refund ? "Accounting settles the approved amount in Refunds."
        : credit ? "Accounting applies the approved folio credit."
          : frontDesk ? "Front Desk applies the recorded decision." : "This case is awaiting its recorded execution.";
    if (canExecute && frontDesk) {
      actions = <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void run(checkIn ? props.executeException : props.execute)}>
        {checkIn ? "Continue check-in" : "Execute approved exception"}
      </button>;
    } else if (canFinancialExecute && credit) {
      actions = <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void run(props.financialExecute)}>Apply approved credit</button>;
    } else if (canFinancialExecute && refund && props.openRefunds) {
      actions = <button type="button" className="btn btn-accent" onClick={props.openRefunds}>Open Refunds</button>;
    }
  } else if (item.status === "rejected") {
    heading = "Decision closed";
  }
  return (
    <footer className="approval-workflow" aria-busy={busy}>
      <div>
        <h3>{heading}</h3>
        <p>{detail}</p>
        {actionError && <p role="alert">The action could not be confirmed. Reload this page before trying again.</p>}
      </div>
      {actions && <div className="approval-workflow-actions">{actions}</div>}
    </footer>
  );
}
