import type { ReactNode } from "react";

/**
 * Inline error alert — replaces ad-hoc error banners (booking-error, admin-loading, etc.).
 * Honest Feed Rule: inline, contextual, persistent until dismissed or retried.
 * Single-home: haven-data-controls.css §error-alert
 */
export interface HavenErrorAlertProps {
  /** Short title — "Unable to load", "Save failed". */
  title: string;
  /** Optional detail — "Check your connection and try again". */
  body?: string;
  /** Optional retry/primary action — <button onClick={retry}>Try again</button>. */
  action?: ReactNode;
  /** Visual theme. */
  variant?: "internal" | "customer";
  /** Allow user to dismiss (renders inline X). */
  dismissible?: boolean;
  /** Called when dismissed. */
  onDismiss?: () => void;
  /** Additional className. */
  className?: string;
}

export function HavenErrorAlert({
  title,
  body,
  action,
  variant = "internal",
  dismissible = false,
  onDismiss,
  className,
}: HavenErrorAlertProps) {
  const Heading = variant === "customer" ? "h2" : "h3";
  return (
    <div
      className={`haven-error-alert is-${variant} ${className ?? ""}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="haven-error-content">
        <Heading>{title}</Heading>
        {body && <p>{body}</p>}
        {action && <div className="haven-error-action">{action}</div>}
      </div>
      {dismissible && onDismiss && (
        <button
          type="button"
          className="haven-error-dismiss"
          onClick={onDismiss}
          aria-label="Dismiss error"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}