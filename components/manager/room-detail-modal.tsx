"use client";

import { useEffect, useRef, useState } from "react";
import { BedDouble, CalendarDays, ClipboardCheck, DoorOpen, Wrench } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { formatPeso } from "@/lib/format";
import { roomPrimary } from "@/lib/room-images";
import type { RecordItem } from "@/lib/types";

export type RoomDetail = {
  room: RecordItem;
  roomType: RecordItem | null;
  bookingVisible: boolean;
  currentStay: RecordItem | null;
  nextReservation: RecordItem | null;
  assignments: RecordItem[];
  tasks: RecordItem[];
  orders: RecordItem[];
  blocked: boolean;
};

const label = (value: unknown) => String(value ?? " ").replaceAll("_", " ");
const when = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? label(value) : date.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
};

// Readiness explained from current authoritative state only — no recreated
// state machine, no synthetic history.
function readiness(room: RecordItem, blocked: boolean): string[] {
  const notes: string[] = [];
  switch (String(room.status)) {
    case "available": notes.push("Clean and serviceable — ready to be assigned to an arriving guest."); break;
    case "reserved": notes.push("Held for a confirmed upcoming arrival; it cannot be assigned to another reservation."); break;
    case "occupied": notes.push("A guest is in house. Checkout moves it to dirty for turnover cleaning."); break;
    case "dirty": notes.push("Awaiting housekeeping turnover. It returns to available once cleaned and inspected."); break;
    case "maintenance": notes.push(blocked ? "Held out of service while a maintenance work order is open." : "Held for maintenance; it is not assignable right now."); break;
    default: notes.push(`Current recorded status: ${label(room.status)}.`);
  }
  if (String(room.housekeeping) === "dirty") notes.push("Housekeeping state is dirty — the room needs a full clean before the next arrival.");
  else if (String(room.housekeeping) === "inspection" || String(room.housekeeping) === "reclean_required") notes.push(`Housekeeping state is ${label(room.housekeeping)} — final sign-off is still pending.`);
  return notes;
}

export default function RoomDetailModal({ room, onClose, onViewReservation }: { room: RecordItem; onClose: () => void; onViewReservation: (reservationId: string) => void }) {
  const [detail, setDetail] = useState<RoomDetail | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("overview");
  const [expanded, setExpanded] = useState<Record<string, number>>({});
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // The parent remounts this modal per room (key={room.id}), so state starts
  // fresh for every room; the effect only owns the fetch lifecycle.
  useEffect(() => {
    let active = true;
    fetch(`/api/staff/rooms/${room.id}`, { cache: "no-store" })
      .then(async (response) => { const body = await response.json(); if (!active) return; response.ok ? setDetail(body.data) : setError(body.error ?? "Unable to load room details."); })
      .catch(() => { if (active) setError("Unable to load room details."); });
    return () => { active = false; };
  }, [room.id]);

  const tabs = detail
    ? ([["overview", "Overview", BedDouble], ...(detail.bookingVisible ? [["booking", "Booking activity", CalendarDays]] : []), ["housekeeping", "Housekeeping", ClipboardCheck], ["maintenance", "Maintenance", Wrench]] as [string, string, React.ElementType][])
    : [];

  const handleTabKeys = (event: React.KeyboardEvent) => {
    if (!tabs.length) return;
    const index = tabs.findIndex(([key]) => key === tab);
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next === null) return;
    event.preventDefault();
    setTab(tabs[next][0]);
    tabRefs.current[tabs[next][0]]?.focus();
  };

  const shown = (key: string, count = 6) => expanded[key] ?? count;

  return (
    <Modal isOpen onClose={onClose} title={`Room ${label(room.number)}`} description={`${label(room.type)}${room.floor ? ` · Floor ${label(room.floor)}` : ""}`} size="xl" headerVariant="branded">
      <div className="room-detail">
        <div className="room-detail-status">
          <span className={`badge ${room.status}`}>{label(room.status)}</span>
          <span className={`badge ${room.housekeeping}`}>{label(room.housekeeping)}</span>
          {detail?.blocked && <strong className="room-blocked-banner">ROOM BLOCKED — Active maintenance work order prevents this room from being assigned until resolved.</strong>}
        </div>

        {error && <div className="empty"><h3>Room details unavailable</h3><p>{error}</p></div>}
        {!error && !detail && (
          <div className="room-skeleton" aria-label="Loading room details">
            <span className="room-skeleton-tabs"><i /><i /><i /><i /></span>
            <span className="room-skeleton-grid">{Array.from({ length: 8 }, (_, index) => <i key={index} />)}</span>
          </div>
        )}

        {detail && (
          <>
            <div className="room-detail-tabs" role="tablist" aria-label="Room detail sections" onKeyDown={handleTabKeys}>
              {tabs.map(([key, text, Icon]) => (
                <button key={key} ref={(element) => { tabRefs.current[key] = element; }} role="tab" id={`room-tab-${key}`} aria-selected={tab === key} aria-controls={`room-panel-${key}`} tabIndex={tab === key ? 0 : -1} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><Icon size={14} aria-hidden="true" />{text}</button>
              ))}
            </div>

            {tab === "overview" && <OverviewPanel detail={detail} onViewReservation={onViewReservation} />}
            {tab === "booking" && <BookingPanel detail={detail} onViewReservation={onViewReservation} shown={shown("booking")} onShowMore={() => setExpanded((state) => ({ ...state, booking: (state.booking ?? 6) + 9 }))} />}
            {tab === "housekeeping" && <HousekeepingPanel detail={detail} shown={shown("housekeeping")} onShowMore={() => setExpanded((state) => ({ ...state, housekeeping: (state.housekeeping ?? 6) + 9 }))} />}
            {tab === "maintenance" && <MaintenancePanel detail={detail} shown={shown("maintenance")} onShowMore={() => setExpanded((state) => ({ ...state, maintenance: (state.maintenance ?? 6) + 9 }))} />}
          </>
        )}
      </div>
    </Modal>
  );
}

