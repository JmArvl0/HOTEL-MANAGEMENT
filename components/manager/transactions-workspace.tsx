"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, CircleAlert, CircleCheck, ClipboardCopy, LockKeyhole, Search } from "lucide-react";
import type { AccountingLedger } from "@/lib/accounting";
import type { RecordItem } from "@/lib/types";
import "./transactions-workspace.css";

type Transaction = AccountingLedger["transactions"][number];
type Period = "today" | "yesterday" | "all";
type Status = "all" | "paid" | "pending_verification" | "failed" | "other";
type Kind = "all" | "deposit" | "stay_payment" | "refund";

type Props = {
  ledger: AccountingLedger;
  search: string;
  setSearch: (value: string) => void;
  canVerify: boolean;
  canIssueDocument: boolean;
  rejectDeposit: (row: RecordItem) => void;
  generateDocument: (payload: { documentType: "receipt"; paymentId: string }) => void;
  openDepositVerification: (paymentId: string) => void;
  openCashInvestigation?: () => void;
};

const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" });
const dayFormat = new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Manila" });
const timeFormat = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Manila" });
const keyFormat = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Manila" });
const text = (value: unknown, fallback = "Not recorded") => value == null || String(value).trim() === "" ? fallback : String(value);
const readable = (value: unknown) => text(value).replaceAll("_", " ");
const titled = (value: unknown) => readable(value).replace(/^./, letter => letter.toUpperCase());
const dateOf = (value: unknown) => { const date = new Date(String(value ?? "")); return Number.isNaN(date.getTime()) ? null : date; };
const dayKey = (value: unknown) => {
  const date = value instanceof Date ? value : dateOf(value);
  if (!date) return "";
  const parts = Object.fromEntries(keyFormat.formatToParts(date).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const shiftDay = (key: string, offset: number) => {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
const dateLabel = (key: string) => dayFormat.format(new Date(`${key}T12:00:00+08:00`));
const stamp = (value: unknown) => {
  const date = dateOf(value);
  return date ? `${dayFormat.format(date)} · ${timeFormat.format(date)}` : "Date unavailable";
};
const amount = (row: Transaction) => Math.round(Number(row.amount || 0) * 100);
const activityAt = (row: Transaction) => row.status === "paid" ? row.verified_at ?? row.created_at : row.created_at;
const money = (centavos: number) => currency.format(centavos / 100);
const purposeLabel = (row: Transaction) => row.purpose === "refund" ? "Refund" : String(row.purpose).includes("deposit") ? "Reservation deposit" : row.purpose === "stay_payment" ? "Stay payment" : titled(row.purpose);
const methodLabel = (row: Transaction) => row.method === "gateway_paymongo" ? "Online · PayMongo" : ["manual_gcash", "gcash"].includes(String(row.method)) ? "Manual GCash" : row.method === "manual_bank" ? "Bank transfer" : titled(row.method);
const statusLabel = (row: Transaction) => row.status === "pending_verification" ? row.method === "gateway_paymongo" ? "Awaiting provider" : "Awaiting review" : row.status === "paid" ? "Settled" : titled(row.status);
const statusTone = (row: Transaction) => row.status === "paid" ? "paid" : row.status === "pending_verification" ? "pending" : row.status === "failed" ? "failed" : "other";
const matchesKind = (row: Transaction, kind: Kind) => kind === "all" || kind === "deposit" && String(row.purpose).includes("deposit") || row.purpose === kind;

export default function TransactionsWorkspace({ ledger, search, setSearch, canVerify, canIssueDocument, rejectDeposit, generateDocument, openDepositVerification, openCashInvestigation }: Props) {
  const today = dayKey(new Date());
  const yesterday = shiftDay(today, -1);
  const [period, setPeriod] = useState<Period>("today");
  const [status, setStatus] = useState<Status>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const restoreFocus = useRef(false);
  const invoices = useMemo(() => new Map(ledger.invoices.map(row => [String(row.reservation_id), text(row.guest_name, "Guest name unavailable")])), [ledger.invoices]);
  const transactions = useMemo(() => [...ledger.transactions].sort((a, b) => (dateOf(activityAt(b))?.getTime() ?? 0) - (dateOf(activityAt(a))?.getTime() ?? 0)), [ledger.transactions]);
  const periodRows = transactions.filter(row => period === "all" || dayKey(activityAt(row)) === (period === "today" ? today : yesterday));
  const totals = periodRows.reduce<{ gross: number; refunds: number; pending: number }>((sum, row) => {
    if (row.status === "pending_verification") sum.pending += 1;
    if (row.status === "paid") {
      if (row.purpose === "refund") sum.refunds += amount(row);
      else sum.gross += amount(row);
    }
    return sum;
  }, { gross: 0, refunds: 0, pending: 0 });
  const normalizedSearch = search.trim().toLowerCase();
  const base = periodRows.filter(row => matchesKind(row, kind) && [row.id, row.reservation_id, invoices.get(String(row.reservation_id)), row.reference].some(value => String(value ?? "").toLowerCase().includes(normalizedSearch)));
  const isOther = (row: Transaction) => !["paid", "pending_verification", "failed"].includes(String(row.status));
  const statusCounts = { all: base.length, paid: base.filter(row => row.status === "paid").length, pending_verification: base.filter(row => row.status === "pending_verification").length, failed: base.filter(row => row.status === "failed").length, other: base.filter(isOther).length };
  const filtered = base.filter(row => status === "all" || status === "other" && isOther(row) || row.status === status);
  const pageSize = 6;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const selected = visible.find(row => String(row.id) === selectedId) ?? visible[0] ?? null;
  const guestName = (row: Transaction) => invoices.get(String(row.reservation_id)) ?? "Guest name unavailable";

  useEffect(() => {
    if (mobileDetail && window.matchMedia?.("(max-width: 1150px)").matches) detailHeadingRef.current?.focus();
    else if (!mobileDetail && restoreFocus.current) {
      restoreFocus.current = false;
      selectedRowRef.current?.focus();
    }
  }, [mobileDetail]);

  const clearFilters = () => {
    setSearch(""); setKind("all"); setStatus("all"); setPeriod("today"); setPage(0); setMobileDetail(false);
  };
  const choose = (row: Transaction) => { setSelectedId(String(row.id)); setCopyMessage(""); setMobileDetail(true); };
  const copyReference = async () => {
    if (!selected?.reference) return;
    try { await navigator.clipboard.writeText(String(selected.reference)); setCopyMessage("Reference copied."); }
    catch { setCopyMessage(`Copy unavailable. Reference: ${selected.reference}`); }
  };
  const history = selected ? [
    { label: "Recorded", at: selected.created_at },
    ...(selected.submitted_at && selected.submitted_at !== selected.created_at ? [{ label: "Submitted", at: selected.submitted_at }] : []),
    ...(selected.verified_at ? [{ label: "Verified", at: selected.verified_at }] : []),
    ...(selected.reviewed_at && selected.reviewed_at !== selected.verified_at ? [{ label: "Review recorded", at: selected.reviewed_at }] : []),
  ].filter(event => dateOf(event.at)).sort((a, b) => (dateOf(a.at)?.getTime() ?? 0) - (dateOf(b.at)?.getTime() ?? 0)) : [];
  const pending = selected?.status === "pending_verification";
  const failed = selected?.status === "failed";
  const provider = selected?.method === "gateway_paymongo";
  const cashException = selected?.method === "cash" && selected.status === "paid" && !selected.cash_shift_id;
  const outcome = pending ? provider ? "Awaiting provider settlement" : "Awaiting Accounting review" : failed ? text(selected?.decision_reason, "Payment failed. Review the decision in Deposit Verification.") : "";

  return <div className="tx-workspace" data-mobile-view={mobileDetail ? "detail" : "ledger"}>
    <header className="tx-page-heading">
      <div><h1>Transactions</h1><p>Trace payments and refunds from the ledger to the individual record.</p></div>
      <p className="tx-immutability"><LockKeyhole size={17} aria-hidden="true" /> Settled entries are preserved. Corrections are recorded separately.</p>
    </header>

    <section className="tx-summary" aria-labelledby="tx-summary-title">
      <div className="tx-summary-heading"><div><h2 id="tx-summary-title">Money movement</h2><p>Settled payments use verification date · Manila time</p></div>
        <label className="tx-period"><span>Period</span><select aria-label="Period" value={period} onChange={event => { setPeriod(event.target.value as Period); setPage(0); setMobileDetail(false); }}><option value="today">{dateLabel(today)}</option><option value="yesterday">{dateLabel(yesterday)}</option><option value="all">All dates</option></select></label>
      </div>
      <dl className="tx-summary-values">
        <div><dt>Gross collected</dt><dd>{money(totals.gross)}</dd><small>Paid deposits and stay payments</small></div>
        <div><dt>Refunds issued</dt><dd>{money(totals.refunds)}</dd><small>Settled refund outflows</small></div>
        <div className="tx-net"><dt>Net collections</dt><dd>{money(totals.gross - totals.refunds)}</dd><small>Gross collected less refunds</small></div>
        <div className="tx-pending-total"><dt>Awaiting verification</dt><dd>{totals.pending}</dd><small>Excluded from settled totals</small></div>
      </dl>
    </section>

    <div className="tx-frame">
      <section className="tx-ledger" aria-labelledby="tx-ledger-title">
        <div className="tx-ledger-heading"><div><h2 id="tx-ledger-title">Ledger</h2><p role="status">{filtered.length} {filtered.length === 1 ? "record" : "records"} in view</p></div><span>Newest first</span></div>
        <div className="tx-status-filters" role="group" aria-label="Transaction status">
          {(["all", "paid", "pending_verification", "failed", "other"] as Status[]).map(value => <button key={value} type="button" aria-pressed={status === value} onClick={() => { setStatus(value); setPage(0); }}>
            {value === "all" ? "All" : value === "paid" ? "Settled" : value === "pending_verification" ? "Awaiting review" : value === "failed" ? "Failed" : "Other states"} <span>{statusCounts[value]}</span>
          </button>)}
        </div>
        <div className="tx-toolbar" role="search" aria-label="Find transactions">
          <label className="tx-search"><Search size={17} aria-hidden="true" /><span className="tx-sr-only">Search transactions</span><input type="search" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} placeholder="Search guest, booking, or reference" /></label>
          <label className="tx-type"><span className="tx-sr-only">Type</span><select aria-label="Type" value={kind} onChange={event => { setKind(event.target.value as Kind); setPage(0); }}><option value="all">All types</option><option value="deposit">Deposits</option><option value="stay_payment">Stay payments</option><option value="refund">Refunds</option></select></label>
          {(search || kind !== "all" || status !== "all" || period !== "today") && <button type="button" className="tx-text-button" onClick={clearFilters}>Clear</button>}
        </div>
        <div className="tx-ledger-body">
          {visible.length ? <><div className="tx-table-head" aria-hidden="true"><span>Activity</span><span>Guest & booking</span><span>Method · reference</span><span>Amount</span></div>
            <div role="list" aria-label="Transactions">{visible.map(row => <div role="listitem" key={String(row.id)}><button type="button" className="tx-row" aria-label={`${guestName(row)} · ${text(row.reservation_id)} · ${purposeLabel(row)} · ${methodLabel(row)} · ${text(row.reference)} · ${money(amount(row))} · ${statusLabel(row)}`} aria-pressed={row === selected} aria-controls="tx-detail-content" ref={row === selected ? selectedRowRef : undefined} onClick={() => choose(row)}>
              <span className="tx-row-date"><strong>{stamp(activityAt(row)).split(" · ")[0]}</strong><small>{stamp(activityAt(row)).split(" · ")[1] ?? ""}</small></span>
              <span className="tx-row-guest"><strong>{guestName(row)}</strong><small title={text(row.reservation_id)}>{text(row.reservation_id)} · {purposeLabel(row)}</small></span>
              <span className="tx-row-method"><strong>{methodLabel(row)}</strong><small>{text(row.reference)}</small></span>
              <span className="tx-row-money"><strong data-outflow={row.purpose === "refund"}>{row.purpose === "refund" ? "−" : ""}{money(amount(row))}</strong><small className="tx-status" data-tone={statusTone(row)}>{statusLabel(row)}</small></span>
              <ChevronRight className="tx-row-chevron" size={16} aria-hidden="true" />
            </button></div>)}</div></> : <div className="tx-empty"><Search size={24} aria-hidden="true" /><h3>No matching transactions</h3><p>{period === "today" && !search && kind === "all" && status === "all" ? "No transactions were recorded today. Choose another period to review history." : "Try another guest, booking, reference, or filter."}</p><button type="button" onClick={() => { setPeriod("all"); setStatus("all"); setKind("all"); setSearch(""); setPage(0); }}>Show all dates</button></div>}
        </div>
        <footer className="tx-ledger-footer"><span>{visible.length ? `Showing ${safePage * pageSize + 1}–${safePage * pageSize + visible.length} of ${filtered.length}` : "Showing 0 records"}</span><div role="group" aria-label="Ledger pages"><button type="button" aria-label="Previous page" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}><ChevronRight size={16} aria-hidden="true" /></button><span>{safePage + 1} / {pages}</span><button type="button" aria-label="Next page" disabled={safePage === pages - 1} onClick={() => setPage(safePage + 1)}><ChevronRight size={16} aria-hidden="true" /></button></div></footer>
      </section>

      <section className="tx-detail" aria-labelledby="tx-detail-title">
        <div className="tx-detail-heading">{mobileDetail && <button type="button" className="tx-text-button tx-back" onClick={() => { restoreFocus.current = true; setMobileDetail(false); }}><ArrowLeft size={16} aria-hidden="true" /> Back to ledger</button>}<div><div><h2 id="tx-detail-title" tabIndex={-1} ref={detailHeadingRef}>Transaction detail</h2><p>Recorded activity and context</p></div><span><LockKeyhole size={14} aria-hidden="true" /> Ledger record</span></div></div>
        <div className="tx-detail-content" id="tx-detail-content">
          {!selected ? <div className="tx-detail-empty"><h3>No transaction selected</h3><p>Choose a ledger entry to review its recorded details.</p></div> : <>
            <div className="tx-record-top"><div className="tx-record-status"><span>{purposeLabel(selected)}</span><span className="tx-status" data-tone={statusTone(selected)}>{statusLabel(selected)}</span></div><p className="tx-record-amount" data-outflow={selected.purpose === "refund"}>{selected.purpose === "refund" ? "−" : ""}{money(amount(selected))}</p><p className="tx-record-person">{guestName(selected)} <span>· {text(selected.reservation_id)}</span></p>{outcome && <p className="tx-outcome" role={failed ? "alert" : undefined}>{outcome}</p>}</div>
            <div className="tx-detail-section"><h3>Recorded details</h3><dl className="tx-facts"><div><dt>Transaction ID</dt><dd>{text(selected.id)}</dd></div><div><dt>Recorded · Manila</dt><dd>{stamp(selected.created_at)}</dd></div><div><dt>Payment method</dt><dd>{methodLabel(selected)}</dd></div><div><dt>Recorded by</dt><dd>{text(selected.received_by_name)}</dd></div><div><dt>Cash drawer</dt><dd>{text(selected.cash_shift_id)}</dd></div><div className="tx-reference"><dt>Reference</dt><dd>{text(selected.reference)}{text(selected.reference, "") !== "" && <button type="button" onClick={() => void copyReference()}><ClipboardCopy size={14} aria-hidden="true" /> Copy</button>}</dd></div></dl><p className="tx-copy-feedback" role="status">{copyMessage}</p></div>
            <div className="tx-detail-section"><h3>Record history</h3>{history.length ? <ol className="tx-history">{history.map((event, index) => <li key={`${event.label}-${index}`}><span aria-hidden="true" /><div><strong>{event.label}</strong><time dateTime={String(event.at)}>{stamp(event.at)}</time></div></li>)}</ol> : <p className="tx-detail-muted">No timestamps are available for this record.</p>}</div>
            <div className="tx-context" data-tone={pending ? "pending" : failed ? "failed" : "settled"}>{pending || failed ? <CircleAlert size={18} aria-hidden="true" /> : <CircleCheck size={18} aria-hidden="true" />}<div><strong>{pending ? provider ? "Provider settlement pending" : "Review required" : failed ? "Not settled" : selected.purpose === "refund" ? "Separate refund entry" : "Settled record"}</strong><p>{pending ? provider ? "Provider settlement is automatic. Follow its status in Deposit Verification." : canVerify ? "Accounting can review submitted proof in Deposit Verification." : "Accounting reviews submitted proof. Front Desk can follow its status here." : failed ? "This attempt is excluded from settled totals." : selected.purpose === "refund" ? "This outflow does not change the original payment record." : "Settled entries cannot be edited. Corrections use separate financial records."}</p></div></div>
            {cashException && <div className="tx-context" data-tone="pending"><CircleAlert size={18} aria-hidden="true" /><div><strong>Cash collected without a drawer link</strong><p>Accounting investigates this historical collection in Reconciliation. It is excluded from every drawer balance.</p></div></div>}
            <div className="tx-actions">{pending && <button type="button" onClick={() => openDepositVerification(String(selected.id))}>Open Deposit Verification</button>}{pending && canVerify && <button type="button" onClick={() => rejectDeposit(selected as RecordItem)}>Reject payment</button>}{cashException && openCashInvestigation && <button type="button" onClick={openCashInvestigation}>Open cash investigation</button>}{selected.status === "paid" && selected.purpose !== "refund" && canIssueDocument && <button type="button" onClick={() => generateDocument({ documentType: "receipt", paymentId: String(selected.id) })}>Issue receipt</button>}</div>
          </>}
        </div>
      </section>
    </div>
  </div>;
}
