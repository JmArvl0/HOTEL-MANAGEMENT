"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArrowLeft, Bell, ClipboardList, Clock, ConciergeBell, FileText, Info, Package, Wrench } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { HavenFilterBadges, HavenSearchInput, HavenSkeletonList } from "@/components/ui/haven-data-controls";
import { HavenSelect } from "@/components/ui/haven-select";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import { canAccess } from "@/lib/permissions";
import { requestLabel } from "@/lib/request-options";
import { groupRequestBatches, requestCode, type RequestBatch, type RequestBatchItem } from "@/lib/request-batches";
import type { Role } from "@/lib/types";
import { hotelRequest, useHotelResource } from "./hotel-operations-client";
import "./guest-requests.css";

type StaffRequest = RequestBatchItem & {
  guest_id: string | null;
  priority: string;
  escalation_status?: string | null;
  escalated_at?: string | null;
  reservation?: { confirmation_number: string | null; guest_name: string | null; room_type: string | null; room_number: string | null } | null;
};
type Batch = RequestBatch<StaffRequest>;
type InventoryItem = { id: string; name: string; quantity: number; reorder_point: number; unit: string; status: string };

const QUEUES = [["pending", "Awaiting approval"], ["open", "Open work"], ["history", "History"]] as const;
const DEPARTMENTS: Record<string, string> = { front_desk: "Front Desk", housekeeping: "Housekeeping", maintenance: "Maintenance" };
const approvalLabels = { pending: "Awaiting approval", approved: "Approved", rejected: "Declined", withdrawn: "Withdrawn" };
const format = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" });
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Time unavailable" : format.format(date);
};
const label = (value: string) => value.replaceAll("_", " ");
const plural = (value: number, noun: string) => `${value} ${noun}${value === 1 ? "" : "s"}`;
const guestName = (batch: Batch) => batch.items[0].reservation?.guest_name || batch.items[0].guest_id || "Guest";
const roomLabel = (batch: Batch) => batch.items[0].reservation?.room_number ? `Room ${batch.items[0].reservation.room_number}` : "Room unassigned";
const bookingLabel = (batch: Batch) => batch.items[0].reservation?.confirmation_number || batch.items[0].reservation_id;
const openWork = (item: StaffRequest) => item.approval_status === "approved" && ["open", "in_progress"].includes(item.status);
const activeItems = (batch: Batch) => batch.items.filter(item => item.approval_status !== "withdrawn");
const queueFor = (batch: Batch) => batch.approval === "pending" ? "pending" :
  batch.approval === "approved" && batch.items.some(item => openWork(item) || (item.approval_status == null && ["open", "in_progress"].includes(item.status)))
    ? "open" : "history";

function requestContent(item: StaffRequest) {
  const title = item.request_type ? requestLabel(item.request_type) : item.request;
  const prefix = `${title}: `;
  const note = item.request.startsWith(prefix) ? item.request.slice(prefix.length).trim() : "";
  return { title, note, original: !note && item.request !== title ? item.request : "" };
}

