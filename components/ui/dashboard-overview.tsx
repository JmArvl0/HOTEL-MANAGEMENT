import type { ElementType, ReactNode } from "react";
import Link from "next/link";
import { PageHeader } from "./Navigation";
import "./dashboard-overview.css";

export function DashboardOverview({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`dashboard-overview ${className}`.trim()}>{children}</div>;
}

export function DashboardHeading({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return <PageHeader className="dashboard-heading" title={title} subtitle={subtitle} actions={actions} />;
}

export type DashboardMetric = {
  label: string;
  value: string | number;
  hint?: string;
  icon: ElementType;
  onOpen?: () => void;
  href?: string;
};

export function DashboardMetrics({ items }: { items: DashboardMetric[] }) {
  return <div className="mod-kpis dashboard-metrics" role="group" aria-label="At a glance">
    {items.map(({ label, value, hint, icon: Icon, onOpen, href }) => {
      const name = `${label}, ${value}${hint ? `. ${hint}` : ""}`;
      const content = <><span>{label}</span><b>{value}</b>{hint && <small>{hint}</small>}<i aria-hidden="true"><Icon size={18} /></i></>;
      if (href) return <Link key={label} className="mod-kpi" href={href} aria-label={name}>{content}</Link>;
      if (onOpen) return <button key={label} className="mod-kpi" type="button" onClick={onOpen} aria-label={name}>{content}</button>;
      return <article key={label} className="mod-kpi">{content}</article>;
    })}
  </div>;
}

export function DashboardPanel({ title, description, action, children, className = "" }: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return <section className={`dashboard-panel ${className}`.trim()} aria-label={title}>
    <header className="dashboard-panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>
    {children}
  </section>;
}
