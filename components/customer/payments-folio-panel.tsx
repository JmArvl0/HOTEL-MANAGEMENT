"use client";

import { useState, useTransition, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BadgeCheck, Files, WalletCards, X } from "lucide-react";
import { HavenDataToolbar, HavenSearchInput, HavenSelect } from "@/components/ui";
import { ModuleSummaryCards } from "@/components/manager/module-summary-cards";
import { TablePagination } from "@/components/ui/table-pagination";
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

export type FolioFilters = {
  stay: ReservationCategory | "all";
  payment: FolioPaymentState | "all";
  query: string;
};

export function PaymentsFolioPanel({ filters, stayCounts, paymentCounts, pagination, outstanding, paidToDate, children }: {
  filters: FolioFilters;
  stayCounts: Record<FolioFilters["stay"], number>;
  paymentCounts: Record<FolioFilters["payment"], number>;
  pagination: { page: number; pageCount: number; start: number; end: number; total: number };
  outstanding: number;
  paidToDate: number;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState(filters);
  const [previousFilters, setPreviousFilters] = useState(filters);
  if (previousFilters !== filters) {
    setPreviousFilters(filters);
    setActive(filters);
  }
  const hasActiveFilters = filters.stay !== "all" || filters.payment !== "all" || Boolean(filters.query);
  const total = pagination.total;

  const navigate = (next: FolioFilters, page = 1) => {
    const params = new URLSearchParams();
    if (next.stay !== "all") params.set("stay", next.stay);
    if (next.payment !== "all") params.set("pay", next.payment);
    if (next.query.trim()) params.set("q", next.query.trim());
    if (page > 1) params.set("page", String(page));
    const suffix = params.toString();
    setActive(next);
    startTransition(() => {
      router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
    });
  };
  const clearFilters = () => navigate({ stay: "all", payment: "all", query: "" });
  const stayOptions = [
    { value: "all", label: `All stays (${stayCounts.all})` },
    ...Object.entries(STAY_LABELS).map(([value, label]) => ({ value, label: `${label} (${stayCounts[value as ReservationCategory]})` })),
  ];
  const paymentOptions = [
    { value: "all", label: `All payments (${paymentCounts.all})` },
    ...Object.entries(PAYMENT_LABELS).map(([value, label]) => ({ value, label: `${label} (${paymentCounts[value as FolioPaymentState]})` })),
  ];

  return (
    <>
      <div aria-label="Filtered financial summary" aria-live="polite" aria-atomic="true">
        <ModuleSummaryCards
          cards={[
            { label: "Total folios", value: total, hint: `${total} stay record${total === 1 ? "" : "s"}`, icon: Files, tone: "today" },
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
        search={<HavenSearchInput value={active.query} onValueChange={(query) => navigate({ ...active, query })} label="Search folios" placeholder="Booking reference or room" variant="customer" />}
        advancedFilters={
          <>
            <div className="haven-filter folio-filter-control">
              <HavenSelect value={active.stay} onChange={(stay) => navigate({ ...active, stay: stay as FolioFilters["stay"] })} ariaLabel="Stay status" options={stayOptions} />
            </div>
            <div className="haven-filter folio-filter-control">
              <HavenSelect value={active.payment} onChange={(payment) => navigate({ ...active, payment: payment as FolioFilters["payment"] })} ariaLabel="Payment status" options={paymentOptions} />
            </div>
          </>
        }
      />
      <div aria-busy={pending}>
        {total === 0 ? (
          <div className="customer-empty folio-empty">
            <h2>No folios match these filters</h2>
            <p>Try another stay status, payment state, or booking reference.</p>
            <button className="btn btn-soft" type="button" onClick={clearFilters}>Show all folios</button>
          </div>
        ) : (
          <>
            <div className="customer-financial-list">{children}</div>
            <div className="reservation-history-footer folio-footer">
              {hasActiveFilters && (
                <button type="button" className="btn btn-soft" onClick={clearFilters}>
                  <X size={14} aria-hidden="true" />
                  Clear filters
                </button>
              )}
              <TablePagination {...pagination} onPageChange={(page) => navigate(active, page)} noun="folios" />
            </div>
          </>
        )}
      </div>
    </>
  );
}
