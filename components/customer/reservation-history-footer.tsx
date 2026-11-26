"use client";

import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

export function ReservationHistoryFooter({
  query = "",
  status = "all",
  sort = "recommended",
  page,
  pageCount,
  start,
  end,
  total,
  hasActiveFilters = false,
  noun = "reservations",
}: {
  query?: string;
  status?: string;
  sort?: string;
  page: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
  hasActiveFilters?: boolean;
  noun?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const goToPage = (next: number) => {
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (status !== "all") params.set("status", status);
    if (sort !== "recommended") params.set("sort", sort);
    if (next > 1) params.set("page", String(next));
    const suffix = params.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
  };

  const clear = () => {
    router.replace(pathname, { scroll: false });
  };

  return (
    <div className="reservation-history-footer">
      <div className="reservation-history-footer-info">
        <span className="reservation-history-count" aria-live="polite">
          Showing {start}–{end} of {total} {noun}
        </span>
        {hasActiveFilters && (
          <button type="button" className="btn btn-soft" onClick={clear}>
            <X size={14} aria-hidden="true" />
            Clear filters
          </button>
        )}
      </div>
      {pageCount > 1 && (
        <nav className="reservation-history-pages" aria-label={`${noun[0].toUpperCase()}${noun.slice(1)} pagination`}>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => goToPage(page - 1)}
            disabled={page === 1}
            aria-label={`Previous page of ${noun}`}
          >
            <ChevronLeft aria-hidden="true" size={15} />
            <span>Previous</span>
          </button>
          <span className="reservation-history-page" aria-current="page">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => goToPage(page + 1)}
            disabled={page === pageCount}
            aria-label={`Next page of ${noun}`}
          >
            <span>Next</span>
            <ChevronRight aria-hidden="true" size={15} />
          </button>
        </nav>
      )}
    </div>
  );
}
