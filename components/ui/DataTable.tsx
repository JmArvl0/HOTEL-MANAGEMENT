"use client";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getExpandedRowModel,
  flexRender,
  createColumnHelper as createTanStackColumnHelper,
  SortingState,
  ColumnFiltersState,
  PaginationState,
  ExpandedState,
  RowSelectionState,
  Table,
  Column,
} from "@tanstack/react-table";
import { Fragment, useState, useMemo, useCallback, useEffect } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, Search, Filter, FilterX, Download, Eye, Edit, Trash2, MoreHorizontal } from "lucide-react";
import { StatusBadge } from "./StatusBadge";

export interface DataTableColumn<T> {
  accessorKey: keyof T | string;
  header: string;
  cell?: (value: unknown, row: T) => React.ReactNode;
  enableSorting?: boolean;
  enableFiltering?: boolean;
  filterType?: "text" | "number" | "select" | "date";
  filterOptions?: { value: string; label: string }[];
  size?: number;
  minSize?: number;
  maxSize?: number;
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  keyAccessor: (row: T) => string;
  pageSize?: number;
  pageSizeOptions?: number[];
  enableSorting?: boolean;
  enableFiltering?: boolean;
  enablePagination?: boolean;
  enableRowSelection?: boolean;
  enableColumnResizing?: boolean;
  enableVirtualization?: boolean;
  virtualizedRowHeight?: number;
  virtualizedOverscan?: number;
  onRowClick?: (row: T) => void;
  onSelectionChange?: (selection: RowSelectionState) => void;
  initialSelection?: RowSelectionState;
  loading?: boolean;
  emptyMessage?: string;
  emptyAction?: React.ReactNode;
  striped?: boolean;
  hoverable?: boolean;
  compact?: boolean;
  className?: string;
  renderToolbar?: (props: { filters: ColumnFiltersState; setFilters: (filters: ColumnFiltersState) => void; sorting: SortingState; setSorting: (sorting: SortingState) => void }) => React.ReactNode;
  renderRowActions?: (row: T) => React.ReactNode;
  renderExpandedContent?: (row: T) => React.ReactNode;
  caption?: string;
  ariaLabel?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  keyAccessor,
  pageSize = 25,
  pageSizeOptions = [10, 25, 50, 100],
  enableSorting = true,
  enableFiltering = true,
  enablePagination = true,
  enableRowSelection = false,
  enableColumnResizing = false,
  enableVirtualization = false,
  virtualizedRowHeight = 48,
  virtualizedOverscan = 5,
  onRowClick,
  onSelectionChange,
  initialSelection,
  loading = false,
  emptyMessage = "No data available",
  emptyAction,
  striped = true,
  hoverable = true,
  compact = false,
  className = "",
  renderToolbar,
  renderRowActions,
  renderExpandedContent,
  caption,
  ariaLabel = "Data table",
}: DataTableProps<T>) {
  const columnHelper = createTanStackColumnHelper<T>();

  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });
  const [expanded, setExpanded] = useState<ExpandedState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>(initialSelection || {});
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});

  const tableColumns = useMemo(() => {
    return columns.map((col) => {
      const baseColumn = columnHelper.accessor((row: T) => row[col.accessorKey as keyof T], {
        id: String(col.accessorKey),
        header: col.header,
        cell: (info) => col.cell ? col.cell(info.getValue(), info.row.original) : String(info.renderValue() ?? ""),
        enableSorting: col.enableSorting !== false && enableSorting,
        enableColumnFilter: col.enableFiltering !== false && enableFiltering,
        size: col.size,
        minSize: col.minSize,
        maxSize: col.maxSize,
      });

      return baseColumn;
    });
  }, [columns, enableSorting, enableFiltering, columnHelper]);

  // Add selection column if enabled
  const columnsWithSelection = useMemo(() => {
    if (!enableRowSelection) return tableColumns;

    return [
      columnHelper.display({
        id: "selection",
        header: ({ table }) => (
          <input
            type="checkbox"
            checked={table.getIsAllPageRowsSelected()}
            ref={(el) => { if (el) el.indeterminate = table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected(); }}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
            aria-label="Select all rows"
            className="form-checkbox"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={(e) => row.toggleSelected(e.target.checked)}
            aria-label="Select row"
            className="form-checkbox"
          />
        ),
        size: 48,
        enableSorting: false,
        enableColumnFilter: false,
      }),
      ...tableColumns,
    ];
  }, [tableColumns, enableRowSelection, columnHelper]);

  // Add actions column if renderRowActions provided
  const finalColumns = useMemo(() => {
    if (!renderRowActions) return columnsWithSelection;

    return [
      ...columnsWithSelection,
      columnHelper.display({
        id: "actions",
        header: "Actions",
        cell: ({ row }) => renderRowActions(row.original),
        enableSorting: false,
        enableColumnFilter: false,
        size: 120,
      }),
    ];
  }, [columnsWithSelection, renderRowActions, columnHelper]);

  // Add expanded column if renderExpandedContent provided
  const columnsWithExpansion = useMemo(() => {
    if (!renderExpandedContent) return finalColumns;

    return [
      columnHelper.display({
        id: "expand",
        header: "",
        cell: ({ row }) => (
          <button
            onClick={() => row.toggleExpanded()}
            aria-expanded={row.getIsExpanded()}
            aria-label={row.getIsExpanded() ? "Collapse row" : "Expand row"}
            className="expand-button"
          >
            {row.getIsExpanded() ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        ),
        size: 40,
        enableSorting: false,
        enableColumnFilter: false,
      }),
      ...finalColumns,
    ];
  }, [finalColumns, columnHelper]);

  const table = useReactTable({
    data,
    columns: columnsWithExpansion,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    state: {
      sorting,
      columnFilters,
      pagination,
      expanded,
      rowSelection,
      globalFilter,
      columnVisibility,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onPaginationChange: setPagination,
    onExpandedChange: setExpanded,
    onRowSelectionChange: (updater) => {
      const newSelection = typeof updater === "function" ? updater(rowSelection) : updater;
      setRowSelection(newSelection);
      onSelectionChange?.(newSelection);
    },
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    initialState: {
      pagination: { pageIndex: 0, pageSize },
      rowSelection: initialSelection || {},
    },
    manualPagination: false,
    manualFiltering: false,
    manualSorting: false,
    autoResetPageIndex: false,
    autoResetExpanded: false,
    meta: { compact },
  });

  const handleGlobalFilterChange = useCallback((value: string) => {
    setGlobalFilter(value);
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const handleColumnFilterChange = useCallback((columnId: string, value: unknown) => {
    setColumnFilters((prev) => {
      const existing = prev.find((f) => f.id === columnId);
      if (value === "" || value === undefined || value === null) {
        return prev.filter((f) => f.id !== columnId);
      }
      if (existing) {
        return prev.map((f) => (f.id === columnId ? { ...f, value } : f));
      }
      return [...prev, { id: columnId, value }];
    });
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, []);

  const handleSortChange = useCallback((columnId: string, desc: boolean) => {
    setSorting((prev) => {
      const existing = prev.find((s) => s.id === columnId);
      if (existing) {
        if (desc === false) {
          return prev.filter((s) => s.id !== columnId);
        }
        return prev.map((s) => (s.id === columnId ? { id: columnId, desc } : s));
      }
      return [...prev, { id: columnId, desc }];
    });
  }, []);

  const getFilterInput = (column: Column<T, unknown>) => {
    const filter = column.getFilterValue();
    const filterType = columns.find((c) => c.accessorKey === column.id)?.filterType || "text";
    const filterOptions = columns.find((c) => c.accessorKey === column.id)?.filterOptions;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      handleColumnFilterChange(column.id, e.target.value);
    };

    switch (filterType) {
      case "select":
        return (
          <select value={filter as string} onChange={handleChange} className="filter-input" aria-label={`Filter ${column.columnDef.header}`}>
            <option value="">All</option>
            {filterOptions?.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );
      case "number":
        return (
          <input
            type="number"
            value={filter as string}
            onChange={handleChange}
            className="filter-input"
            placeholder="Filter..."
            aria-label={`Filter ${column.columnDef.header}`}
          />
        );
      case "date":
        return (
          <input
            type="date"
            value={filter as string}
            onChange={handleChange}
            className="filter-input"
            aria-label={`Filter ${column.columnDef.header}`}
          />
        );
      default:
        return (
          <input
            type="text"
            value={filter as string}
            onChange={handleChange}
            className="filter-input"
            placeholder="Filter..."
            aria-label={`Filter ${column.columnDef.header}`}
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="data-table-loading" role="status" aria-live="polite">
        <div className="loading-spinner" />
        <p>Loading data...</p>
      </div>
    );
  }

  const rowCount = data.length;
  const pageCount = table.getPageCount();

  return (
    <div className={`data-table-container ${className}`}>
      {caption && <caption className="visually-hidden">{caption}</caption>}

      {/* Toolbar */}
      <div className="data-table-toolbar">
        <div className="toolbar-left">
          {renderToolbar ? (
            renderToolbar({ filters: columnFilters, setFilters: setColumnFilters, sorting, setSorting })
          ) : (
            <>
              {enableFiltering && (
                <div className="global-filter-wrapper">
                  <Search className="filter-icon" aria-hidden="true" />
                  <input
                    type="search"
                    value={globalFilter}
                    onChange={(e) => handleGlobalFilterChange(e.target.value)}
                    placeholder="Search all columns..."
                    className="global-filter-input"
                    aria-label="Search table"
                  />
                  {globalFilter && (
                    <button
                      onClick={() => handleGlobalFilterChange("")}
                      className="filter-clear"
                      aria-label="Clear search"
                    >
                      <FilterX size={14} />
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {/* Column visibility */}
          {enableColumnResizing && table.getAllLeafColumns().length > 0 && (
            <div className="column-visibility">
              <button className="toolbar-btn" aria-label="Column visibility">
                <MoreHorizontal size={16} />
              </button>
              <div className="column-visibility-dropdown">
                {table.getAllLeafColumns().map((col) => (
                  <label key={col.id} className="column-visibility-item">
                    <input
                      type="checkbox"
                      checked={col.getIsVisible()}
                      onChange={(e) => col.toggleVisibility(e.target.checked)}
                    />
                    <span>{col.columnDef.header as string}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Export */}
          <button className="toolbar-btn" aria-label="Export to CSV" onClick={() => exportToCSV(table)}>
            <Download size={16} />
          </button>
        </div>

        <div className="toolbar-right">
          {enablePagination && (
            <div className="pagination-controls">
              <select
                value={pagination.pageSize}
                onChange={(e) => {
                  setPagination((prev) => ({ ...prev, pageSize: Number(e.target.value), pageIndex: 0 }));
                }}
                className="page-size-select"
                aria-label="Rows per page"
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size} per page
                  </option>
                ))}
              </select>

              <div className="pagination-buttons">
                <button
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                  className="pagination-btn"
                  aria-label="Previous page"
                >
                  <ChevronUp size={14} />
                </button>
                <span className="pagination-info" aria-live="polite">
                  Page {pagination.pageIndex + 1} of {pageCount}
                </span>
                <button
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                  className="pagination-btn"
                  aria-label="Next page"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="data-table-wrapper" role="region" aria-label={ariaLabel} tabIndex={0}>
        <table className={`data-table ${striped ? "striped" : ""} ${hoverable ? "hoverable" : ""} ${compact ? "compact" : ""}`}>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className={`data-table-th ${header.column.getCanSort() ? "sortable" : ""} ${header.column.getIsSorted() ? (header.column.getIsSorted() === "asc" ? "sort-asc" : "sort-desc") : ""}`}
                    style={{
                      width: header.getSize(),
                      minWidth: header.column.columnDef.minSize,
                      maxWidth: header.column.columnDef.maxSize,
                    }}
                    scope="col"
                  >
                    <div className="th-content">
                      <span>{flexRender(header.column.columnDef.header, header.getContext())}</span>
                      {header.column.getCanSort() && (
                        <button
                          onClick={() => header.column.toggleSorting()}
                          className="sort-button"
                          aria-label={header.column.getIsSorted() ? (header.column.getIsSorted() === "asc" ? "Sorted ascending, click to remove sort" : "Sorted descending, click to sort ascending") : "Click to sort ascending"}
                        >
                          {header.column.getIsSorted() ? (header.column.getIsSorted() === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />) : <ChevronsUpDown size={14} />}
                        </button>
                      )}
                      {enableFiltering && header.column.getCanFilter() && (
                        <div className="filter-header">
                          {getFilterInput(header.column)}
                        </div>
                      )}
                    </div>
                    {enableColumnResizing && (
                      <div
                        className="resize-handle"
                        onMouseDown={(e) => header.getResizeHandler()(e.nativeEvent)}
                        onTouchStart={(e) => header.getResizeHandler()(e.nativeEvent)}
                        aria-label="Resize column"
                      />
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={table.getAllLeafColumns().length} className="data-table-empty">
                  <div className="empty-state">
                    {emptyAction || emptyMessage}
                  </div>
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    className={`data-table-row ${row.getIsSelected() ? "selected" : ""} ${row.getIsExpanded() ? "expanded" : ""}`}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    style={{ cursor: onRowClick ? "pointer" : undefined }}
                    data-row-key={keyAccessor(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="data-table-td">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                  {renderExpandedContent && row.getIsExpanded() && (
                    <tr className="data-table-expanded-row">
                      <td colSpan={table.getAllLeafColumns().length} className="data-table-expanded-cell">
                        {renderExpandedContent(row.original)}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="data-table-mobile-cards" aria-hidden="true">
        {table.getRowModel().rows.map((row) => (
          <article key={row.id} className={`data-table-card ${row.getIsSelected() ? "selected" : ""}`}>
            {enableRowSelection && (
              <label className="card-selection">
                <input
                  type="checkbox"
                  checked={row.getIsSelected()}
                  onChange={(e) => row.toggleSelected(e.target.checked)}
                  className="form-checkbox"
                />
                <span className="visually-hidden">Select row</span>
              </label>
            )}
            <div className="card-content">
              {row.getVisibleCells().map((cell) => (
                <div key={cell.id} className="card-field">
                  <span className="card-label">{cell.column.columnDef.header as string}</span>
                  <span className="card-value">{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
                </div>
              ))}
              {renderRowActions && (
                <div className="card-actions">
                  {renderRowActions(row.original)}
                </div>
              )}
            </div>
          </article>
        ))}
        {table.getRowModel().rows.length === 0 && (
          <div className="mobile-empty-state">
            {emptyAction || emptyMessage}
          </div>
        )}
      </div>

      {/* Pagination Info */}
      {enablePagination && (
        <div className="data-table-footer">
          <p className="pagination-summary" aria-live="polite">
            Showing {Math.min((pagination.pageIndex * pagination.pageSize) + 1, rowCount)} to {Math.min((pagination.pageIndex + 1) * pagination.pageSize, rowCount)} of {rowCount} rows
          </p>
        </div>
      )}
    </div>
  );
}

function exportToCSV<T>(table: Table<T>) {
  const headers = table.getAllLeafColumns().map((col) => col.columnDef.header as string).join(",");
  const rows = table.getFilteredRowModel().rows.map((row) =>
    row.getVisibleCells().map((cell) => {
      const value = cell.getValue();
      if (typeof value === "string" && value.includes(",")) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    }).join(",")
  );
  const csv = [headers, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "table-export.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}

export type ColumnDef<T> = DataTableColumn<T>;

// Helper to create columns with proper typing
export function createColumnHelper<T>() {
  return {
    accessor: <K extends keyof T>(accessorKey: K, options: Omit<DataTableColumn<T>, "accessorKey">) => ({
      accessorKey,
      ...options,
    }),
    display: (options: Omit<DataTableColumn<T>, "accessorKey"> & { id: string }) => ({
      accessorKey: options.id,
      ...options,
    }),
  };
}