function OverviewPanel({ detail, onViewReservation }: { detail: RoomDetail; onViewReservation: (reservationId: string) => void }) {
  const { room, roomType, currentStay, nextReservation, blocked } = detail;
  const photo = roomPrimary(roomType?.photo_urls as string[] | undefined, String(room.type));
  const amenities = (roomType?.amenities ?? room.amenities) as unknown as string[] | null;
  return (
    <div id="room-panel-overview" role="tabpanel" aria-labelledby="room-tab-overview">
      <div className="room-detail-grid">
        {photo && <img className="room-detail-photo" src={photo} alt={`${label(room.type)} room type`} />}
        <section>
          <h3>Room facts</h3>
          <dl>
            <div><dt>Status</dt><dd><span className={`badge ${room.status}`}>{label(room.status)}</span></dd></div>
            <div><dt>Housekeeping</dt><dd><span className={`badge ${room.housekeeping}`}>{label(room.housekeeping)}</span></dd></div>
            <div><dt>Floor</dt><dd>{label(room.floor)}</dd></div>
            <div><dt>Nightly rate</dt><dd>{formatPeso(Number(room.rate || 0))}</dd></div>
            {room.wing ? <div><dt>Wing</dt><dd>{label(room.wing)}</dd></div> : null}
          </dl>
        </section>
        <section>
          <h3>{label(room.type)}</h3>
          {roomType ? <dl>
            {roomType.max_guests ? <div><dt>Max guests</dt><dd>{label(roomType.max_guests)}</dd></div> : null}
            {roomType.beds ? <div><dt>Beds</dt><dd>{label(roomType.beds)}</dd></div> : null}
            {roomType.size_sqm ? <div><dt>Size</dt><dd>{label(roomType.size_sqm)} sqm</dd></div> : null}
            {roomType.base_rate ? <div><dt>Base rate</dt><dd>{formatPeso(Number(roomType.base_rate))}</dd></div> : null}
          </dl> : <p className="room-detail-note">No room-type profile is recorded for {label(room.type)}.</p>}
          {roomType?.description ? <p className="room-detail-note">{label(roomType.description)}</p> : null}
          {Array.isArray(amenities) && amenities.length > 0 && <p className="room-detail-note"><strong>Amenities:</strong> {amenities.map(label).join(", ")}</p>}
        </section>
        <section>
          <h3>Readiness</h3>
          {readiness(room, blocked).map((note) => <p key={note} className="room-detail-note">{note}</p>)}
        </section>
        {detail.bookingVisible && <section>
          <h3>Current stay</h3>
          {currentStay ? <>
            <dl>
              <div><dt>Guest</dt><dd>{label(currentStay.guest_name)}</dd></div>
              <div><dt>Reference</dt><dd>{label(currentStay.confirmation_number || currentStay.id)}</dd></div>
              <div><dt>Dates</dt><dd>{label(currentStay.check_in)} to {label(currentStay.check_out)}</dd></div>
              {currentStay.checked_in_at ? <div><dt>Checked in</dt><dd>{when(currentStay.checked_in_at)}</dd></div> : null}
            </dl>
            <button className="btn btn-soft" onClick={() => onViewReservation(String(currentStay.id))}><DoorOpen size={14} /> View reservation</button>
          </> : nextReservation ? <>
            <p className="room-detail-note">No active reservation is in house.</p>
            <dl>
              <div><dt>Next reservation</dt><dd>{label(nextReservation.guest_name)}</dd></div>
              <div><dt>Reference</dt><dd>{label(nextReservation.confirmation_number || nextReservation.id)}</dd></div>
              <div><dt>Arrival</dt><dd>{label(nextReservation.check_in)}</dd></div>
              <div><dt>Departure</dt><dd>{label(nextReservation.check_out)}</dd></div>
              <div><dt>Status</dt><dd><span className={`badge ${String(nextReservation.status)}`}>{label(nextReservation.status)}</span></dd></div>
            </dl>
            <button className="btn btn-soft" onClick={() => onViewReservation(String(nextReservation.id))}><DoorOpen size={14} /> View reservation</button>
          </> : <p className="room-detail-note">No active reservation. This room is not held for an arriving guest.</p>}
        </section>}
      </div>
    </div>
  );
}

