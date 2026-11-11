"use client";

import { useState } from "react";
import { BedDouble, CalendarDays, CheckCircle2, ChevronDown, ClipboardCheck, MoreHorizontal, Wrench } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { HavenEmptyState } from "@/components/ui";
import { groupRoomsByType, roomBoardState, type RackBoardState, type RackReservation, type RackRoom } from "@/lib/room-rack";

export type BoardAction = { label: string; hint?: string; onSelect: () => void };

const HOUSEKEEPING_LABEL: Record<string, string> = {
  clean: "Clean",
  dirty: "Dirty",
  cleaning: "Cleaning in progress",
  inspection: "Inspection",
  reclean_required: "Reclean required",
};

const stayRange = (stay: RackReservation) => `${stay.check_in.slice(0, 10)} → ${stay.check_out.slice(0, 10)}`;

function outOfServiceReason(room: RackRoom, blocked = false): string {
  if (blocked) return "Maintenance-blocked";
  if (room.administratively_active === false) return "Retired";
  if (room.status === "maintenance") return "Maintenance";
  return "Cleanup pending";
}

const STATE_LABEL: Record<RackBoardState, string> = {
  available: "Available", occupied: "Occupied", dirty: "Dirty", reserved: "Reserved", out_of_service: "Out of service",
};
const ROOM_DETAIL: Record<RackBoardState, { label: string; icon: typeof BedDouble }> = {
  available: { label: "Ready for check-in", icon: CheckCircle2 },
  occupied: { label: "Guest in house", icon: BedDouble },
  reserved: { label: "Review room assignment", icon: CalendarDays },
  dirty: { label: "Cleaning required", icon: ClipboardCheck },
  out_of_service: { label: "Unavailable for assignment", icon: Wrench },
};

function housekeepingStatus(room: RackRoom): { label: string; status: string } {
  const key = String(room.housekeeping);
  return { label: HOUSEKEEPING_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1), status: key };
}

/**
 * Redesigned room card: prominent room number, separate occupancy and
 * housekeeping badges, guest info when applicable, hover state, click to
 * open room details.
 */
