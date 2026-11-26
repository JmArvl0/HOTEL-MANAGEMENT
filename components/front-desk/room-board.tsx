"use client";

import { BedDouble, Calendar, Crown, Layers, MoreHorizontal, Sparkles, User } from "lucide-react";
import Image from "next/image";
import { useId, useState, type CSSProperties } from "react";
import { Modal } from "@/components/ui/Modal";
import { RoomTypeBadge } from "@/components/ui/RoomTypeBadge";
import { roomPhotoNeedsDirectUrl, roomPrimaryPhoto } from "@/lib/room-images";
import { groupRoomsByType, linkedRoomStay, roomBoardState, type RackBoardState, type RackReservation, type RackRoom } from "@/lib/room-rack";
import styles from "./room-board.module.css";

export type BoardAction = { label: string; hint?: string; onSelect: () => void };

const HOUSEKEEPING_LABEL: Record<string, string> = {
  clean: "Clean",
  dirty: "Dirty",
  cleaning: "Cleaning in progress",
  inspection: "Inspection",
  reclean_required: "Reclean required",
};

const stayDate = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
});

export function roomCardStayDates(stay: RackReservation): string {
  const start = new Date(stay.check_in.slice(0, 10));
  const end = new Date(stay.check_out.slice(0, 10));
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || end < start) return "Stay dates unavailable";
  return stayDate.formatRange(start, end);
}

function outOfServiceReason(room: RackRoom, blocked: boolean): string {
  if (blocked) return "Maintenance-blocked";
  if (room.administratively_active === false) return "Retired";
  if (room.status === "maintenance") return "Maintenance";
  return "Cleanup pending";
}

const OCCUPANCY_LABEL: Record<RackBoardState, string> = {
  available: "Available",
  occupied: "Occupied",
  dirty: "Turnover due",
  reserved: "Reserved",
  out_of_service: "Out of service",
};

// The same measured curve clips the photo and draws the thin gold edge.
const SIDE_CURVE = "M 77 0 C 90 2 100 11 100 20 C 100 31 87 41 87 51 C 87 63 96 70 96 79 C 96 89 88 98 70 100";
const BOTTOM_CURVE = "M 100 77 C 93 91 83 100 70 100 C 59 100 50 88 38 89 C 25 89 13 99 0 85";

function RoomCardPhoto({ room, large }: { room: RackRoom; large: boolean }) {
  const curveId = useId();
  const [failedUrls, setFailedUrls] = useState<string[]>([]);
  const catalogUrl = room.room_type_photo_url;
  const fallbackUrl = roomPrimaryPhoto(room.type);
  const src = [catalogUrl, fallbackUrl].find((url) => url && !failedUrls.includes(url));
  const photoAlt = src === catalogUrl ? `${room.type} room interior` : `Illustrative ${room.type} room interior`;

  return (
    <div className={styles.photo}>
      <svg className={styles.edge} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <clipPath id={`${curveId}-side`} clipPathUnits="objectBoundingBox">
            <path d={`${SIDE_CURVE} H 0 V 0 Z`} transform="scale(.01)" />
          </clipPath>
          <clipPath id={`${curveId}-bottom`} clipPathUnits="objectBoundingBox">
            <path d={`${BOTTOM_CURVE} V 0 H 100 Z`} transform="scale(.01)" />
          </clipPath>
        </defs>
        <path className={styles.sideEdge} d={SIDE_CURVE} vectorEffect="non-scaling-stroke" />
        <path className={styles.bottomEdge} d={BOTTOM_CURVE} vectorEffect="non-scaling-stroke" />
      </svg>
      <div
        className={styles.photoSurface}
        style={{ "--photo-side": `url("#${curveId}-side")`, "--photo-bottom": `url("#${curveId}-bottom")` } as CSSProperties}
      >
        {src ? (
          <Image
            src={src}
            alt={photoAlt}
            fill
            sizes={large ? "(max-width: 680px) 100vw, 36vw" : "(max-width: 680px) 100vw, 320px"}
            unoptimized={roomPhotoNeedsDirectUrl(src)}
            onError={() => setFailedUrls((failed) => [...failed, src])}
          />
        ) : (
          <div className={styles.photoPlaceholder} role="img" aria-label={`No photo available for ${room.type}`}>
            <BedDouble aria-hidden="true" />
          </div>
        )}
      </div>
    </div>
  );
}

