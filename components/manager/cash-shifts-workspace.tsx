"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Banknote, Check, ChevronRight, Clock3, Filter, RefreshCw, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import CashCountPanel, { type CashCountPresentation } from "./cash-count-panel";
import CashCloseNextSteps from "./cash-close-next-steps";
import { Modal } from "@/components/ui/Modal";
import { TablePagination, useTablePagination } from "@/components/ui/table-pagination";
import { canOperateCashShift, canReconcileFinancials } from "@/lib/permissions";
import { cashDate, cashDifference, cashDuration, cashMoney, cashNumber, filterCashHistory, selectCashShifts, shiftCashBasis, type CashRecord } from "@/lib/cash-shift-display";
import type { AccountingLedger } from "@/lib/accounting";
import type { OperationalStaff, ShiftHandover } from "@/lib/operations";
import type { Role } from "@/lib/types";
import "./cash-shifts-workspace.css";

type Props = {
  ledger: AccountingLedger | null; actorId: string; role: Role;
  search: string; setSearch: (value: string) => void;
  onOpen: () => void; onRefresh: () => void;
  onOpenHandovers: (id?: string) => void;
  onCreateHandover: (shift: CashRecord) => void;
  onOpenReport: (date: string) => void;
  refreshError?: string;
};
type MovementFilter = "all" | "collection" | "refund";
const text = (value: unknown, fallback = "Not supplied") => typeof value === "string" && value.trim() ? value.replaceAll("_", " ") : fallback;
const shortId = (row: CashRecord) => String(row.id).slice(0, 8);
const stateLabel = (row: CashRecord) => row.status === "open" ? "Open" : row.status === "closed" ? "Awaiting reconciliation" : row.status === "reconciled" ? "Reconciled" : "Status unavailable";

function RecordedCount({ expected, counted, variance }: { expected: unknown; counted: unknown; variance: unknown }) {
  const difference = cashDifference(variance);
  return <dl className="cash-recorded-count" aria-label="Recorded cash count">
    <div><dt>Expected at close</dt><dd>{cashMoney(expected)}</dd></div>
    <div><dt>Counted at close</dt><dd>{cashMoney(counted)}</dd></div>
    <div><dt>{difference.label}</dt><dd>{cashMoney(difference.amount)}</dd></div>
  </dl>;
}

function DrawerStatus({ drawer, count }: { drawer: CashRecord; count: CashCountPresentation }) {
  const difference = cashDifference(count.variance);
  let title = "Count needed to close";
  let description = count.expanded ? "Expected cash is based on the drawer’s ledger." : count.draftStatus;
  let status = "Not counted";
  if (!count.mayClose) {
    title = "Drawer opened by another cashier";
    description = text(drawer.staff_name, "The opener") + " owns this drawer. Only the opener or Accounting can close it.";
    status = "";
  } else if (count.expected === null) {
    title = "Expected cash is unavailable";
    description = "Refresh the ledger before closing.";
    status = "";
  } else if (count.counted !== null) {
    title = difference.label + (difference.amount ? " " + cashMoney(difference.amount) : "");
    description = count.expanded ? "Review your physical count before closing." : count.draftStatus;
    status = "Count entered";
  }
  return <div className="cash-drawer-status">
    <span className="cash-status-icon"><Clock3 size={16} aria-hidden="true" /></span>
    <div><strong>{title}</strong><small>{description}</small></div>
    {status && <span>{status}</span>}
  </div>;
}

