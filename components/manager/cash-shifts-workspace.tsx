"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Circle, Clock3, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
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
const text = (value: unknown, fallback = "Not supplied") => typeof value === "string" && value.trim() ? value.replaceAll("_", " ") : fallback;
const shortId = (row: CashRecord) => String(row.id).slice(0, 8);
const stateLabel = (row: CashRecord) => row.status === "open" ? "Open" : row.status === "closed" ? "Awaiting reconciliation" : row.status === "reconciled" ? "Reconciled" : "Status unavailable";

function Comparison({ expected, counted, variance, draft }: { expected: unknown; counted: unknown; variance: unknown; draft: boolean }) {
  const difference = cashDifference(variance);
  return <dl className="cash-comparison" aria-label="Cash count comparison">
    <div className="cash-expected"><dt>Expected cash</dt><dd className={cashMoney(expected).length > 12 ? "cash-long-money" : undefined}>{cashMoney(expected)}</dd><small>{draft ? "Opening float + net cash collected" : "Recorded at close"}</small></div>
    <div><dt>Counted cash</dt><dd className={cashMoney(counted).length > 12 ? "cash-long-money" : undefined}>{cashMoney(counted)}</dd><small>{cashNumber(counted) === null ? "No physical count supplied" : draft ? "Independent count · draft" : "Recorded at close"}</small></div>
    <div className={`cash-difference cash-${difference.tone}`}><dt>{difference.label}</dt><dd className={cashMoney(difference.amount).length > 12 ? "cash-long-money" : undefined}>{cashMoney(difference.amount)}</dd><small>{difference.amount === null ? "A physical count is required" : difference.amount === 0 ? "No cash difference" : draft ? "Explanation required before close" : "Original difference retained"}</small></div>
  </dl>;
}

function Lifecycle({ shift, counted }: { shift: CashRecord; counted: number | null }) {
  const current = shift.status === "reconciled" ? 5 : shift.status === "closed" ? 4 : counted === null ? 1 : 2;
  return <ol className="cash-lifecycle" aria-label="Cash shift lifecycle">{["Opened", "Cash activity", "Count", "Close", "Reconcile"].map((step, index) =>
    <li key={step} className={index < current ? "cash-step-complete" : undefined} aria-current={index === current ? "step" : undefined}>
      {index < current ? <Check size={13} aria-hidden="true" /> : <Circle size={10} aria-hidden="true" />}<span>{step}</span>
    </li>)}
  </ol>;
}

function CashMovements({ shift, ledger, onCurrent }: { shift: CashRecord; ledger: AccountingLedger; onCurrent?: () => void }) {
  const rows = [...shiftCashBasis(shift, ledger.transactions).linked].sort((a, b) => (Date.parse(String(b.created_at)) || 0) - (Date.parse(String(a.created_at)) || 0));
  const page = useTablePagination(rows);
  return <section className="cash-surface cash-movements" aria-labelledby="cash-movements-heading">
    <header className="cash-panel-heading"><div><h2 id="cash-movements-heading">Cash movements</h2><p>{shift.status === "open" ? "Current drawer" : "Historical drawer"} · #{shortId(shift)} · {rows.length} linked payment records · Manila times</p></div>{onCurrent && <button className="cash-text-action" onClick={onCurrent}>Return to current drawer</button>}</header>
    {rows.length ? <div className="cash-table-frame"><table aria-label="Shift cash movements"><thead><tr><th scope="col">Time</th><th scope="col">Type / description</th><th scope="col">Reference / method</th><th scope="col" className="cash-num">Amount</th><th scope="col">Status</th><th scope="col">Recorded by</th></tr></thead>
      <tbody>{page.rows.map(row => {
        const amount = cashNumber(row.amount);
        return <tr key={String(row.id)}><td data-label="Time">{cashDate(row.created_at)}</td><td data-label="Type"><strong>{row.purpose === "refund" ? "Refund" : text(row.purpose)}</strong><small>Reservation {text(row.reservation_id)}</small></td><td data-label="Reference">{text(row.reference)}<small>{text(row.method)}</small></td><td data-label="Amount" className="cash-num">{amount === null ? "—" : `${row.purpose === "refund" ? "−" : "+"}${cashMoney(amount)}`}</td><td data-label="Status">{text(row.status)}<small>{row.status === "paid" ? "Included in cash basis" : "Not included in cash basis"}</small></td><td data-label="Recorded by">{text(row.received_by_name)}</td></tr>;
      })}</tbody></table></div> : <p className="cash-empty">No payment records are linked to this drawer in the ledger.</p>}
    <p className="cash-table-note">Cash out includes paid refunds linked to this drawer. Recorded by identifies the staff member who entered the payment or payout.</p>
    <TablePagination {...page} onPageChange={page.setPage} noun="cash movements" note="Only paid, linked records enter the cash basis." />
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
    <Comparison expected={shift.expected_cash} counted={shift.actual_cash} variance={shift.variance} draft={false} />
    <form className="hms-cash-count" onSubmit={submit}><p>Review records the difference without changing guest payments or the original count.</p><label>Reconciliation notes{hasVariance ? " (required)" : " (optional)"}<textarea ref={input} rows={3} maxLength={400} required={hasVariance} value={notes} disabled={busy} onChange={e => setNotes(e.target.value)} /></label>{error && <p role="alert">{error}</p>}<div className="btn-row"><button type="button" className="btn btn-secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? "Recording reconciliation…" : "Record reconciliation"}</button></div></form>
  </Modal>;
}