function BookingPanel({ detail, onViewReservation, shown, onShowMore }: { detail: RoomDetail; onViewReservation: (reservationId: string) => void; shown: number; onShowMore: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  // Assignments carry their reservation embedded; the Current-stay group renders the
  // in-house reservation directly, so both shapes flow through one row renderer.
  const reservationOf = (item: RecordItem): RecordItem => ((item as unknown as { reservation?: RecordItem | null }).reservation ?? item);
  const groups: [string, RecordItem[]][] = [
    ["Current stay", detail.currentStay ? [detail.currentStay] : []],
    ["Upcoming", detail.assignments.filter((a) => a.status === "active" && String(reservationOf(a).status) !== "checked_in" && String(a.check_in) >= today).sort((a, b) => String(a.check_in).localeCompare(String(b.check_in)))],
    ["Recent", detail.assignments.filter((a) => !(a.status === "active" && String(a.check_in) >= today))],
  ];
  const empty = groups.every(([, items]) => items.length === 0);
  return (
    <div id="room-panel-booking" role="tabpanel" aria-labelledby="room-tab-booking">
      {empty && <div className="empty"><h3>No booking history recorded</h3><p>This room has no reservation assignments on record yet.</p></div>}
      {groups.filter(([, items]) => items.length > 0).map(([title, items]) => <section key={title} className="room-detail-section">
        <h3>{title}</h3>
        {items.slice(0, title === "Current stay" ? 1 : shown).map((item) => {
          const reservation = reservationOf(item);
          return <div className="room-detail-row" key={String(item.id)}>
            <div>
              <b>{label(reservation.guest_name)}</b>
              <small>{label(reservation.confirmation_number || reservation.id)} · {label(reservation.check_in)} to {label(reservation.check_out)}</small>
              {reservation.checked_in_at ? <small>Checked in {when(reservation.checked_in_at)}</small> : null}
              {reservation.checked_out_at ? <small>Checked out {when(reservation.checked_out_at)}</small> : null}
              {item.reason ? <small>{label(item.reason)}{item.is_upgrade ? " · upgrade" : ""}</small> : null}
            </div>
            <div className="room-detail-row-side">
              <span className={`badge ${String(reservation.status)}`}>{label(reservation.status)}</span>
              {String(item.status) !== String(reservation.status) && <span className="badge">{label(item.status)}</span>}
              <button className="table-action view-action" onClick={() => onViewReservation(String(reservation.id))}>View</button>
            </div>
          </div>;
        })}
        {title !== "Current stay" && items.length > shown && <button className="room-detail-more" onClick={onShowMore}>Show more ({items.length - shown} remaining)</button>}
      </section>)}
    </div>
  );
}

function HousekeepingPanel({ detail, shown, onShowMore }: { detail: RoomDetail; shown: number; onShowMore: () => void }) {
  return (
    <div id="room-panel-housekeeping" role="tabpanel" aria-labelledby="room-tab-housekeeping">
      {detail.tasks.length === 0 ? <div className="empty"><h3>No housekeeping history</h3><p>No room-care tasks have been recorded for this room.</p></div> :
        <section className="room-detail-section">
          {detail.tasks.slice(0, shown).map((task) => <div className="room-detail-row" key={String(task.id)}>
            <div>
              <b>{label(task.task_type)}</b>
              <small>{label(task.task)}</small>
              <small>{label(task.assigned_to)}{task.started_at ? ` · started ${when(task.started_at)}` : ""}{task.completed_at ? ` · completed ${when(task.completed_at)}` : ""}</small>
              {task.deferred_reason ? <small>Deferred: {label(task.deferred_reason)}</small> : null}
              {task.inspection_status && task.inspection_status !== "not_required" ? <small>Inspection {label(task.inspection_status)}{task.inspected_by_name ? ` by ${label(task.inspected_by_name)}` : ""}</small> : null}
            </div>
            <div className="room-detail-row-side"><span className={`badge ${String(task.priority)}`}>{label(task.priority)}</span><span className={`badge ${String(task.status)}`}>{label(task.status)}</span></div>
          </div>)}
          {detail.tasks.length > shown && <button className="room-detail-more" onClick={onShowMore}>Show more ({detail.tasks.length - shown} remaining)</button>}
        </section>}
    </div>
  );
}

function MaintenancePanel({ detail, shown, onShowMore }: { detail: RoomDetail; shown: number; onShowMore: () => void }) {
  const activeIssue = (order: RecordItem) => ["open", "assigned", "in_progress", "waiting_parts", "deferred"].includes(String(order.status));
  const active = detail.orders.filter(activeIssue);
  const resolved = detail.orders.filter((order) => !activeIssue(order));
  const orderRow = (order: RecordItem) => <div className="room-detail-row" key={String(order.id)}>
    <div>
      <b>{label(order.issue)}</b>
      <small>{label(order.id)} · {label(order.category)} · {label(order.assigned_to)}</small>
      {order.diagnosis ? <small>Diagnosis: {label(order.diagnosis)}</small> : null}
      {order.resolution ? <small>Resolution: {label(order.resolution)}</small> : null}
      <small>Opened {when(order.created_at)}{order.resolved_at ? ` · resolved ${when(order.resolved_at)}` : order.completed_at ? ` · completed ${when(order.completed_at)}` : ""}</small>
      {(Array.isArray(order.events) && order.events.length > 0) && <div className="room-detail-events">
        {(order.events as unknown as RecordItem[]).map((event) => <small key={String(event.id)}>{when(event.created_at)} — {label(event.event_type)}{event.from_status || event.to_status ? ` (${label(event.from_status)} → ${label(event.to_status)})` : ""}{event.note ? ` · ${label(event.note)}` : ""}</small>)}
      </div>}
    </div>
    <div className="room-detail-row-side">
      <span className={`badge ${String(order.priority)}`}>{label(order.priority)}</span>
      <span className={`badge ${String(order.serviceability_impact)}`}>{label(order.serviceability_impact)}</span>
      <span className={`badge ${String(order.status)}`}>{label(order.status)}</span>
    </div>
  </div>;
  return (
    <div id="room-panel-maintenance" role="tabpanel" aria-labelledby="room-tab-maintenance">
      {detail.blocked && <strong className="room-blocked-banner">ROOM BLOCKED — Active maintenance work order prevents this room from being assigned until resolved.</strong>}
      {detail.orders.length === 0 ? <div className="empty"><h3>No maintenance history</h3><p>No work orders have been raised for this room.</p></div> : <>
        <section className="room-detail-section">
          <h3>{active.length ? `Active issues (${active.length})` : "Active issues"}</h3>
          {active.length ? active.map(orderRow) : <p className="room-detail-note">No open work orders — this room has no outstanding maintenance.</p>}
        </section>
        {resolved.length > 0 && <section className="room-detail-section">
          <h3>Resolved history</h3>
          {resolved.slice(0, shown).map(orderRow)}
          {resolved.length > shown && <button className="room-detail-more" onClick={onShowMore}>Show more ({resolved.length - shown} remaining)</button>}
        </section>}
      </>}
    </div>
  );
}
