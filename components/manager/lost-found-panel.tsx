"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, ClipboardList, Info, Package, PackageCheck, RefreshCw, ShieldCheck } from "lucide-react";
import { useActionDialogs } from "@/components/ui/action-dialogs";
import { HavenSearchInput } from "@/components/ui/haven-data-controls";
import { HavenSelect } from "@/components/ui/haven-select";
import { PageHeader } from "@/components/ui/Navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TablePagination, useTablePagination } from "@/components/ui/table-pagination";
import { fetchPublic, readResponse } from "@/lib/client-errors";
import { ERROR_COPY, userMessage } from "@/lib/errors";
import { foundMetrics, foundReference, manilaDateKey, manilaInputToIso, type FoundEvent, type FoundItem } from "@/lib/operations";
import type { Role } from "@/lib/types";
import "./lost-found.css";

const MANILA = "Asia/Manila";
const stamp = (value: string) => new Date(value).toLocaleString("en-PH", {
  timeZone: MANILA, year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
});
const humanize = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());

const STATUS_META: Record<string, { label: string; badge: string }> = {
  found: { label: "Found", badge: "submitted" },
  secured: { label: "In custody", badge: "info" },
  claim_pending: { label: "Open claim", badge: "pending" },
  release_authorized: { label: "Ready for release", badge: "approved" },
  released: { label: "Released", badge: "completed" },
  disposed: { label: "Disposed", badge: "disabled" },
};
const metaFor = (status: string) => STATUS_META[status] ?? { label: humanize(status), badge: "info" };

const ACTION_LABEL: Record<string, string> = {
  found: "Found item recorded",
  secure: "Item secured",
  claim: "Claim recorded",
  authorize_release: "Release authorized",
  reject_claim: "Claim declined",
  release: "Item released",
  dispose: "Item disposed",
  take_custody: "Custody acknowledged",
};

