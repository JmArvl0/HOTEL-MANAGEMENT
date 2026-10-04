"use client";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";

export type ShellNavItem = { href: string; label: string };

export function AppShell({
  brand,
  nav,
  activeHref,
  title,
  actions,
  onCommand,
  children,
}: {
  brand: string;
  nav: ShellNavItem[];
  activeHref?: string;
  title: string;
  actions?: React.ReactNode;
  onCommand: () => void;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className={`saas-shell${collapsed ? " collapsed" : ""}`}>
      <aside className="saas-sidebar">
        <div className="saas-brand">{brand}</div>
        <nav aria-label="Primary">
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={item.href === activeHref ? "active" : undefined}
              aria-current={item.href === activeHref ? "page" : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <button
          type="button"
          className="saas-collapse"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          aria-expanded={!collapsed}
        >
          {"‹"}
        </button>
      </aside>
      <div className="saas-main">
        <header className="saas-topbar">
          <h1>{title}</h1>
          <div className="saas-topbar-actions">
            <button type="button" className="saas-command" onClick={onCommand} aria-label="Search or run a command">
              Search…
            </button>
            <ThemeToggle />
            {actions}
          </div>
        </header>
        <main className="saas-page">{children}</main>
      </div>
    </div>
  );
}
