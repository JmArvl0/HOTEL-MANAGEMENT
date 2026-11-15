"use client";

import { forwardRef, type ReactNode } from "react";
import { HavenLogo } from "./haven-logo";

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
            <HavenLogo size={31} />
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