type QueueFilter = "all" | "in_custody" | "found" | "secured" | "claim_pending" | "release_authorized" | "released" | "disposed";
type DateFilter = "all" | "today" | "7d" | "30d";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "in_custody", label: "In custody" },
  { value: "found", label: "Found" },
  { value: "secured", label: "Secured" },
  { value: "claim_pending", label: "Open claim" },
  { value: "release_authorized", label: "Ready for release" },
  { value: "released", label: "Released" },
  { value: "disposed", label: "Disposed" },
];
const DATE_OPTIONS = [
  { value: "all", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

function matchesQueue(status: string, queue: QueueFilter) {
  if (queue === "all") return true;
  if (queue === "in_custody") return status === "found" || status === "secured";
  return status === queue;
}

function readiness(item: FoundItem) {
  return [
    { label: "Secured in storage", done: item.status !== "found" && Boolean(item.storage_location) },
    { label: "Claim recorded", done: ["claim_pending", "release_authorized", "released"].includes(item.status) },
    { label: "Release authorized", done: ["release_authorized", "released"].includes(item.status) },
    { label: "Handover recorded", done: item.status === "released" },
  ];
}

type DetailAction = { label: string; action: string; tone: "primary" | "secondary" | "danger" };

function actionsFor(role: Role, item: FoundItem): DetailAction[] {
  const actions: DetailAction[] = [];
  if (role === "housekeeping" && item.status === "found") actions.push({ label: "Secure item", action: "secure", tone: "primary" });
  if (role === "front_desk" && item.status === "secured") actions.push({ label: "Record claim", action: "claim", tone: "primary" });
  if (role === "manager" && item.status === "claim_pending") {
    actions.push({ label: "Authorize release", action: "authorize_release", tone: "primary" });
    actions.push({ label: "Decline claim", action: "reject_claim", tone: "danger" });
  }
  if (role === "front_desk" && item.status === "release_authorized") actions.push({ label: "Release item", action: "release", tone: "primary" });
  if (role === "manager" && item.status === "secured") actions.push({ label: "Record disposition", action: "dispose", tone: "secondary" });
  if (["secured", "claim_pending", "release_authorized"].includes(item.status)) actions.push({ label: "Take custody", action: "take_custody", tone: "secondary" });
  return actions;
}

export default function LostFoundPanel({ role }: { role: Role }) {
  const [data, setData] = useState<{ items: FoundItem[]; events: FoundEvent[] } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<QueueFilter>("all");
  const [location, setLocation] = useState("all");
  const [date, setDate] = useState<DateFilter>("all");
  const [search, setSearch] = useState("");
  const [now] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const dialogs = useActionDialogs();
  const backRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetchPublic("/api/staff/lost-found", { cache: "no-store", signal });
      const body = await readResponse(response);
      if (!response.ok) throw new Error(body.message ?? body.error);
      setData(body.data);
      setError("");
    } catch (caught) {
      if (!signal?.aborted) setError(userMessage(caught, "Unable to load. Try again."));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) void load(controller.signal); });
    return () => controller.abort();
  }, [load]);

  async function save(payload: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetchPublic("/api/staff/lost-found", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const body = await readResponse(response);
      if (!response.ok) throw new Error(body.message ?? body.error);
      setMessage("Item history updated.");
      await load();
    } catch (caught) {
      setError(userMessage(caught, ERROR_COPY.unknown));
    } finally {
      setBusy(false);
    }
  }

  async function record() {
    const value = await dialogs.askForm({
      title: "Record a found item",
      description: "Describe the item and where it was found. Keep identity documents, card numbers and guest contact details out of the description.",
      fields: [
        { key: "description", label: "Item description", type: "textarea", required: true },
        { key: "location", label: "Found location", type: "text", required: true },
        { key: "foundAt", label: "Found at (Manila)", type: "datetime-local", required: true },
      ],
      submitText: "Record item",
    });
    if (!value) return;
    try {
      await save({ ...value, action: "record", id: crypto.randomUUID(), foundAt: manilaInputToIso(String(value.foundAt)) });
    } catch (caught) {
      setError(userMessage(caught, "Check the found time."));
    }
  }

  async function act(item: FoundItem, action: string) {
    const titles: Record<string, string> = {
      secure: "Secure item", claim: "Record claim", authorize_release: "Authorize release", reject_claim: "Decline claim",
      release: "Release to verified claimant", dispose: "Authorize disposition", take_custody: "Acknowledge physical custody",
    };
    if (action === "release" || action === "dispose") {
      const release = action === "release";
      const confirmation = await dialogs.askForm({
        title: titles[action],
        fields: [
          {
            key: "note", label: "Required note", type: "textarea", required: true,
            validation: value => {
              const length = String(value).trim().length;
              return length >= 3 && length <= 500 ? null : "Enter a note of 3 to 500 characters.";
            },
          },
          {
            key: "verified", type: "checkbox", required: true,
            label: release
              ? "I verified the claimant's identity and am handing over the item."
              : "I checked the hotel's retention policy and have authority to dispose of this item.",
            validation: value => value === true ? null : "Confirm before continuing.",
          },
        ],
        submitText: release ? "Confirm release" : "Confirm disposition",
      });
      if (confirmation?.verified !== true) return;
      await save({ action, id: item.id, version: item.version, note: confirmation.note, identityVerified: true });
      return;
    }
    const note = await dialogs.askPrompt({
      title: titles[action],
      message: action === "secure"
        ? "Enter the secure storage location."
        : action === "take_custody"
          ? "Confirm that you physically hold the item. Record its storage location and the staff member who handed it over."
          : action === "claim"
            ? "Record the claim verification reference. Do not enter ID numbers or payment details."
            : "Record the verification, approval or disposition reason. This history is retained.",
      label: "Required note", multiline: true, required: true,
    });
    if (!note) return;
    await save({ action, id: item.id, version: item.version, note });
  }

  const items = useMemo(() => data?.items ?? [], [data]);
  const metrics = useMemo(() => foundMetrics(items), [items]);

  const locationOptions = useMemo(() => {
    const locations = [...new Set(items.map((item) => item.found_location).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return [{ value: "all", label: "All locations" }, ...locations.map((value) => ({ value, label: value }))];
  }, [items]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (!matchesQueue(item.status, queue)) return false;
      if (location !== "all" && item.found_location !== location) return false;
      if (date !== "all") {
        const found = Date.parse(item.found_at);
        if (date === "today") {
          if (manilaDateKey(item.found_at) !== manilaDateKey(new Date(now))) return false;
        } else if (found < now - (date === "7d" ? 7 : 30) * 86_400_000) return false;
      }
      if (term) {
        const claimNote = role === "housekeeping" ? null : item.claimant_note;
        const haystack = [item.description, foundReference(item.id), item.found_location, item.custodian_name, item.storage_location, claimNote].join(" ").toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    }).sort((left, right) => Date.parse(right.found_at) - Date.parse(left.found_at));
  }, [items, queue, location, date, search, now, role]);

  const pager = useTablePagination(rows, 10);
  const selected = rows.find((item) => item.id === selectedId) ?? rows[0] ?? null;
  const selectedMeta = selected ? metaFor(selected.status) : null;
  const selectedEvents = useMemo(() => {
    if (!selected) return [];
    return (data?.events ?? []).filter((event) => event.item_id === selected.id).sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at));
  }, [data, selected]);
  const selectedActions = selected ? actionsFor(role, selected) : [];
  const securedCount = items.filter((item) => item.status === "secured").length;

  const metricCards = [
    { key: "in_custody" as const, label: "In custody", value: metrics.inCustody, hint: "Found and secured items", icon: Package },
    { key: "claim_pending" as const, label: "Open claims", value: metrics.openClaims, hint: "Awaiting manager decision", icon: ClipboardList },
    { key: "release_authorized" as const, label: "Ready for release", value: metrics.readyForRelease, hint: "Handover after verification", icon: ShieldCheck },
    { key: "released" as const, label: "Released", value: metrics.released, hint: "Recorded handovers", icon: CheckCircle2 },
  ];

  function changeQueue(value: string) {
    setQueue(value as QueueFilter);
    setDetailOpen(false);
    setMessage("");
    pager.setPage(1);
  }

  function changeLocation(value: string) {
    setLocation(value);
    setDetailOpen(false);
    pager.setPage(1);
  }

  function changeDate(value: string) {
    setDate(value as DateFilter);
    setDetailOpen(false);
    pager.setPage(1);
  }

  function select(item: FoundItem) {
    setSelectedId(item.id);
    setDetailOpen(true);
    requestAnimationFrame(() => backRef.current?.focus());
  }

  function backToQueue() {
    setDetailOpen(false);
    if (selected) requestAnimationFrame(() => rowRefs.current.get(selected.id)?.focus());
  }

  function startClaim() {
    if (!securedCount) {
      setMessage("No secured items are ready for a claim.");
      return;
    }
    changeQueue("secured");
    setMessage("Select a secured item to record its claim.");
  }

  const pageActions = role === "housekeeping"
    ? <button className="btn btn-primary" disabled={busy || !data} onClick={() => void record()}>Record found item</button>
    : role === "front_desk"
      ? <button className="btn btn-primary" disabled={busy || !data} onClick={startClaim}>Record claim</button>
      : undefined;

  return <section className="lost-found">
    {dialogs.view}
    <PageHeader
      eyebrow="Guest belongings"
      title="Lost & Found"
      subtitle="Secure custody, documented claims and an accountable release."
      actions={pageActions}
    />

    {(error || message) && <p className={`lf-feedback${error ? " is-error" : ""}`} role={error ? "alert" : "status"}>
      {error || message}
      {error && <button type="button" className="lf-text-action" onClick={() => void load()}>Retry</button>}
    </p>}

    <div className="lf-metrics" role="group" aria-label="Lost and found summary">
      {metricCards.map(({ key, label, value, hint, icon: Icon }) => <button
        key={key}
        type="button"
        className="lf-metric"
        aria-pressed={queue === key}
        aria-label={`${label}, ${value}`}
        onClick={() => changeQueue(queue === key ? "all" : key)}
      >
        <span>{label}</span><Icon size={17} aria-hidden="true" /><strong>{value}</strong><small>{hint}</small>
      </button>)}
    </div>

    <div className="lf-workspace" data-detail-open={detailOpen && selected?.id === selectedId ? "true" : "false"}>
      <section className="lf-panel lf-queue" aria-label="Lost and found register">
        <header className="lf-panel-head">
          <div><h2>Claims &amp; reported items</h2><p>Newest reports first. Select an item to review custody.</p></div>
          <button type="button" className="lf-refresh" aria-label="Refresh items" disabled={busy} onClick={() => void load()}>
            <RefreshCw size={15} aria-hidden="true" /><span>Refresh</span>
          </button>
        </header>

        <div className="lf-toolbar">
          <HavenSearchInput
            value={search}
            onValueChange={(value) => { setSearch(value); pager.setPage(1); }}
            label="Search items"
            placeholder="Search item, reference, location or custodian"
            debounceMs={0}
          />
          <div className="lf-filters">
            <HavenSelect value={queue} onChange={changeQueue} options={STATUS_OPTIONS} ariaLabel="Status" />
            <HavenSelect value={location} onChange={changeLocation} options={locationOptions} ariaLabel="Location" />
            <HavenSelect value={date} onChange={changeDate} options={DATE_OPTIONS} ariaLabel="Found date" />
          </div>
        </div>

        <div className="lf-queue-meta">
          <span>{rows.length} {rows.length === 1 ? "item" : "items"}</span>
          <span>Latest 100 records</span>
        </div>

        {!data && !error ? <div className="lf-empty" role="status"><h3>Loading item register…</h3><p>Retrieving the latest custody records.</p></div>
          : pager.rows.length ? <div className="lf-table-wrap">
            <table className="lf-table">
              <caption className="sr-only">Lost and found items</caption>
              <thead><tr><th scope="col">Reference</th><th scope="col">Item</th><th scope="col" className="lf-col-location">Location</th><th scope="col" className="lf-col-found">Found</th><th scope="col">Status</th></tr></thead>
              <tbody>{pager.rows.map((item) => {
                const meta = metaFor(item.status);
                return <tr key={item.id} data-selected={selected?.id === item.id ? "true" : "false"}>
                  <td>{foundReference(item.id)}</td>
                  <td>
                    <button
                      type="button"
                      className="lf-row-button"
                      ref={(node) => { if (node) rowRefs.current.set(item.id, node); else rowRefs.current.delete(item.id); }}
                      aria-current={selected?.id === item.id ? "true" : undefined}
                      aria-label={`Open ${item.description}`}
                      onClick={() => select(item)}
                    >{item.description}</button>
                  </td>
                  <td className="lf-col-location">{item.found_location}</td>
                  <td className="lf-col-found"><time dateTime={item.found_at}>{stamp(item.found_at)}</time></td>
                  <td><StatusBadge status={meta.badge} label={meta.label} size="sm" /></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
            : <div className="lf-empty">
              <h3>No matching items</h3>
              <p>Try another search or clear the status, location and date filters.</p>
              <button type="button" className="lf-text-action" onClick={() => { setSearch(""); setQueue("all"); setLocation("all"); setDate("all"); pager.setPage(1); }}>Clear filters</button>
            </div>}

        {rows.length > 0 && <TablePagination
          page={pager.page}
          pageCount={pager.pageCount}
          start={pager.start}
          end={pager.end}
          total={pager.total}
          onPageChange={pager.setPage}
          noun="items"
          note="Counts cover the latest 100 records"
        />}
      </section>

      <section className="lf-panel lf-detail" aria-label="Item detail">
        {selected && selectedMeta ? <>
          <header className="lf-detail-head">
            <button ref={backRef} type="button" className="lf-back" onClick={backToQueue}>
              <ArrowLeft size={15} aria-hidden="true" />Back to items
            </button>
            <div className="lf-detail-title">
              <span className="lf-reference">{foundReference(selected.id)}</span>
              <h2>{selected.description}</h2>
              <StatusBadge status={selectedMeta.badge} label={selectedMeta.label} size="sm" />
            </div>
          </header>

          <div className="lf-detail-body">
            <dl className="lf-facts">
              <div><dt>Found location</dt><dd>{selected.found_location}</dd></div>
              <div><dt>Date found</dt><dd>{stamp(selected.found_at)}</dd></div>
              <div><dt>Current custodian</dt><dd>{selected.custodian_name ?? "Staff member"}</dd></div>
              <div><dt>Storage</dt><dd>{selected.storage_location ?? "Not secured yet"}</dd></div>
              <div><dt>Last update</dt><dd>{stamp(selectedEvents.at(-1)?.created_at ?? selected.found_at)}</dd></div>
            </dl>

            {selected.status === "disposed"
              ? <div className="lf-callout"><Info size={16} aria-hidden="true" /><p>Disposed after custody review. The action history is retained for audit.</p></div>
              : <section className="lf-section">
                <h3>Release readiness</h3>
                <ul className="lf-checklist">
                  {readiness(selected).map((step) => <li key={step.label} data-done={step.done ? "true" : "false"}>
                    {step.done ? <Check size={14} aria-hidden="true" /> : <PackageCheck size={14} aria-hidden="true" />}
                    <span>{step.label}</span>
                    <small>{step.done ? "Recorded" : "Pending"}</small>
                  </li>)}
                </ul>
              </section>}

            {role !== "housekeeping" && selected.claimant_note ? <section className="lf-section">
              <h3>Claim note</h3>
              <p className="lf-note">{selected.claimant_note}</p>
            </section> : null}

            <section className="lf-section">
              <h3>Chain of custody</h3>
              {selectedEvents.length ? <ol className="lf-timeline" aria-label="Chain of custody">
                {selectedEvents.map((event) => <li key={event.id}>
                  <div>
                    <strong>{ACTION_LABEL[event.action] ?? humanize(event.action)}</strong>
                    <span>{event.actor_name ?? "Staff member"}</span>
                    <time dateTime={event.created_at}>{stamp(event.created_at)}</time>
                    <p>{event.note}</p>
                  </div>
                </li>)}
              </ol> : <p className="lf-muted">No custody events recorded yet.</p>}
            </section>
          </div>

          <footer className="lf-actions">
            <p>{selectedActions.length ? "Every action requires a note and is saved to the custody history." : "No action required at this stage."}</p>
            <div>
              {selectedActions.map((action) => <button
                key={action.action}
                type="button"
                className={`lf-action ${action.tone}`}
                disabled={busy}
                onClick={() => void act(selected, action.action)}
              >{action.label}</button>)}
            </div>
          </footer>
        </> : <div className="lf-no-selection">
          <Package size={26} aria-hidden="true" />
          <h2>Select an item</h2>
          <p>Choose an item from the register to review its facts and custody history.</p>
        </div>}
      </section>
    </div>
  </section>;
}
