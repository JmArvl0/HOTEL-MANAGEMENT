"use client";

import { MoreHorizontal } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RoomTypeBadge } from "@/components/ui/RoomTypeBadge";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { groupRoomsByType, roomBoardState, type RackReservation, type RackRoom } from "@/lib/room-rack";

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

function occupancyStatus(state: string, blocked: boolean): { label: string; status: string } {
  if (blocked || roomOutOfService(state)) return { label: "Out of service", status: "out_of_service" };
  switch (state) {
    case "available": return { label: "Available", status: "available" };
    case "occupied": return { label: "Occupied", status: "occupied" };
    case "dirty": return { label: "Dirty", status: "dirty" };
    case "reserved": return { label: "Reserved", status: "reserved" };
    default: return { label: state.charAt(0).toUpperCase() + state.slice(1), status: state };
  }
}

function roomOutOfService(state: string): boolean {
  return state === "out_of_service";
}

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
  state: string;
  blocked?: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const occupancy = occupancyStatus(state, !!blocked);
  const housekeeping = housekeepingStatus(room);
  const guest = stay?.guest_name ?? upcoming?.guest_name ?? null;
  const range = stay ? stayRange(stay) : upcoming ? stayRange(upcoming) : null;
  const hasStay = Boolean(stay ?? upcoming);

  return (
      <div
        role="button"
        tabIndex={0}
        className={`room-card is-${state}${selected ? " selected" : ""}`}
        aria-pressed={selected}
        aria-label={`Room ${room.number}, floor ${String(room.floor ?? "—")}, ${occupancy.label}, housekeeping ${housekeeping.label}${guest ? `, guest ${guest}` : ""}`}
        onClick={onSelect}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(); } }}
      >
      <div className="room-card-head">
        <RoomTypeBadge name={room.type} colorKey={room.room_type_color ?? null} />
        <button type="button" className="room-card-menu" aria-label="More options" onClick={(e) => { e.stopPropagation(); }}><MoreHorizontal size={14} aria-hidden="true" /></button>
      </div>
      <div className="room-card-body">
        <div className="room-card-number">Room {room.number}</div>
        <div className="room-card-badges">
          <StatusBadge status={occupancy.status} label={occupancy.label} size="sm" />
          <StatusBadge status={housekeeping.status} label={housekeeping.label} size="sm" />
        </div>
        <div className="room-card-floor">Floor {String(room.floor ?? "—")}{state === "out_of_service" ? ` · ${outOfServiceReason(room, blocked)}` : ""}</div>
        {hasStay ? (
          <div className="room-card-stay">
            {stay?.guest_name ? <img className="room-card-avatar" src={"https://ui-avatars.com/api/?name=" + encodeURIComponent(stay.guest_name) + "&background=random"} alt="" /> : null}
            <div className="room-card-stay-text">
              <div className="room-card-guest">{guest ? `Guest · ${guest}` : "—"}</div>
              <div className="room-card-range">{range ?? "—"}</div>
            </div>
          </div>
        ) : (
          <div className="room-card-empty">Ready for check-in</div>
        )}
      </div>
    </div>
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
  state: string;
  stay: RackReservation | null;
  upcoming: RackReservation | null;
  actions: BoardAction[];
  onClose: () => void;
}) {
  const occupancy = occupancyStatus(state, false);
  const guest = stay?.guest_name ?? upcoming?.guest_name ?? null;
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Room ${room.number} — ${occupancy.label}`}
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
        return (
          <section key={group.type} className="board-group" role="listitem" aria-label={`${group.type}, ${group.rooms.length} rooms`}>
            <header className="board-group-head">
              <div className="board-group-title">
                <RoomTypeBadge name={group.type} colorKey={colorKey} />
                <span className="board-group-name">{group.type}</span>
              </div>
              <span className="board-group-count">{group.rooms.length}</span>
              <ul className="board-group-breakdown" aria-label={`${group.type} condition`}>
                {counts.available > 0 && <li className="breakdown-available">{counts.available} ready</li>}
                {counts.occupied > 0 && <li className="breakdown-occupied">{counts.occupied} occupied</li>}
                {counts.dirty > 0 && <li className="breakdown-dirty">{counts.dirty} dirty</li>}
                {counts.reserved > 0 && <li className="breakdown-reserved">{counts.reserved} reserved</li>}
                {counts.out_of_service > 0 && <li className="breakdown-out_of_service">{counts.out_of_service} out of service</li>}
              </ul>
            </header>
            <div className="board-cards">
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
            </div>
          </section>
        );
      })}
    </div>
  );
}
