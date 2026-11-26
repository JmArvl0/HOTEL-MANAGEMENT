export function paginateTableRows<T>(rows: readonly T[], requestedPage: number, pageSize: number) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const pageCount = Math.max(1, Math.ceil(rows.length / safePageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), pageCount);
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
