"use client";

import { useId, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cashMoney } from "@/lib/cash-shift-display";
import type { DashboardData } from "@/lib/types";
import { DashboardPanel } from "./dashboard-overview";

export function DailyDashboardFinances({ totals }: { totals?: NonNullable<DashboardData["managerOverview"]>["finances"] }) {
  return <DashboardFinances description="Payments and folio balances" amounts={totals ? [
    { label: "Collections today", value: totals.collectionsToday },
    { label: "Deposits received", value: totals.depositsReceived },
    { label: "Outstanding balances", value: totals.outstandingBalances },
    { label: "Refunds today", value: totals.refundSummary },
  ] : []} />;
}

export function DashboardFinances({ title = "Today’s finances", description, amounts, empty = "Financial totals are unavailable.", children }: {
  title?: string;
  description?: string;
  amounts: { label: string; value: number }[];
  empty?: string;
  children?: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  const Icon = visible ? EyeOff : Eye;
  return <DashboardPanel title={title} description={description} action={amounts.length > 0 &&
    <button type="button" className="dashboard-eye" aria-label="Show financial amounts" aria-controls={id} aria-pressed={visible}
      title={visible ? "Hide financial amounts" : "Show financial amounts"} onClick={() => setVisible(value => !value)}>
      <Icon size={18} aria-hidden="true" />
    </button>}>
    {amounts.length ? <dl className="dashboard-amounts" id={id}>
      {amounts.map(({ label, value }) => {
        const amount = cashMoney(value);
        const firstDigit = amount.search(/\d/);
        return <div key={label}>
          <dt>{label}</dt>
          <dd>{visible || firstDigit === -1 ? amount : <>
            <span aria-hidden="true">{amount.replace(/\d/g, (digit, index) => index === firstDigit ? digit : "*")}</span>
            <span className="sr-only">Amount hidden</span>
          </>}</dd>
        </div>;
      })}
    </dl> : <p className="dashboard-empty">{empty}</p>}
    {children && <div className="dashboard-panel-footer">{children}</div>}
  </DashboardPanel>;
}
