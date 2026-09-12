"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const tableCollator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
  ignorePunctuation: true,
});

export function sortTableRows<T>(rows: readonly T[], getLabel: (row: T) => string | null | undefined) {
  return [...rows].sort((left, right) =>
    tableCollator.compare(getLabel(left)?.trim() ?? "", getLabel(right)?.trim() ?? ""),
  );
}

export function paginateTableRows<T>(rows: readonly T[], requestedPage: number, pageSize: number) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(rows.length / safePageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage)), pageCount);
  const offset = (page - 1) * safePageSize;
  const pageRows = rows.slice(offset, offset + safePageSize);

  return {
    rows: pageRows,
    page,
    pageCount,
    start: pageRows.length ? offset + 1 : 0,
    end: offset + pageRows.length,
    total: rows.length,
  };
}

export function useTablePagination<T>(rows: readonly T[], pageSize = 10) {
  const [requestedPage, setRequestedPage] = useState(1);
  const result = paginateTableRows(rows, requestedPage, pageSize);

  return {
    ...result,
    setPage: (page: number) => setRequestedPage(Math.min(Math.max(1, page), result.pageCount)),
  };
}

type TablePaginationProps = {
  page: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
  onPageChange: (page: number) => void;
  noun?: string;
  allTotal?: number;
  note?: string;
};

export function TablePagination({
  page,
  pageCount,
  start,
  end,
  total,
  onPageChange,
  noun = "records",
  allTotal,
  note,
}: TablePaginationProps) {
  const hasMultiplePages = pageCount > 1;
  const range = hasMultiplePages ? `${start}\u2013${end}` : `${total}`;
  const totalContext = allTotal === undefined || allTotal === total ? total : allTotal;

  return (
    <nav className="table-pagination" aria-label={`${noun} pagination`}>
      <div className="table-pagination-copy" aria-live="polite">
        <span className="table-pagination-summary">
          Showing {range} of {totalContext} {noun}
        </span>
        {note ? <span className="table-pagination-note">{note}</span> : null}
      </div>

      {hasMultiplePages ? (
        <div className="table-pagination-controls">
          <button
            type="button"
            className="table-pagination-button"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            aria-label={`Previous page of ${noun}`}
          >
            <ChevronLeft aria-hidden="true" size={15} />
            <span>Previous</span>
          </button>
          <span className="table-pagination-page" aria-current="page">
            Page {page} of {pageCount}
          </span>
          <button
            type="button"
            className="table-pagination-button"
            onClick={() => onPageChange(page + 1)}
            disabled={page === pageCount}
            aria-label={`Next page of ${noun}`}
          >
            <span>Next</span>
            <ChevronRight aria-hidden="true" size={15} />
          </button>
        </div>
      ) : null}
    </nav>
  );
}