function RoomCard({
  room,
  reservation,
  state,
  blocked,
  selected,
  large,
  onSelect,
  onActions,
}: {
  room: RackRoom;
  reservation: RackReservation | null;
  state: RackBoardState;
  blocked: boolean;
  selected: boolean;
  large: boolean;
  onSelect: () => void;
  onActions: () => void;
}) {
  const occupancy = blocked ? "out_of_service" : state;
  const housekeeping = HOUSEKEEPING_LABEL[room.housekeeping] ?? room.housekeeping.replaceAll("_", " ");
  const guest = reservation?.guest_name?.trim();
  const floor = room.floor == null || room.floor === "" ? "Floor not set" : `Floor ${room.floor}`;
  const type = room.type || "Unspecified";

  return (
    <div className={styles.cardFrame}>
      <article className={styles.card} data-variant={large ? "large" : "compact"} data-selected={selected}>
        <button
          type="button"
          className={styles.openRoom}
          aria-haspopup="dialog"
          aria-label={`Room ${room.number}, ${floor.toLowerCase()}, ${OCCUPANCY_LABEL[occupancy]}, housekeeping ${housekeeping}${guest ? `, guest ${guest}` : ""}`}
          onClick={onSelect}
        />
        <RoomCardPhoto room={room} large={large} />
        <div className={styles.content}>
          <div className={styles.summary}>
            <div className={styles.heading}>
              <RoomTypeBadge name={type} colorKey={room.room_type_color} className={styles.roomType} icon={<Crown aria-hidden="true" />} />
              <button type="button" className={styles.menu} aria-label={`Room ${room.number} actions`} aria-haspopup="dialog" onClick={onActions}>
                <MoreHorizontal aria-hidden="true" />
              </button>
            </div>
            <h3 className={styles.number}>Room {room.number}</h3>
            <div className={styles.statuses}>
              <span className={styles.status} data-status={occupancy}>{OCCUPANCY_LABEL[occupancy]}</span>
              <span className={styles.status} data-status={room.housekeeping}>
                {room.housekeeping === "clean" && <Sparkles aria-hidden="true" />}
                {housekeeping || "Unknown"}
              </span>
            </div>
            <p className={styles.floor}>
              <Layers aria-hidden="true" />
              <span>{floor}{occupancy === "out_of_service" ? ` · ${outOfServiceReason(room, blocked)}` : ""}</span>
            </p>
            {!reservation && occupancy === "available" && <p className={styles.ready}>Ready for check-in</p>}
          </div>
          {reservation && (
            <dl className={styles.details}>
              <div className={styles.detail}>
                <dt><User className={styles.detailIcon} aria-hidden="true" />Guest</dt>
                <dd>{guest || "No guest assigned"}</dd>
              </div>
              <div className={styles.detail}>
                <dt><Calendar className={styles.detailIcon} aria-hidden="true" />Stay dates</dt>
                <dd>{roomCardStayDates(reservation)}</dd>
              </div>
            </dl>
          )}
        </div>
      </article>
    </div>
  );
}

export function RoomActionSheet({
  room,
  state,
  stay,
  upcoming,
  blocked,
  actions,
  onClose,
}: {
  room: RackRoom;
  state: RackBoardState;
  stay: RackReservation | null;
  upcoming: RackReservation | null;
  blocked: boolean;
  actions: BoardAction[];
  onClose: () => void;
}) {
  const occupancy = OCCUPANCY_LABEL[blocked ? "out_of_service" : state];
  const guest = stay?.guest_name ?? upcoming?.guest_name ?? null;
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Room ${room.number} — ${occupancy}`}
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
  largeCards = false,
  onSelectRoom,
  onRoomActions,
}: {
  rooms: RackRoom[];
  reservations: RackReservation[];
  today: string;
  blockedRoomIds?: Set<string> | string[] | null;
  selectedRoomId: string | null;
  largeCards?: boolean;
  onSelectRoom: (room: RackRoom) => void;
  onRoomActions: (room: RackRoom) => void;
}) {
  const blocked = blockedRoomIds instanceof Set ? blockedRoomIds : new Set(blockedRoomIds ?? []);
  const groups = groupRoomsByType(rooms);
  const large = largeCards || rooms.length === 1;
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
        return (
          <section key={group.type} className="board-group" role="listitem" aria-label={`${group.type}, ${group.rooms.length} rooms`}>
            <header className="board-group-head">
              <span className="board-group-name">{group.type}</span>
              <span className="board-group-count">{group.rooms.length}</span>
              <ul className="board-group-breakdown" aria-label={`${group.type} condition`}>
                {counts.available > 0 && <li className="breakdown-available">{counts.available} ready</li>}
                {counts.occupied > 0 && <li className="breakdown-occupied">{counts.occupied} occupied</li>}
                {counts.dirty > 0 && <li className="breakdown-dirty">{counts.dirty} dirty</li>}
                {counts.reserved > 0 && <li className="breakdown-reserved">{counts.reserved} reserved</li>}
                {counts.out_of_service > 0 && <li className="breakdown-out_of_service">{counts.out_of_service} out of service</li>}
              </ul>
            </header>
            <div className={styles.cards} data-layout={large ? "large" : "compact"}>
              {group.rooms.map((room) => {
                const board = roomBoardState(room, reservations, today, blocked);
                const reservation = board.stay ?? board.upcoming ??
                  (board.state === "dirty" || board.state === "out_of_service" ? linkedRoomStay(room.id, reservations, today) : null);
                return (
                  <RoomCard
                    key={room.id}
                    room={room}
                    reservation={reservation}
                    state={board.state}
                    blocked={blocked.has(room.id)}
                    selected={selectedRoomId === room.id}
                    large={large}
                    onSelect={() => onSelectRoom(room)}
                    onActions={() => onRoomActions(room)}
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
