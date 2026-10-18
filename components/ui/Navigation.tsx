"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

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
              <span className={item.current ? "breadcrumb-current" : "breadcrumb-link"} aria-current={item.current ? "page" : undefined}>
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
  /**
   * "default" is the compact premium header (forms, settings, dense screens).
   * "band" is the full deep-teal hero treatment (dashboards, major module
   * landings). Same markup either way — only the surface changes.
   */
  variant?: "default" | "band";
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
  breadcrumb,
  className = "",
  variant = "default",
}: PageHeaderProps) {
  return (
    <header className={`page-header${variant === "band" ? " band" : ""} ${className}`}>
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

