"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { HavenEmptyState } from "@/components/ui";
import { BedDouble, CalendarDays, ChevronDown } from "lucide-react";
import { barsForRoom, groupRoomsByType, roomBoardState, windowDays, type RackAssignment, type RackBar, type RackReservation, type RackRoom } from "@/lib/room-rack";

const dateLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
const weekdayLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", timeZone: "UTC" });

const stayStatus = (status: string): { label: string; status: string } => {
  switch (status) {
    case "checked_in": return { label: "In-house", status: "checked_in" };
    case "confirmed": return { label: "Confirmed", status: "confirmed" };
    case "checked_out": return { label: "Checked out", status: "checked_out" };
    case "cancelled": return { label: "Cancelled", status: "cancelled" };
    case "pending": return { label: "Pending", status: "pending" };
    default: return { label: status.charAt(0).toUpperCase() + status.slice(1), status };
  }
};

/** Keep overlapping allocations visible in separate lanes rather than covering a guest. */
function withLanes(bars: RackBar[]) {
  const ends: number[] = [];
  return bars.map(bar => {
    let lane = ends.findIndex(end => end <= bar.start);
    if (lane < 0) lane = ends.length;
    ends[lane] = bar.start + bar.span;
    return { ...bar, lane };
  });
}

export default function RoomCalendar({ rooms, reservations, currentStays = reservations, assignments, from, days, today, blockedRoomIds, onSelectRoom, onOpenReservation }: {
  rooms: RackRoom[]; reservations: RackReservation[]; currentStays?: RackReservation[]; assignments?: RackAssignment[];
  from: string; days: number; today: string; blockedRoomIds: Set<string>;
  onSelectRoom: (room: RackRoom) => void; onOpenReservation: (id: string) => void;
}) {
  const dates = windowDays(from, days);
  const groups = groupRoomsByType(rooms);
  const unassigned = reservations.filter(r => ["pending", "confirmed"].includes(r.status) && !r.room_id);
  return <section className="room-calendar" aria-label="Booking calendar">
    {!rooms.length ? <HavenEmptyState icon={<CalendarDays size={22} aria-hidden="true" />} title="No rooms match" body="Clear room filters or choose another floor or room type." /> : <div className="room-calendar-scroll" tabIndex={0} aria-label="Booking calendar, scroll horizontally for more dates">
      <table className="room-calendar-table" style={{ minWidth: 154 + days * 88 }}>
        <caption className="sr-only">Assigned bookings per room from {dateLabel(from)} through {dateLabel(dates.at(-1)!)}</caption>
        <colgroup><col style={{ width: 154 }} />{dates.map(d => <col key={d} />)}</colgroup>
        <thead><tr><th scope="col">Room / status</th>{dates.map(d => <th scope="col" key={d} aria-current={d === today ? "date" : undefined}><span>{weekdayLabel(d)}</span><b>{dateLabel(d)}</b>{d === today && <small>Today</small>}</th>)}</tr></thead>
        {groups.map(group => <RoomCalendarGroup key={group.type} group={group} reservations={reservations} currentStays={currentStays} assignments={assignments} from={from} days={days} dates={dates} today={today} blockedRoomIds={blockedRoomIds} onSelectRoom={onSelectRoom} onOpenReservation={onOpenReservation} />)}
      </table>
    </div>}
    {unassigned.length > 0 && <details className="room-calendar-unassigned"><summary>{unassigned.length} {unassigned.length === 1 ? "booking" : "bookings"} awaiting room assignment in this window</summary><ul>{unassigned.map(r => <li key={r.id}><span><b>{r.guest_name ?? "Guest"}</b> · {dateLabel(r.check_in)} → {dateLabel(r.check_out)} · {r.room_type}</span><button type="button" className="table-action action-neutral" onClick={() => onOpenReservation(r.id)}>Review {r.confirmation_number ?? r.id}</button></li>)}</ul></details>}
    <p className="room-calendar-note">Room badges show current status. Stays span assigned nights and exclude checkout day.</p>
  </section>;
}

function RoomCalendarGroup({ group, reservations, currentStays, assignments, from, days, dates, today, blockedRoomIds, onSelectRoom, onOpenReservation }: {
  group: { type: string; rooms: RackRoom[] }; reservations: RackReservation[]; currentStays: RackReservation[]; assignments?: RackAssignment[];
  from: string; days: number; dates: string[]; today: string; blockedRoomIds: Set<string>;
  onSelectRoom: (room: RackRoom) => void; onOpenReservation: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const entries = group.rooms.map(room => ({ room, state: roomBoardState(room, currentStays, today, blockedRoomIds).state }));
  const summary = (["occupied", "available", "reserved", "dirty", "out_of_service"] as const).flatMap(state => {
    const count = entries.filter(room => room.state === state).length;
    return count ? [`${count} ${state === "out_of_service" ? "out of service" : state}`] : [];
  });
  const color = group.rooms[0]?.room_type_color;
  return <tbody>
    <tr className="room-calendar-group"><th colSpan={days + 1} scope="rowgroup"><button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span className={`room-type-circle${color ? ` rt-${color}` : ""}`} aria-hidden="true" />
      <b>{group.type}</b><small>{group.rooms.length} {group.rooms.length === 1 ? "room" : "rooms"}{summary.length > 0 && ` · ${summary.join(" · ")}`}</small>
      <ChevronDown size={16} aria-hidden="true" />
    </button></th></tr>
    {open && entries.map(({ room, state }) => {
      const bars = withLanes(barsForRoom(reservations, room.id, from, days, assignments));
      const laneCount = Math.max(1, ...bars.map(b => b.lane + 1));
      return <tr key={room.id}>
        <th scope="row"><button type="button" className="room-calendar-room" onClick={() => onSelectRoom(room)}><b>Room {room.number}</b><small>Floor {room.floor ?? "—"} · {group.type}</small><StatusBadge status={state} size="sm" /></button></th>
        <td colSpan={days} className="room-calendar-allocations"><div className="room-calendar-track" style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${laneCount}, minmax(70px, auto))` }}>
          {dates.map((d, index) => <span key={d} aria-hidden="true" className={`room-calendar-day${d === today ? " is-today" : ""}`} style={{ gridColumn: index + 1, gridRow: `1 / span ${laneCount}` }} />)}
          {bars.map(bar => {
            const st = stayStatus(bar.reservation.status);
            const dateRange = `${dateLabel(bar.reservation.check_in)} – ${dateLabel(bar.reservation.check_out)}`;
            const reference = bar.reservation.confirmation_number ?? bar.reservation.id;
            const guest = bar.reservation.guest_name ?? "Guest";
            return <button type="button" key={bar.segmentId ?? bar.reservation.id} className="room-calendar-stay" data-status={st.status} data-narrow={bar.span === 1} style={{ gridColumn: `${bar.start + 1} / span ${bar.span}`, gridRow: bar.lane + 1 }} onClick={() => onOpenReservation(bar.reservation.id)} title={`${guest} · ${st.label} · ${reference} · ${dateRange}`} aria-label={`${guest}, ${reference}, room ${room.number}, ${bar.reservation.check_in.slice(0, 10)} to ${bar.reservation.check_out.slice(0, 10)}, checkout day excluded, ${st.label}`}>
              <BedDouble size={16} aria-hidden="true" />
              <span className="room-calendar-stay-text"><b className="room-calendar-stay-guest">{guest}</b><small className="room-calendar-stay-meta">{reference}</small></span>
              {bar.span >= 3 && <small className="room-calendar-stay-dates">{dateRange}</small>}
            </button>;
          })}
        </div></td>
      </tr>;
    })}
  </tbody>;
}
