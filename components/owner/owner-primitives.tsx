"use client";

import { useId, useMemo, type ReactNode } from "react";
import {
  CircleDollarSign,
  ClipboardCheck,
  Crown,
  Search,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { HavenDataToolbar, HavenEmptyState, HavenSearchInput, HavenSelect } from "@/components/ui";
import { formatHotelDateTime, formatPeso } from "@/lib/format";
import { TablePagination, useTablePagination } from "@/components/ui/table-pagination";

export type Row = Record<string, unknown>;

export type OwnerFilter = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
};

/**
 * Universal internal toolbar: search row FIRST, filter row SECOND
 * (DOM order included — keyboard navigation follows the visual order).
 */
export function OwnerToolbar({
  search,
  setSearch,
  searchLabel,
  searchPlaceholder,
  filters,
  resultCount,
  resultNoun = "records",
  onClear,
}: {
  search: string;
  setSearch: (value: string) => void;
  searchLabel: string;
  searchPlaceholder: string;
  filters: OwnerFilter[];
  resultCount?: number;
  resultNoun?: string;
  onClear?: () => void;
}) {
  const hasActive =
    search.trim() !== "" || filters.some((filter) => filter.value !== "all");
  return (
    <HavenDataToolbar
      variant="internal"
      label={searchLabel}
      search={<HavenSearchInput value={search} onValueChange={setSearch} label={searchLabel} placeholder={searchPlaceholder} />}
      advancedFilters={
        <>
        {filters.map((filter) => (
          <div className="haven-filter" key={filter.label}>
            <span>{filter.label}</span>
            <HavenSelect
              value={filter.value}
              onChange={filter.onChange}
              ariaLabel={`Filter by ${filter.label.toLowerCase()}`}
              options={filter.options}
            />
          </div>
        ))}
        </>
      }
      resultCount={resultCount}
      resultNoun={resultNoun}
      onClearFilters={onClear}
      hasActiveFilters={hasActive}
    />
  );
}

/** Client-side substring filter over already-loaded rows. No refetch. */
export function useOwnerSearch<T extends Row>(rows: readonly T[], search: string): T[] {
  return useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [...rows];
    return rows.filter((row) => JSON.stringify(row).toLowerCase().includes(query));
  }, [rows, search]);
}

/** Polished empty state shared by every Owner module. */
export function OwnerEmpty({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return <HavenEmptyState icon={icon} title={title} body={body} action={action} variant="internal" />;
}

/** Sub-block header inside a module (secondary content grouping). */
export function OwnerSectionHead({
  title,
  note,
  action,
}: {
  title: string;
  note?: string;
  action?: ReactNode;
}) {
  return (
    <div className="owner-section-head">
      <div>
        <h2>{title}</h2>
        {note && <p>{note}</p>}
      </div>
      {action}
    </div>
  );
}

export type OwnerColumn = {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
};

/** Panel + table + pagination + empty state in one consistent language. */
export function OwnerTablePanel({
  title,
  noun,
  note,
  rows,
  columns,
  pageSize = 10,
  empty,
}: {
  title: string;
  noun: string;
  note?: string;
  rows: Row[];
  columns: OwnerColumn[];
  pageSize?: number;
  empty?: ReactNode;
}) {
  const page = useTablePagination(rows, pageSize);
  return (
    <section className="data-panel owner-panel" aria-label={title}>
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          <p>
            {rows.length} authoritative {rows.length === 1 ? noun.replace(/s$/, "") : noun}
          </p>
        </div>
      </div>
      {rows.length === 0 ? (
        (empty ?? (
          <OwnerEmpty icon={<Search size={22} />} title="No matching records" body="Try clearing the search and filters to see every record." />
        ))
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} scope="col">
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {page.rows.map((row, index) => (
                <tr key={String(row.id ?? `${title}-${index}`)}>
                  {columns.map((column) => (
                    <td key={column.key}>{column.render(row)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 && (
        <TablePagination {...page} onPageChange={page.setPage} noun={noun} note={note} />
      )}
    </section>
  );
}

/** User-friendly timestamps in the hotel timezone (replaces raw ISO/UUID-primary cells). */
export function formatOwnerDate(value: unknown, timeZone = "Asia/Manila") {
  return formatHotelDateTime(value === null || value === undefined ? null : String(value), timeZone);
}

const label = (value: unknown) =>
  String(value ?? "—").replaceAll("_", " ");

/**
 * Presentation-only policy formatting. Fixes the currency-on-days bug:
 * day/hour counts render as units, basis points as percent, times as HH:MM.
 * Stored values are never touched.
 */
export function formatPolicyValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key.endsWith("_days")) return `${Number(value)} day${Number(value) === 1 ? "" : "s"}`;
  if (key.endsWith("_age")) return `${Number(value)} year${Number(value) === 1 ? "" : "s"}`;
  if (key.endsWith("_hours")) return `${Number(value)} hour${Number(value) === 1 ? "" : "s"}`;
  if (key.endsWith("_minutes")) return `${Number(value)} min`;
  if (
    key === "cancellation_partial_refund_basis_points" ||
    key === "vat_rate_bp" ||
    key === "service_charge_bp"
  )
    return `${Number(value) / 100}%`;
  if (key.endsWith("_time")) return String(value).slice(0, 5);
  if (/amount|balance|revenue|collected|refund|credit/i.test(key) && Number.isFinite(Number(value)))
    return formatPeso(Number(value));
  if (typeof value === "number") return String(value);
  return label(value);
}

/** Role icon + summary for the authority-hierarchy cards (display only). */
export const OWNER_ROLE_META: Record<string, { summary: string; Icon: LucideIcon }> = {
  owner: { summary: "Executive governance over the platform and its administrators", Icon: Crown },
  admin: { summary: "Governance of accounts, configuration, and policy", Icon: ShieldCheck },
  manager: { summary: "Operational oversight, approvals, and escalations", Icon: ClipboardCheck },
  front_desk: { summary: "Reservations, arrival, and departure coordination", Icon: Users },
  housekeeping: { summary: "Room care, inspection, and maintenance reporting", Icon: Sparkles },
  maintenance: { summary: "Work orders and technical serviceability", Icon: Wrench },
  accounting: { summary: "Payments, folios, refunds, and reconciliation", Icon: CircleDollarSign },
  guest: { summary: "Self-service access to own reservations and requests", Icon: User },
};

/** Collapsible attention group (Operations module). Pure <details> — no JS state. */
export function OwnerCollapse({
  title,
  count,
  children,
  defaultOpen = false,
}: {
  title: string;
  count: number;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const id = useId();
  return (
    <details className="owner-collapse" open={defaultOpen || undefined}>
      <summary aria-describedby={id}>
        <strong>{title}</strong>
        <span className="owner-count" id={id}>
          {count}
        </span>
      </summary>
      <div className="owner-collapse-body">{children}</div>
    </details>
  );
}

/** Client-side tabs over already-loaded data (Departments module). No refetch. */
export function OwnerTabs({
  tabs,
  active,
  onChange,
  label: ariaLabel,
}: {
  tabs: { key: string; label: string; count?: number }[];
  active: string;
  onChange: (key: string) => void;
  label: string;
}) {
  return (
    <div className="owner-tabs" role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          className={active === tab.key ? "active" : ""}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {typeof tab.count === "number" && (
            <span className="owner-count">{tab.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
