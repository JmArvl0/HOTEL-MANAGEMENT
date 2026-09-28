"use client";

import { useEffect, useMemo, useState } from "react";
import { BedDouble, CalendarDays, DoorOpen, Sparkles, SprayCan } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ModuleSummaryCards } from "@/components/manager/module-summary-cards";
import { HavenDataToolbar, HavenSearchInput } from "@/components/ui";
import { HavenSelect } from "@/components/ui/haven-select";
import { useFrontOfficeRack } from "@/hooks/use-front-office-rack";
import BoardReservationTabs, { type BoardTab } from "./board-reservation-tabs";
import RoomBoard, { RoomActionSheet, type BoardAction } from "./room-board";
import RoomBoardOps from "./room-board-ops";
import {
  assignableCell,
  barsForRoom,
  rackSummary,
  roomBoardState,
  unassignedArrivals,
  type RackReservation,
  type RackRoom,
} from "@/lib/room-rack";
import type { RecordItem } from "@/lib/types";
import "./fused-room-rack-panel.css";

const asRecord = (value: object): RecordItem => value as unknown as RecordItem;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (iso: string, delta: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
const shortDay = (iso: string) => iso.slice(5).replace("-", "/");
const fullDay = (iso: string) => `${iso.slice(5).replace("-", "/")}/${iso.slice(0, 4)}`;

/**
 * Single stay-window control: the trigger shows the range ("09/28 –
 * 10/05/2026"), opening two native date inputs that apply immediately on
 * valid change. End date derives the 1–14 day window; no presets, no new
 * dependencies — native inputs per the repo date standard.
 */
function BoardDateRange({ from, days, onRange, notify }: {
  from: string;
  days: number;
  onRange: (from: string, days: number) => void;
  notify: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(addDays(from, days - 1));
  const end = addDays(from, days - 1);
  const label = days <= 1 ? `${fullDay(from)} · 1 day` : `${shortDay(from)} – ${fullDay(end)}`;
  const apply = (nextFrom: string, nextTo: string) => {
    if (!ISO_DAY.test(nextFrom) || !ISO_DAY.test(nextTo)) return;
    const span = Math.round((Date.parse(`${nextTo}T00:00:00Z`) - Date.parse(`${nextFrom}T00:00:00Z`)) / 86_400_000) + 1;
    if (span < 1) {
      notify("End date must be on or after the start date.");
      return;
    }
    if (span > 14) notify("Window capped at 14 days.");
    onRange(nextFrom, Math.min(14, span));
  };
  return (
    <span className="board-range">
      <button
        type="button"
        className="board-range-trigger"
        aria-label={`Stay window, currently ${label}. Change dates`}
        aria-expanded={open}
        onClick={() => { setDraftFrom(from); setDraftTo(end); setOpen((v) => !v); }}
      >
        <CalendarDays size={15} aria-hidden="true" />
        <span aria-hidden="true">{label}</span>
      </button>
      {open && (
        <>
          <button type="button" className="board-range-backdrop" aria-label="Close date picker" onClick={() => setOpen(false)} />
          <span className="board-range-pop" role="dialog" aria-label="Choose stay window">
            <label>From
              <input type="date" className="board-date-input" data-range="from" value={ISO_DAY.test(draftFrom) ? draftFrom : ""} required aria-required="true"
                onChange={(e) => { setDraftFrom(e.target.value); if (ISO_DAY.test(e.target.value)) apply(e.target.value, draftTo); }} />
            </label>
            <label>To
              <input type="date" className="board-date-input" data-range="to" value={ISO_DAY.test(draftTo) ? draftTo : ""} min={ISO_DAY.test(draftFrom) ? draftFrom : undefined} required aria-required="true"
                onChange={(e) => { setDraftTo(e.target.value); if (ISO_DAY.test(e.target.value)) apply(draftFrom, e.target.value); }} />
            </label>
          </span>
        </>
      )}
    </span>
  );
}

/**
 * Room Reservations as an interactive Room Board: KPI strip,
 * shared toolbar, type-grouped room cards, ops rail, and tabbed reservations
 * below. Every mutation reuses the existing assign / check-in / folio /
 * detail / dispatch routes — the board decides nothing the server does not
 * re-validate. .mod-kpis is owned by ModuleSummaryCards and untouched.
 */
export default function FrontOfficeRack({
  role,
  onOpenFolio,
  onCheckIn,
  onViewRoom,
  onNewReservation,
  onCheckOut,
}: {
  role: string;
  onOpenFolio: (reservationId: string) => void;
  onCheckIn: (reservationId: string) => void;
  onViewRoom?: (room: RecordItem) => void;
  onNewReservation?: () => void;
  onCheckOut?: (item: RecordItem) => void;
}) {
  const { from, days, setDays, setFrom, snapshot, loading, error, reload } = useFrontOfficeRack();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [floorFilter, setFloorFilter] = useState("all");
  const [tab, setTab] = useState<BoardTab>("arrivals");
  const [view, setView] = useState<"board" | BoardTab>("board");
  const [history, setHistory] = useState<RackReservation[] | null>(null);
  const [activeRoom, setActiveRoom] = useState<RackRoom | null>(null);
  const [arrivalPick, setArrivalPick] = useState<RackRoom | null>(null);
  const [confirm, setConfirm] = useState<{ reservation: RackReservation; room: RackRoom } | null>(null);
  const [dispatchRoom, setDispatchRoom] = useState<RackRoom | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const rooms = useMemo(() => snapshot?.rooms ?? [], [snapshot]);
  const reservations = useMemo(() => snapshot?.reservations ?? [], [snapshot]);
  const today = useMemo(
    () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()),
    []
  );
  const summary = useMemo(() => rackSummary(rooms, reservations, today), [rooms, reservations, today]);
  const canAssign = role === "front_desk";
  const canDispatch = role === "front_desk" || role === "manager";

  // Full reservation history for the All/Completed tabs: the rack snapshot
  // only covers the selected window, so closed past stays need the existing
  // resources list (same RBAC — front_desk holds reservations access).
  // Failure falls back to snapshot rows; tabs stay usable either way.
  useEffect(() => {
    let live = true;
    fetch("/api/resources/reservations", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (!live || !Array.isArray(body?.data)) return;
        setHistory(
          (body.data as Record<string, unknown>[]).map((row) => ({
            id: String(row.id),
            confirmation_number: (row.confirmation_number as string | null) ?? null,
            guest_name: (row.guest_name as string | null) ?? null,
            room_type: String(row.room_type ?? ""),
            room_id: (row.room_id as string | null) ?? null,
            room_number: (row.room_number as string | null) ?? null,
            check_in: String(row.check_in ?? ""),
            check_out: String(row.check_out ?? ""),
            status: String(row.status ?? ""),
            payment_status: (row.payment_status as string | null) ?? null,
          }))
        );
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const queue = useMemo(() => unassignedArrivals(reservations), [reservations]);
  const types = useMemo(() => [...new Set(rooms.map((r) => r.type))], [rooms]);
  const floors = useMemo(() => [...new Set(rooms.map((r) => String(r.floor ?? "—")))], [rooms]);
  const states = useMemo(
    () => new Map(rooms.map((room) => [room.id, roomBoardState(room, reservations, today)] as const)),
    [rooms, reservations, today]
  );

  const visibleRooms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rooms.filter((room) => {
      if (typeFilter !== "all" && room.type !== typeFilter) return false;
      if (floorFilter !== "all" && String(room.floor ?? "—") !== floorFilter) return false;
      if (statusFilter !== "all" && states.get(room.id)?.state !== statusFilter) return false;
      if (!needle) return true;
      if (`${room.number} ${room.type} ${room.floor ?? ""}`.toLowerCase().includes(needle)) return true;
      return reservations.some(
        (r) =>
          r.room_id === room.id &&
          `${r.guest_name ?? ""} ${r.confirmation_number ?? ""} ${r.id}`.toLowerCase().includes(needle)
      );
    });
  }, [rooms, reservations, query, typeFilter, floorFilter, statusFilter, states]);

  const arrivalsToday = reservations.filter((r) => r.check_in.slice(0, 10) === today && ["pending", "confirmed"].includes(r.status)).length;
  const departuresToday = reservations.filter((r) => r.check_out.slice(0, 10) === today).length;
  const checkIns = reservations.filter((r) => r.status === "checked_in").length;
  const checkOuts = reservations.filter((r) => r.status === "checked_out").length;
  const hasActiveFilters = query.trim() !== "" || typeFilter !== "all" || statusFilter !== "all" || floorFilter !== "all";

  async function assign(reservation: RackReservation, room: RackRoom) {
    const bars = barsForRoom(reservations, room.id, from, days);
    const check = assignableCell(room, reservation, bars);
    if (!check.ok) {
      setNotice((check as { reason: string }).reason);
      setConfirm(null);
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch(`/api/front-desk/reservations/${reservation.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ room: room.number, reason: "Assigned from Room Rack" }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Unable to assign room.");
      setConfirm(null);
      setArrivalPick(null);
      setActiveRoom(null);
      await reload();
      onCheckIn(reservation.id);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Unable to assign room.");
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }

  async function dispatch(room: RackRoom) {
    setBusy(true);
    setNotice("");
    try {
      const res = await fetch("/api/resources/housekeeping_tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: room.id,
          room_number: room.number,
          task: "Urgent reclean requested from Room Rack",
          priority: "urgent",
          status: "pending",
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Unable to dispatch housekeeping.");
      setDispatchRoom(null);
      setActiveRoom(null);
      setNotice(`Reclean dispatched for room ${room.number}.`);
      await reload();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Unable to dispatch housekeeping.");
    } finally {
      setBusy(false);
    }
  }

  function roomActions(room: RackRoom): BoardAction[] {
    const board = states.get(room.id) ?? roomBoardState(room, reservations, today);
    const stay = board.stay ?? board.upcoming;
    const actions: BoardAction[] = [];
    if (onViewRoom)
      actions.push({
        label: "View room details",
        hint: `${room.type} · Floor ${String(room.floor ?? "—")}`,
        onSelect: () => { setActiveRoom(null); onViewRoom(asRecord({ id: room.id, number: room.number, type: room.type, floor: room.floor, status: room.status, housekeeping: room.housekeeping })); },
      });
    if (stay)
      actions.push({
        label: stay.status === "checked_in" ? "View folio" : "View reservation",
        hint: `${stay.guest_name ?? stay.confirmation_number ?? "Stay"} · ${stay.check_in.slice(0, 10)} → ${stay.check_out.slice(0, 10)}`,
        onSelect: () => { setActiveRoom(null); onOpenFolio(stay.id); },
      });
    if (canAssign && board.state === "available" && queue.length > 0)
      actions.push({
        label: "Assign arrival…",
        hint: `${queue.filter((r) => r.room_type === room.type).length} compatible arrival${queue.filter((r) => r.room_type === room.type).length === 1 ? "" : "s"}`,
        onSelect: () => { setActiveRoom(null); setArrivalPick(room); },
      });
    if (canAssign && stay?.status === "confirmed")
      actions.push({ label: "Check in guest", hint: stay.guest_name ?? undefined, onSelect: () => { setActiveRoom(null); onCheckIn(stay.id); } });
    if (stay?.status === "checked_in" && onCheckOut)
      actions.push({ label: "Check out guest", hint: stay.guest_name ?? undefined, onSelect: () => { setActiveRoom(null); onCheckOut(asRecord(stay)); } });
    if (board.state === "dirty" && canDispatch)
      actions.push({ label: "Dispatch reclean", hint: "Creates an urgent housekeeping task", onSelect: () => { setActiveRoom(null); setDispatchRoom(room); } });
    if (!canAssign && board.state === "available")
      actions.push({ label: "Assignment is Front Desk only", hint: "This view is read-only for your role", onSelect: () => { setActiveRoom(null); setNotice("Room assignment and check-in are Front Desk operations — this view is read-only for your role."); } });
    return actions;
  }

  if (loading && !snapshot) return <div className="rack-skeleton" aria-label="Loading room rack"><span className="pulse-bar" /><span className="pulse-bar" /><span className="pulse-bar short" /></div>;
  if (error && !snapshot) return <div className="rack-error" role="alert"><p>{error}</p><button type="button" onClick={() => void reload()}>Retry</button></div>;

  const activeBoard = activeRoom ? states.get(activeRoom.id) ?? roomBoardState(activeRoom, reservations, today) : null;

  return (
    <>
      <ModuleSummaryCards
        ariaLabel="Front office summary"
        cards={[
          { label: "Available", value: summary.available, hint: "Clean and ready", tone: "done", icon: DoorOpen },
          { label: "Occupied", value: summary.occupied, hint: "Guests in house", tone: "active", icon: BedDouble },
          { label: "Dirty", value: summary.dirty, hint: "Awaiting turnover", tone: "attention", icon: SprayCan },
          { label: "Arrivals today", value: summary.arrivalsToday, hint: "Confirmed for today", tone: "today", icon: CalendarDays },
          { label: "Departures today", value: summary.departuresToday, hint: "Checking out", tone: "today", icon: Sparkles },
        ]}
      />

    <section aria-label="Room reservations" className="data-panel room-rack">

      <div className="board-viewtabs" role="tablist" aria-label="Room reservations views">
        {([["board", "Room Reservations"], ["all", "All Reservations"], ["arrivals", "Upcoming Arrivals"], ["in_house", "Current Guests"], ["departures", "Departures Today"], ["completed", "Completed"]] as ["board" | BoardTab, string][]).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={(view === "board" ? "board" : tab) === value}
            className={(view === "board" ? "board" : tab) === value ? "active" : ""}
            onClick={() => { if (value === "board") setView("board"); else { setTab(value); setView(value); } }}
          >
            {label}
          </button>
        ))}
      </div>

      {notice && <p role="status" className="rack-notice">{notice}</p>}

      <div className="board-layout">
        <div className="board-main">
          {view === "board" ? (
          <>
          <HavenDataToolbar
        label="Room board search and filters"
        filtersLayout="compact"
        search={<HavenSearchInput value={query} onValueChange={setQuery} label="Search room board" placeholder="Search room number, guest name, or reservation #..." />}
        advancedFilters={<>
          <div className="haven-filter"><HavenSelect value={typeFilter} onChange={setTypeFilter} ariaLabel="Filter by room type" options={[{ value: "all", label: "All room types" }, ...types.map((t) => ({ value: t, label: t }))]} /></div>
          <div className="haven-filter"><HavenSelect value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by room status" options={[{ value: "all", label: "All statuses" }, { value: "available", label: "Clean" }, { value: "occupied", label: "Occupied" }, { value: "dirty", label: "Dirty" }, { value: "reserved", label: "Reserved" }, { value: "out_of_service", label: "Out of service" }]} /></div>
          <div className="haven-filter"><HavenSelect value={floorFilter} onChange={setFloorFilter} ariaLabel="Filter by floor" options={[{ value: "all", label: "All floors" }, ...floors.map((f) => ({ value: f, label: `Floor ${f}` }))]} /></div>
          <div className="haven-filter"><BoardDateRange from={from} days={days} notify={setNotice} onRange={(nextFrom, nextDays) => { setFrom(nextFrom); setDays(nextDays); }} /></div>
        </>}
        resultCount={visibleRooms.length}
        resultNoun="rooms"
        onClearFilters={() => { setQuery(""); setTypeFilter("all"); setStatusFilter("all"); setFloorFilter("all"); }}
        hasActiveFilters={hasActiveFilters}
      />
      <p className="board-window-note" aria-live="polite">Window from {from} · {days} days</p>
          <RoomBoard rooms={visibleRooms} reservations={reservations} today={today} selectedRoomId={activeRoom?.id ?? null} onSelectRoom={setActiveRoom} />
          </>
          ) : (
          <BoardReservationTabs reservations={reservations} history={history} today={today} tab={tab} onOpenFolio={onOpenFolio} search={query} onSearchChange={setQuery} />
          )}
        </div>
        <RoomBoardOps
          actions={[
            ...(onNewReservation ? [{ label: "New Reservation", icon: DoorOpen, onSelect: onNewReservation }] : []),
            { label: "Check In Guest", icon: CalendarDays, onSelect: () => { setTab("arrivals"); setView("arrivals"); setNotice("Choose an arrival below — opening it shows check-in."); } },
            { label: "Check Out Guest", icon: BedDouble, onSelect: () => { setTab("in_house"); setView("in_house"); setNotice("Choose a current guest below — opening it shows check-out."); } },
            { label: "Room Status Update", icon: SprayCan, onSelect: () => setNotice("Select a room on the board to see its available actions.") },
          ]}
          arrivals={arrivalsToday}
          departures={departuresToday}
          checkIns={checkIns}
          checkOuts={checkOuts}
          occupied={summary.occupied}
          total={rooms.length}
          onSelectTab={(t) => { setTab(t as BoardTab); setView(t as BoardTab); }}
        />
      </div>

      {activeRoom && activeBoard && (
        <RoomActionSheet
          room={activeRoom}
          state={activeBoard.state}
          stay={activeBoard.stay}
          upcoming={activeBoard.upcoming}
          actions={roomActions(activeRoom)}
          onClose={() => setActiveRoom(null)}
        />
      )}

      {arrivalPick && (
        <Modal isOpen onClose={() => setArrivalPick(null)} title={`Assign arrival to room ${arrivalPick.number}?`}>
          <p>Only {arrivalPick.type} arrivals fit this room. Assignment re-validates on the server.</p>
          <div className="board-actions">
            {queue.filter((r) => r.room_type === arrivalPick.type).map((r) => (
              <button key={r.id} type="button" className="board-action" onClick={() => setConfirm({ reservation: r, room: arrivalPick })}>
                <span><b>{r.guest_name ?? r.confirmation_number ?? r.id}</b><small>{r.check_in.slice(0, 10)} → {r.check_out.slice(0, 10)}</small></span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
            {queue.filter((r) => r.room_type === arrivalPick.type).length === 0 && <p>No compatible arrivals waiting.</p>}
          </div>
        </Modal>
      )}

      {confirm && (
        <Modal isOpen onClose={() => setConfirm(null)} title={`Assign room ${confirm.room.number}?`}>
          <p>{confirm.reservation.guest_name} · {confirm.reservation.room_type} · {confirm.reservation.check_in.slice(0, 10)} → {confirm.reservation.check_out.slice(0, 10)}</p>
          <div>
            <button type="button" onClick={() => setConfirm(null)}>Cancel</button>
            <button type="button" disabled={busy} onClick={() => void assign(confirm.reservation, confirm.room)}>
              {busy ? "Assigning…" : "Assign & check in"}
            </button>
          </div>
        </Modal>
      )}

      {dispatchRoom && (
        <Modal isOpen onClose={() => setDispatchRoom(null)} title={`Dispatch reclean for room ${dispatchRoom.number}?`}>
          <p>Creates an urgent housekeeping task. The turnover queue owns completion.</p>
          <div>
            <button type="button" onClick={() => setDispatchRoom(null)}>Cancel</button>
            <button type="button" disabled={busy} onClick={() => void dispatch(dispatchRoom)}>
              {busy ? "Dispatching…" : "Dispatch reclean"}
            </button>
          </div>
        </Modal>
      )}
    </section>
    </>
  );
}
