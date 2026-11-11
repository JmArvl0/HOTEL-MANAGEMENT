"use client";

import { CalendarDays, CheckCircle2, ChevronRight, ClipboardCheck, Users, Wrench } from "lucide-react";
import type { RackBoardState } from "@/lib/room-rack";
import type { ReservationQueue } from "@/lib/reservation-workspace";

const statuses: { key: RackBoardState; label: string }[] = [
  { key: "available", label: "Ready" },
  { key: "occupied", label: "Occupied" },
  { key: "reserved", label: "Reserved" },
  { key: "dirty", label: "Cleaning" },
  { key: "out_of_service", label: "Out of service" },
];

export default function RoomFocusPanel({ counts, arrivals, unassigned, roomDataReady, selected, onRoomFilter, onBookingQueue }: {
  counts: Record<RackBoardState, number>;
  arrivals: number | "—";
  unassigned: number | "—";
  roomDataReady: boolean;
  selected: string;
  onRoomFilter: (state: RackBoardState) => void;
  onBookingQueue?: (queue: ReservationQueue) => void;
}) {
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const segments: string[] = [];
  let offset = 0;
  for (const { key } of statuses) {
    if (!counts[key] || !total) continue;
    const start = offset;
    offset += counts[key];
    segments.push(`var(--fo-${key}) ${start / total * 100}% ${offset / total * 100}%`);
  }
  const pct = (count: number) => total ? `${Math.round(count / total * 100)}%` : "0%";
  const focus = [
    { title: "Dirty rooms", hint: "Awaiting housekeeping turnover", count: roomDataReady ? counts.dirty : "—", icon: ClipboardCheck, tone: "dirty", action: () => onRoomFilter("dirty"), pressed: selected === "dirty" },
    { title: "Upcoming arrivals", hint: "Expected check-ins today", count: arrivals, icon: CalendarDays, tone: "occupied", action: onBookingQueue && (() => onBookingQueue("arrivals")) },
    { title: "Unassigned arrivals", hint: "Today's bookings without a room", count: unassigned, icon: Users, tone: "reserved", action: onBookingQueue && (() => onBookingQueue("unassigned")) },
    { title: "Rooms out of service", hint: "Maintenance or otherwise unavailable", count: roomDataReady ? counts.out_of_service : "—", icon: Wrench, tone: "out_of_service", action: () => onRoomFilter("out_of_service"), pressed: selected === "out_of_service" },
    { title: "Ready for check-in", hint: "Clean and available rooms", count: roomDataReady ? counts.available : "—", icon: CheckCircle2, tone: "available", action: () => onRoomFilter("available"), pressed: selected === "available" },
  ];
  return <aside className="data-panel room-focus" aria-label="Today's focus">
    <h2>Today&apos;s focus</h2>
    <p className="subtitle">Operational items for the current hotel day.</p>
    <div className="board-rail-content" role="region" aria-label="Room focus details" tabIndex={0}>
      <ul className="focus-list">
        {focus.map(({ title, hint, count, icon: Icon, tone, action, pressed }) => {
          const content = <><span className={`focus-icon fo-${tone}`}><Icon size={16} aria-hidden="true" /></span><span className="focus-text"><b>{title}</b><small>{hint}</small></span><b className="focus-count">{count}</b>{action && <ChevronRight size={15} aria-hidden="true" />}</>;
          return <li key={title}>{action ? <button className="focus-item" type="button" aria-pressed={pressed} onClick={action}>{content}</button> : <div className="focus-item">{content}</div>}</li>;
        })}
      </ul>
      <section className="room-insights" aria-label="Quick insights">
        <h2>Quick insights</h2>
        <p className="subtitle">Room distribution by current status.</p>
        {total > 0 ? <>
          <div className="room-insights-mix">
            <div className="room-insights-ring" style={{ backgroundImage: `conic-gradient(${segments.join(", ")})` }} aria-hidden="true"><span><b>{total}</b>Rooms</span></div>
            <ul aria-label={`Current status of ${total} rooms`}>
              {statuses.map(({ key, label }) => <li key={key}><i className={`fo-${key}`} aria-hidden="true" /><span>{label}</span><b>{counts[key]}</b><small>{pct(counts[key])}</small></li>)}
            </ul>
          </div>
          {counts.available > 0 && <p className="room-insights-ready"><CheckCircle2 size={18} aria-hidden="true" /><span><b>{counts.available} {counts.available === 1 ? "room" : "rooms"} ready for check-in</b><small>{pct(counts.available)} of rooms are clean and available.</small></span></p>}
        </> : <p className="subtitle">{roomDataReady ? "No rooms on record." : "Room counts are unavailable."}</p>}
      </section>
    </div>
  </aside>;
}