function RoomCard({
  room,
  stay,
  upcoming,
  state,
  blocked,
  selected,
  onSelect,
}: {
  room: RackRoom;
  stay: RackReservation | null;
  upcoming: RackReservation | null;
  state: RackBoardState;
  blocked?: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const housekeeping = housekeepingStatus(room);
  const guest = stay?.guest_name ?? upcoming?.guest_name ?? null;
  const range = stay ? stayRange(stay) : upcoming ? stayRange(upcoming) : null;
  const { label, icon: DetailIcon } = ROOM_DETAIL[state];

  return (
    <button type="button" className={`room-card is-${state}${selected ? " selected" : ""}`}
      aria-haspopup="dialog"
      aria-label={`Room ${room.number}, floor ${String(room.floor ?? "—")}, ${STATE_LABEL[state]}, housekeeping ${housekeeping.label}${guest ? `, guest ${guest}` : ""}`}
      onClick={onSelect}>
      <span className="room-card-head"><b className="room-card-number">Room {room.number}</b><span className="room-card-menu" aria-hidden="true"><MoreHorizontal size={14} /></span></span>
      <span className="room-card-badges">
          <StatusBadge status={state} label={STATE_LABEL[state]} size="sm" />
          {housekeeping.label !== STATE_LABEL[state] && <StatusBadge status={housekeeping.status} label={housekeeping.label} size="sm" />}
      </span>
      <span className="room-card-floor">Floor {String(room.floor ?? "—")}{state === "out_of_service" || blocked ? ` · ${outOfServiceReason(room, blocked)}` : ""}</span>
      <span className="room-card-stay"><DetailIcon size={15} aria-hidden="true" /><span className="room-card-stay-text">
        <span className="room-card-guest">{guest ? `Guest · ${guest}` : label}</span>
        {range && <span className="room-card-range">{range}</span>}
      </span></span>
    </button>
  );
}

export function RoomActionSheet({
  room,
  state,
  stay,
  upcoming,
  actions,
  onClose,
}: {
  room: RackRoom;
  state: RackBoardState;
  stay: RackReservation | null;
  upcoming: RackReservation | null;
  actions: BoardAction[];
  onClose: () => void;
}) {
  const guest = stay?.guest_name ?? upcoming?.guest_name ?? null;
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Room ${room.number} — ${STATE_LABEL[state]}`}
      description={`${room.type} · Floor ${String(room.floor ?? "—")}${guest ? ` · ${guest}` : ""}`}
      size="md"
      headerVariant="branded"
      portal
    >
      <div className="board-actions">
        {actions.map((action) => (
          <button key={action.label} type="button" className="board-action" onClick={action.onSelect}>
            <span><b>{action.label}</b>{action.hint && <small>{action.hint}</small>}</span>
            <span aria-hidden="true">›</span>
          </button>
        ))}
        {actions.length === 0 && <p>No actions are available for your role on this room.</p>}
      </div>
    </Modal>
  );
}

/**
 * Interactive room board: rooms grouped by live type with a labeled group
 * header (type name, room count, occupancy/condition counts) and redesigned
 * room cards below.
 */
export default function RoomBoard({
  rooms,
  reservations,
  today,
  blockedRoomIds,
  selectedRoomId,
  onSelectRoom,
}: {
  rooms: RackRoom[];
  reservations: RackReservation[];
  today: string;
  blockedRoomIds?: Set<string> | string[] | null;
  selectedRoomId: string | null;
  onSelectRoom: (room: RackRoom) => void;
}) {
  const blocked = blockedRoomIds instanceof Set ? blockedRoomIds : new Set(blockedRoomIds ?? []);
  const groups = groupRoomsByType(rooms);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  if (!groups.length) return <HavenEmptyState icon={<BedDouble size={22} aria-hidden="true" />} title="No rooms match" body="Clear filters or try another room type or floor." />;
  return (
    <div className="board-groups" role="list" aria-label="Rooms by type">
      {groups.map((group) => {
        const states = group.rooms.map((room) => roomBoardState(room, reservations, today, blocked).state);
        const counts = {
          available: states.filter((s) => s === "available").length,
          occupied: states.filter((s) => s === "occupied").length,
          dirty: states.filter((s) => s === "dirty").length,
          reserved: states.filter((s) => s === "reserved").length,
          out_of_service: states.filter((s) => s === "out_of_service").length,
        };
        const colorKey = group.rooms[0]?.room_type_color ?? null;
        const open = !collapsed.has(group.type);
        return (
          <section key={group.type} className="board-group" role="listitem" aria-label={`${group.type}, ${group.rooms.length} rooms`}>
            <header className="board-group-head">
              <button type="button" className="board-group-title" aria-expanded={open} onClick={() => setCollapsed(current => {
                const next = new Set(current);
                if (next.has(group.type)) next.delete(group.type); else next.add(group.type);
                return next;
              })}>
                <span className={`room-type-circle ${colorKey ? `rt-${colorKey}` : ""}`} aria-hidden="true" />
                <span className="board-group-name">{group.type}</span>
                <span className="board-group-count">{group.rooms.length} {group.rooms.length === 1 ? "room" : "rooms"}</span>
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              <ul className="board-group-breakdown" aria-label={`${group.type} condition`}>
                {counts.available > 0 && <li className="breakdown-available">{counts.available} ready</li>}
                {counts.occupied > 0 && <li className="breakdown-occupied">{counts.occupied} occupied</li>}
                {counts.dirty > 0 && <li className="breakdown-dirty">{counts.dirty} dirty</li>}
                {counts.reserved > 0 && <li className="breakdown-reserved">{counts.reserved} reserved</li>}
                {counts.out_of_service > 0 && <li className="breakdown-out_of_service">{counts.out_of_service} out of service</li>}
              </ul>
            </header>
            {open && <div className="board-cards">
              {group.rooms.map((room) => {
                const board = roomBoardState(room, reservations, today, blocked);
                return (
                  <RoomCard
                    key={room.id}
                    room={room}
                    stay={board.stay}
                    upcoming={board.upcoming}
                    state={board.state}
                    blocked={blocked.has(room.id)}
                    selected={selectedRoomId === room.id}
                    onSelect={() => onSelectRoom(room)}
                  />
                );
              })}
            </div>}
          </section>
        );
      })}
    </div>
  );
}
