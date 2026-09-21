"use client";

import type { ElementType, ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export type HavenActionItemTone = "amber" | "green" | "rose" | "neutral";
export type HavenActionItemVariant = "row" | "stat";

export type HavenActionItemProps = {
  icon: ElementType;
  /** Primary label (row) or metric label (stat). */
  title: ReactNode;
  /** Supporting description (row) or detail line (stat). */
  description?: ReactNode;
  /** Large tabular figure — stat variant only. */
  value?: ReactNode;
  tone?: HavenActionItemTone;
  /** Zero-count / all-clear state: muted icon, card kept as a shortcut. */
  quiet?: boolean;
  variant?: HavenActionItemVariant;
  onAction?: () => void;
  /** Accessible name override; defaults to "title: description". */
  actionLabel?: string;
  /** Custom trailing node (e.g. an inline action button). Defaults to a
   * navigation chevron when onAction is set, nothing otherwise. */
  trailing?: ReactNode;
  className?: string;
};

/**
 * Shared staff operational action card: icon | title + description | chevron.
 * Owns the visual layout, never the business data. Renders a <button> only
 * when it performs an action; informational cards are plain <div>s so nothing
 * looks clickable that isn't. Staff-scoped styling lives in
 * app/staff-ops-theme.css (.haven-action-item).
 */
export function HavenActionItem({
  icon: Icon,
  title,
  description,
  value,
  tone = "neutral",
  quiet = false,
  variant = "row",
  onAction,
  actionLabel,
  trailing,
  className,
}: HavenActionItemProps) {
  const stat = variant === "stat";
  const label =
    actionLabel ??
    [title, description].filter((part) => typeof part === "string").join(": ");
  const cls = [
    "haven-action-item",
    `haven-action-item--${stat ? "stat" : "row"}`,
    quiet ? "is-quiet" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const body = (
    <>
      <span className="haven-action-item-icon" aria-hidden="true">
        <Icon size={18} />
      </span>
      <span className="haven-action-item-copy">
        {stat ? (
          <>
            <small>{title}</small>
            <strong>{value}</strong>
            {description != null && <em>{description}</em>}
          </>
        ) : (
          <>
            <strong>{title}</strong>
            {description != null && <small>{description}</small>}
          </>
        )}
      </span>
      {trailing ??
        (onAction ? (
          <ChevronRight
            size={16}
            aria-hidden="true"
            className="haven-action-item-chevron"
          />
        ) : null)}
    </>
  );
  if (onAction) {
    return (
      <button
        type="button"
        className={cls}
        data-tone={tone}
        onClick={onAction}
        aria-label={label || undefined}
      >
        {body}
      </button>
    );
  }
  return (
    <div className={cls} data-tone={tone}>
      {body}
    </div>
  );
}
