"use client";

import { BedDouble, Download, Gauge, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardData, Role } from "@/lib/types";
import { CHART_REPORT_OCCUPANCY } from "@/lib/chart-tokens";
import { ModuleSummaryCards } from "@/components/manager/module-summary-cards";
import { PageHeader } from "@/components/ui";
import NightAuditPanel from "./night-audit-panel";

const peso = (value: unknown) => new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
}).format(Number(value || 0));

export default function PerformanceReports({ data, role, showHeader = true, showExport = true }: { data: DashboardData; role: Role; showHeader?: boolean; showExport?: boolean }) {
  const totalRooms = data.roomMix.reduce((total, slice) => total + slice.value, 0);
  const outOfService = data.roomMix.find((slice) => slice.name === "Service")?.value ?? 0;
  const serviceableRooms = Math.max(totalRooms - outOfService, 0);
  const readiness = Math.round((serviceableRooms / Math.max(totalRooms, 1)) * 100);
  const averageOccupancy = Math.round(data.occupancyTrend.reduce((sum, point) => sum + point.occupancy, 0) / Math.max(data.occupancyTrend.length, 1));
  const firstOccupancy = data.occupancyTrend.at(0)?.occupancy ?? 0;
  const latestOccupancy = data.occupancyTrend.at(-1)?.occupancy ?? 0;
  const occupancyChange = latestOccupancy - firstOccupancy;
  const TrendIcon = occupancyChange < 0 ? TrendingDown : TrendingUp;
  const moneyValue = role === "manager" ? data.metrics.collectionsToday : data.metrics.revenue;

  return <section className="performance-reports" aria-label="Property performance">
    {showHeader && <PageHeader variant="band" className="reports-title" eyebrow="Administration & analytics" title="Property performance" subtitle="Review revenue movement, occupancy, and room readiness from the hotel's current operational records." actions={showExport && <button className="btn btn-accent" type="button" onClick={() => window.print()} aria-label="Export property performance report">
        <Download size={17} aria-hidden="true"/> Export report
      </button>} />}

    <ModuleSummaryCards
      cards={[
        { label: role === "manager" ? "Collections today" : "Estimated room revenue", value: peso(moneyValue), hint: role === "manager" ? `${peso(data.metrics.depositsReceived)} deposits · ${peso(data.metrics.refundSummary)} refunds` : "Based on current folios", icon: Wallet, tone: "today" },
        { label: "Average booked occupancy", value: `${averageOccupancy}%`, hint: `${occupancyChange >= 0 ? "+" : ""}${occupancyChange} points across the seven-day view`, icon: TrendIcon, tone: "today" },
        { label: "Operational readiness", value: `${readiness}%`, hint: `${serviceableRooms} of ${totalRooms} rooms serviceable`, icon: Gauge, tone: "today" },
      ]}
      ariaLabel="Performance summary"
    />

    <div className="report-analysis-grid">
      <article className="panel report-chart report-analysis-panel">
        <div className="panel-heading report-panel-heading">
          <div><p className="report-section-label">Occupancy trend</p><h2>Seven-day booked occupancy</h2><p>Rooms with a stay covering each night, as a share of serviceable rooms — measured from reservation stay dates, not the live room rack. The last point is today.</p></div>
          <span className={`report-change ${occupancyChange < 0 ? "negative" : "positive"}`}><TrendIcon size={14} aria-hidden="true"/>{occupancyChange >= 0 ? "+" : ""}{occupancyChange} pts</span>
        </div>
        <div className="report-chart-canvas" role="img" aria-label={`Seven-day booked occupancy chart. Average ${averageOccupancy} percent, ending at ${latestOccupancy} percent booked for today.`}>
          <ResponsiveContainer width="100%" height={285}>
            <AreaChart data={data.occupancyTrend} margin={{ top: 12, right: 8, left: -14, bottom: 0 }}>
              <defs><linearGradient id="reportOccupancyFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={CHART_REPORT_OCCUPANCY} stopOpacity={.34}/><stop offset="100%" stopColor={CHART_REPORT_OCCUPANCY} stopOpacity={.02}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 5" vertical={false}/>
              <XAxis dataKey="day" axisLine={false} tickLine={false}/>
              <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`}/>
              <Tooltip formatter={(value) => [`${Number(value)}%`, "Occupancy"]}/>
              <Area type="monotone" dataKey="occupancy" stroke={CHART_REPORT_OCCUPANCY} fill="url(#reportOccupancyFill)" strokeWidth={3}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <details className="report-data-details">
          <summary>View booked occupancy data</summary>
          <div className="table-scroll"><table><caption className="sr-only">Seven-day booked occupancy values</caption><thead><tr><th scope="col">Day</th><th scope="col">Booked</th></tr></thead><tbody>{data.occupancyTrend.map((point) => <tr key={point.day}><td>{point.day}</td><td><strong>{point.occupancy}%</strong></td></tr>)}</tbody></table></div>
        </details>
      </article>

      <aside className="panel report-analysis-panel report-room-status" aria-labelledby="report-room-status-title">
        <div className="panel-heading report-panel-heading"><div><p className="report-section-label">Inventory snapshot</p><h2 id="report-room-status-title">Room status</h2><p>Live room distribution from the room rack — updated by Front Desk actions, independent of reservation stay dates.</p></div><span className="report-room-total"><BedDouble size={15} aria-hidden="true"/>{totalRooms} rooms</span></div>
        <ul>{data.roomMix.map((slice) => {
          const percentage = Math.round((slice.value / Math.max(totalRooms, 1)) * 100);
          return <li key={slice.name}>
            <div><span><i style={{ backgroundColor: slice.color }} aria-hidden="true"/>{slice.name}</span><strong>{slice.value}</strong></div>
            <div className="report-status-track" aria-hidden="true"><span style={{ width: `${percentage}%`, backgroundColor: slice.color }}/></div>
            <small>{percentage}% of inventory</small>
          </li>;
        })}</ul>
      </aside>
    </div>
    <NightAuditPanel role={role} readOnly />
  </section>;
}
