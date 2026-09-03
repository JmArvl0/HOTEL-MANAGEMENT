"use client";

import { useState, useEffect, useMemo, useRef, useCallback, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ChevronDown, Search, X, Menu, Home, FolderOpen, Folder } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
  badgeVariant?: "default" | "danger" | "warning" | "success";
  children?: NavItem[];
  disabled?: boolean;
  external?: boolean;
  roles?: string[];
}

export interface NavGroupProps {
  items: NavItem[];
  title?: string;
  icon?: ReactNode;
  initiallyOpen?: boolean;
  className?: string;
}

export function NavGroup({ items, title, initiallyOpen = true, className = "" }: NavGroupProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const pathname = usePathname();

  const hasActiveChild = useMemo(() => {
    return items.some((item) => {
      if (item.children) {
        return item.children.some((child) => pathname.startsWith(child.href));
      }
      return pathname === item.href || pathname.startsWith(item.href + "/");
    });
  }, [items, pathname]);

  // Auto-open if any child is active
  useEffect(() => {
    if (hasActiveChild && !isOpen) {
      setIsOpen(true);
    }
  }, [hasActiveChild, isOpen]);

  const filteredItems = items.filter((item) => !item.disabled);

  return (
    <div className={`nav-group ${className}`}>
      {title && (
        <button
          className="nav-group-header"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-controls={`nav-group-${title?.toLowerCase().replace(/\s+/g, "-")}`}
        >
          <span className="nav-group-title">{title}</span>
          <span className="nav-group-badge" aria-hidden="true">
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        </button>
      )}
      <nav
        id={`nav-group-${title?.toLowerCase().replace(/\s+/g, "-")}`}
        className={`nav-group-content ${isOpen ? "open" : ""}`}
        aria-label={title}
        role={title ? "group" : undefined}
      >
        <ul className="nav-list" role="list">
          {filteredItems.map((item) => (
            <li key={item.href} className="nav-item">
              {item.children && item.children.length > 0 ? (
                <NavGroup
                  items={item.children}
                  title={item.label}
                  icon={item.icon}
                  initiallyOpen={isOpen && hasActiveChild}
                />
              ) : (
                <NavLink
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  badge={item.badge}
                  badgeVariant={item.badgeVariant}
                  external={item.external}
                  disabled={item.disabled}
                  isActive={pathname === item.href || pathname.startsWith(item.href + "/")}
                />
              )}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

interface NavLinkProps {
  href: string;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
  badgeVariant?: "default" | "danger" | "warning" | "success";
  external?: boolean;
  disabled?: boolean;
  isActive?: boolean;
}

function NavLink({ href, label, icon, badge, badgeVariant = "default", external = false, disabled = false, isActive = false }: NavLinkProps) {
  const Component = external ? "a" : Link;
  const props = external ? { href, target: "_blank", rel: "noopener noreferrer" } : { href };

  return (
    <Component
      {...props}
      className={`nav-link ${isActive ? "active" : ""} ${disabled ? "disabled" : ""}`}
      aria-current={isActive ? "page" : undefined}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : undefined}
    >
      {icon && <span className="nav-link-icon" aria-hidden="true">{icon}</span>}
      <span className="nav-link-label">{label}</span>
      {badge && (
        <span className={`nav-badge nav-badge-${badgeVariant}`} aria-label={`${badge} items`}>
          {badge}
        </span>
      )}
      {!external && !disabled && <ChevronRight size={12} className="nav-link-chevron" aria-hidden="true" />}
    </Component>
  );
}

export interface SidebarProps {
  items: NavItem[];
  title?: string;
  logo?: ReactNode;
  footer?: ReactNode;
  collapsed?: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
  "aria-label"?: string;
}

export function Sidebar({
  items,
  title,
  logo,
  footer,
  collapsed = false,
  onCollapseChange,
  searchable = true,
  searchPlaceholder = "Search navigation...",
  className = "",
  "aria-label": ariaLabel = "Main navigation",
}: SidebarProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const sidebarRef = useRef<HTMLElement>(null);

  const filteredItems = useMemo(() => {
    if (!searchQuery) return items;
    const query = searchQuery.toLowerCase();
    return items.filter((item) =>
      item.label.toLowerCase().includes(query) ||
      item.children?.some((child) => child.label.toLowerCase().includes(query))
    );
  }, [items, searchQuery]);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === "Escape") {
      if (isSearchOpen) {
        setIsSearchOpen(false);
        setSearchQuery("");
      } else if (mobileOpen) {
        setMobileOpen(false);
      }
    }
  }, [isSearchOpen, mobileOpen]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Focus management for mobile
  useEffect(() => {
    if (mobileOpen && sidebarRef.current) {
      const firstLink = sidebarRef.current.querySelector<HTMLAnchorElement>(".nav-link");
      firstLink?.focus();
    }
  }, [mobileOpen]);

  return (
    <>
      {/* Mobile toggle button */}
      <button
        className="sidebar-mobile-toggle"
        onClick={() => setMobileOpen(true)}
        aria-label="Open navigation"
        aria-expanded={mobileOpen}
        aria-controls="sidebar"
      >
        <Menu size={20} aria-hidden="true" />
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        ref={sidebarRef}
        id="sidebar"
        className={`sidebar ${collapsed ? "collapsed" : ""} ${mobileOpen ? "mobile-open" : ""} ${className}`}
        role="navigation"
        aria-label={ariaLabel}
        aria-expanded={!collapsed}
      >
        {/* Header */}
        <div className="sidebar-header">
          {logo && (
            <div className="sidebar-logo">
              {collapsed ? (
                <span className="sidebar-logo-collapsed" aria-hidden="true">{logo}</span>
              ) : (
                <span className="sidebar-logo-full">{logo}</span>
              )}
            </div>
          )}
          {title && !collapsed && (
            <h2 className="sidebar-title">{title}</h2>
          )}
          {onCollapseChange && (
            <button
              className="sidebar-toggle"
              onClick={() => onCollapseChange(!collapsed)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
            >
              {collapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
            </button>
          )}
        </div>

        {/* Search */}
        {searchable && !collapsed && (
          <div className="sidebar-search">
            <button
              className="sidebar-search-toggle"
              onClick={() => setIsSearchOpen(true)}
              aria-label="Search navigation"
              aria-expanded={isSearchOpen}
            >
              <Search size={18} aria-hidden="true" />
              <span className="search-placeholder">{searchPlaceholder}</span>
              <X size={16} className="search-close" aria-hidden="true" />
            </button>
            {isSearchOpen && (
              <div className="sidebar-search-input-wrapper">
                <Search size={18} className="search-icon" aria-hidden="true" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={searchPlaceholder}
                  className="sidebar-search-input"
                  aria-label="Search navigation"
                  autoFocus
                />
                <button
                  className="search-clear"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear search"
                >
                  <X size={16} aria-hidden="true" />
                </button>
                <button
                  className="search-close-btn"
                  onClick={() => setIsSearchOpen(false)}
                  aria-label="Close search"
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="sidebar-nav" role="navigation" aria-label={title || "Navigation sections"}>
          {filteredItems.map((item, index) => (
            <NavGroup
              key={index}
              items={item.children ? [item] : [item]}
              title={item.children ? item.label : undefined}
              initiallyOpen={true}
            />
          ))}
        </nav>

        {/* Footer */}
        {footer && (
          <div className="sidebar-footer">
            {footer}
          </div>
        )}
      </aside>
    </>
  );
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  separator?: ReactNode;
  className?: string;
  "aria-label"?: string;
}

export function Breadcrumb({
  items,
  separator = <ChevronRight size={14} aria-hidden="true" />,
  className = "",
  "aria-label": ariaLabel = "Breadcrumb",
}: BreadcrumbProps) {
  return (
    <nav className={`breadcrumb ${className}`} aria-label={ariaLabel}>
      <ol className="breadcrumb-list" role="list">
        {items.map((item, index) => (
          <li key={index} className="breadcrumb-item">
            {item.href && !item.current ? (
              <Link href={item.href} className="breadcrumb-link">
                {item.label}
              </Link>
            ) : (
              <span className={item.current ? "breadcrumb-current" : "breadcrumb-link"}>
                {item.label}
              </span>
            )}
            {index < items.length - 1 && (
              <span className="breadcrumb-separator" aria-hidden="true">
                {separator}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: ReactNode;
  breadcrumb?: BreadcrumbItem[];
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  breadcrumb,
  className = "",
}: PageHeaderProps) {
  return (
    <header className={`page-header ${className}`}>
      {breadcrumb && <Breadcrumb items={breadcrumb} />}
      <div className="page-header-content">
        {eyebrow && <p className="page-header-eyebrow">{eyebrow}</p>}
        <h1 className="page-header-title">{title}</h1>
        {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}

