"use client";

import { useMemo } from "react";
import { BedDouble, Download, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AccountingLedger } from "@/lib/accounting";
import { fromCentavos, toCentavos } from "@/lib/booking";
import { CHART_AXIS, CHART_COLLECTED, CHART_GRID, CHART_REFUNDED, CHART_REPORT_OCCUPANCY } from "@/lib/chart-tokens";
import type { DashboardData } from "@/lib/types";
import { ModuleSummaryCards } from "@/components/manager/module-summary-cards";
import { PageHeader } from "@/components/ui/Navigation";
import NightAuditPanel from "./night-audit-panel";

const peso = (value: unknown) => new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
}).format(Number(value || 0));

const compactPeso = (value: number) => new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  notation: "compact",
  maximumFractionDigits: 0,
}).format(value);

function hotelDay(value: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(value);
}

function buildCollectionTrend(ledger: AccountingLedger | null) {
  const today = hotelDay(new Date());
  const anchor = new Date(`${today}T12:00:00+08:00`);
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(anchor);
    date.setUTCDate(date.getUTCDate() - (6 - index));
    return hotelDay(date);
  });
  const byDate = new Map(dates.map((date) => [date, { day: date, collectedCents: 0, refundedCents: 0 }]));

  for (const payment of ledger?.transactions ?? []) {
    if (payment.status !== "paid") continue;
    const stamp = payment.verified_at ?? payment.created_at;
    if (typeof stamp !== "string") continue;
    const date = hotelDay(new Date(stamp));
    const point = byDate.get(date);
    if (!point) continue;
    const amount = Math.max(toCentavos(Number(payment.amount ?? 0)), 0);
    if (payment.purpose === "refund") point.refundedCents += amount;
    else point.collectedCents += amount;
  }

  return dates.map((date) => {
    const point = byDate.get(date)!;
    return {
      day: new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" }).format(new Date(`${date}T04:00:00Z`)),
      collected: fromCentavos(point.collectedCents),
      refunded: fromCentavos(point.refundedCents),
    };
  });
}

function buildCollectionBreakdown(ledger: AccountingLedger | null) {
  const byMethod = new Map<string, { count: number; cents: number }>();
  for (const payment of ledger?.transactions ?? []) {
    if (payment.status !== "paid" || payment.purpose === "refund") continue;
    const method = typeof payment.method === "string" && payment.method ? payment.method : "unspecified";
    const current = byMethod.get(method) ?? { count: 0, cents: 0 };
    current.count += 1;
    current.cents += Math.max(toCentavos(Number(payment.amount ?? 0)), 0);
    byMethod.set(method, current);
  }
  return [...byMethod.entries()]
    .map(([method, totals]) => ({ method, count: totals.count, amount: fromCentavos(totals.cents) }))
    .sort((left, right) => right.amount - left.amount);
}

const methodLabel = (value: string) => value.split(/[_\s]+/).map((word) => word ? word[0].toUpperCase() + word.slice(1) : word).join(" ");

