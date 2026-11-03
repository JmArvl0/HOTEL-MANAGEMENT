"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { BadgeCheck, Files, WalletCards, X } from "lucide-react";
import { HavenDataToolbar, HavenSearchInput, HavenSelect } from "@/components/ui";
import { ModuleSummaryCards } from "@/components/manager/module-summary-cards";
import { TablePagination, useTablePagination } from "@/components/ui/table-pagination";
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
  const page = useTablePagination(filtered, 4);
  useEffect(() => { page.setPage(1); }, [stay, payment, search]); // eslint-disable-line react-hooks/exhaustive-deps

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
    { value: "all", label: `All stays (${stayFacet.length})` },
    ...stayValues.map((value) => ({
      value,
      label: `${STAY_LABELS[value]} (${stayFacet.filter((item) => item.stayState === value).length})`,
    })),
  ];
  const paymentOptions = [
    { value: "all", label: `All payments (${paymentFacet.length})` },
    ...paymentValues.map((value) => ({
      value,
      label: `${PAYMENT_LABELS[value]} (${paymentFacet.filter((item) => item.paymentState === value).length})`,
    })),
  ];

  return (
    <>
      <div aria-label="Filtered financial summary" aria-live="polite" aria-atomic="true">
        {/* Guest surface: customer tokens (--cp-*) paint the shared card via
            ui-primitives fallback chains; tones land as semantic chips. */}
        <ModuleSummaryCards
          cards={[
            { label: "Total folios", value: filtered.length, hint: countLabel(filtered.length), icon: Files, tone: "today" },
            { label: "Outstanding balance", value: formatPeso(outstanding), hint: outstanding > 0 ? "Payment remains due" : "All balances settled", icon: WalletCards, tone: outstanding > 0 ? "attention" : "done" },
            { label: "Total paid to date", value: formatPeso(paidToDate), hint: "Verified payments received", icon: BadgeCheck, tone: "done" },
          ]}
          ariaLabel="Financial summary"
        />
      </div>

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
              <HavenSelect value={stay} onChange={(value) => setStay(value as StayFilter)} ariaLabel="Stay status" options={stayOptions} />
            </div>
            <div className="haven-filter folio-filter-control">
              <HavenSelect value={payment} onChange={(value) => setPayment(value as PaymentFilter)} ariaLabel="Payment status" options={paymentOptions} />
            </div>
          </>
        }
      />

      {filtered.length === 0 ? (
        <div className="customer-empty folio-empty">
          <h2>No folios match these filters</h2>
          <p>Try another stay status, payment state, or booking reference.</p>
          <button className="btn btn-soft" type="button" onClick={clearFilters}>Show all folios</button>
        </div>
      ) : (
        <>
          <div className="customer-financial-list">{page.rows.map((item) => <Fragment key={item.id}>{item.content}</Fragment>)}</div>
          <div className="reservation-history-footer folio-footer">
            {hasActiveFilters && (
              <button type="button" className="btn btn-soft" onClick={() => { clearFilters(); page.setPage(1); }}>
                <X size={14} aria-hidden="true" />
                Clear filters
              </button>
            )}
            <TablePagination {...page} onPageChange={page.setPage} noun="folios" />
          </div>
        </>
      )}
    </>
  );
}
