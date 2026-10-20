"use client";

import { forwardRef, useRef, useImperativeHandle, type RefObject } from "react";
import { Bell } from "lucide-react";

export interface HavenNotificationBellProps {
  count: number;
  expanded: boolean;
  onToggle: () => void;
  buttonRef?: RefObject<HTMLButtonElement>;
  className?: string;
  badgeClassName?: string;
  /** Visual theme variant. */
  variant?: "staff" | "customer";
}

export const HavenNotificationBell = forwardRef<HTMLButtonElement, HavenNotificationBellProps>(function HavenNotificationBell({
  count,
  expanded,
  onToggle,
  buttonRef,
  className = "",
  badgeClassName = "",
  variant = "staff",
  ...props
}, forwardedRef) {
  const buttonEl = useRef<HTMLButtonElement>(null);
  
  useImperativeHandle(buttonRef, () => buttonEl.current!, [buttonEl]);
  useImperativeHandle(forwardedRef, () => buttonEl.current!, [buttonEl]);

  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  const baseClass = `haven-notification-bell ${className}`.trim();
  const badgeClass = `haven-notification-badge ${badgeClassName}`.trim();
  
  return (
    <button
      ref={buttonEl}
      type="button"
      className={`haven-notification-bell ${className}`.trim()}
      aria-label={count > 0 ? `Notifications, ${count} unread` : "Notifications"}
      aria-expanded={expanded}
      aria-haspopup="dialog"
      title="Notifications"
      onClick={onToggle}
      {...props}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="haven-bell-icon" aria-hidden="true">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M13.73 21a2 2 0 0 1-3.46 0" />
      </svg>
      {count > 0 && (
        <i className={`haven-notification-badge ${badgeClassName}`.trim()} aria-hidden="true">
          {count > 99 ? "99+" : count}
        </i>
      )}
    </button>
  );
});