export default function AccountingPerformanceReports({ data, ledger }: { data: DashboardData; ledger: AccountingLedger | null }) {
  const trend = useMemo(() => buildCollectionTrend(ledger), [ledger]);
  const collectionBreakdown = useMemo(() => buildCollectionBreakdown(ledger), [ledger]);
  const occupancies = data.occupancyTrend;
  const averageOccupancy = Math.round(occupancies.reduce((sum, point) => sum + point.occupancy, 0) / Math.max(occupancies.length, 1));
  const occupancyChange = (occupancies.at(-1)?.occupancy ?? 0) - (occupancies.at(0)?.occupancy ?? 0);
  const TrendIcon = occupancyChange < 0 ? TrendingDown : TrendingUp;
  const ledgerMetrics = ledger?.metrics;

  return <section className="performance-reports accounting-performance-reports" aria-label="Financial performance">
    <PageHeader variant="band" className="reports-title" eyebrow="Accounting reports" title="Financial performance" subtitle="Review settled collections, refunds, booked occupancy and read-only operating-day evidence." actions={<button className="btn btn-soft" type="button" onClick={() => window.print()} aria-label="Export financial performance report"><Download size={16} aria-hidden="true"/>Export report</button>}/>
    <ModuleSummaryCards ariaLabel="Financial performance summary" cards={[
      { label: "Settled collections", value: peso(ledgerMetrics?.grossCollected), hint: "All recorded periods · paid transactions", icon: Wallet, tone: "today" },
      { label: "Refunds issued", value: peso(ledgerMetrics?.refundsIssued), hint: "Settled refund payments", icon: TrendingDown, tone: "attention" },
      { label: "Net receipts", value: peso(ledgerMetrics?.netRevenue), hint: "Collections less refunds", icon: TrendingUp, tone: "done" },
      { label: "Open reconciliation variance", value: peso(ledgerMetrics?.openReconciliationVariance), hint: "Flagged periods for follow-up", icon: BedDouble, tone: Number(ledgerMetrics?.openReconciliationVariance ?? 0) !== 0 ? "attention" : "done" },
    ]}/>
    {ledger ? <>
      <div className="report-analysis-grid accounting-report-grid">
      <article className="panel report-chart report-analysis-panel">
        <div className="panel-heading report-panel-heading"><div><p className="report-section-label">Ledger movement</p><h2>Collections and refunds</h2><p>Paid transactions grouped by verification date in the hotel timezone. The seven-day window includes today.</p></div></div>
        <div className="report-chart-canvas" role="img" aria-label="Seven-day chart of settled collections and refunds, based on ledger payment verification dates.">
          <ResponsiveContainer width="100%" height={285}>
            <BarChart data={trend} margin={{ top: 12, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 5" vertical={false}/>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: CHART_AXIS, fontSize: 11 }}/>
              <YAxis axisLine={false} tickLine={false} tick={{ fill: CHART_AXIS, fontSize: 10 }} tickFormatter={compactPeso} width={72}/>
              <Tooltip formatter={(value, name) => [peso(value), name === "collected" ? "Collected" : "Refunded"]}/>
              <Legend formatter={(value) => value === "collected" ? "Collected" : "Refunded"}/>
              <Bar dataKey="collected" fill={CHART_COLLECTED} radius={[4, 4, 0, 0]} maxBarSize={24}/>
              <Bar dataKey="refunded" fill={CHART_REFUNDED} radius={[4, 4, 0, 0]} maxBarSize={24}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <details className="report-data-details"><summary>View daily ledger totals</summary><div className="table-scroll"><table><caption className="sr-only">Seven-day settled collections and refund values</caption><thead><tr><th scope="col">Hotel day</th><th scope="col">Collected</th><th scope="col">Refunded</th></tr></thead><tbody>{trend.map((point) => <tr key={point.day}><td>{point.day}</td><td>{peso(point.collected)}</td><td>{peso(point.refunded)}</td></tr>)}</tbody></table></div></details>
      </article>
      <article className="panel report-chart report-analysis-panel accounting-occupancy-panel">
        <div className="panel-heading report-panel-heading"><div><p className="report-section-label">Operating context</p><h2>Booked occupancy</h2><p>Rooms with a stay covering each night, as a share of serviceable rooms — not live room-rack occupancy.</p></div><span className={`report-change ${occupancyChange < 0 ? "negative" : "positive"}`}><TrendIcon size={14} aria-hidden="true"/>{occupancyChange >= 0 ? "+" : ""}{occupancyChange} pts</span></div>
        <p className="accounting-occupancy-average">{averageOccupancy}% <span>seven-day average</span></p>
        <div className="report-chart-canvas" role="img" aria-label={`Seven-day booked occupancy chart. Average ${averageOccupancy} percent.`}>
          <ResponsiveContainer width="100%" height={205}>
            <AreaChart data={occupancies} margin={{ top: 12, right: 8, left: -14, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 5" vertical={false}/>
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: CHART_AXIS, fontSize: 11 }}/>
              <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: CHART_AXIS, fontSize: 10 }} tickFormatter={(value) => `${value}%`}/>
              <Tooltip formatter={(value) => [`${Number(value)}%`, "Booked occupancy"]}/>
              <Area type="monotone" dataKey="occupancy" stroke={CHART_REPORT_OCCUPANCY} fill={CHART_REPORT_OCCUPANCY} fillOpacity={0.15} strokeWidth={3}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <details className="report-data-details"><summary>View booked occupancy data</summary><div className="table-scroll"><table><caption className="sr-only">Seven-day booked occupancy values</caption><thead><tr><th scope="col">Day</th><th scope="col">Booked</th></tr></thead><tbody>{occupancies.map((point) => <tr key={point.day}><td>{point.day}</td><td><strong>{point.occupancy}%</strong></td></tr>)}</tbody></table></div></details>
      </article>
      </div>
      <section className="data-panel accounting-collection-breakdown" aria-labelledby="accounting-report-breakdown-title">
        <div className="panel-heading"><div><h2 id="accounting-report-breakdown-title">Collection breakdown</h2><p>Settled collection totals by payment method across all recorded periods.</p></div></div>
        {collectionBreakdown.length ? <div className="table-scroll"><table aria-label="Settled collections by payment method"><thead><tr><th scope="col">Payment method</th><th scope="col">Settled payments</th><th scope="col">Settled total</th></tr></thead><tbody>{collectionBreakdown.map((row) => <tr key={row.method}><td><strong>{methodLabel(row.method)}</strong></td><td>{row.count}</td><td>{peso(row.amount)}</td></tr>)}</tbody></table></div> : <div className="empty"><Wallet aria-hidden="true"/><h3>No settled collections</h3><p>Paid collection transactions will appear here when recorded.</p></div>}
      </section>
    </> : <div className="empty"><Wallet aria-hidden="true"/><h3>Financial ledger unavailable</h3><p>Refresh the report to reload Accounting records.</p></div>}
    <NightAuditPanel role="accounting" readOnly/>
  </section>;
}
