"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { BadgeCheck, Files, WalletCards } from "lucide-react";
import { HavenDataToolbar, HavenSearchInput, HavenSelect } from "@/components/ui";
import { formatPeso } from "@/lib/format";
import type { FolioPaymentState, ReservationCategory } from "@/lib/customer";

const STAY_LABELS: Record<ReservationCategory, string> = {
  current: "Current Stay",
  upcoming: "Upcoming Stays",
  past: "Past Stays",
  cancelled: "Cancelled",
};

const PAYMENT_LABELS: Record<FolioPaymentState, string> = {
  pending: "Awaiting Verification",
  due: "Balance Due",
  refund: "Refunds",
  settled: "Settled",
};

export type PaymentsFolioItem = {
  id: string;
  stayState: ReservationCategory;
  paymentState: FolioPaymentState;
  balance: number;
  paid: number;
  searchText: string;
  content: ReactNode;
};

type StayFilter = ReservationCategory | "all";
type PaymentFilter = FolioPaymentState | "all";

const stayValues = Object.keys(STAY_LABELS) as ReservationCategory[];
const paymentValues = Object.keys(PAYMENT_LABELS) as FolioPaymentState[];

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("en");
}

function matchesSearch(item: PaymentsFolioItem, search: string) {
  return !search || normalized(item.searchText).includes(search);
}

function countLabel(count: number) {
  return `${count} stay record${count === 1 ? "" : "s"}`;
}

export function PaymentsFolioPanel({
  items,
  initialStay = "all",
  initialPayment = "all",
  initialQuery = "",
}: {
  items: PaymentsFolioItem[];
  initialStay?: StayFilter;
  initialPayment?: PaymentFilter;
  initialQuery?: string;
}) {
  const [stay, setStay] = useState<StayFilter>(initialStay);
  const [payment, setPayment] = useState<PaymentFilter>(initialPayment);
  const [query, setQuery] = useState(initialQuery);
  const search = normalized(query);

  const filtered = useMemo(
    () => items.filter((item) => matchesSearch(item, search) && (stay === "all" || item.stayState === stay) && (payment === "all" || item.paymentState === payment)),
    [items, payment, search, stay],
  );
  const stayFacet = useMemo(
    () => items.filter((item) => matchesSearch(item, search) && (payment === "all" || item.paymentState === payment)),
    [items, payment, search],
  );
  const paymentFacet = useMemo(
    () => items.filter((item) => matchesSearch(item, search) && (stay === "all" || item.stayState === stay)),
    [items, search, stay],
  );

  const outstanding = filtered.reduce((sum, item) => sum + item.balance, 0);
  const paidToDate = filtered.reduce((sum, item) => sum + item.paid, 0);
  const hasActiveFilters = stay !== "all" || payment !== "all" || Boolean(search);

  useEffect(() => {
    const params = new URLSearchParams();
    if (stay !== "all") params.set("stay", stay);
    if (payment !== "all") params.set("pay", payment);
    if (query.trim()) params.set("q", query.trim());
    const suffix = params.toString();
    window.history.replaceState(null, "", suffix ? `${window.location.pathname}?${suffix}` : window.location.pathname);
  }, [payment, query, stay]);

  const clearFilters = () => {
    setStay("all");
    setPayment("all");
    setQuery("");
  };

  const stayOptions = [
    { value: "all", label: `All Stays (${stayFacet.length})` },
    ...stayValues.map((value) => ({
      value,
      label: `${STAY_LABELS[value]} (${stayFacet.filter((item) => item.stayState === value).length})`,
    })),
  ];
  const paymentOptions = [
    { value: "all", label: `All Payment States (${paymentFacet.length})` },
    ...paymentValues.map((value) => ({
      value,
      label: `${PAYMENT_LABELS[value]} (${paymentFacet.filter((item) => item.paymentState === value).length})`,
    })),
  ];

  return (
    <>
      <section className="folio-kpi-grid" aria-label="Filtered financial summary" aria-live="polite" aria-atomic="true">
        <article className="folio-kpi-card">
          <span className="folio-kpi-icon"><Files size={19} aria-hidden="true" /></span>
          <div><small>Total folios</small><strong>{filtered.length}</strong><p>{countLabel(filtered.length)}</p></div>
        </article>
        <article className={`folio-kpi-card ${outstanding > 0 ? "has-balance" : "is-clear"}`}>
          <span className="folio-kpi-icon"><WalletCards size={19} aria-hidden="true" /></span>
          <div><small>Outstanding balance</small><strong>{formatPeso(outstanding)}</strong><p>{outstanding > 0 ? "Payment remains due" : "All balances settled"}</p></div>
        </article>
        <article className="folio-kpi-card is-paid">
          <span className="folio-kpi-icon"><BadgeCheck size={19} aria-hidden="true" /></span>
          <div><small>Total paid to date</small><strong>{formatPeso(paidToDate)}</strong><p>Verified payments received</p></div>
        </article>
      </section>

      <HavenDataToolbar
        variant="customer"
        label="Filter payment and folio records"
        filtersLayout="compact"
        search={
          <HavenSearchInput
            value={query}
            onValueChange={setQuery}
            label="Search folios"
            placeholder="Booking reference or room"
            variant="customer"
            debounceMs={0}
          />
        }
        advancedFilters={
          <>
            <div className="haven-filter folio-filter-control">
              <span>Stay status</span>
              <HavenSelect value={stay} onChange={(value) => setStay(value as StayFilter)} ariaLabel="Stay status" options={stayOptions} />
            </div>
            <div className="haven-filter folio-filter-control">
              <span>Payment status</span>
              <HavenSelect value={payment} onChange={(value) => setPayment(value as PaymentFilter)} ariaLabel="Payment status" options={paymentOptions} />
            </div>
          </>
        }
        resultCount={filtered.length}
        resultNoun="folios"
        onClearFilters={clearFilters}
        hasActiveFilters={hasActiveFilters}
      />

      {filtered.length === 0 ? (
        <div className="customer-empty folio-empty">
          <h2>No folios match these filters</h2>
          <p>Try another stay status, payment state, or booking reference.</p>
          <button className="btn btn-soft" type="button" onClick={clearFilters}>Show all folios</button>
        </div>
      ) : (
        <div className="customer-financial-list">{filtered.map((item) => <Fragment key={item.id}>{item.content}</Fragment>)}</div>
      )}
    </>
  );
}
