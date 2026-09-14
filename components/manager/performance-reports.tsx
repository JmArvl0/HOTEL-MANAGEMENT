"use client";

import { BedDouble, Download, Gauge, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardData, Role } from "@/lib/types";

const peso = (value: unknown) => new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  maximumFractionDigits: 0,
}).format(Number(value || 0));

export default function PerformanceReports({ data, role }: { data: DashboardData; role: Role }) {
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

  return <section className="performance-reports" aria-labelledby="performance-reports-title">
    <div className="page-title reports-title">
      <div>
        <p className="eyebrow">Administration &amp; analytics</p>
        <h1 id="performance-reports-title">Property performance</h1>
        <p>Review revenue movement, occupancy, and room readiness from the hotel&apos;s current operational records.</p>
      </div>
      <button className="btn btn-accent" type="button" onClick={() => window.print()} aria-label="Export property performance report">
        <Download size={17} aria-hidden="true"/> Export report
      </button>
    </div>

    <div className="report-kpi-grid" aria-label="Performance summary">
      <article className="report-kpi-card">
        <span className="report-kpi-icon"><Wallet size={18} aria-hidden="true"/></span>
        <div><p>{role === "manager" ? "Collections today" : "Estimated room revenue"}</p><strong>{peso(moneyValue)}</strong>
          <small>{role === "manager" ? `${peso(data.metrics.depositsReceived)} deposits · ${peso(data.metrics.refundSummary)} refunds` : "Based on current folios"}</small></div>
      </article>
      <article className="report-kpi-card">
        <span className="report-kpi-icon"><TrendIcon size={18} aria-hidden="true"/></span>
        <div><p>Average occupancy</p><strong>{averageOccupancy}%</strong><small>{occupancyChange >= 0 ? "+" : ""}{occupancyChange} points across the seven-day view</small></div>
      </article>
      <article className="report-kpi-card">
        <span className="report-kpi-icon"><Gauge size={18} aria-hidden="true"/></span>
        <div><p>Operational readiness</p><strong>{readiness}%</strong><small>{serviceableRooms} of {totalRooms} rooms serviceable</small></div>
      </article>
    </div>

    <div className="report-analysis-grid">
      <article className="panel report-chart report-analysis-panel">
        <div className="panel-heading report-panel-heading">
          <div><p className="report-section-label">Occupancy trend</p><h2>Seven-day occupancy</h2><p>Daily share of rooms occupied or reserved.</p></div>
          <span className={`report-change ${occupancyChange < 0 ? "negative" : "positive"}`}><TrendIcon size={14} aria-hidden="true"/>{occupancyChange >= 0 ? "+" : ""}{occupancyChange} pts</span>
        </div>
        <div className="report-chart-canvas" role="img" aria-label={`Seven-day occupancy chart. Average ${averageOccupancy} percent, ending at ${latestOccupancy} percent.`}>
          <ResponsiveContainer width="100%" height={285}>
            <AreaChart data={data.occupancyTrend} margin={{ top: 12, right: 8, left: -14, bottom: 0 }}>
              <defs><linearGradient id="reportOccupancyFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2a9098" stopOpacity={.34}/><stop offset="100%" stopColor="#2a9098" stopOpacity={.02}/></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 5" vertical={false}/>
              <XAxis dataKey="day" axisLine={false} tickLine={false}/>
              <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tickFormatter={(value) => `${value}%`}/>
              <Tooltip formatter={(value) => [`${Number(value)}%`, "Occupancy"]}/>
              <Area type="monotone" dataKey="occupancy" stroke="#2a9098" fill="url(#reportOccupancyFill)" strokeWidth={3}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <details className="report-data-details">
          <summary>View occupancy data</summary>
          <div className="table-scroll"><table><caption className="sr-only">Seven-day occupancy values</caption><thead><tr><th scope="col">Day</th><th scope="col">Occupancy</th></tr></thead><tbody>{data.occupancyTrend.map((point) => <tr key={point.day}><td>{point.day}</td><td><strong>{point.occupancy}%</strong></td></tr>)}</tbody></table></div>
        </details>
      </article>

      <aside className="panel report-analysis-panel report-room-status" aria-labelledby="report-room-status-title">
        <div className="panel-heading report-panel-heading"><div><p className="report-section-label">Inventory snapshot</p><h2 id="report-room-status-title">Room status</h2><p>Live room distribution in the current dashboard snapshot.</p></div><span className="report-room-total"><BedDouble size={15} aria-hidden="true"/>{totalRooms} rooms</span></div>
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
  </section>;
}
