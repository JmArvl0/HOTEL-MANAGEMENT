"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CreditCard, FileText, LogOut, ReceiptText, ShieldCheck, Wallet } from "lucide-react";
import { HavenDataToolbar, HavenEmptyState, HavenFilterBadges, HavenSearchInput, PageHeader } from "@/components/ui";
import { HavenSkeleton } from "@/components/ui/haven-skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { TablePagination, useTablePagination } from "@/components/ui/table-pagination";
import { formatPeso } from "@/lib/format";
import { formatPaymentSubmittedAt } from "@/lib/payment-display";
import { canCollectPayment, canVerifyDeposit } from "@/lib/permissions";
import type { BillingFolio, BillingSnapshot } from "@/lib/staff-billing";
import type { RecordItem, Role } from "@/lib/types";
import { ModuleSummaryCards } from "./module-summary-cards";
import "./staff-billing-workspace.css";

const queues = [
  { value: "all", label: "All folios" },
  { value: "checkout", label: "Checkout due" },
  { value: "review", label: "Deposit review" },
  { value: "settled", label: "Settled" },
];
const shortDay = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
function dayLabel(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? value : shortDay.format(date);
}
const money = (value: RecordItem[string]) => value == null ? "—" : formatPeso(Number(value));

function billingRow(folio: BillingFolio, today: string) {
  const { invoice, reservation, deposits } = folio;
  const guest = String(reservation?.guest_name || invoice?.guest_name || "Guest");
  const reference = String(reservation?.confirmation_number || reservation?.id || invoice?.reservation_id || "");
  const balance = invoice?.balance == null ? null : Number(invoice.balance);
  const inHouse = reservation?.status === "checked_in";
  const checkOut = String(reservation?.check_out ?? "").slice(0, 10);
  const checkIn = String(reservation?.check_in ?? "").slice(0, 10);
  const overdue = inHouse && Boolean(checkOut) && checkOut < today;
  const leaving = inHouse && checkOut === today;
  const checkoutDue = (overdue || leaving) && (balance ?? 0) > 0;
  const settled = balance === 0 && invoice?.status === "paid" && !deposits.length;
  const upcoming = reservation?.status === "pending" || reservation?.status === "confirmed";
  const room = reservation?.room_number ? `Room ${reservation.room_number}` : reservation?.room_type;
  const stay = [room, overdue ? "Checkout overdue" : leaving ? "Checkout today"
    : inHouse && checkOut ? `Checkout ${dayLabel(checkOut)}`
    : upcoming && checkIn ? `Arrival ${dayLabel(checkIn)}` : null].filter(Boolean).join(" · ");
  const status = deposits.length ? { status: "pending_verification", label: "Verify deposit" }
    : checkoutDue ? { status: "pending", label: overdue ? "Checkout overdue" : "Checkout due" }
    : settled ? { status: "paid", label: "Settled" }
    : { status: String(invoice?.status ?? "unknown"), label: invoice?.status === "partial" ? "Part-paid" : undefined };
  const priority = checkoutDue ? 0 : deposits.length ? 1 : (balance ?? 0) > 0 ? 2 : 3;
  return { ...folio, guest, reference, balance, inHouse, checkoutDue, overdue, settled, upcoming, stay, status, priority };
}

type Row = ReturnType<typeof billingRow>;
type Props = {
  role: Role;
  refreshVersion: number;
  search: string;
  onSearch: (value: string) => void;
  onCollect: (reservation: RecordItem) => void;
  onReviewDeposit: (payment: RecordItem) => void;
  onOpenReservation: (reservation: RecordItem) => void;
  onIssueStatement?: (reservationId: string) => void;
  onAdjustFolio?: (reservationId: string) => void;
  onReverseCharge?: (charge: RecordItem) => void;
};

type EntryFilter = "all" | "charges" | "payments" | "adjustments";