function CashMovements({ shift, ledger, onCurrent }: { shift: CashRecord; ledger: AccountingLedger; onCurrent?: () => void }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<MovementFilter>("all");
  const rows = useMemo(() => [...shiftCashBasis(shift, ledger.transactions).linked].sort((a, b) => (Date.parse(String(b.created_at)) || 0) - (Date.parse(String(a.created_at)) || 0)), [shift, ledger.transactions]);
  const filtered = useMemo(() => rows.filter(row => {
    const matchesKind = kind === "all" || (kind === "refund" ? row.purpose === "refund" : row.purpose !== "refund");
    const searchable = [row.purpose, row.reservation_id, row.reference, row.method, row.received_by_name].join(" ").toLowerCase();
    return matchesKind && searchable.includes(query.trim().toLowerCase());
  }), [rows, query, kind]);
  const page = useTablePagination(filtered);
  const hasFilters = Boolean(query || kind !== "all");
  function clearFilters() {
    setQuery("");
    setKind("all");
    page.setPage(1);
  }
  return <section className="cash-surface cash-movements" aria-labelledby="cash-movements-heading">
    <header className="cash-panel-heading">
      <div>
        <p className="cash-section-label">{shift.status === "open" ? "Current drawer" : "Closed drawer"} · #{shortId(shift)}</p>
        <h2 id="cash-movements-heading">Recent cash activity</h2>
        <p>Payments and payouts linked to this drawer. Times shown in Manila time.</p>
      </div>
      {onCurrent && <button className="cash-text-action" onClick={onCurrent}>Return to drawer overview</button>}
      {hasFilters && <button className="cash-text-action" onClick={clearFilters}>View all movements<ChevronRight size={14} aria-hidden="true" /></button>}
    </header>
    <div className="cash-activity-controls">
      <label className="cash-activity-search"><Search size={15} aria-hidden="true" /><span className="cash-visually-hidden">Search activity</span><input type="search" placeholder="Reservation, reference or method" value={query} onChange={event => { setQuery(event.target.value); page.setPage(1); }} /></label>
      <label className="cash-activity-filter"><Filter size={15} aria-hidden="true" /><span className="cash-visually-hidden">Activity type</span><select value={kind} onChange={event => { setKind(event.target.value as MovementFilter); page.setPage(1); }}><option value="all">All activity</option><option value="collection">Collections</option><option value="refund">Cash payouts</option></select></label>
    </div>
    {filtered.length ? <div className="cash-table-frame" role="region" aria-label="Cash movements table" tabIndex={0}><table aria-label="Shift cash movements"><thead><tr><th scope="col">Time</th><th scope="col">Reservation / reference</th><th scope="col">Activity</th><th scope="col">Method</th><th scope="col" className="cash-num">Amount</th></tr></thead>
      <tbody>{page.rows.map(row => {
        const amount = cashNumber(row.amount);
        const refund = row.purpose === "refund";
        return <tr key={String(row.id)}>
          <td>{cashDate(row.created_at)}</td>
          <td><strong>{text(row.reservation_id)}</strong><small>{text(row.reference)}</small></td>
          <td>
            <span className={`cash-movement-type ${refund ? "cash-payout-type" : ""}`}>
              {refund ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownLeft size={14} aria-hidden="true" />}
              {refund ? "Cash payout" : "Collection"}
            </span>
            {row.status !== "paid" && <small>{text(row.status)} · excluded from drawer balance</small>}
          </td>
          <td>{text(row.method)}<small>Recorded by {text(row.received_by_name)}</small></td>
          <td className={`cash-num ${refund ? "cash-payout-amount" : ""}`}>{amount === null ? "—" : `${refund ? "−" : "+"}${cashMoney(amount)}`}</td>
        </tr>;
      })}</tbody></table></div> : <p className="cash-empty">{rows.length ? "No cash activity matches this search or filter. Try another term." : "No payment records are linked to this drawer in the ledger."}</p>}
    <TablePagination {...page} onPageChange={page.setPage} noun="cash movements" allTotal={rows.length} note="Only paid, linked records enter the drawer balance." />
  </section>;
}

