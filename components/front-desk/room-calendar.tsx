"use client";

import { RoomTypeBadge } from "@/components/ui/RoomTypeBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { HavenEmptyState } from "@/components/ui";
import { CalendarDays } from "lucide-react";
import { barsForRoom, groupRoomsByType, roomBoardState, windowDays, type RackAssignment, type RackBar, type RackReservation, type RackRoom } from "@/lib/room-rack";

const dateLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" });
const weekdayLabel = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "narrow", timeZone: "UTC" });

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

export default function RoomCalendar({ rooms, reservations, assignments, from, days, today, blockedRoomIds, onSelectRoom, onOpenReservation }: {
  rooms: RackRoom[]; reservations: RackReservation[]; assignments?: RackAssignment[];
  from: string; days: number; today: string; blockedRoomIds: Set<string>;
  onSelectRoom: (room: RackRoom) => void; onOpenReservation: (id: string) => void;
}) {
  const dates = windowDays(from, days);
  const groups = groupRoomsByType(rooms);
  const unassigned = reservations.filter(r => ["pending", "confirmed"].includes(r.status) && !r.room_id);
  return <section className="room-calendar" aria-label="Booking calendar">
    <p className="room-calendar-note">Guest names span assigned nights; checkout day is excluded. Current room condition is shown beside the room number.</p>
    {!rooms.length ? <HavenEmptyState icon={<CalendarDays size={22} aria-hidden="true" />} title="No rooms match" body="Clear room filters or choose another floor or room type." /> : <div className="room-calendar-scroll" tabIndex={0} aria-label="Booking calendar, scroll horizontally for more dates">
      <table className="room-calendar-table" style={{ minWidth: 170 + days * 120 }}>
        <caption className="sr-only">Assigned bookings per room from {dateLabel(from)} through {dateLabel(dates.at(-1)!)}</caption>
        <colgroup><col style={{ width: 170 }} />{dates.map(d => <col key={d} />)}</colgroup>
        <thead><tr><th scope="col">Room / current condition</th>{dates.map(d => <th scope="col" key={d} aria-current={d === today ? "date" : undefined}><span>{weekdayLabel(d)}</span><b>{dateLabel(d)}</b>{d === today && <small>Today</small>}</th>)}</tr></thead>
        {groups.map(group => <RoomCalendarGroup key={group.type} group={group} reservations={reservations} assignments={assignments} from={from} days={days} dates={dates} today={today} blockedRoomIds={blockedRoomIds} onSelectRoom={onSelectRoom} onOpenReservation={onOpenReservation} />)}
      </table>
    </div>}
    {unassigned.length > 0 && <details className="room-calendar-unassigned"><summary>{unassigned.length} bookings awaiting room assignment in this window</summary><ul>{unassigned.map(r => <li key={r.id}><span><b>{r.guest_name ?? "Guest"}</b> · {dateLabel(r.check_in)} → {dateLabel(r.check_out)} · {r.room_type}</span><button type="button" className="table-action action-neutral" onClick={() => onOpenReservation(r.id)}>Review {r.confirmation_number ?? r.id}</button></li>)}</ul></details>}
  </section>;
}

function RoomCalendarGroup({ group, reservations, assignments, from, days, dates, today, blockedRoomIds, onSelectRoom, onOpenReservation }: {
  group: { type: string; rooms: RackRoom[] }; reservations: RackReservation[]; assignments?: RackAssignment[];
  from: string; days: number; dates: string[]; today: string; blockedRoomIds: Set<string>;
  onSelectRoom: (room: RackRoom) => void; onOpenReservation: (id: string) => void;
}) {
  return <tbody>
    <tr className="room-calendar-group"><th colSpan={days + 1} scope="rowgroup"><RoomTypeBadge name={group.type} colorKey={group.rooms[0]?.room_type_color} /> <span>{group.rooms.length} rooms</span></th></tr>
    {group.rooms.map(room => {
      const bars = withLanes(barsForRoom(reservations, room.id, from, days, assignments));
      const laneCount = Math.max(1, ...bars.map(b => b.lane + 1));
      const state = roomBoardState(room, reservations, today, blockedRoomIds).state;
      return <tr key={room.id}>
        <th scope="row"><button type="button" className="room-calendar-room" onClick={() => onSelectRoom(room)}><b>Room {room.number}</b><small>Floor {room.floor ?? "—"} · {group.type}</small><StatusBadge status={state === "out_of_service" ? "maintenance" : state === "available" ? "clean" : state} size="sm" /></button></th>
        <td colSpan={days} className="room-calendar-allocations"><div className="room-calendar-track" style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${laneCount}, minmax(70px, auto))` }}>
          {dates.map((d, index) => <span key={d} aria-hidden="true" className={`room-calendar-day${d === today ? " is-today" : ""}`} style={{ gridColumn: index + 1, gridRow: `1 / span ${laneCount}` }} />)}
          {!bars.length && <span className="room-calendar-vacant" style={{ gridColumn: `1 / span ${days}`, gridRow: 1 }} />}
          {bars.map(bar => {
            const st = stayStatus(bar.reservation.status);
            return <button type="button" key={bar.segmentId ?? bar.reservation.id} className={`room-calendar-stay${bar.reservation.status === "checked_in" ? " is-in-house" : ""}`} style={{ gridColumn: `${bar.start + 1} / span ${bar.span}`, gridRow: bar.lane + 1 }} onClick={() => onOpenReservation(bar.reservation.id)} aria-label={`${bar.reservation.guest_name ?? "Guest"}, ${bar.reservation.confirmation_number ?? bar.reservation.id}, room ${room.number}, ${bar.reservation.check_in.slice(0, 10)} to ${bar.reservation.check_out.slice(0, 10)}, checkout day excluded`}>
              <div className="room-calendar-stay-guest">{bar.reservation.guest_name ?? "Guest"}</div>
              <div className="room-calendar-stay-meta"><span>{st.label}</span>{bar.reservation.confirmation_number && <span>· {bar.reservation.confirmation_number}</span>}</div>
            </button>;
          })}
        </div></td>
      </tr>;
    })}
  </tbody>;
}
