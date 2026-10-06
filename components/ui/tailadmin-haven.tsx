"use client";

import React, { ReactNode, forwardRef } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Info,
  X,
} from "lucide-react";

/* =============================================================================
   1. TAILADMIN COMPONENT CARD
   ============================================================================= */
export interface ComponentCardProps {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}

export function ComponentCard({
  title,
  subtitle,
  action,
  children,
  footer,
  className = "",
  bodyClassName = "",
  id,
}: ComponentCardProps) {
  return (
    <div className={`component-card saas-card ${className}`.trim()} id={id}>
      {(title || action) && (
        <div className="panel-heading">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action && <div className="card-action">{action}</div>}
        </div>
      )}
      <div className={`card-body ${bodyClassName}`.trim()}>{children}</div>
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
}

/* =============================================================================
   2. TAILADMIN METRIC / STAT CARD (EcommerceMetrics Pattern)
   ============================================================================= */
export type StatTone = "brand" | "success" | "warning" | "danger" | "neutral";

export interface StatCardProps {
  title: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  trend?: {
    value: string | number;
    isPositive?: boolean;
    label?: string;
  };
  badge?: ReactNode;
  tone?: StatTone;
  onClick?: () => void;
  className?: string;
}

export function StatCard({
  title,
  value,
  hint,
  icon,
  trend,
  badge,
  tone = "brand",
  onClick,
  className = "",
}: StatCardProps) {
  const isClickable = Boolean(onClick);
  const toneClasses: Record<StatTone, string> = {
    brand: "stat-tone-brand",
    success: "stat-tone-success",
    warning: "stat-tone-warning",
    danger: "stat-tone-danger",
    neutral: "stat-tone-neutral",
  };

  const content = (
    <>
      <div className="stat-card-header flex items-center justify-between">
        {icon && (
          <div className={`stat-icon-box ${toneClasses[tone]}`} aria-hidden="true">
            {icon}
          </div>
        )}
        {badge}
        {trend && (
          <span
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
              trend.isPositive
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
                : "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400"
            }`}
          >
            {trend.isPositive ? (
              <ArrowUpRight size={14} aria-hidden="true" />
            ) : (
              <ArrowDownRight size={14} aria-hidden="true" />
            )}
            {trend.value}
          </span>
        )}
      </div>

      <div className="stat-card-body mt-4">
        <span className="stat-label text-sm text-gray-500 dark:text-gray-400 font-medium block">
          {title}
        </span>
        <h4 className="stat-value text-2xl lg:text-3xl font-bold tracking-tight text-gray-900 dark:text-white mt-1 tabular-nums">
          {value}
        </h4>
        {hint && (
          <p className="stat-hint text-xs text-gray-400 dark:text-gray-500 mt-1">
            {hint}
          </p>
        )}
      </div>
    </>
  );

  return isClickable ? (
    <button
      type="button"
      className={`metric-card mod-kpi stat-card text-left w-full cursor-pointer transition-all hover:scale-[1.01] ${className}`.trim()}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <article className={`metric-card mod-kpi stat-card ${className}`.trim()}>
      {content}
    </article>
  );
}

/* =============================================================================
   3. TAILADMIN PAGE BREADCRUMB & PAGE HEADER
   ============================================================================= */
export interface BreadcrumbCrumb {
  label: string;
  href?: string;
}

export interface TailAdminPageHeaderProps {
  pageTitle: string;
  subtitle?: string;
  eyebrow?: string;
  breadcrumbs?: BreadcrumbCrumb[];
  actions?: ReactNode;
  className?: string;
}

export function TailAdminPageHeader({
  pageTitle,
  subtitle,
  eyebrow = "HAVEN MAKATI",
  breadcrumbs,
  actions,
  className = "",
}: TailAdminPageHeaderProps) {
  return (
    <div className={`page-title page-header ${className}`.trim()}>
      <div className="flex-1 min-w-0">
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{pageTitle}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="breadcrumb" aria-label="Breadcrumb">
            <ol className="breadcrumb-list">
              <li>
                <Link href="/" className="breadcrumb-link">
                  Home
                </Link>
              </li>
              {breadcrumbs.map((crumb, idx) => {
                const isLast = idx === breadcrumbs.length - 1;
                return (
                  <li key={idx} className="breadcrumb-item">
                    <span className="breadcrumb-separator" aria-hidden="true">
                      <ChevronRight size={14} />
                    </span>
                    {crumb.href && !isLast ? (
                      <Link href={crumb.href} className="breadcrumb-link">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="breadcrumb-current">{crumb.label}</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        )}
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
    </div>
  );
}

/* =============================================================================
   4. TAILADMIN BUTTON
   ============================================================================= */
export interface TailAdminButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "sm" | "md" | "lg";
  variant?: "primary" | "secondary" | "danger" | "ghost" | "soft";
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  loading?: boolean;
}

export const TailAdminButton = forwardRef<HTMLButtonElement, TailAdminButtonProps>(
  (
    {
      children,
      size = "md",
      variant = "primary",
      startIcon,
      endIcon,
      loading = false,
      disabled = false,
      className = "",
      type = "button",
      ...props
    },
    ref
  ) => {
    const sizeClasses = {
      sm: "btn-sm",
      md: "",
      lg: "btn-lg",
    };

    const variantClasses = {
      primary: "btn-accent btn-primary",
      secondary: "btn-soft",
      danger: "btn-danger action-danger",
      ghost: "btn-ghost",
      soft: "btn-soft",
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={`btn saas-btn ${sizeClasses[size]} ${variantClasses[variant]} ${className}`.trim()}
        {...props}
      >
        {loading && (
          <span className="animate-spin inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full" />
        )}
        {!loading && startIcon && (
          <span className="btn-start-icon flex items-center">{startIcon}</span>
        )}
        <span>{children}</span>
        {endIcon && <span className="btn-end-icon flex items-center">{endIcon}</span>}
      </button>
    );
  }
);
TailAdminButton.displayName = "TailAdminButton";

/* =============================================================================
   5. TAILADMIN STATUS BADGE
   ============================================================================= */
export type TailBadgeColor =
  | "primary"
  | "success"
  | "error"
  | "warning"
  | "info"
  | "neutral";

export interface TailAdminBadgeProps {
  color?: TailBadgeColor;
  size?: "sm" | "md";
  variant?: "light" | "solid";
  startIcon?: ReactNode;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
}

export function TailAdminBadge({
  color = "primary",
  size = "md",
  variant = "light",
  startIcon,
  pulse = false,
  children,
  className = "",
}: TailAdminBadgeProps) {
  const colorMap: Record<TailBadgeColor, string> = {
    primary: "badge-primary checked_in",
    success: "confirmed clean paid",
    error: "cancelled failed maintenance",
    warning: "pending dirty low",
    info: "in_progress",
    neutral: "badge-neutral",
  };

  return (
    <span
      className={`badge saas-badge ${colorMap[color]} ${size === "sm" ? "badge-sm" : ""} ${className}`.trim()}
    >
      {pulse && (
        <span
          className="inline-block w-2 h-2 rounded-full mr-1.5 animate-pulse bg-current"
          aria-hidden="true"
        />
      )}
      {startIcon && <span className="mr-1">{startIcon}</span>}
      {children}
    </span>
  );
}

/* =============================================================================
   6. TAILADMIN TABLE PRIMITIVES (BasicTableOne Structure)
   ============================================================================= */
export function Table({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="table-wrap saas-table-wrap">
      <table className={`data-table saas-table ${className}`.trim()}>
        {children}
      </table>
    </div>
  );
}

export function TableHeader({ children }: { children: ReactNode }) {
  return <thead>{children}</thead>;
}

export function TableBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({
  children,
  className = "",
  onClick,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={`${onClick ? "cursor-pointer" : ""} ${className}`.trim()}
      onClick={onClick}
      {...props}
    >
      {children}
    </tr>
  );
}

export function TableHead({
  children,
  className = "",
  align = "left",
}: {
  children: ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
}) {
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return <th className={`${alignClass} ${className}`.trim()}>{children}</th>;
}

export function TableCell({
  children,
  className = "",
  align = "left",
}: {
  children: ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
}) {
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return <td className={`${alignClass} ${className}`.trim()}>{children}</td>;
}

/* =============================================================================
   7. TAILADMIN FORM INPUTS & SELECTS
   ============================================================================= */
export interface TailAdminInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
}

export const TailAdminInput = forwardRef<HTMLInputElement, TailAdminInputProps>(
  (
    {
      label,
      hint,
      error,
      startIcon,
      endIcon,
      id,
      className = "",
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="form-field">
        {label && (
          <label htmlFor={inputId} className="form-label">
            {label}
            {props.required && <span className="required">*</span>}
          </label>
        )}
        <div className="relative flex items-center">
          {startIcon && (
            <span className="absolute left-3.5 text-gray-400 pointer-events-none">
              {startIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            className={`form-input saas-input ${startIcon ? "pl-10" : ""} ${
              endIcon ? "pr-10" : ""
            } ${error ? "border-red-500" : ""} ${className}`.trim()}
            {...props}
          />
          {endIcon && (
            <span className="absolute right-3.5 text-gray-400">{endIcon}</span>
          )}
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        {hint && !error && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      </div>
    );
  }
);
TailAdminInput.displayName = "TailAdminInput";

export interface TailAdminSelectProps {
  label?: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function TailAdminSelect({
  label,
  options,
  value,
  onChange,
  placeholder = "Select an option",
  disabled = false,
  className = "",
}: TailAdminSelectProps) {
  return (
    <div className="form-field">
      {label && <label className="form-label">{label}</label>}
      <div className="relative">
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`form-select saas-select appearance-none pr-10 ${className}`.trim()}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
          <ChevronDown size={16} />
        </span>
      </div>
    </div>
  );
}

/* =============================================================================
   8. TAILADMIN TABS
   ============================================================================= */
export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: ReactNode;
}

export function TailAdminTabs({
  tabs,
  activeTab,
  onChange,
  className = "",
}: {
  tabs: TabItem[];
  activeTab: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={`tabs-container border-b border-gray-200 dark:border-gray-800 ${className}`.trim()}>
      <div className="flex gap-2 -mb-px overflow-x-auto" role="tablist">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.id)}
              className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
                isActive
                  ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {tab.icon && <span>{tab.icon}</span>}
              <span>{tab.label}</span>
              {typeof tab.count === "number" && (
                <span
                  className={`px-2 py-0.5 rounded-full text-xs ${
                    isActive
                      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* =============================================================================
   9. TAILADMIN ALERT
   ============================================================================= */
export interface TailAdminAlertProps {
  variant?: "success" | "warning" | "error" | "info";
  title?: string;
  message: string;
  onClose?: () => void;
  className?: string;
}

export function TailAdminAlert({
  variant = "info",
  title,
  message,
  onClose,
  className = "",
}: TailAdminAlertProps) {
  const variantStyles = {
    success: {
      box: "bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/20 dark:border-emerald-800/40 dark:text-emerald-300",
      icon: <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" size={18} />,
    },
    warning: {
      box: "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/20 dark:border-amber-800/40 dark:text-amber-300",
      icon: <AlertTriangle className="text-amber-600 dark:text-amber-400" size={18} />,
    },
    error: {
      box: "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/20 dark:border-rose-800/40 dark:text-rose-300",
      icon: <AlertCircle className="text-rose-600 dark:text-rose-400" size={18} />,
    },
    info: {
      box: "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/20 dark:border-blue-800/40 dark:text-blue-300",
      icon: <Info className="text-blue-600 dark:text-blue-400" size={18} />,
    },
  };

  const current = variantStyles[variant];

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-xl border ${current.box} ${className}`.trim()}
      role="alert"
    >
      <span className="flex-shrink-0 mt-0.5">{current.icon}</span>
      <div className="flex-1 min-w-0">
        {title && <h5 className="font-semibold text-sm mb-0.5">{title}</h5>}
        <p className="text-sm opacity-90">{message}</p>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-700 dark:hover:text-white"
          aria-label="Dismiss alert"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/* =============================================================================
   10. TAILADMIN EMPTY STATE
   ============================================================================= */
export function TailAdminEmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`haven-empty-state ${className}`.trim()}>
      {icon && <div className="haven-empty-icon">{icon}</div>}
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div className="haven-empty-action">{action}</div>}
    </div>
  );
}

/* =============================================================================
   11. TAILADMIN SKELETON
   ============================================================================= */
export function TailAdminSkeleton({
  type = "card",
  count = 1,
  className = "",
}: {
  type?: "card" | "table" | "stat" | "text";
  count?: number;
  className?: string;
}) {
  const items = Array.from({ length: count });

  if (type === "stat") {
    return (
      <div className="metric-grid">
        {items.map((_, i) => (
          <div key={i} className="metric-card animate-pulse p-6">
            <div className="w-12 h-12 rounded-xl bg-gray-200 dark:bg-gray-800 mb-4" />
            <div className="w-24 h-4 rounded bg-gray-200 dark:bg-gray-800 mb-2" />
            <div className="w-32 h-8 rounded bg-gray-200 dark:bg-gray-800" />
          </div>
        ))}
      </div>
    );
  }

  if (type === "table") {
    return (
      <div className="table-wrap animate-pulse p-4">
        <div className="h-10 bg-gray-200 dark:bg-gray-800 rounded mb-4" />
        {items.map((_, i) => (
          <div key={i} className="h-12 bg-gray-100 dark:bg-gray-900 rounded mb-2" />
        ))}
      </div>
    );
  }

  return (
    <div className={`component-card animate-pulse p-6 ${className}`.trim()}>
      <div className="w-48 h-6 bg-gray-200 dark:bg-gray-800 rounded mb-3" />
      <div className="w-full h-4 bg-gray-100 dark:bg-gray-900 rounded mb-2" />
      <div className="w-3/4 h-4 bg-gray-100 dark:bg-gray-900 rounded" />
    </div>
  );
}

/* =============================================================================
   12. TAILADMIN PAGINATION
   ============================================================================= */
export function TailAdminPagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  pageSize = 10,
}: {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
}) {
  const pages = Array.from(
    { length: Math.min(5, totalPages) },
    (_, i) => i + Math.max(1, Math.min(currentPage - 2, totalPages - 4))
  ).filter((p) => p >= 1 && p <= totalPages);

  const start = (currentPage - 1) * pageSize + 1;
  const end = totalItems ? Math.min(currentPage * pageSize, totalItems) : currentPage * pageSize;

  return (
    <div className="table-pagination flex items-center justify-between flex-wrap gap-4 py-4 px-6 border-t border-gray-200 dark:border-gray-800">
      {typeof totalItems === "number" && (
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Showing <b className="font-semibold text-gray-800 dark:text-white">{start}</b> to{" "}
          <b className="font-semibold text-gray-800 dark:text-white">{end}</b> of{" "}
          <b className="font-semibold text-gray-800 dark:text-white">{totalItems}</b> results
        </span>
      )}

      <div className="flex items-center gap-1.5 ml-auto">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="table-pagination-button inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={16} />
          <span>Previous</span>
        </button>

        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`w-9 h-9 rounded-lg text-sm font-semibold flex items-center justify-center transition-colors ${
              p === currentPage
                ? "bg-blue-600 text-white"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            }`}
          >
            {p}
          </button>
        ))}

        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="table-pagination-button inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span>Next</span>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