function ReconciliationDialog({ shift, onClose, onRefresh, onSaved }: { shift: CashRecord; onClose: () => void; onRefresh: () => void; onSaved: (message: string) => void }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const hasVariance = cashNumber(shift.variance) !== 0;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (hasVariance && notes.trim().length < 3) { setError("Explain the recorded variance before reconciling this shift."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/accounting/cash-shifts/${shift.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reconcile", notes: notes.trim() || undefined }) });
      const body = await response.json();
      if (!response.ok) { if (response.status === 409) onRefresh(); throw new Error(body.error || "Unable to reconcile. Your note is preserved; retry."); }
      onSaved(`Shift #${shortId(shift)} reconciled. Its recorded variance remains ${cashMoney(shift.variance)}.`); onClose(); onRefresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to reconcile. Retry."); }
    finally { setBusy(false); }
  }
  return <Modal isOpen onClose={() => { if (!busy) onClose(); }} title="Reconcile cash shift" description={`Shift #${shortId(shift)} · Accounting review`} initialFocusRef={input} className="cash-count-dialog" closeOnEscape={!busy} closeOnOverlayClick={!busy} showCloseButton={!busy}>
    <RecordedCount expected={shift.expected_cash} counted={shift.actual_cash} variance={shift.variance} />
    <form className="hms-cash-count" onSubmit={submit}><p>Review records the difference without changing guest payments or the original count.</p><label>Reconciliation notes{hasVariance ? " (required)" : " (optional)"}<textarea ref={input} rows={3} maxLength={400} required={hasVariance} value={notes} disabled={busy} onChange={e => setNotes(e.target.value)} /></label>{error && <p role="alert">{error}</p>}<div className="btn-row"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? "Recording reconciliation…" : "Record reconciliation"}</button></div></form>
  </Modal>;
}

export default function CashShiftsWorkspace({ ledger, actorId, role, search, setSearch, onOpen, onRefresh, onOpenHandovers, onCreateHandover, onOpenReport, refreshError = "" }: Props) {
  const [status, setStatus] = useState("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [historySelection, setHistorySelection] = useState<string | null>(null);
  const [movementId, setMovementId] = useState<string | null>(null);
  const [reconcileId, setReconcileId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [handovers, setHandovers] = useState<{ staff: OperationalStaff[]; handovers: ShiftHandover[] } | null>(null);
  const [handoverError, setHandoverError] = useState("");
  const [handoverRetry, setHandoverRetry] = useState(0);
  const historyRef = useRef<HTMLElement>(null);
  const allowed = canOperateCashShift(role), mayReconcile = canReconcileFinancials(role);
  const { active, latestClosed } = selectCashShifts(ledger?.cashShifts ?? []);
  const current = active ?? latestClosed;
  const matching = filterCashHistory(ledger?.cashShifts ?? [], search, status);
  const history = useTablePagination(matching);
  const selectedHistory = history.rows.find(row => row.id === historySelection);
  const detail = ledger?.cashShifts.find(row => row.id === detailId);
  const reconcile = ledger?.cashShifts.find(row => row.id === reconcileId && row.status === "closed");
  const movement = ledger?.cashShifts.find(row => row.id === movementId) ?? current;
  const pending = ledger?.cashShifts.filter(row => row.status === "closed") ?? [];
  const activityRef = useRef<HTMLElement>(null);

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    let live = true;
    async function load() {
      try {
        const response = await fetch("/api/staff/handovers", { cache: "no-store", signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !Array.isArray(body.data?.handovers) || !Array.isArray(body.data?.staff)) throw new Error(body.error || "Unable to load cash handovers.");
        if (live) { setHandovers(body.data); setHandoverError(""); }
      } catch (cause) { if (live && !controller.signal.aborted) setHandoverError(cause instanceof Error ? cause.message : "Unable to load handovers."); }
    }
    void load();
    return () => { live = false; controller.abort(); };
  }, [allowed, actorId, role, handoverRetry]);

  const openHistory = useCallback(() => {
    setStatus("closed"); setSearch(""); history.setPage(1);
    historyRef.current?.scrollIntoView?.({ block: "start", behavior: "instant" }); historyRef.current?.focus();
  }, [history, setSearch]);
  if (!allowed) return <section className="cash-workspace"><p>Cash handling access required.</p></section>;
  if (!ledger) return <section className="cash-workspace cash-surface"><h1>Cash &amp; Shifts</h1><p>The financial ledger is unavailable. No current drawer balance can be confirmed.</p><button className="cash-button" onClick={onRefresh}>Retry ledger</button></section>;

  const basis = current ? shiftCashBasis(current, ledger.transactions) : null;
  const linkedHandovers = handovers?.handovers.filter(row => row.source_type === "cash_shift") ?? [];
  const outstandingHandovers = linkedHandovers.filter(row => !row.resolved_at).sort((a, b) =>
    Number(!b.acknowledged_at && b.follow_up_user_id === actorId) - Number(!a.acknowledged_at && a.follow_up_user_id === actorId)
    || Number(b.source_id === active?.id) - Number(a.source_id === active?.id));
  const personalPending = outstandingHandovers.filter(row => !row.acknowledged_at && row.follow_up_user_id === actorId);
  const nameOf = (id: string) => handovers?.staff.find(person => person.id === id)?.name ?? "Staff name not supplied";
  const filter = (value: string) => { setStatus(value); history.setPage(1); };
  const saved = (result?: string) => { if (result) setMessage(result); onRefresh(); };
  const openReconcile = (row: CashRecord) => { setDetailId(null); setReconcileId(String(row.id)); };
  const showActivity = (id: string) => {
    setMovementId(id);
    setDetailId(null);
    requestAnimationFrame(() => {
      activityRef.current?.scrollIntoView?.({ block: "start" });
      activityRef.current?.focus();
    });
  };

  return <div className="cash-workspace">
    {message && <p className="cash-feedback" role="status">{message}</p>}
    <CashCountPanel ledger={ledger} actorId={actorId} role={role} onSaved={saved} onStale={onRefresh} renderWorkspace={(count: CashCountPresentation) => {
      const physicalCountRecorded = active ? count.counted !== null : cashNumber(latestClosed?.actual_cash) !== null;
      const paidActivity = basis?.linked.filter(row => row.status === "paid") ?? [];
      const payouts = paidActivity.filter(row => row.purpose === "refund").length;
      const collections = paidActivity.length - payouts;
      const readinessSteps = [
        { label: "Drawer opened", detail: current ? `Opened by ${text(current.staff_name, "Staff name not supplied")}` : "Open with a counted float", complete: Boolean(current) },
        { label: "Cash activity recorded", detail: current ? `${collections} collection${collections === 1 ? "" : "s"} · ${payouts} payout${payouts === 1 ? "" : "s"}` : "Paid cash activity appears here", complete: paidActivity.length > 0 },
        { label: "Physical count", detail: physicalCountRecorded ? active ? "Count entered. Review before close." : "Recorded at close" : "Required before closing the drawer", complete: physicalCountRecorded },
      ];
      const readinessComplete = readinessSteps.filter(step => step.complete).length;
      const readinessTitle = active ? "Close readiness" : current ? "Latest shift summary" : "Close readiness";
      const readinessCount = active || !current ? `${readinessComplete} of 3` : "Closed";

      return <>
        <header className="cash-workspace-heading">
          <div>
            <h1>Cash &amp; Shifts</h1>
            <p>Track the shared drawer, count cash, and review completed shifts.</p>
            {refreshError && <p className="cash-refresh-error" role="alert">Refresh failed: {refreshError} Values below are from the last successful ledger read.</p>}
          </div>
          <div className="cash-heading-actions">
            <button className="cash-button" aria-label="Refresh cash ledger" onClick={onRefresh}><RefreshCw size={16} aria-hidden="true" />Refresh</button>
            {!active && <button className="cash-button cash-primary" onClick={onOpen}>Open cash shift<ArrowRight size={16} aria-hidden="true" /></button>}
          </div>
        </header>

        {personalPending.length > 0 && !handoverError && <div className="cash-attention">
          <TriangleAlert size={17} aria-hidden="true" />
          <p>{personalPending.length} cash handover{personalPending.length === 1 ? " awaits" : "s await"} your acknowledgement.</p>
        </div>}

        <div className="cash-operational-grid">
            <section className="cash-surface cash-current" aria-labelledby="cash-current-heading" id="shared-drawer-count">
              <div className="cash-section-heading">
                <div>
                  <p className="cash-section-label">CURRENT DRAWER</p>
                  <h2 id="cash-current-heading">{active ? text(active.location, "Shared cash drawer") : "No drawer is open"}</h2>
                </div>
                <span className={`cash-status ${active ? "cash-status-open" : ""}`}>{active ? "Open" : "Closed"}</span>
              </div>
              {active ? <>
                <div className="cash-person">
                  <span className="cash-avatar" aria-hidden="true">{text(active.staff_name, "?").trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("")}</span>
                  <div><strong>{text(active.staff_name, "Staff name not supplied")}</strong><p>Opened {cashDate(active.opened_at)} · Shift #{shortId(active)}</p></div>
                  <span className="cash-elapsed"><Clock3 size={14} aria-hidden="true" />{cashDuration(active, now)}</span>
                </div>
                <div className="cash-expected-row">
                  <div><span>Expected cash in drawer</span><strong>{cashMoney(count.expected)}</strong><small>Opening float + cash received − cash payouts</small></div>
                  {count.mayClose ? !count.expanded && <button ref={count.triggerRef} type="button" className="cash-button cash-primary" disabled={count.busy} onClick={count.review}><Banknote size={17} aria-hidden="true" />Record cash count</button>
                    : <button type="button" className="cash-button" onClick={() => setDetailId(String(active.id))}>View drawer details</button>}
                </div>
                <dl className="cash-basis">
                  <div><dt>Opening float</dt><dd>{cashMoney(active.opening_amount)}</dd></div>
                  <div><dt>Cash received</dt><dd>{cashMoney(basis?.incoming)}</dd></div>
                  <div><dt>Cash payouts</dt><dd>{cashMoney(basis?.outgoing)}</dd></div>
                </dl>
                {basis && !basis.agrees && <p className="cash-basis-warning">The payment breakdown differs from this ledger snapshot. Refresh to review the recorded net collections.</p>}
                <DrawerStatus drawer={active} count={count} />
                {count.editor}
              </> : <>
                <p className="cash-closed-note">Open a shift with a counted float to accept cash payments.</p>
                {latestClosed && <div className="cash-last-close">
                  <div className="cash-section-heading">
                    <div><h3>Latest closed shift</h3><p>{text(latestClosed.staff_name)} · {cashDate(latestClosed.closed_at)}</p></div>
                    <button className="cash-text-action" onClick={() => setDetailId(String(latestClosed.id))}>View shift record<ChevronRight size={14} aria-hidden="true" /></button>
                  </div>
                  <RecordedCount expected={latestClosed.expected_cash} counted={latestClosed.actual_cash} variance={latestClosed.variance} />
                </div>}
              </>}
            </section>
          <aside className="cash-side-rail">
            <section className="cash-surface cash-readiness" aria-labelledby="cash-readiness-heading">
              <header className="cash-panel-heading"><div><p className="cash-section-label">SHIFT CHECKLIST</p><h2 id="cash-readiness-heading">{readinessTitle}</h2></div><span className="cash-readiness-count">{readinessCount}</span></header>
              <ol className="cash-readiness-list">
                {readinessSteps.map((step, index) => <li key={step.label} className={step.complete ? "cash-step-complete" : ""}>
                  <span className="cash-readiness-icon" aria-hidden="true">{step.complete ? <Check size={13} /> : index + 1}</span>
                  <span><strong>{step.label}</strong><small>{step.detail}</small></span>
                </li>)}
              </ol>
              {mayReconcile && <div className="cash-accounting-note">
                <ShieldCheck size={16} aria-hidden="true" />
                <div><strong>Accounting review</strong><small>{pending.length ? `${pending.length} closed shift${pending.length === 1 ? "" : "s"} awaiting reconciliation` : "Reconcile a shift after the cash count and close."}</small>
                  {pending.length > 0 && <button type="button" className="cash-text-action" onClick={openHistory}>Review closed shifts<ChevronRight size={14} aria-hidden="true" /></button>}
                </div>
              </div>}
            </section>

            <section className="cash-surface cash-handovers" aria-labelledby="cash-handover-heading">
              <header className="cash-panel-heading"><div><p className="cash-section-label">TEAM FOLLOW-UP</p><h2 id="cash-handover-heading">Drawer handover</h2></div>{outstandingHandovers.length > 0 && <span className="cash-handover-count">{outstandingHandovers.length} open</span>}<button className="cash-text-action" aria-label="Open operational handover" onClick={() => onOpenHandovers()}>View all</button></header>
              {handoverError ? <div className="cash-empty" role="alert">Cash follow-up could not be confirmed: {handoverError} <button className="cash-text-action" onClick={() => setHandoverRetry(value => value + 1)}>Retry handovers</button></div> : !handovers ? <p className="cash-empty" role="status">Loading authorized handovers…</p> : <>
                {outstandingHandovers.length ? <ul className="cash-handover-list">{outstandingHandovers.slice(0, 1).map(row => <li key={row.id}><div className="cash-section-heading"><h3>{nameOf(row.submitted_by)} <ArrowRight size={14} aria-label="to" /> {nameOf(row.follow_up_user_id)}</h3><span className={`cash-status ${row.acknowledged_at ? "" : "cash-status-review"}`}>{row.acknowledged_at ? "Acknowledged · Unresolved" : "Awaiting acknowledgement"}</span></div><p>{row.summary}</p><small>{row.source_id === current?.id ? active ? "Current drawer" : "Latest closed drawer" : "Other cash shift"} · #{row.source_id.slice(0, 8)} · Submitted {cashDate(row.submitted_at)}</small><button className="cash-text-action" onClick={() => onOpenHandovers(row.id)}>View follow-up</button></li>)}</ul> : <p className="cash-empty">No unresolved cash follow-up appears in the recent authorized records. Older records are outside this list.</p>}
              </>}
              {latestClosed && !detail && <details className="cash-follow-up-disclosure">
                <summary>Post-close actions<ChevronRight size={14} aria-hidden="true" /></summary>
                <CashCloseNextSteps key={String(latestClosed.id)} shift={latestClosed} role={role} onCreateHandover={onCreateHandover} onOpenHandovers={onOpenHandovers} onOpenReport={onOpenReport} />
              </details>}
            </section>
          </aside>
        </div>
      </>;
    }} />

    <section ref={activityRef} tabIndex={-1} className="cash-activity-region" aria-label="Cash activity">
      {movement ? <CashMovements key={String(movement.id)} shift={movement} ledger={ledger} onCurrent={current && movement.id !== current.id ? () => setMovementId(null) : undefined} /> : <div className="cash-surface cash-movements"><header className="cash-panel-heading"><h2>Recent cash activity</h2></header><p className="cash-empty">Open a drawer to begin recording cash activity.</p></div>}
    </section>

    <section className="cash-history" ref={historyRef} tabIndex={-1} aria-labelledby="cash-history-heading">
      <div className="cash-surface cash-history-panel">
        <header className="cash-panel-heading">
          <div>
            <p className="cash-section-label">ALL DATES</p>
            <h2 id="cash-history-heading">Shift history</h2>
            <p>Drawer records and their reconciliation status.</p>
          </div>
          {mayReconcile && pending.length > 0 && <button className="cash-review-pill" onClick={openHistory}>{pending.length} awaiting reconciliation</button>}
        </header>
        <div className="cash-history-controls">
          <label>
            <Search size={15} aria-hidden="true" />
            <span className="cash-visually-hidden">Search shifts</span>
            <input type="search" value={search} placeholder="Cashier, shift ID or notes" onChange={event => { setSearch(event.target.value); history.setPage(1); }} />
          </label>
          <label>
            <Filter size={15} aria-hidden="true" />
            <span className="cash-visually-hidden">Shift status</span>
            <select value={status} onChange={event => filter(event.target.value)}>
              <option value="all">All shifts</option>
              <option value="open">Open</option>
              <option value="closed">Awaiting reconciliation</option>
              <option value="reconciled">Reconciled</option>
            </select>
          </label>
          {(search || status !== "all") && <button className="cash-text-action" onClick={() => { setSearch(""); filter("all"); }}>Clear filters</button>}
        </div>
        <div className="cash-table-frame" role="region" aria-label="Shift history table" tabIndex={0}>
          <table aria-label="Cash shift history">
            <thead><tr>
              <th scope="col">Shift</th><th scope="col">Date</th><th scope="col">Opened by</th>
              <th scope="col" className="cash-num">Expected</th><th scope="col" className="cash-num">Counted</th>
              <th scope="col">Status</th><th scope="col">Actions</th>
            </tr></thead>
            <tbody>{history.rows.map(row => {
              const open = row.status === "open";
              const expected = open ? shiftCashBasis(row, ledger.transactions).expected : row.expected_cash;
              const difference = cashDifference(open ? null : row.variance);
              const id = String(row.id);
              const selected = historySelection === id;
              const statusTone = open ? "cash-status-open" : row.status === "closed" ? "cash-status-review" : "cash-status-reconciled";
              return <tr key={id}>
                <td><strong>#{shortId(row)}</strong></td>
                <td>{cashDate(row.opened_at)}</td>
                <td><strong>{text(row.staff_name)}</strong><small>{text(row.location)}</small></td>
                <td className="cash-num">{cashMoney(expected)}</td>
                <td className="cash-num">
                  {open ? "Not recorded" : cashMoney(row.actual_cash)}
                  {!open && <small className={difference.amount ? "cash-recorded-difference" : undefined}>{difference.amount ? `${difference.label} ${cashMoney(difference.amount)}` : difference.label}</small>}
                </td>
                <td><span className={`cash-status ${statusTone}`}>{stateLabel(row)}</span></td>
                <td><div className="cash-row-actions">
                  <button className="cash-button" aria-expanded={selected} aria-label={`View shift ${id}`} onClick={() => setHistorySelection(selected ? null : id)}>{selected ? "Hide details" : "Details"}</button>
                  {row.status === "closed" && mayReconcile && <button className="cash-text-action" onClick={() => openReconcile(row)} aria-label={`Reconcile shift ${id}`}>Review</button>}
                </div></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {!matching.length && <p className="cash-empty">{ledger.cashShifts.length ? "No shifts match these filters." : "Shift records will appear here once you open a drawer."}</p>}
        {selectedHistory && <div className="cash-history-selection" role="region" aria-label={`Summary for shift ${shortId(selectedHistory)}`}>
          <div><strong>#{shortId(selectedHistory)} · {stateLabel(selectedHistory)}</strong><small>{text(selectedHistory.staff_name)} · {cashDate(selectedHistory.opened_at)}</small></div>
          <div className="cash-row-actions">
            <button className="cash-text-action" onClick={() => setDetailId(String(selectedHistory.id))}>Full shift record</button>
            <button className="cash-text-action" onClick={() => showActivity(String(selectedHistory.id))}>View cash activity</button>
          </div>
        </div>}
        <TablePagination {...history} onPageChange={history.setPage} noun="matching shifts" note={`${ledger.cashShifts.length} shifts across all dates and statuses.`} />
      </div>
      <p className="cash-history-total">Recorded net variance: <strong>{cashMoney(ledger.metrics.cashVariance)}</strong> across all closed and reconciled shifts.</p>
      <p className="cash-custody"><ShieldCheck size={16} aria-hidden="true" />Only the opener or Accounting can close the shared drawer.</p>
    </section>


    <Modal isOpen={Boolean(detail)} onClose={() => setDetailId(null)} title={detail ? `Cash shift #${shortId(detail)}` : "Cash shift"} className="cash-count-dialog" size="lg">
      {detail && <><p>{text(detail.staff_name)} · {text(detail.location)} · {stateLabel(detail)}</p><dl className="cash-detail-list">{[["Full shift ID", detail.id], ["Opened", cashDate(detail.opened_at)], ["Closed", detail.closed_at ? cashDate(detail.closed_at) : "Not closed"], ["Reconciled", detail.reconciled_at ? cashDate(detail.reconciled_at) : "Not reconciled"], ["Opening float", cashMoney(detail.opening_amount)], ["Net collected", cashMoney(detail.collected)], ["Expected cash", cashMoney(detail.status === "open" ? shiftCashBasis(detail, ledger.transactions).expected : detail.expected_cash)], ["Counted cash", detail.status === "open" ? "Not recorded" : cashMoney(detail.actual_cash)], ["Recorded variance", detail.status === "open" ? "Not recorded" : cashMoney(detail.variance)], ["Close notes", text(detail.close_notes, "No close note supplied")], ["Reconciliation notes", text(detail.reconciliation_notes, "No reconciliation note supplied")]].map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{String(value)}</dd></div>)}</dl>{detail.status !== "open" && <CashCloseNextSteps shift={detail} role={role} onCreateHandover={onCreateHandover} onOpenHandovers={onOpenHandovers} onOpenReport={onOpenReport} />}<div className="btn-row"><button className="cash-button" onClick={() => { showActivity(String(detail.id)); }}>View cash activity</button>{detail.status === "closed" && mayReconcile && <button className="cash-button cash-primary" onClick={() => openReconcile(detail)}>Reconcile shift</button>}</div></>}
    </Modal>

    {reconcile && mayReconcile && <ReconciliationDialog key={`reconcile:${String(reconcile.id)}`} shift={reconcile} onClose={() => setReconcileId(null)} onRefresh={onRefresh} onSaved={setMessage} />}
  </div>;
}
