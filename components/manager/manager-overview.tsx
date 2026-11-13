"use client";

import { useState, type CSSProperties } from "react";
import { AlertTriangle, ArrowUpRight, BedDouble, Bell, CalendarDays, ChevronRight, ClipboardCheck, ClipboardList, Clock3, Gauge, LogOut, QrCode, Wrench } from "lucide-react";
import { HavenActionItem, type HavenActionItemTone } from "@/components/ui/haven-action-item";
import { HavenFilterBadges } from "@/components/ui/haven-data-controls";
import { Modal } from "@/components/ui/Modal";
import { DashboardHeading, DashboardMetrics, DashboardOverview } from "@/components/ui/dashboard-overview";
import { DailyDashboardFinances } from "@/components/ui/dashboard-finances";
import { canOpenSection, type Section } from "@/config/role-navigation";
import { CHART_OCCUPANCY } from "@/lib/chart-tokens";
import type { ReservationQueue } from "@/lib/reservation-workspace";
import type { RackBoardState } from "@/lib/room-rack";
import type { DashboardData } from "@/lib/types";
import "./manager-overview.css";

type Props = {
  data: DashboardData;
  setSection: (section: Section) => void;
  allowed: Section[];
  onScan: () => void;
  onOpenRack?: (view: "board" | ReservationQueue, tab: ReservationQueue, roomStatus?: RackBoardState) => void;
};

const roomStates: { state: RackBoardState; label: string; description: string }[] = [
  { state: "occupied", label: "Occupied", description: "Guests in residence" },
  { state: "available", label: "Ready to assign", description: "Clean and available" },
  { state: "reserved", label: "Reserved", description: "Held or unavailable for assignment" },
  { state: "dirty", label: "Awaiting housekeeping", description: "Rooms to turn" },
  { state: "out_of_service", label: "Out of service", description: "Blocked from assignment" },
];

const monthDay = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
const pointLabel = (point: DashboardData["occupancyTrend"][number]) => point.date ? monthDay.format(new Date(`${point.date}T00:00:00Z`)) : point.day;

function OccupancyComparison({ current, previous, onInsights }: {
  current: DashboardData["occupancyTrend"];
  previous: DashboardData["occupancyTrend"];
  onInsights?: () => void;
}) {
  const [period, setPeriod] = useState("current");
  const selected = period === "previous" && previous.length ? "previous" : "current";
  const points = selected === "previous" ? previous : current;
  const average = points.length ? Math.round(points.reduce((sum, point) => sum + point.occupancy, 0) / points.length) : null;
  const maximum = Math.max(100, Math.ceil(Math.max(...points.map(point => point.occupancy)) / 20) * 20);
  const range = (series: typeof current, fallback: string) => series.length ? `${pointLabel(series[0])} – ${pointLabel(series[series.length - 1])}` : fallback;

  return <section className="mo-panel" aria-labelledby="mo-booked-title">
    <header className="mo-panel-heading">
      <div><h2 id="mo-booked-title">Booked occupancy</h2><p>Share of rooms booked per night</p></div>
      <select aria-label="Occupancy period" value={selected} onChange={event => setPeriod(event.target.value)}>
        <option value="current">{range(current, "Latest 7 nights")}</option>
        {previous.length > 0 && <option value="previous">{range(previous, "Previous 7 nights")}</option>}
      </select>
    </header>
    {average === null ? <p className="mo-empty">Booked occupancy is unavailable.</p> : <>
      <div className="mo-average" aria-live="polite"><b>{average}%</b><span>Average for period</span></div>
      <div className="mo-chart" style={{ "--mo-chart-color": CHART_OCCUPANCY } as CSSProperties}>
        <div className="mo-chart-scale" aria-hidden="true"><span>{maximum}%</span><span>{maximum / 2}%</span><span>0%</span></div>
        <ol className="mo-bars" aria-label="Nightly booked occupancy">
          {points.map((point, index) => <li key={point.date ?? point.day}>
            <span className={selected === "current" && index === points.length - 1 ? "mo-bar mo-bar-today" : "mo-bar"} style={{ height: `${point.occupancy / maximum * 100}%` }}><b>{point.occupancy}%</b></span>
            <time dateTime={point.date}>{pointLabel(point)}</time>
          </li>)}
        </ol>
      </div>
    </>}
    {onInsights && <button className="mo-insights" type="button" onClick={onInsights}>Predictive insights <ArrowUpRight size={14} aria-hidden="true" /></button>}
  </section>;
}

