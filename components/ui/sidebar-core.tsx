"use client";

import { forwardRef, type RefObject } from "react";
import { ChevronRight, PanelLeftClose } from "lucide-react";

export interface SidebarCoreProps {
  /** Navigation items to render. */
  items: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    badge?: number;
    active?: boolean;
    onClick?: () => void;
  }>;
  /** Currently collapsed state. */
  collapsed: boolean;
  /** Callback when collapse toggles. */
  onToggleCollapse: () => void;
  /** Brand section. */
  brand: {
    mark: React.ReactNode;
    copy: React.ReactNode;
  };
  /** Optional footer content. */
  footer?: React.ReactNode;
  /** Mobile breakpoint in px (default 1000). */
  mobileBreakpoint?: number;
  /** Custom className. */
  className?: string;
  /** Container ref for external control. */
  containerRef?: RefObject<HTMLDivElement>;
}

/**
 * Shared sidebar core — handles collapse animation, mobile drawer, keyboard nav,
 * persistence. Does NOT know about roles, nav items, or brand specifics.
 * Consumers: StaffSidebar, CustomerSidebar.
 */
export const SidebarCore = forwardRef<HTMLDivElement, SidebarCoreProps>(function SidebarCore({
  items,
  collapsed,
  onToggleCollapse,
  brand,
  footer,
  mobileBreakpoint = 1000,
  className = "",
  containerRef,
  ...props
}, forwardedRef) {
  const asideRef = containerRef;
  // No internal state - fully controlled by parent
  
  return (
    <aside
      ref={asideRef ?? forwardedRef}
      className={`app-sidebar ${collapsed ? "collapsed" : ""} ${className}`.trim()}
      {...props}
    >
      <div className="app-sidebar-top">
        <div className="app-sidebar-brand">
          <button
            className="app-sidebar-brand-toggle"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-controls="app-navigation"
            aria-expanded={!collapsed}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
          >
            {brand.mark}
          </button>
          {!collapsed && <span className="app-sidebar-brand-copy">{brand.copy}</span>}
          {!collapsed && (
            <button
              className="app-sidebar-collapse-btn"
              onClick={onToggleCollapse}
              aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
              aria-controls="app-navigation"
              aria-expanded={!collapsed}
              title={collapsed ? "Expand navigation" : "Collapse navigation"}
            >
              <PanelLeftClose size={16} />
            </button>
          )}
        </div>
      </div>
      
      <nav className="app-sidebar-nav" aria-label="Main navigation">
        {items.map((item) => (
          <button
            key={item.key}
            className={`app-sidebar-nav-item ${item.active ? "active" : ""} ${collapsed ? "collapsed" : ""}`.trim()}
            onClick={item.onClick}
            aria-current={item.active ? "page" : undefined}
            title={collapsed ? item.label : undefined}
          >
            <span className="app-sidebar-nav-icon" aria-hidden="true">{item.icon}</span>
            {!collapsed && <span className="app-sidebar-nav-label">{item.label}</span>}
            {item.badge && item.badge > 0 && !collapsed && (
              <span className="app-sidebar-nav-badge" aria-label={`${item.badge} items`}>
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
      
      {footer && (
        <div className="app-sidebar-footer">
          {footer}
        </div>
      )}
    </aside>
  );
});
SidebarCore.displayName = "SidebarCore";