function FolioDetails({ row, role, readOnly, onCollect, onReviewDeposit, onOpenReservation, onIssueStatement, onAdjustFolio, onReverseCharge, onBack }: {
  row: Row;
  role: Role;
  readOnly: boolean;
  onBack: () => void;
} & Pick<Props, "onCollect" | "onReviewDeposit" | "onOpenReservation" | "onIssueStatement" | "onAdjustFolio" | "onReverseCharge">) {
  const [entryFilter, setEntryFilter] = useState<EntryFilter>("all");
  const { invoice, reservation, deposits } = row;
  const initials = row.guest.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("");
  const activity = row.activity.filter(payment => !deposits.some(deposit => deposit.id === payment.id));
  const chargeEntries = (row.charges ?? []).map(charge => ({ id: String(charge.id), kind: "charge" as const, title: String(charge.description ?? "Folio charge"), note: String(charge.category ?? "Charge").replaceAll("_", " "), amount: Number(charge.amount ?? 0), at: String(charge.created_at ?? ""), status: String(charge.status ?? ""), record: charge }));
  const adjustmentEntries = (row.adjustments ?? []).map(adjustment => ({ id: String(adjustment.id), kind: "adjustment" as const, title: String(adjustment.reason ?? "Folio correction"), note: String(adjustment.transaction_type ?? "Adjustment").replaceAll("_", " "), amount: Number(adjustment.amount ?? 0) * (adjustment.direction === "credit" ? -1 : 1), at: String(adjustment.created_at ?? ""), status: "", record: adjustment }));
  const baseAmount = invoice?.amount != null
    ? Number(invoice.amount) - chargeEntries.reduce((sum, entry) => sum + entry.amount, 0) - adjustmentEntries.reduce((sum, entry) => sum + entry.amount, 0)
    : reservation?.total != null ? Number(reservation.total) : null;
  const entries = [
    ...(baseAmount != null ? [{ id: `room:${row.key}`, kind: "room" as const, title: "Booked stay", note: "Base folio obligation", amount: baseAmount, at: String(reservation?.created_at ?? ""), status: "", record: null }] : []),
    ...chargeEntries,
    ...adjustmentEntries,
    ...activity.map(payment => ({ id: String(payment.id), kind: "payment" as const, title: payment.purpose === "refund" ? "Refund" : payment.purpose === "reservation_deposit" ? "Reservation deposit" : "Stay payment", note: String(payment.method ?? "Method unavailable").replaceAll("_", " "), amount: Number(payment.amount ?? 0) * (payment.status === "paid" && payment.purpose !== "refund" ? -1 : 1), at: String(payment.verified_at ?? payment.submitted_at ?? payment.created_at ?? ""), status: String(payment.status ?? ""), record: payment })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const filteredEntries = entries.filter(entry => entryFilter === "all" || entryFilter === "charges" && ["room", "charge"].includes(entry.kind) || entryFilter === "payments" && entry.kind === "payment" || entryFilter === "adjustments" && entry.kind === "adjustment");
  const reservationId = String(reservation?.id ?? invoice?.reservation_id ?? "");
  return <>
    <header className="billing-folio-heading">
      <button className="billing-back" type="button" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" /> Back to folios</button>
      <h2 id="billing-folio-title" tabIndex={-1}>Folio details</h2><small>{invoice?.id ?? "Folio not issued"}</small>
    </header>
    <div className="billing-identity">
      <span aria-hidden="true">{initials}</span>
      <div><h3>{row.guest}</h3>{row.reference && <p>{row.reference}</p>}{row.stay && <p>{row.stay}</p>}</div>
    </div>
    <dl className="billing-balances">
      <div><dt>Folio total</dt><dd>{money(invoice?.amount)}</dd></div>
      <div><dt>Applied payments</dt><dd>{money(invoice?.paid)}</dd></div>
      <div><dt>Folio credit</dt><dd>{money(invoice?.credit_balance ?? 0)}</dd></div>
      <div className="billing-due"><dt>Balance due</dt><dd>{money(row.balance)}</dd></div>
    </dl>
    <div className="billing-contexts">
      {deposits.length > 0 ? <>
        {deposits.map((deposit, index) => <div className="billing-deposit" key={deposit.id}>
          <div className="billing-context" data-tone="review">
            <strong>Deposit awaiting verification</strong>
            <p>{money(deposit.amount)} submitted. Applied payments update after verification.</p>
          </div>
          {canVerifyDeposit(role) && <button type="button" className="btn btn-accent" disabled={readOnly}
            onClick={() => onReviewDeposit({ ...deposit, reservation } as unknown as RecordItem)}>
            <ShieldCheck size={16} aria-hidden="true" /> {deposits.length === 1 ? "Review deposit" : `Review deposit ${index + 1}`}
          </button>}
        </div>)}
        {!canVerifyDeposit(role) && <p className="billing-muted">Accounting reviews deposit submissions.</p>}
      </> : <>
        {row.checkoutDue && <div className="billing-context" data-tone="checkout">
          <strong>{row.overdue ? "Checkout overdue" : "Checkout today"}</strong>
          <p>Review the remaining balance before closing the stay.</p>
        </div>}
        {row.settled && <div className="billing-context" data-tone="settled">
          <strong>Balance settled</strong><p>All posted charges are covered.</p>
        </div>}
        {row.upcoming && (row.balance ?? 0) > 0 && <div className="billing-context">
          <strong>Upcoming stay</strong><p>Balance collection becomes available after check-in.</p>
        </div>}
      </>}
    </div>
    <section className="billing-activity" aria-label="Folio activity">
      <div className="billing-activity-heading"><h3>Folio activity</h3><small>{entries.length} {entries.length === 1 ? "entry" : "entries"}</small></div>
      <div className="billing-activity-filters" role="group" aria-label="Folio activity filter">
        {([ ["all", "All activity"], ["charges", "Charges"], ["payments", "Payments"], ["adjustments", "Corrections"] ] as const).map(([value, text]) =>
          <button key={value} type="button" aria-pressed={entryFilter === value} onClick={() => setEntryFilter(value)}>{text}</button>)}
      </div>
      {filteredEntries.length === 0 ? <p className="billing-muted">No {entryFilter === "all" ? "recorded activity" : entryFilter} on this folio.</p> : <ul>
        {filteredEntries.map(entry => <li key={`${entry.kind}:${entry.id}`}>
          <div className="billing-entry-main"><b>{entry.title}</b><small>{entry.note} · {formatPaymentSubmittedAt(entry.at)}{entry.kind === "payment" && entry.status !== "paid" ? " · Not applied to balance" : ""}</small></div>
          <div className="billing-entry-end"><b>{entry.kind === "payment" && entry.status !== "paid" ? "" : entry.amount < 0 ? "−" : "+"}{formatPeso(Math.abs(entry.amount))}</b>
            {entry.status && <StatusBadge status={entry.status} size="sm" showIcon={false} />}
            {entry.kind === "charge" && role === "accounting" && entry.status !== "reversed" && onReverseCharge &&
              <button type="button" className="billing-entry-action" disabled={readOnly} onClick={() => onReverseCharge(entry.record!)}>Reverse charge</button>}
          </div>
        </li>)}
      </ul>}
      <p className="billing-ledger-note">Corrections are recorded as new entries. Original financial history stays visible.</p>
    </section>
    <div className="billing-actions">
      {reservation && <button type="button" className="btn btn-soft" onClick={() => onOpenReservation(reservation)}><FileText size={16} aria-hidden="true" /> Open reservation</button>}
      {invoice && reservationId && onIssueStatement && <button type="button" className="btn btn-soft" disabled={readOnly} onClick={() => onIssueStatement(reservationId)}>Issue statement</button>}
      {role === "accounting" && invoice && reservationId && onAdjustFolio && invoice.status !== "cancelled" && <button type="button" className="btn btn-soft" disabled={readOnly} onClick={() => onAdjustFolio(reservationId)}>Record adjustment</button>}
      {reservation && !deposits.length && row.inHouse && (row.balance ?? 0) > 0 && canCollectPayment(role) &&
        <button type="button" className="btn btn-accent" disabled={readOnly} onClick={() => onCollect(reservation)}><CreditCard size={16} aria-hidden="true" /> Collect payment</button>}
    </div>
  </>;
}

export default function StaffBillingWorkspace({ role, refreshVersion, search, onSearch, onCollect, onReviewDeposit, onOpenReservation, onIssueStatement, onAdjustFolio, onReverseCharge }: Props) {
  const [read, setRead] = useState<{ data: BillingSnapshot | null; error: string; version: number }>({ data: null, error: "", version: -1 });
  const [retry, setRetry] = useState(0);
  const [queue, setQueue] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const detailRef = useRef<HTMLElement>(null);
  const selectedButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (mobileDetail && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 690px)").matches) {
      detailRef.current?.querySelector<HTMLElement>("#billing-folio-title")?.focus();
    }
  }, [mobileDetail, selected]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/staff/billing", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body: { data?: BillingSnapshot; error?: string } = await response.json().catch(() => ({}));
        if (!response.ok || !body.data || !Array.isArray(body.data.folios)) throw new Error(body.error || "Unable to load Billing.");
        if (!controller.signal.aborted) setRead({ data: body.data, error: "", version: refreshVersion });
      })
      .catch(error => {
        if (!controller.signal.aborted) setRead(current => ({ ...current, error: error instanceof Error ? error.message : "Unable to load Billing." }));
      });
    return () => controller.abort();
  }, [refreshVersion, retry]);

  const snapshot = read.data;
  const rows = useMemo(() => snapshot ? snapshot.folios.map(folio => billingRow(folio, snapshot.today))
    .sort((a, b) => a.priority - b.priority || (b.balance ?? 0) - (a.balance ?? 0)) : [], [snapshot]);
  const matching = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter(row => {
      if (queue === "checkout" && !row.checkoutDue || queue === "review" && !row.deposits.length || queue === "settled" && !row.settled) return false;
      return [row.guest, row.reference, row.invoice?.id, row.reservation?.id, row.stay].join(" ").toLowerCase().includes(needle);
    });
  }, [queue, rows, search]);
  const page = useTablePagination(matching);
  const active = rows.find(row => row.key === selected)
    ?? rows.find(row => selected === `reservation:${row.reservation?.id}`)
    ?? page.rows[0];
  const checkout = rows.filter(row => row.checkoutDue);
  const open = rows.filter(row => (row.balance ?? 0) > 0);
  const sum = (items: Row[]) => formatPeso(items.reduce((total, row) => total + Math.round((row.balance ?? 0) * 100), 0) / 100);

  function selectFolio(row: Row, button: HTMLButtonElement) {
    selectedButtonRef.current = button;
    setSelected(row.key);
    setMobileDetail(true);
    const detail = detailRef.current;
    const ledger = button.closest(".billing-ledger");
    if (detail && ledger && detail.getBoundingClientRect().top >= ledger.getBoundingClientRect().bottom - 1) {
      detail.scrollIntoView?.({ block: "nearest" });
    }
  }

  function backToFolios() {
    setMobileDetail(false);
    requestAnimationFrame(() => selectedButtonRef.current?.focus());
  }

  return <div className="staff-billing">
    <PageHeader title="Billing & payments" subtitle="Find balances, prepare for checkout, and review every charge, correction, and payment behind a folio." />
    {read.error && <div className="data-panel billing-load-error" role="alert">
      <span>{read.error}{read.data ? " Showing the last successful read." : ""}</span>
      <button type="button" className="btn btn-soft" onClick={() => setRetry(value => value + 1)}>Retry billing</button>
    </div>}
    {!read.data ? !read.error && <div className="data-panel billing-loading" role="status" aria-label="Loading billing"><HavenSkeleton /><HavenSkeleton width="65%" /></div> : <>
      {read.data.demo && <p className="billing-muted">Demo data</p>}
      <ModuleSummaryCards ariaLabel="Billing summary" cards={[
        { label: "Outstanding balance", value: sum(open), hint: `${open.length} ${open.length === 1 ? "folio" : "folios"} with a balance`, icon: Wallet, tone: "active" },
        { label: "Due at checkout", value: sum(checkout), hint: `${checkout.length} due today or overdue`, icon: LogOut, tone: "attention" },
        { label: "Deposits to verify", value: rows.reduce((count, row) => count + row.deposits.length, 0), hint: "Awaiting Accounting", icon: ShieldCheck, tone: "today" },
      ]} />
      <div className={`billing-layout${mobileDetail ? " billing-layout--detail" : ""}`}>
        <section className="data-panel billing-ledger" aria-labelledby="billing-list-title">
          <header><h2 id="billing-list-title">Guest folios</h2><p>Find the billing record for a stay.</p></header>
          <HavenDataToolbar label="Folio search and filters"
            search={<HavenSearchInput value={search} onValueChange={value => { onSearch(value); page.setPage(1); setSelected(null); setMobileDetail(false); }}
              label="Search folios" placeholder="Guest, room, or booking #" />}
            quickFilters={<HavenFilterBadges label="Billing queue" options={queues} value={queue}
              onChange={value => { setQueue(value); setSelected(null); setMobileDetail(false); page.setPage(1); }} />} />
          {page.rows.length ? <div className="table-scroll"><table aria-label="Guest folios">
            <thead><tr><th scope="col">Guest / stay</th><th scope="col">Status</th><th scope="col">Balance</th></tr></thead>
            <tbody>{page.rows.map(row => <tr key={row.key} data-selected={active?.key === row.key || undefined}>
              <td><button type="button" aria-pressed={active?.key === row.key} className="billing-select-folio"
                onClick={event => selectFolio(row, event.currentTarget)}>
                <strong>{row.guest}</strong><small>{row.stay || row.reference || row.invoice?.id}</small>
              </button></td>
              <td><StatusBadge {...row.status} variant="soft" size="sm" showIcon={false} /></td>
              <td>{money(row.balance)}</td>
            </tr>)}</tbody>
          </table></div> : <HavenEmptyState icon={<ReceiptText size={22} aria-hidden="true" />}
            title={rows.length ? "No matching folios" : "No folios on record"}
            body={rows.length ? "Try another guest, room, or queue." : "Billing records appear here as stays and deposits are recorded."} />}
          <TablePagination {...page} onPageChange={next => { page.setPage(next); setSelected(null); setMobileDetail(false); }} noun="folios" allTotal={rows.length} />
        </section>
        <aside className="data-panel billing-folio" ref={detailRef} aria-labelledby="billing-folio-title">
          {active ? <FolioDetails key={active.key} row={active} role={role} readOnly={Boolean(read.error || read.data.demo || read.version !== refreshVersion)}
            onCollect={reservation => { setSelected(active.key); onCollect(reservation); }}
            onReviewDeposit={payment => { setSelected(active.key); onReviewDeposit(payment); }}
            onOpenReservation={onOpenReservation} onIssueStatement={onIssueStatement} onAdjustFolio={onAdjustFolio} onReverseCharge={onReverseCharge} onBack={backToFolios} />
            : <><h2 id="billing-folio-title">Folio details</h2><p className="billing-muted">Select a folio to see its balance and actions.</p></>}
        </aside>
      </div>
    </>}
  </div>;
}