function elapsed(createdAt: string, now: number) {
  const minutes = Math.floor((now - Date.parse(createdAt)) / 60_000);
  if (!Number.isFinite(minutes) || minutes <= 0) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${Math.floor(minutes / 1440)}d ${Math.floor((minutes % 1440) / 60)}h`;
}

function fulfillment(batch: Batch) {
  const approved = batch.items.filter(item => item.approval_status === "approved");
  return { done: approved.filter(item => item.status === "completed").length, total: approved.length };
}

function BatchStatus({ batch, teamView }: { batch: Batch; teamView: boolean }) {
  const { done, total } = fulfillment(batch);
  if (batch.approval === "approved" && total > 0 && done === total) {
    return <StatusBadge status="completed" label={teamView ? "Housekeeping done" : "Fulfilled"} showIcon={false} />;
  }
  return <StatusBadge status={batch.approval} label={approvalLabels[batch.approval]} showIcon={false} />;
}

function SupplySnapshot({ version }: { version: number }) {
  const { data, error, loading, refresh } = useHotelResource<InventoryItem[]>("/api/resources/inventory");
  useEffect(() => { if (version) void refresh(); }, [version, refresh]);
  const low = data?.filter(item => item.status !== "healthy").length ?? 0;
  return <details className="gr-supply">
    <summary>Supply snapshot {low > 0 && <StatusBadge status="low" label={`${low} to reorder`} showIcon={false} />}</summary>
    {loading && !data && <p>Loading stock levels…</p>}
    {error && <div role="alert"><p>{data ? "Stock refresh failed. Showing the last loaded quantities." : "Stock levels are unavailable."}</p>
      <button type="button" className="btn btn-soft" onClick={() => void refresh()}>Retry stock levels</button>
    </div>}
    {data?.length ? <dl>{data.slice(0, 6).map(item => <div key={item.id}><dt>{item.name}</dt>
      <dd>{item.quantity} {item.unit} on hand · Reorder at {item.reorder_point}</dd></div>)}</dl> :
      data && <p>No inventory records.</p>}
  </details>;
}

function SubmissionDetails({ selected, role, now, busy, detailScroll, inventoryVersion, onReview, onProgress, onEscalate }: {
  selected?: Batch;
  role: Role;
  now: number;
  busy: boolean;
  detailScroll: RefObject<HTMLDivElement>;
  inventoryVersion: number;
  onReview: (batch: Batch, decision: "approve" | "reject") => void;
  onProgress: (batch: Batch, item: StaffRequest, action: "start" | "complete") => void;
  onEscalate?: (batch: Batch, item: StaffRequest) => void;
}) {
  const teamView = role === "housekeeping";
  const canReview = role === "front_desk";
  const supply = canAccess(role, "inventory") && <SupplySnapshot version={inventoryVersion} />;
  if (!selected) return <div className="gr-detail-scroll" ref={detailScroll}>
    <div className="gr-empty"><FileText size={24} aria-hidden="true" /><h3>No submission selected</h3><p>Choose a submission from the queue.</p></div>
    {supply}
  </div>;

  const first = selected.items[0];
  const { done, total } = fulfillment(selected);
  const active = activeItems(selected);
  const approval = selected.approval;
  const decision = active.find(item => item.approved_at);
  const declineNote = active.find(item => item.approval_status === "rejected" && item.approval_note)?.approval_note;
  const pendingCount = active.filter(item => item.approval_status === "pending").length;
  const note = requestContent(first).note;
  const sharedNote = note && selected.items.every(item => requestContent(item).note === note) ? note : "";
  const overdue = approval === "pending" && now - Date.parse(first.created_at) > 2 * 60 * 60_000;
  const reviewable = canReview && approval === "pending";
  return <>
    <header className="gr-detail-head">
      <div className="gr-reference"><span><FileText size={16} aria-hidden="true" /> Submission {requestCode(selected)}</span>
        <BatchStatus batch={selected} teamView={teamView} /></div>
      <div className="gr-guest"><span className="gr-initials" aria-hidden="true">
        {guestName(selected).trim().split(/\s+/).slice(0, 2).map(name => name[0]).join("").toUpperCase()}
      </span><div><h2 tabIndex={-1} data-gr-guest>{guestName(selected)}</h2>
        <p>Booking {bookingLabel(selected)}{first.reservation?.room_type && ` · ${first.reservation.room_type}`}</p>
      </div></div>
    </header>
    <div className="gr-detail-scroll" ref={detailScroll} role="region" aria-label="Submission information" tabIndex={0}>
      <dl className="gr-context"><div><dt>Room</dt><dd>{roomLabel(selected)}</dd></div>
        <div><dt>Submitted</dt><dd><time dateTime={first.created_at}>{dateLabel(first.created_at)}</time></dd></div>
        <div><dt>{approval === "approved" ? "Fulfillment" : "Items submitted"}</dt>
          <dd>{approval === "approved" ? `${done} of ${total} done` : plural(selected.items.length, "item")}</dd></div>
      </dl>
      <section aria-labelledby="gr-items-heading">
        <div className="gr-section-title"><h3 id="gr-items-heading">Requested items</h3>{teamView && <span>Housekeeping only</span>}</div>
        <ul className="gr-items">{selected.items.map(item => {
          const content = requestContent(item);
          const TeamIcon = item.department === "maintenance" ? Wrench : item.department === "housekeeping" ? Package : ConciergeBell;
          const canProgress = item.department === role && ["housekeeping", "maintenance", "front_desk"].includes(role) && openWork(item);
          const escalated = item.escalation_status === "escalated";
          const state = item.approval_status === "pending" ? "Awaiting approval" : item.approval_status === "withdrawn" ? "Withdrawn" : undefined;
          return <li key={item.id}>
            <div className="gr-item-title"><TeamIcon size={16} aria-hidden="true" /><div><strong>{content.title}</strong>
              <p>{DEPARTMENTS[item.department] ?? label(item.department)}{escalated && " · Escalated to Manager"}</p>
              {(content.original || (!sharedNote && content.note)) && <p>{content.original || content.note}</p>}
            </div></div>
            <StatusBadge status={state ? item.approval_status : openWork(item) ? "info" : item.status}
              label={state ?? (openWork(item) ? item.status === "open" ? "Open" : "In progress" : undefined)} showIcon={false} />
            {canProgress && <div className="gr-item-actions">
              {item.status === "open" && <button type="button" className="btn btn-soft" disabled={busy} onClick={() => onProgress(selected, item, "start")}>Start</button>}
              <button type="button" className="btn btn-soft" disabled={busy} onClick={() => onProgress(selected, item, "complete")}>Complete</button>
              {teamView && onEscalate && !escalated && <button type="button" className="btn btn-soft" disabled={busy}
                onClick={() => onEscalate(selected, item)}>Escalate</button>}
            </div>}
          </li>;
        })}</ul>
      </section>
      {sharedNote && <section className="gr-callout"><Info size={16} aria-hidden="true" /><div><h3>Guest note</h3><p>{sharedNote}</p></div></section>}
      {approval === "pending" && <section className="gr-callout gr-callout-wait"><Clock size={16} aria-hidden="true" /><div>
        <h3>{overdue ? `Waiting ${elapsed(first.created_at, now)} for a decision` : "One decision for the whole submission"}</h3>
        <p>{reviewable ? `Approval sends ${plural(pendingCount, "active item")} to the assigned teams.` : "Front Desk reviews this submission."}
          {active.length < selected.items.length && " Withdrawn items stay closed."}</p>
      </div></section>}
      {declineNote && <section className="gr-callout gr-callout-decline"><Info size={16} aria-hidden="true" /><div>
        <h3>Reason shared with guest</h3><p>{declineNote}</p>
      </div></section>}
      <section className="gr-activity"><h3>Submission activity</h3>
        <ul>
          <li><FileText size={15} aria-hidden="true" /><span>Submission recorded</span><time dateTime={first.created_at}>{dateLabel(first.created_at)}</time></li>
          {decision?.approved_at && <li><ClipboardList size={15} aria-hidden="true" />
            <span>{approval === "rejected" ? "Submission declined" : "Submission approved"}</span>
            <time dateTime={decision.approved_at}>{dateLabel(decision.approved_at)}</time></li>}
          {selected.items.filter(item => item.escalated_at).map(item => <li key={item.id}><Bell size={15} aria-hidden="true" />
            <span>{requestContent(item).title} escalated</span><time dateTime={item.escalated_at!}>{dateLabel(item.escalated_at!)}</time></li>)}
        </ul>
      </section>
      {supply}
    </div>
    <footer className="gr-detail-footer">
      <p>{reviewable ? `${plural(pendingCount, "active item")} in this decision` :
        role === "manager" ? "Manager view · Read only" : approval === "approved" ? "Departments update each item as work is done." : "This submission is closed."}</p>
      {reviewable && <div>
        <button type="button" className="btn btn-soft gr-decline" disabled={busy} onClick={() => onReview(selected, "reject")}>Decline submission</button>
        <button type="button" className="btn btn-accent gr-approve" disabled={busy} onClick={() => onReview(selected, "approve")}>Approve submission</button>
      </div>}
    </footer>
  </>;
}

export default function GuestRequestsPanel({ role, onEscalate }: {
  role: Role;
  onEscalate?: (request: StaffRequest) => void | Promise<void>;
}) {
  const [requests, setRequests] = useState<StaffRequest[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<{ message: string; failed: boolean } | null>(null);
  const [queue, setQueue] = useState("all");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [selectedKey, setSelectedKey] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inventoryVersion, setInventoryVersion] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const sequence = useRef(0);
  const navigation = useRef(0);
  const saving = useRef(false);
  const workspace = useRef<HTMLDivElement>(null);
  const queueList = useRef<HTMLDivElement>(null);
  const detailScroll = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const rowTrigger = useRef<HTMLButtonElement | null>(null);
  const dialogs = useActionDialogs();
  const canReview = role === "front_desk";
  const teamView = role === "housekeeping";

  const load = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const data = await hotelRequest<StaffRequest[]>("/api/resources/guest_requests");
      if (request !== sequence.current) return null;
      setRequests(data ?? []);
      setError("");
      return data ?? [];
    } catch (cause) {
      if (request === sequence.current) setError(cause instanceof Error ? cause.message : "Unable to load guest requests.");
      return null;
    }
  }, []);
  useEffect(() => {
    const loadSequence = sequence;
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => {
      setNow(Date.now());
      if (!saving.current) void load();
    }, 30_000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); loadSequence.current++; };
  }, [load]);

  const batches = useMemo(() => groupRequestBatches(teamView
    ? (requests ?? []).filter(item => item.department === role)
    : requests ?? []).filter(batch => !teamView || batch.approval !== "pending"), [requests, role, teamView]);
  const teamOptions = [{ value: "all", label: "All departments" }, ...Array.from(new Set(
    [...Object.keys(DEPARTMENTS), ...batches.flatMap(batch => batch.items.map(item => item.department))],
  )).sort().map(value => ({ value, label: DEPARTMENTS[value] ?? label(value) }))];
  const term = search.trim().toLowerCase();
  const filtered = batches.filter(batch =>
    (department === "all" || batch.items.some(item => item.department === department)) &&
    (!term || [
      guestName(batch), roomLabel(batch), bookingLabel(batch), requestCode(batch), batch.key,
      ...batch.items.flatMap(item => [item.request, requestContent(item).title, DEPARTMENTS[item.department] ?? label(item.department)]),
    ].some(text => text.toLowerCase().includes(term))));
  const groups = QUEUES.filter(([key]) => !teamView || key !== "pending").map(([key, title]) => {
    const rows = filtered.filter(batch => queueFor(batch) === key);
    if (key === "pending") rows.reverse();
    return { key, title, rows };
  });
  const visibleGroups = groups.filter(group => queue === "all" || group.key === queue);
  const visible = visibleGroups.flatMap(group => group.rows);
  const selected = visible.find(batch => batch.key === selectedKey) ?? visible[0];
  const activeFilters = Boolean(term) || department !== "all" || queue !== "all";

  function changeFilter() {
    navigation.current++;
    if (queueList.current) queueList.current.scrollTop = 0;
    if (detailScroll.current) detailScroll.current.scrollTop = 0;
    setNotice(null);
  }

  function select(batch: Batch, trigger: HTMLButtonElement) {
    navigation.current++;
    rowTrigger.current = trigger;
    setSelectedKey(batch.key);
    setDetailOpen(true);
    setNotice(null);
    if (detailScroll.current) detailScroll.current.scrollTop = 0;
    requestAnimationFrame(() => {
      if (!back.current?.getClientRects().length) return;
      back.current.scrollIntoView({ block: "start" });
      workspace.current?.querySelector<HTMLElement>("[data-gr-guest]")?.focus({ preventScroll: true });
    });
  }

  function backToQueue() {
    navigation.current++;
    setDetailOpen(false);
    requestAnimationFrame(() => {
      const trigger = rowTrigger.current;
      const target = trigger?.isConnected ? trigger : workspace.current?.querySelector<HTMLButtonElement>('[aria-current="true"]');
      (target ?? workspace.current?.querySelector<HTMLInputElement>('input[type="search"]'))?.focus();
    });
  }

  async function save(batch: Batch, run: () => Promise<unknown>, message?: string, refreshStock = false) {
    if (saving.current) return;
    const view = navigation.current;
    saving.current = true;
    setBusy(true);
    setNotice(null);
    try {
      await run();
      const next = await load();
      if (refreshStock) setInventoryVersion(value => value + 1);
      if (view === navigation.current) {
        const updated = next && groupRequestBatches(teamView ? next.filter(item => item.department === role) : next)
          .find(record => record.key === batch.key);
        if (updated) {
          setSelectedKey(updated.key);
          setQueue(current => current === "all" ? current : queueFor(updated));
        }
        if (message) {
          setNotice({ message, failed: false });
          requestAnimationFrame(() => {
            if (view === navigation.current && document.activeElement === document.body) {
              workspace.current?.querySelector<HTMLElement>("[data-gr-guest]")?.focus({ preventScroll: true });
            }
          });
        }
      }
    } catch (cause) {
      if (view === navigation.current) setNotice({
        message: cause instanceof Error ? cause.message : "Unable to update this request.", failed: true,
      });
      await load();
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  async function review(batch: Batch, decision: "approve" | "reject") {
    if (saving.current || !canReview || batch.approval !== "pending") return;
    let note: string | undefined;
    if (decision === "approve") {
      const items = batch.items.filter(item => item.approval_status === "pending");
      const confirmed = await dialogs.askConfirm({ title: "Approve submission",
        message: `Approve ${plural(items.length, "active request")} from ${guestName(batch)}? Approved items route to their departments.`,
        confirmText: "Approve and route" });
      if (!confirmed) return;
    } else {
      const reason = await dialogs.askPrompt({ title: "Decline submission",
        message: "The guest sees this reason. Declining cancels the active requests in this submission.",
        label: "Reason visible to the guest", multiline: true, rows: 3, required: true, submitText: "Decline submission",
        validation: value => {
          const text = String(value).trim();
          if (!text) return "A reason is required.";
          return text.length > 500 ? "Use 500 characters or fewer." : null;
        },
      });
      if (!reason) return;
      note = reason.trim();
    }
    await save(batch, () => hotelRequest("/api/front-desk/guest-requests/review", { batchId: batch.key, decision, note }),
      decision === "approve" ? "Submission approved." : "Submission declined.");
  }

  async function progress(batch: Batch, item: StaffRequest, action: "start" | "complete") {
    await save(batch, () => hotelRequest(`/api/guest-requests/${item.id}/progress`, { action }),
      action === "start" ? "Request started." : "Request completed.", action === "complete");
  }

  function row(batch: Batch) {
    const active = activeItems(batch);
    const first = active[0] ?? batch.items[0];
    const { done, total } = fulfillment(batch);
    const overdue = batch.approval === "pending" && now - Date.parse(batch.items[0].created_at) > 2 * 60 * 60_000;
    return <li key={batch.key}>
      <button type="button" className="gr-row" aria-current={selected?.key === batch.key ? "true" : undefined}
        onClick={event => select(batch, event.currentTarget)}>
        <span className="gr-row-name"><strong>{guestName(batch)}</strong><small>
          {roomLabel(batch)} · {requestContent(first).title}{active.length > 1 ? ` +${active.length - 1}` : ""}
        </small></span>
        <span className="gr-row-state"><BatchStatus batch={batch} teamView={teamView} />
          <small className={overdue ? "gr-overdue" : undefined}>
            {batch.approval === "pending" ? `${overdue ? "Waiting " : ""}${elapsed(first.created_at, now)}`
              : batch.approval === "approved" && total ? `${done}/${total} done` : dateLabel(batch.items[0].created_at)}
          </small>
        </span>
      </button>
    </li>;
  }

  return <div className="guest-requests" ref={workspace}>
    <header className="gr-page-heading"><h1>Guest Requests</h1><p>{teamView
      ? "Work on approved guest requests routed to Housekeeping."
      : "Review guest submissions and track work across departments."}</p></header>
    {notice && <p className="gr-feedback" role={notice.failed ? "alert" : "status"}>{notice.message}</p>}
    <div className="gr-workspace" data-detail-open={detailOpen && selected?.key === selectedKey}>
      <section className="gr-panel gr-queue" aria-labelledby="gr-queue-heading">
        <header className="gr-queue-head"><div><h2 id="gr-queue-heading">{teamView ? "Housekeeping queue" : "Submission queue"}</h2>
          <p>{teamView ? "Review and complete work routed to Housekeeping." : "Oldest submissions awaiting a decision appear first."}</p>
        </div><ClipboardList size={21} aria-hidden="true" /></header>
        <div className="gr-filters">
          <HavenFilterBadges label="Submission filters" value={queue} onChange={value => { changeFilter(); setQueue(value); }}
            options={[{ value: "all", label: "All", count: requests ? filtered.length : undefined },
              ...groups.map(group => ({ value: group.key, label: group.title, count: requests ? group.rows.length : undefined }))]} />
          <div className="gr-search" data-team={teamView}>
            <HavenSearchInput label="Search guest requests" placeholder="Guest, room, booking or request" value={search}
              onValueChange={value => { changeFilter(); setSearch(value); }} />
            {!teamView && <HavenSelect value={department} onChange={value => { changeFilter(); setDepartment(value); }}
              options={teamOptions} ariaLabel="Filter by department" />}
          </div>
        </div>
        {error && <div className="gr-feedback" role="alert">
          <p>{requests ? "Could not refresh submissions. Showing the last loaded queue." : error}</p>
          <button type="button" className="btn btn-soft" onClick={() => void load()}>Retry queue</button>
        </div>}
        <div className="gr-list" ref={queueList}>
          {!requests && !error && <div className="gr-empty"><HavenSkeletonList lines={5} /></div>}
          {visibleGroups.filter(group => group.rows.length).map(group => <section className="gr-group" key={group.key}>
            <h3>{group.key === "history" ? "Recent history" : group.title}</h3><ul>{group.rows.map(row)}</ul>
          </section>)}
          {requests && !visible.length && <div className="gr-empty"><h3>{activeFilters ? "No matching submissions" : "No submissions"}</h3>
            <p>{activeFilters ? "Try a different search or clear the filters." : "Guest submissions will appear here."}</p></div>}
        </div>
        <footer className="gr-queue-footer">
          <span role="status">{requests && `${plural(visible.length, "submission")} in view`}</span>
          {activeFilters && <button type="button" className="btn btn-soft" onClick={() => {
            changeFilter(); setQueue("all"); setSearch(""); setDepartment("all");
            workspace.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
          }}>Clear filters</button>}
        </footer>
      </section>
      <aside className="gr-panel gr-detail" aria-label="Submission details">
        <button ref={back} className="btn btn-soft gr-back" type="button" onClick={backToQueue}><ArrowLeft size={16} aria-hidden="true" /> Back to queue</button>
        <SubmissionDetails selected={selected} role={role} now={now} busy={busy} detailScroll={detailScroll}
          inventoryVersion={inventoryVersion} onReview={(batch, decision) => void review(batch, decision)}
          onProgress={(batch, item, action) => void progress(batch, item, action)}
          onEscalate={onEscalate ? (batch, item) => void save(batch, async () => onEscalate(item)) : undefined} />
      </aside>
    </div>
    {dialogs.view}
  </div>;
}
