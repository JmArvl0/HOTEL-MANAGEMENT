"use client";

import { BedDouble, CalendarCheck, CalendarClock, ChevronRight, ClipboardCheck, Gauge, LogIn, LogOut } from "lucide-react";

export type OpsAction = { label: string; icon: React.ElementType; onSelect: () => void; disabled?: boolean };

/**
 * Right-side operations rail: quick actions (existing flows only),
 * today's activity from live snapshot data, occupancy, and the real-state
 * legend. All figures arrive computed; nothing here invents data.
 */
export default function RoomBoardOps({
  actions,
  arrivals,
  departures,
  checkIns,
  checkOuts,
  occupied,
  total,
  onSelectTab,
}: {
  actions: OpsAction[];
  arrivals: number;
  departures: number;
  checkIns: number;
  checkOuts: number;
  occupied: number;
  total: number;
  onSelectTab: (tab: string) => void;
}) {
  const pct = total > 0 ? Math.round((occupied / total) * 100) : 0;
  const rows = [
    { label: "Arrivals", value: arrivals, Icon: CalendarCheck, tone: "ops-arr", tab: "arrivals" },
    { label: "Departures", value: departures, Icon: CalendarClock, tone: "ops-dep", tab: "departures" },
    { label: "Check-ins", value: checkIns, Icon: LogIn, tone: "ops-in", tab: "in_house" },
    { label: "Check-outs", value: checkOuts, Icon: LogOut, tone: "ops-out", tab: "departures" },
  ];
  return (
    <aside className="board-ops" aria-label="Front office operations">
      <section className="data-panel ops-panel" aria-labelledby="ops-actions">
        <h2 id="ops-actions"><ClipboardCheck size={15} aria-hidden="true" /> Quick Actions</h2>
        <ul>
          {actions.map(({ label, icon: Icon, onSelect, disabled }) => (
            <li key={label}>
              <button type="button" onClick={onSelect} disabled={disabled}>
                <Icon size={16} aria-hidden="true" />
                <span>{label}</span>
                <ChevronRight size={15} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="data-panel ops-panel" aria-labelledby="ops-activity">
        <h2 id="ops-activity"><BedDouble size={15} aria-hidden="true" /> Today&apos;s Activity</h2>
        <ul className="ops-activity">
          {rows.map(({ label, value, Icon, tone, tab }) => (
            <li key={label}>
              <button type="button" onClick={() => onSelectTab(tab)} aria-label={`${label}: ${value}. Show in reservations.`}>
                <span className={`ops-ico ${tone}`} aria-hidden="true"><Icon size={15} /></span>
                <span>{label}</span>
                <b>{value}</b>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="data-panel ops-panel" aria-labelledby="ops-occupancy">
        <h2 id="ops-occupancy"><Gauge size={15} aria-hidden="true" /> Occupancy</h2>
        <div className="ops-occupancy">
          <span
            className="ops-donut"
            role="img"
            aria-label={`Occupied ${pct} percent, ${occupied} of ${total} rooms`}
            style={{ background: `conic-gradient(var(--dg) ${pct * 3.6}deg, var(--dl) 0deg)` }}
          >
            <b>{pct}%</b>
          </span>
          <span className="ops-occupancy-copy"><b>Occupied</b><small>{occupied} / {total} Rooms</small></span>
        </div>
        <h3>Legend</h3>
        <ul className="ops-legend">
          <li><i className="dot dot-available" aria-hidden="true" /> Clean</li>
          <li><i className="dot dot-occupied" aria-hidden="true" /> Occupied</li>
          <li><i className="dot dot-dirty" aria-hidden="true" /> Dirty</li>
          <li><i className="dot dot-oos" aria-hidden="true" /> Out of Service</li>
        </ul>
      </section>
  </aside>
  );
}
