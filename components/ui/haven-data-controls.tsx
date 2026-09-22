"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Search, X } from "lucide-react";

export type HavenControlVariant = "customer" | "internal";

export type HavenFilterBadgeOption = {
  value: string;
  label: string;
  count?: number;
  disabled?: boolean;
};

export function HavenSearchInput({
  value,
  onValueChange,
  label,
  placeholder,
  variant = "internal",
  debounceMs = 350,
  autoFocus = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  label: string;
  placeholder: string;
  variant?: HavenControlVariant;
  debounceMs?: number;
  autoFocus?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [lastExternalValue, setLastExternalValue] = useState(value);

  // React recommends adjusting controlled draft state during render instead of
  // a synchronizing effect. The guard makes this a single follow-up render
  // only when an external clear/navigation changes the canonical value.
  if (lastExternalValue !== value) {
    setLastExternalValue(value);
    setDraft(value);
  }
  useEffect(() => {
    if (draft === value) return;
    const timer = window.setTimeout(() => onValueChange(draft), debounceMs);
    return () => window.clearTimeout(timer);
  }, [debounceMs, draft, onValueChange, value]);

  const clear = () => {
    setDraft("");
    if (value !== "") onValueChange("");
  };

  return (
    <label className={`haven-search-input is-${variant}`}>
      <Search size={variant === "customer" ? 18 : 16} aria-hidden="true" />
      <input
        type="search"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && draft) {
            event.preventDefault();
            clear();
          }
        }}
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      {draft && (
        <button type="button" className="haven-search-clear" onClick={clear} aria-label={`Clear ${label.toLowerCase()}`}>
          <X size={15} aria-hidden="true" />
        </button>
      )}
    </label>
  );
}

export function HavenFilterBadges({
  value,
  onChange,
  options,
  label,
  variant = "internal",
  allValue = "all",
}: {
  value: string;
  onChange: (value: string) => void;
  options: HavenFilterBadgeOption[];
  label: string;
  variant?: HavenControlVariant;
  allValue?: string;
}) {
  const ordered = useMemo(() => {
    const all = options.find((option) => option.value === allValue);
    return all ? [all, ...options.filter((option) => option.value !== allValue)] : options;
  }, [allValue, options]);

  return (
    <div className={`haven-filter-badges is-${variant}`} role="group" aria-label={label}>
      {ordered.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`haven-filter-badge${value === option.value ? " active" : ""}`}
          aria-pressed={value === option.value}
          disabled={option.disabled}
          onClick={() => onChange(option.value)}
        >
          <span>{option.label}</span>
          {typeof option.count === "number" && <b aria-label={`${option.count} results`}>{option.count}</b>}
        </button>
      ))}
    </div>
  );
}

export function HavenDataToolbar({
  search,
  quickFilters,
  advancedFilters,
  resultCount,
  resultNoun = "results",
  onClearFilters,
  hasActiveFilters = false,
  variant = "internal",
  label = "Search and filters",
  filtersLayout = "stacked",
}: {
  search: ReactNode;
  quickFilters?: ReactNode;
  advancedFilters?: ReactNode;
  resultCount?: number;
  resultNoun?: string;
  onClearFilters?: () => void;
  hasActiveFilters?: boolean;
  variant?: HavenControlVariant;
  label?: string;
  filtersLayout?: "stacked" | "inline" | "compact";
}) {
  const noun = resultCount === 1 ? resultNoun.replace(/s$/, "") : resultNoun;
  return (
    <section className={`haven-data-toolbar is-${variant} filters-${filtersLayout}`} aria-label={label}>
      <div className="haven-toolbar-section haven-toolbar-search">
        <span className="haven-toolbar-label">Search</span>
        {search}
      </div>
      {quickFilters && (
        <div className="haven-toolbar-section haven-toolbar-quick">
          <span className="haven-toolbar-label">Quick filters</span>
          {quickFilters}
        </div>
      )}
      {advancedFilters && (
        <div className="haven-toolbar-section haven-toolbar-advanced">
          <span className="haven-toolbar-label">Advanced filters</span>
          <div className="haven-toolbar-advanced-controls">{advancedFilters}</div>
        </div>
      )}
      {(typeof resultCount === "number" || (onClearFilters && hasActiveFilters)) && (
        <div className="haven-toolbar-footer">
          {typeof resultCount === "number" && (
            <span className="haven-result-count" aria-live="polite">
              Showing {resultCount} {noun}
            </span>
          )}
          {onClearFilters && hasActiveFilters && (
            <button type="button" className="haven-clear-filters" onClick={onClearFilters}>
              <X size={14} aria-hidden="true" />
              Clear filters
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export function HavenEmptyState({
  icon,
  title,
  body,
  action,
  variant = "internal",
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  variant?: HavenControlVariant;
}) {
  const Heading = variant === "customer" ? "h2" : "h3";
  return (
    <div className={`haven-empty-state is-${variant}`}>
      <span className="haven-empty-icon" aria-hidden="true">{icon}</span>
      <Heading>{title}</Heading>
      <p>{body}</p>
      {action && <div className="haven-empty-action">{action}</div>}
    </div>
  );
}