export default function ManagerOverview({ data, setSection, allowed, onScan, onOpenRack }: Props) {
  const [filter, setFilter] = useState("all");
  const [overdueOpen, setOverdueOpen] = useState(false);
  const { metrics: m, managerOverview: snapshot } = data;
  const sectionAction = (section: Section) => canOpenSection(allowed, section) ? () => setSection(section) : undefined;
  const openRooms = (state: RackBoardState) => onOpenRack && canOpenSection(allowed, "room_rack")
    ? () => onOpenRack("board", "all", state)
    : sectionAction("rooms");
  const openBookings = (queue: ReservationQueue) => allowed.includes("reservations")
    ? () => onOpenRack ? onOpenRack(queue, queue) : setSection("reservations")
    : undefined;
  const briefing = sectionAction("hotel_operations");
  const maintenance = sectionAction("maintenance_orders");
  const housekeeping = sectionAction("housekeeping_tasks");
  const guestRequests = sectionAction("guest_requests");
  const overdueHousekeeping = housekeeping ? m.overdueHousekeeping : 0;
  const overdueRequests = guestRequests ? m.overdueRequests : 0;
  const overdue = overdueHousekeeping + overdueRequests;
  const queues = [
    { category: "operations", count: m.criticalMaintenance, label: `${m.criticalMaintenance} urgent or critical work order${m.criticalMaintenance === 1 ? "" : "s"}`, detail: `${m.openMaintenance} open work orders`, badge: "Priority", icon: Wrench, tone: "rose", open: maintenance },
    { category: "decisions", count: m.pendingApprovals, label: `${m.pendingApprovals} pending approval${m.pendingApprovals === 1 ? "" : "s"}`, detail: "Awaiting review", badge: "Pending", icon: ClipboardCheck, tone: "amber", open: sectionAction("approvals") },
    { category: "operations", count: m.unassignedArrivals, label: m.unassignedArrivals === 1 ? "1 arrival needs a room" : `${m.unassignedArrivals} arrivals need rooms`, detail: "Today’s arrivals without an assignment", badge: "Unassigned", icon: CalendarDays, tone: "info", open: openBookings("unassigned") },
    { category: "operations", count: overdue, label: `${overdue} overdue service task${overdue === 1 ? "" : "s"}`, detail: `${overdueHousekeeping} housekeeping · ${overdueRequests} guest requests`, badge: "Overdue", icon: Clock3, tone: "amber", open: () => setOverdueOpen(true) },
    { category: "operations", count: m.escalatedIssues, label: `${m.escalatedIssues} escalated guest issue${m.escalatedIssues === 1 ? "" : "s"}`, detail: "Escalated to management", badge: "Escalated", icon: Bell, tone: "amber", open: guestRequests },
  ].filter(item => item.count > 0 && item.open);
  const visibleQueues = queues.filter(item => filter === "all" || item.category === filter);
  const urgentCount = maintenance ? m.criticalMaintenance : 0;
  const rooms = snapshot?.roomReadiness;
  const roomTotal = rooms ? Object.values(rooms).reduce((sum, value) => sum + value, 0) : null;
  const cards = [
    { label: "Occupancy now", value: `${m.occupancy}%`, hint: "Live room rack", icon: Gauge, open: openRooms("occupied") },
    { label: "Arrivals today", value: m.arrivals, hint: snapshot ? `${m.unassignedArrivals} unassigned · ${snapshot.checkedInArrivals} checked in` : `${m.unassignedArrivals} unassigned`, icon: CalendarDays, open: openBookings("arrivals") },
    { label: "Departures due", value: m.departures, hint: snapshot ? `${snapshot.checkedOutDepartures} checked out today` : "Awaiting checkout", icon: LogOut, open: openBookings("departures") },
    { label: "Rooms ready", value: m.availableRooms, hint: "Clean and ready to assign", icon: BedDouble, open: openRooms("available") },
  ];

  return <DashboardOverview className="manager-overview">
    <DashboardHeading title="Hotel dashboard" actions={<>
      <button type="button" className="btn btn-soft" onClick={onScan}><QrCode size={17} aria-hidden="true" /> Scan QR</button>
      {briefing && <button type="button" className="btn btn-accent" onClick={briefing}><ClipboardList size={17} aria-hidden="true" /> Shift briefing <ArrowUpRight size={15} aria-hidden="true" /></button>}
    </>} />

    <DashboardMetrics items={cards.map(({ open, ...card }) => ({ ...card, onOpen: open }))} />

    <div className="dashboard-grid-layout">
      <section className="mo-panel" aria-labelledby="mo-exceptions-title">
        <header className="mo-panel-heading">
          <div><h2 id="mo-exceptions-title">Decisions &amp; exceptions</h2><p>What needs attention this shift</p></div>
          {urgentCount > 0 && <span className="mo-badge" data-tone="rose"><AlertTriangle size={13} aria-hidden="true" />{urgentCount} priority</span>}
        </header>
        <div className="mo-filters"><HavenFilterBadges value={filter} onChange={setFilter} label="Filter priority queues" options={[
          { value: "all", label: "All", count: queues.length },
          { value: "decisions", label: "Decisions", count: queues.filter(item => item.category === "decisions").length },
          { value: "operations", label: "Operations", count: queues.filter(item => item.category === "operations").length },
        ]} /></div>
        <p className="sr-only" role="status">{visibleQueues.length} active {visibleQueues.length === 1 ? "queue" : "queues"} shown</p>
        {visibleQueues.length > 0 ? <ul className="mo-priorities">
          {visibleQueues.map(item => <li key={item.badge}><HavenActionItem icon={item.icon} tone={item.tone as HavenActionItemTone}
            title={item.label} description={item.detail} onAction={item.open}
            trailing={<span className="mo-trailing"><span className="mo-badge" data-tone={item.tone}>{item.badge}</span><ChevronRight size={15} aria-hidden="true" /></span>} /></li>)}
        </ul> : <p className="mo-empty">{filter === "decisions" ? "No pending decisions." : filter === "operations" ? "No active operations exceptions." : "No active exceptions."}</p>}
      </section>

      <section className="mo-panel" aria-labelledby="mo-rooms-title">
        <header className="mo-panel-heading">
          <div><h2 id="mo-rooms-title">Room readiness</h2><p>Current room rack</p></div>
          {roomTotal !== null && <span className="mo-total">{roomTotal} {roomTotal === 1 ? "room" : "rooms"}</span>}
        </header>
        {rooms && roomTotal ? <>
          <div className="mo-room-bar" aria-hidden="true">
            {roomStates.filter(({ state }) => rooms[state] > 0).map(({ state }) => <span key={state} data-state={state} style={{ flexGrow: rooms[state] }} />)}
          </div>
          <ul className="mo-rooms">
            {roomStates.map(({ state, label, description }) => {
              const open = openRooms(state);
              const Row = open ? "button" : "div";
              return <li key={state}><Row className="mo-room" {...(open && { type: "button", onClick: open, "aria-label": `${label}, ${rooms[state]}. ${description}` })}>
                <span className="mo-room-dot" data-state={state} aria-hidden="true" />
                <span><strong>{label}</strong><small>{description}</small></span><b>{rooms[state]}</b>
                {open && <ChevronRight size={15} aria-hidden="true" />}
              </Row></li>;
            })}
          </ul>
        </> : <p className="mo-empty">{rooms ? "No rooms in the rack." : "Room readiness is unavailable."}</p>}
      </section>

      <OccupancyComparison current={data.occupancyTrend} previous={snapshot?.previousOccupancyTrend ?? []} onInsights={sectionAction("insights")} />
      <DailyDashboardFinances totals={snapshot?.finances} />
    </div>

    {overdueOpen && <Modal isOpen onClose={() => setOverdueOpen(false)} title="Overdue service tasks" size="sm">
      <div className="haven-action-list">
        {overdueHousekeeping > 0 && <HavenActionItem icon={ClipboardCheck} tone="amber" title={`${overdueHousekeeping} overdue housekeeping tasks`} onAction={housekeeping} />}
        {overdueRequests > 0 && <HavenActionItem icon={Bell} tone="amber" title={`${overdueRequests} overdue guest requests`} onAction={guestRequests} />}
        {overdue === 0 && <p>No overdue service tasks.</p>}
      </div>
    </Modal>}
  </DashboardOverview>;
}
