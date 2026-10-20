"use client";

import { forwardRef, type ReactNode } from "react";
import { Search, ChevronDown, PanelLeftClose, LogOut, Settings } from "lucide-react";

export interface AppHeaderProps {
  /** Page title. */
  title: string;
  /** Page subtitle/description. */
  subtitle?: string;
  /** Additional actions (search, theme toggle, bell, profile). */
  actions?: ReactNode;
  /** Mobile menu trigger. */
  mobileMenuTrigger?: ReactNode;
  /** Custom className. */
  className?: string;
}

/**
 * Unified app header — search, theme toggle, bell, profile menu.
 * Works for both staff (app-shell) and customer (customer-shell) contexts.
 */
export const AppHeader = forwardRef<HTMLDivElement, AppHeaderProps>(function AppHeader({
  title,
  subtitle,
  actions,
  mobileMenuTrigger,
  className = "",
}, forwardedRef) {
  return (
    <header ref={forwardedRef} className={`app-header ${className}`.trim()} role="banner">
      {mobileMenuTrigger && (
        <button
          className="app-header-menu-btn"
          aria-label="Open menu"
          aria-controls="app-sidebar"
          aria-expanded="false"
        >
          <span className="app-header-brand-mark">
            <svg width="31" height="31" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </span>
        </button>
      )}
      
      <div className="app-header-content">
        <div>
          <p className="app-header-eyebrow">{subtitle || "Secure hotel governance workspace"}</p>
          <h1 className="app-header-title">{title}</h1>
        </div>
      </div>
      
      <div className="app-header-actions">
        {actions}
        <slot name="extra" />
      </div>
    </header>
  );
});
AppHeader.displayName = "AppHeader";