export default function CashShiftsWorkspace({ ledger, actorId, role, search, setSearch, onOpen, onRefresh, onOpenHandovers, onCreateHandover, onOpenReport, refreshError = "" }: Props) {
  const [status, setStatus] = useState("all");
  const [detailId, setDetailId] = useState<string | null>(null);
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
  const detail = ledger?.cashShifts.find(row => row.id === detailId);
  const reconcile = ledger?.cashShifts.find(row => row.id === reconcileId && row.status === "closed");
  const movement = ledger?.cashShifts.find(row => row.id === movementId) ?? current;
  const pending = ledger?.cashShifts.filter(row => row.status === "closed") ?? [];

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

  return <div className="cash-workspace">
    {message && <p className="cash-feedback" role="status">{message}</p>}
    <CashCountPanel ledger={ledger} actorId={actorId} role={role} onSaved={saved} onStale={onRefresh} renderWorkspace={(count: CashCountPresentation) => {
      const counted = active ? count.mayClose ? count.counted : null : current?.actual_cash;
      const variance = active ? count.mayClose ? count.variance : null : current?.variance;
      const difference = cashDifference(variance);
      const primary = active ? { label: count.mayClose ? "Review count & close" : "View drawer details", action: count.mayClose ? count.review : () => setDetailId(String(active.id)) }
        : latestClosed?.status === "closed" && mayReconcile ? { label: "Reconcile latest shift", action: () => openReconcile(latestClosed) } : { label: "Open cash shift", action: onOpen };
      return <>
        <header className="cash-workspace-heading"><div><h1>Cash &amp; Shifts</h1><p>One shared drawer. A clear count. An accountable close.</p>{refreshError && <p className="cash-refresh-error" role="alert">Refresh failed: {refreshError} Values below are from the last successful ledger read.</p>}</div><div className="cash-heading-actions"><button className="cash-icon-action" aria-label="Refresh cash ledger" onClick={onRefresh}><RefreshCw size={17} aria-hidden="true" /></button>{!active && primary.label !== "Open cash shift" && <button className="cash-button" onClick={onOpen}>Open cash shift</button>}<button className="cash-button cash-primary" onClick={primary.action} disabled={count.busy}>{primary.label}<ArrowRight size={16} aria-hidden="true" /></button></div></header>
        <div className="cash-attention"><TriangleAlert size={17} aria-hidden="true" /><div>
          <p>{active ? !count.mayClose ? `${text(active.staff_name, "The opener")} owns this drawer. Only the opener or Accounting can close it.` : count.expected === null ? "Expected cash is unavailable. Refresh the ledger before closing." : count.counted === null ? "Count physical cash independently before closing the drawer." : difference.amount === 0 ? "Draft count agrees with expected cash. Review before closing." : `Draft count is ${cashMoney(difference.amount)} ${count.variance !== null && count.variance < 0 ? "short" : "over"}. Explain the difference before closing.` : "No drawer is open. Cash payments require an open drawer."}</p>
          {personalPending.length > 0 && !handoverError && <p>{personalPending.length} cash handover{personalPending.length === 1 ? " awaits" : "s await"} your acknowledgement in the recent authorized records.</p>}
        </div>{pending.length > 0 && <button className="cash-text-action" onClick={openHistory}>Review {pending.length} closed shift{pending.length === 1 ? "" : "s"}</button>}</div>
        <div className="cash-operational-grid">
          <div className="cash-current-stack">
            {!active && <section className="cash-no-drawer"><h2>No drawer is open</h2><p>Start the next drawer with a physically counted opening float. Past shifts and unresolved follow-up remain available.</p></section>}
            {current && <section className="cash-surface cash-current" aria-labelledby="cash-current-heading" id="shared-drawer-count">
              <div className="cash-section-heading"><h2 id="cash-current-heading">{active ? "Current shift" : "Latest closed shift"}</h2><span className={`cash-status ${active ? "cash-status-open" : ""}`}>{active ? "Open" : "Closed"}</span></div>
              <div className="cash-person"><span className="cash-avatar" aria-hidden="true">{text(current.staff_name, "?").split(" ").slice(0, 2).map(part => part[0]).join("")}</span><div><h3>{text(current.staff_name, "Staff name not supplied")}</h3><p>Opened by · {text(current.location, "Location not supplied")} shared drawer</p></div></div>
              <div className="cash-shift-meta"><span>Shift #{shortId(current)}</span><span><Clock3 size={13} aria-hidden="true" />Opened {cashDate(current.opened_at)}</span><span>{cashDuration(current, now)}</span></div>
              {basis && !basis.agrees && <p className="cash-basis-warning">Payment breakdown differs from this ledger snapshot. Refresh to review it; {active ? "running expected uses the recorded net collections" : "closed expected cash remains the recorded amount"}.</p>}
              <Comparison expected={active ? count.expected : current.expected_cash} counted={counted} variance={variance} draft={Boolean(active)} />
              <div className="cash-count-context"><span>{active ? count.counted !== null && count.mayClose ? "Count draft · Not submitted" : "No recorded physical count yet" : `${stateLabel(current)} · Original count retained`}</span>{active && count.mayClose && <button className="cash-text-action" onClick={count.review}>Enter / edit physical count</button>}{!active && <button className="cash-text-action" onClick={() => setDetailId(String(current.id))}>View shift record</button>}</div>
              <button className="cash-button cash-primary cash-mobile-action" onClick={primary.action} disabled={count.busy}>{primary.label}</button>
              <dl className="cash-basis"><div><dt>Opening cash</dt><dd>{cashMoney(current.opening_amount)}</dd></div><div><dt>Cash in</dt><dd>{cashMoney(basis?.incoming)}</dd></div><div><dt>Cash out · refunds</dt><dd>{cashMoney(basis?.outgoing)}</dd></div></dl>
              <Lifecycle shift={current} counted={cashNumber(counted)} />
              {active && count.mayClose && <p className="cash-draft-state" role="status">{count.draftStatus}</p>}
            </section>}
            {latestClosed && !detail && <CashCloseNextSteps key={String(latestClosed.id)} shift={latestClosed} role={role} onCreateHandover={onCreateHandover} onOpenHandovers={onOpenHandovers} onOpenReport={onOpenReport} />}
          </div>
          <aside className="cash-reconciliation"><h2>{active ? "Reconciliation pending close" : latestClosed?.status === "closed" ? "Awaiting Accounting review" : latestClosed ? "Latest shift reconciled" : "Reconciliation"}</h2><p>{active ? "Accounting reviews the recorded result after this drawer closes." : latestClosed?.status === "reconciled" ? "Review is complete. Any recorded difference remains in the audit history." : "Closed shifts retain their physical count and variance for Accounting review."}</p>{pending.length > 0 && <button className="cash-text-action" onClick={openHistory}>{pending.length} closed shift{pending.length === 1 ? "" : "s"} awaiting review</button>}</aside>
        </div>
      </>;
    }} />

    {movement ? <CashMovements key={`movements:${String(movement.id)}`} shift={movement} ledger={ledger} onCurrent={active && movement.id !== active.id ? () => setMovementId(null) : undefined} /> : <section className="cash-surface"><header className="cash-panel-heading"><h2>Cash movements</h2></header><p className="cash-empty">Open a drawer to begin. No current-shift cash movements are available.</p></section>}

    <section className="cash-surface cash-handovers" aria-labelledby="cash-handover-heading"><header className="cash-panel-heading"><h2 id="cash-handover-heading">Handover</h2><button className="cash-text-action" aria-label="Open operational handover" onClick={() => onOpenHandovers()}>View all</button></header>
      {handoverError ? <div className="cash-empty" role="alert">Cash follow-up could not be confirmed: {handoverError} <button className="cash-text-action" onClick={() => setHandoverRetry(value => value + 1)}>Retry handovers</button></div> : !handovers ? <p className="cash-empty" role="status">Loading authorized handovers…</p> : <>
        {outstandingHandovers.length ? <ul className="cash-handover-list">{outstandingHandovers.slice(0, 1).map(row => <li key={row.id}><div className="cash-section-heading"><h3>{nameOf(row.submitted_by)} <ArrowRight size={14} aria-label="to" /> {nameOf(row.follow_up_user_id)}</h3><span className={`cash-status ${row.acknowledged_at ? "" : "cash-status-review"}`}>{row.acknowledged_at ? "Acknowledged · Unresolved" : "Awaiting acknowledgement"}</span></div><p>{row.summary}</p><small>{row.source_id === active?.id ? "Current drawer" : "Other cash shift"} · #{row.source_id.slice(0, 8)} · Submitted {cashDate(row.submitted_at)}</small><button className="cash-text-action" onClick={() => onOpenHandovers(row.id)}>View follow-up</button></li>)}</ul> : <p className="cash-empty">No unresolved cash follow-up appears in the recent authorized records. Older records are outside this list.</p>}
        <p className="cash-table-note">Recent 100 authorized handover records · {outstandingHandovers.length} unresolved / {linkedHandovers.length} visible cash handovers.</p>
      </>}
    </section>

    <section className="cash-history" ref={historyRef} tabIndex={-1} aria-labelledby="cash-history-heading"><header className="cash-history-heading"><div><h2 id="cash-history-heading">Shift history</h2><p>All dates · {ledger.cashShifts.length} recorded shifts</p></div><div className="cash-history-controls"><label>Search shifts<input type="search" value={search} placeholder="Cashier, shift ID or notes" onChange={e => { setSearch(e.target.value); history.setPage(1); }} /></label><label>Shift status<select value={status} onChange={e => filter(e.target.value)}><option value="all">All shifts</option><option value="open">Open</option><option value="closed">Awaiting reconciliation</option><option value="reconciled">Reconciled</option></select></label>{(search || status !== "all") && <button className="cash-text-action" onClick={() => { setSearch(""); filter("all"); }}>Clear filters</button>}</div></header>
      <div className="cash-surface cash-table-frame"><table aria-label="Cash shift history"><thead><tr><th scope="col">Shift / cashier</th><th scope="col" className="cash-num">Expected / counted</th><th scope="col" className="cash-num">Difference</th><th scope="col">Reconciliation</th><th scope="col">Actions</th></tr></thead><tbody>{history.rows.map(row => {
        const difference = cashDifference(row.status === "open" ? null : row.variance);
        const expected = row.status === "open" ? shiftCashBasis(row, ledger.transactions).expected : row.expected_cash;
        return <tr key={String(row.id)}><td data-label="Shift"><strong>{text(row.staff_name, "Staff name not supplied")}</strong><small>{cashDate(row.opened_at)} · #{shortId(row)}</small><small>{text(row.location)}</small></td><td data-label="Cash" className="cash-num"><span className="cash-small-label">Expected </span>{cashMoney(expected)}<small>Counted {row.status === "open" ? "Not recorded" : cashMoney(row.actual_cash)}</small></td><td data-label="Difference" className={`cash-num ${difference.amount ? "cash-recorded-difference" : ""}`}>{cashMoney(row.status === "open" ? null : row.variance)}<small>{difference.label}</small></td><td data-label="Reconciliation"><span className={`cash-status ${row.status === "closed" ? "cash-status-review" : ""}`}>{stateLabel(row)}</span></td><td data-label="Actions"><div className="cash-row-actions"><button className="cash-button" onClick={() => setDetailId(String(row.id))} aria-label={`View shift ${String(row.id)}`}>View details</button>{row.status === "closed" && mayReconcile && <button className="cash-text-action" onClick={() => openReconcile(row)} aria-label={`Reconcile shift ${String(row.id)}`}>Reconcile</button>}</div></td></tr>;
      })}</tbody></table>{matching.length === 0 && <p className="cash-empty">{ledger.cashShifts.length ? "No shifts match these filters. Clear the search or change the status." : "No shifts have been recorded yet. Open the first drawer with a counted float."}</p>}
      <TablePagination {...history} onPageChange={history.setPage} noun="matching shifts" note={`${ledger.cashShifts.length} shifts across all dates and statuses. Current drawer remains independent of filters.`} /></div>
      <p className="cash-history-total">Recorded net variance: <strong>{cashMoney(ledger.metrics.cashVariance)}</strong> · All closed/reconciled shifts across all dates. This signed historical total is not the current drawer shortage.</p>
      <p className="cash-custody"><ShieldCheck size={16} aria-hidden="true" />Only the opener or Accounting can close. Operational handover records follow-up, not a cash transfer.</p>
    </section>

    <Modal isOpen={Boolean(detail)} onClose={() => setDetailId(null)} title={detail ? `Cash shift #${shortId(detail)}` : "Cash shift"} className="cash-count-dialog" size="lg">
      {detail && <><p>{text(detail.staff_name)} · {text(detail.location)} · {stateLabel(detail)}</p><dl className="cash-detail-list">{[["Full shift ID", detail.id], ["Opened", cashDate(detail.opened_at)], ["Closed", detail.closed_at ? cashDate(detail.closed_at) : "Not closed"], ["Reconciled", detail.reconciled_at ? cashDate(detail.reconciled_at) : "Not reconciled"], ["Opening float", cashMoney(detail.opening_amount)], ["Net collected", cashMoney(detail.collected)], ["Expected cash", cashMoney(detail.status === "open" ? shiftCashBasis(detail, ledger.transactions).expected : detail.expected_cash)], ["Counted cash", detail.status === "open" ? "Not recorded" : cashMoney(detail.actual_cash)], ["Recorded variance", detail.status === "open" ? "Not recorded" : cashMoney(detail.variance)], ["Close notes", text(detail.close_notes, "No close note supplied")], ["Reconciliation notes", text(detail.reconciliation_notes, "No reconciliation note supplied")]].map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{String(value)}</dd></div>)}</dl>{detail.status !== "open" && <CashCloseNextSteps shift={detail} role={role} onCreateHandover={onCreateHandover} onOpenHandovers={onOpenHandovers} onOpenReport={onOpenReport} />}<div className="btn-row"><button className="cash-button" onClick={() => { setMovementId(String(detail.id)); setDetailId(null); }}>View cash movements</button>{detail.status === "closed" && mayReconcile && <button className="cash-button cash-primary" onClick={() => openReconcile(detail)}>Reconcile shift</button>}</div></>}
    </Modal>

    {reconcile && mayReconcile && <ReconciliationDialog key={`reconcile:${String(reconcile.id)}`} shift={reconcile} onClose={() => setReconcileId(null)} onRefresh={onRefresh} onSaved={setMessage} />}
  </div>;
}
