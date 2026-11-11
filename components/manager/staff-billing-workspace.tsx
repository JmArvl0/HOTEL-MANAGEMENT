"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CreditCard, FileText, LogOut, ReceiptText, ShieldCheck, Wallet } from "lucide-react";
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
};

function FolioDetails({ row, role, readOnly, onCollect, onReviewDeposit, onOpenReservation }: {
  row: Row;
  role: Role;
  readOnly: boolean;
} & Pick<Props, "onCollect" | "onReviewDeposit" | "onOpenReservation">) {
  const { invoice, reservation, deposits } = row;
  const initials = row.guest.trim().split(/\s+/).slice(0, 2).map(word => word[0]).join("");
  const activity = row.activity.filter(payment => !deposits.some(deposit => deposit.id === payment.id));
  return <>
    <header className="billing-folio-heading"><h2 id="billing-folio-title">Folio details</h2><small>{invoice?.id ?? "Folio not issued"}</small></header>
    <div className="billing-identity">
      <span aria-hidden="true">{initials}</span>
      <div><h3>{row.guest}</h3>{row.reference && <p>{row.reference}</p>}{row.stay && <p>{row.stay}</p>}</div>
    </div>
    <dl className="billing-balances">
      <div><dt>Folio total</dt><dd>{money(invoice?.amount)}</dd></div>
      <div><dt>Applied payments</dt><dd>{money(invoice?.paid)}</dd></div>
      {Number(invoice?.credit_balance ?? 0) > 0 && <div><dt>Folio credit</dt><dd>{money(invoice?.credit_balance)}</dd></div>}
      <div className="billing-due"><dt>Balance due</dt><dd>{money(row.balance)}</dd></div>
    </dl>
    <div className="billing-actions">
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
        {reservation && row.inHouse && (row.balance ?? 0) > 0 && canCollectPayment(role) &&
          <button type="button" className="btn btn-accent" disabled={readOnly} onClick={() => onCollect(reservation)}>
            <CreditCard size={16} aria-hidden="true" /> Collect payment
          </button>}
      </>}
      {reservation && <button type="button" className="btn btn-soft" onClick={() => onOpenReservation(reservation)}>
        <FileText size={16} aria-hidden="true" /> Open reservation
      </button>}
    </div>
    <section className="billing-activity" aria-label="Payment activity">
      <h3>Payment activity</h3>
      {activity.length === 0 ? <p className="billing-muted">No recent payment records on this folio.</p> : <ul>
        {activity.map(payment => <li key={payment.id}>
          <div><b>{money(payment.amount)}</b><small>{payment.purpose === "refund" ? "Refund" : payment.purpose === "reservation_deposit" ? "Deposit" : "Stay payment"} · {String(payment.method ?? "").replaceAll("_", " ") || "Method unavailable"}</small></div>
          <div><StatusBadge status={String(payment.status ?? "")} size="sm" showIcon={false} />
            <small>{formatPaymentSubmittedAt(payment.verified_at ?? payment.submitted_at ?? payment.created_at)}</small></div>
        </li>)}
      </ul>}
    </section>
  </>;
}

export default function StaffBillingWorkspace({ role, refreshVersion, search, onSearch, onCollect, onReviewDeposit, onOpenReservation }: Props) {
  const [read, setRead] = useState<{ data: BillingSnapshot | null; error: string; version: number }>({ data: null, error: "", version: -1 });
  const [retry, setRetry] = useState(0);
  const [queue, setQueue] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);

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
    setSelected(row.key);
    const detail = detailRef.current;
    const ledger = button.closest(".billing-ledger");
    if (detail && ledger && detail.getBoundingClientRect().top >= ledger.getBoundingClientRect().bottom - 1) {
      detail.scrollIntoView?.({ block: "nearest" });
    }
  }

  return <div className="staff-billing">
    <PageHeader title="Billing & payments" subtitle="Find balances, prepare for checkout, and review payment status." />
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
      <div className="billing-layout">
        <section className="data-panel billing-ledger" aria-labelledby="billing-list-title">
          <header><h2 id="billing-list-title">Guest folios</h2><p>Find the billing record for a stay.</p></header>
          <HavenDataToolbar label="Folio search and filters"
            search={<HavenSearchInput value={search} onValueChange={value => { onSearch(value); page.setPage(1); setSelected(null); }}
              label="Search folios" placeholder="Guest, room, or booking #" />}
            quickFilters={<HavenFilterBadges label="Billing queue" options={queues} value={queue}
              onChange={value => { setQueue(value); setSelected(null); page.setPage(1); }} />} />
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
          <TablePagination {...page} onPageChange={next => { page.setPage(next); setSelected(null); }} noun="folios" allTotal={rows.length} />
        </section>
        <aside className="data-panel billing-folio" ref={detailRef} aria-labelledby="billing-folio-title">
          {active ? <FolioDetails row={active} role={role} readOnly={Boolean(read.error || read.data.demo || read.version !== refreshVersion)}
            onCollect={reservation => { setSelected(active.key); onCollect(reservation); }}
            onReviewDeposit={payment => { setSelected(active.key); onReviewDeposit(payment); }}
            onOpenReservation={onOpenReservation} />
            : <><h2 id="billing-folio-title">Folio details</h2><p className="billing-muted">Select a folio to see its balance and actions.</p></>}
        </aside>
      </div>
    </>}
  </div>;
}
