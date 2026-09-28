"use client";

import { Modal } from "@/components/ui/Modal";
import { RoomTypeBadge } from "@/components/ui/RoomTypeBadge";
import { groupRoomsByType, roomBoardState, type RackReservation, type RackRoom } from "@/lib/room-rack";

export type BoardAction = { label: string; hint?: string; onSelect: () => void };

const STATE_LABEL: Record<string, string> = {
  available: "Clean",
  occupied: "Occupied",
  dirty: "Dirty",
  out_of_service: "Out of service",
  reserved: "Reserved",
};

// Short plural breakdown labels for the group header ("3 clean · 1 dirty").
const BREAKDOWN_LABEL: Record<string, string> = {
  available: "clean",
  occupied: "occupied",
  dirty: "dirty",
  out_of_service: "out of service",
  reserved: "reserved",
};

const stayRange = (stay: RackReservation) => `${stay.check_in.slice(0, 10)} → ${stay.check_out.slice(0, 10)}`;

function outOfServiceReason(room: RackRoom): string {
  if (room.administratively_active === false) return "Retired";
  if (room.status === "maintenance") return "Maintenance";
  return "Cleanup pending";
}

function RoomCard({
  room,
  stay,
  upcoming,
  state,
  selected,
  onSelect,
}: {
  room: RackRoom;
  stay: RackReservation | null;
  upcoming: RackReservation | null;
  state: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const guest = stay?.guest_name ?? upcoming?.guest_name ?? null;
  const range = stay ? stayRange(stay) : upcoming ? stayRange(upcoming) : null;
  return (
    <button
      type="button"
      className={`board-card is-${state}${selected ? " selected" : ""}`}
      aria-pressed={selected}
      aria-label={`Room ${room.number}, floor ${String(room.floor ?? "—")}, ${STATE_LABEL[state] ?? state}${guest ? `, guest ${guest}` : ""}`}
      onClick={onSelect}
    >
      <span className="board-card-top">
        <b>Room {room.number}</b>
        <span className={`badge board-state-${state}`}>{STATE_LABEL[state] ?? state}</span>
      </span>
      <span className="board-card-guest">{guest ? `Guest · ${guest}` : "—"}</span>
      <span className="board-card-floor">Floor {String(room.floor ?? "—")}{state === "out_of_service" ? ` · ${outOfServiceReason(room)}` : ""}</span>
      <span className="board-card-range">{range ?? "—"}</span>
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
  state: string;
  stay: RackReservation | null;
  upcoming: RackReservation | null;
  actions: BoardAction[];
  onClose: () => void;
}) {
  const guest = stay?.guest_name ?? upcoming?.guest_name ?? null;
  return (
    <Modal isOpen onClose={onClose} title={`Room ${room.number} — ${STATE_LABEL[state] ?? state}`}>
      <p>
        {room.type} · Floor {String(room.floor ?? "—")}
        {guest ? ` · ${guest}` : ""}
      </p>
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
 * Interactive room board: rooms grouped by their live type with a labeled
 * count + state breakdown per group, each card showing labeled room number,
 * status, guest, floor, and stay range. Filtering and actions stay with
 * the caller — this component only renders groups + cards.
 */
export default function RoomBoard({
  rooms,
  reservations,
  today,
  selectedRoomId,
  onSelectRoom,
}: {
  rooms: RackRoom[];
  reservations: RackReservation[];
  today: string;
  selectedRoomId: string | null;
  onSelectRoom: (room: RackRoom) => void;
}) {
  const groups = groupRoomsByType(rooms);
  return (
    <div className="board-groups" role="list" aria-label="Rooms by type">
      {groups.map((group) => {
        const states = group.rooms.map((room) => roomBoardState(room, reservations, today).state);
        const breakdown = (["available", "occupied", "dirty", "reserved", "out_of_service"] as const)
          .map((state) => ({ state, count: states.filter((s) => s === state).length }))
          .filter(({ count }) => count > 0);
        const colorKey = group.rooms[0]?.room_type_color ?? null;
        return (
          <section key={group.type} className="board-group" role="listitem" aria-label={`${group.type}, ${group.rooms.length} rooms`}>
            <header className="board-group-head">
              <span className="board-group-count" aria-hidden="true">{group.rooms.length}</span>
              <span className="board-group-sub">{group.rooms.length === 1 ? "room" : "rooms"}</span>
              <span className="board-group-type"><RoomTypeBadge name={group.type} colorKey={colorKey} /></span>
              <ul className="board-group-breakdown" aria-label={`${group.type} breakdown`}>
                {breakdown.map(({ state, count }) => (
                  <li key={state} className={`breakdown-${state}`}>{count} {BREAKDOWN_LABEL[state]}</li>
                ))}
              </ul>
            </header>
            <div className="board-cards">
              {group.rooms.map((room) => {
                const board = roomBoardState(room, reservations, today);
                return (
                  <RoomCard
                    key={room.id}
                    room={room}
                    stay={board.stay}
                    upcoming={board.upcoming}
                    state={board.state}
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
