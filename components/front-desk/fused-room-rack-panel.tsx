"use client";

import { useEffect, useMemo, useState } from "react";
import { BedDouble, CalendarDays, DoorOpen, Plus, QrCode, LogOut } from "lucide-react";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { ModuleSummaryCards } from "@/components/manager/module-summary-cards";
import { HavenDataToolbar, HavenSearchInput, HavenFilterBadges, PageHeader } from "@/components/ui";
import { inReservationQueue, reservationOverlapsWindow, reservationQueues } from "@/lib/reservation-workspace";
import { HavenSelect } from "@/components/ui/haven-select";
import { useFrontOfficeRack } from "@/hooks/use-front-office-rack";
import BoardReservationTabs, { type BoardTab } from "./board-reservation-tabs";
import RoomBoard, { RoomActionSheet, type BoardAction } from "./room-board";
import RoomBoardOps from "./room-board-ops";
import RoomCalendar from "./room-calendar";
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
import type { ToastTone } from "@/components/ui/toast-stack";
import { HavenSkeleton } from "@/components/ui/haven-skeleton";
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
    <div className="board-range">
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
          <div className="board-range-pop" role="dialog" aria-label="Choose stay window">
            <label>From
              <input type="date" className="board-date-input" data-range="from" value={ISO_DAY.test(draftFrom) ? draftFrom : ""} required aria-required="true"
                onChange={(e) => { setDraftFrom(e.target.value); if (ISO_DAY.test(e.target.value)) apply(e.target.value, draftTo); }} />
            </label>
            <label>To
              <input type="date" className="board-date-input" data-range="to" value={ISO_DAY.test(draftTo) ? draftTo : ""} min={ISO_DAY.test(draftFrom) ? draftFrom : undefined} required aria-required="true"
                onChange={(e) => { setDraftTo(e.target.value); if (ISO_DAY.test(e.target.value)) apply(draftFrom, e.target.value); }} />
            </label>
          </div>
        </>
      )}
    </div>
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
  onScan,
  notify,
  initialView,
  initialTab,
  workspace = "combined",
  onNavigateReservations,
  onNavigateRooms,
  onManageRooms,
  initialRoomStatus,
}: {
  role: string;
  onOpenFolio: (reservationId: string) => void;
  onCheckIn: (reservationId: string) => void;
  onViewRoom?: (room: RecordItem, actions?: BoardAction[]) => void;
  onNewReservation?: () => void;
  onCheckOut?: (item: RecordItem) => void;
  onScan?: () => void;
  /** Deep-link entry from Overview shortcuts — applied on mount and when changed. */
  initialView?: "board" | BoardTab;
  initialTab?: BoardTab;
  workspace?: "combined" | "rooms" | "reservations";
  onNavigateReservations?: (queue: BoardTab) => void;
  onNavigateRooms?: () => void;
  onManageRooms?: () => void;
  initialRoomStatus?: "available";
  /** Transient feedback — the shared toast stack. Falls back to inline text. */
  notify?: (message: string, tone?: ToastTone) => void;
}) {
  const { from, days, setDays, setFrom, snapshot, loading, error, reload } = useFrontOfficeRack();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>(initialRoomStatus ?? "all");
  const [floorFilter, setFloorFilter] = useState("all");
  const [tab, setTab] = useState<BoardTab>(initialTab ?? "all");
  const entryView = workspace === "rooms" ? "board" : workspace === "reservations" ? initialView && initialView !== "board" ? initialView : "all" : initialView ?? "board";
  const [view, setView] = useState<"board" | BoardTab>(entryView);
  const [boardFormat, setBoardFormat] = useState(workspace === "rooms" ? "calendar" : "cards");
  // The parent remounts this workspace when its section changes, so shortcut
  // and cross-module entries are applied through the initial state above.
  const [history, setHistory] = useState<RackReservation[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [scope, setScope] = useState(initialTab === "in_house" ? "history" : "window");
  const [closedStatus, setClosedStatus] = useState("all");
  const [activeRoom, setActiveRoom] = useState<RackRoom | null>(null);
  const [arrivalPick, setArrivalPick] = useState<RackRoom | null>(null);
  const [confirm, setConfirm] = useState<{ reservation: RackReservation; room: RackRoom } | null>(null);
  const [dispatchRoom, setDispatchRoom] = useState<RackRoom | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // Toast-first feedback: parent wires the shared stack; the inline line is
  // only a fallback so messages are never swallowed when unwired (tests).
  const say = (message: string, tone: ToastTone = "info") => {
    if (notify) notify(message, tone);
    else setNotice(message);
  };

  const rooms = useMemo(() => snapshot?.rooms ?? [], [snapshot]);
  const reservations = useMemo(() => snapshot?.reservations ?? [], [snapshot]);
  // MGR-002: Maintenance-blocked rooms render as out of service and refuse
  // assignment, even when their stored status still reads clean+available.
  const blockedIds = useMemo(() => new Set(snapshot?.blockedRoomIds ?? []), [snapshot]);
  const today = useMemo(
    () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()),
    []
  );
  const summary = useMemo(() => rackSummary(rooms, reservations, today), [rooms, reservations, today]);
  const canAssign = role === "front_desk";
  const canDispatch = role === "front_desk" || role === "manager";

  // Refresh independently of the room window, including after a failed rack read.
  // Never substitute window rows for a failed full-history read.
  useEffect(() => {
    let live = true;
    fetch("/api/resources/reservations", { cache: "no-store" })
      .then(async res => {
        if (!res.ok) throw new Error("Reservation history could not be loaded.");
        return res.json();
      })
      .then((body) => {
        if (!Array.isArray(body?.data)) throw new Error("Reservation history could not be loaded.");
        if (!live) return;
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
            identity_status: (row.identity_status as string | null) ?? null,
            folio_balance: row.folio_balance == null ? null : Number(row.folio_balance),
          }))
        );
        setHistoryError("");
      })
      .catch(() => { if (live) setHistoryError("Reservation history unavailable. Retry to load complete results."); })
      .finally(() => { if (live) setHistoryLoading(false); });
    return () => { live = false; };
  }, [historyVersion]);

  useEffect(() => {
    const refresh = () => { setHistoryLoading(true); setHistoryVersion(v => v + 1); };
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(() => setHistoryVersion(v => v + 1), 30000);
    return () => { window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, []);

  function retryHistory() { setHistoryLoading(true); setHistoryVersion(v => v + 1); }

  const queue = useMemo(() => unassignedArrivals(reservations), [reservations]);
  const types = useMemo(() => [...new Set(rooms.map((r) => r.type))], [rooms]);
  const floors = useMemo(() => [...new Set(rooms.map((r) => String(r.floor ?? "—")))], [rooms]);
  const states = useMemo(
    () => new Map(rooms.map((room) => [room.id, roomBoardState(room, reservations, today, blockedIds)] as const)),
    [rooms, reservations, today, blockedIds]
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
          (r.room_id === room.id || snapshot?.assignments?.some(a => a.reservation_id === r.id && a.room_id === room.id && a.status !== "cancelled")) &&
          `${r.guest_name ?? ""} ${r.confirmation_number ?? ""} ${r.id}`.toLowerCase().includes(needle)
      );
    });
  }, [rooms, reservations, query, typeFilter, floorFilter, statusFilter, states, snapshot?.assignments]);

  const hasActiveFilters = query.trim() !== "" || typeFilter !== "all" || statusFilter !== "all" || floorFilter !== "all";
  const historyAvailable = history !== null && !historyError;
  const dailyRows = historyAvailable ? history : [];
  const readyRooms = Array.from(states.values()).filter(state => state.state === "available").length;
  const listRows = useMemo(() => {
    if (!history || historyError) return [];
    if (scope === "history") return history;
    const end = addDays(from, days - 1);
    return history.filter(r => reservationOverlapsWindow(r, from, end));
  }, [history, historyError, scope, from, days]);
  function selectQueue(target: string) {
    setQuery("");
    if (target === "ready") {
      if (workspace === "reservations" && onNavigateRooms) { onNavigateRooms(); return; }
      setTypeFilter("all"); setFloorFilter("all"); setStatusFilter("available"); setView("board");
      return;
    } else {
      if (workspace === "rooms" && onNavigateReservations) { onNavigateReservations(target as BoardTab); return; }
      setTab(target as BoardTab); setView(target as BoardTab); setClosedStatus("all");
    }
    setScope(target === "in_house" ? "history" : "window"); setFrom(today); setDays(7);
  }

  async function assign(reservation: RackReservation, room: RackRoom) {
    if (blockedIds.has(room.id)) {
      say("Room is maintenance-blocked — resolve the work order before assigning.", "warning");
      setConfirm(null);
      return;
    }
    const bars = barsForRoom(reservations, room.id, from, days, snapshot?.assignments);
    const check = assignableCell(room, reservation, bars);
    if (!check.ok) {
      say((check as { reason: string }).reason, "warning");
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
      setHistoryVersion(v => v + 1);
      onCheckIn(reservation.id);
    } catch (cause) {
      say(cause instanceof Error ? cause.message : "Unable to assign room.", "error");
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
      say(`Reclean dispatched for room ${room.number}.`, "success");
      await reload();
    } catch (cause) {
      say(cause instanceof Error ? cause.message : "Unable to dispatch housekeeping.", "error");
    } finally {
      setBusy(false);
    }
  }

  function roomActions(room: RackRoom): BoardAction[] {
    const board = states.get(room.id) ?? roomBoardState(room, reservations, today, blockedIds);
    const stay = board.stay ?? board.upcoming;
    const actions: BoardAction[] = [];
    // Card click opens room details directly — no "View room details" row.
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
      actions.push({ label: "Assignment is Front Desk only", hint: "This view is read-only for your role",         onSelect: () => { setActiveRoom(null); say("Room assignment and check-in are Front Desk operations — this view is read-only for your role."); } });
    return actions;
  }

  // Card click opens room details directly with its operational actions
  // attached (rendered in the detail modal footer). Only the unwired
  // fallback (no onViewRoom) keeps the legacy action sheet.
  function openRoom(room: RackRoom) {
    if (onViewRoom) {
      onViewRoom(asRecord({ id: room.id, number: room.number, type: room.type, floor: room.floor, status: room.status, housekeeping: room.housekeeping }), roomActions(room));
      return;
    }
    setActiveRoom(room);
  }

  if (loading && !snapshot) return <div className="rack-skeleton" role="status" aria-label="Loading room rack"><HavenSkeleton radius={8} /><HavenSkeleton radius={8} /><HavenSkeleton radius={8} width="60%" /></div>;
  if (error && !snapshot) return <div className="rack-error" role="alert"><p>{error}</p><button type="button" onClick={() => void reload()}>Retry</button></div>;

  const activeBoard = activeRoom ? states.get(activeRoom.id) ?? roomBoardState(activeRoom, reservations, today, blockedIds) : null;

  return (
    <div className="reservation-workspace">
      <PageHeader variant="default" title={workspace === "rooms" ? "Room Management" : workspace === "reservations" ? "Reservations" : "Room Reservations"} subtitle={workspace === "rooms" ? "See assigned guests across upcoming nights and monitor current room condition." : "Prepare arrivals, manage in-house stays, and review departures."} actions={(onScan || onNewReservation || onManageRooms) && <>
            {workspace === "rooms" && onManageRooms && <button type="button" className="btn btn-soft" onClick={onManageRooms}>Manage rooms</button>}
            {onScan && (
              <button type="button" className="btn btn-soft" onClick={onScan}>
                <QrCode size={17} aria-hidden="true" /> Scan QR
              </button>
            )}
            {onNewReservation && (
              <button type="button" className="btn btn-accent" onClick={onNewReservation}>
                <Plus size={17} aria-hidden="true" /> New reservation
              </button>
            )}
          </>} />

      <ModuleSummaryCards
        ariaLabel="Front office summary"
        activeQueue={view === "board" ? statusFilter === "available" ? "ready" : undefined : tab}
        onSelect={selectQueue}
        cards={[
          { label: "Arrivals today", value: historyAvailable ? dailyRows.filter(r => inReservationQueue(r, "arrivals", today)).length : "—", hint: "Expected arrivals still to check in", tone: "today", icon: CalendarDays, queue: "arrivals" },
          { label: "Departures today", value: historyAvailable ? dailyRows.filter(r => inReservationQueue(r, "departures", today)).length : "—", hint: "In-house stays due to check out", tone: "today", icon: LogOut, queue: "departures" },
          { label: "In-house", value: historyAvailable ? dailyRows.filter(r => inReservationQueue(r, "in_house", today)).length : "—", hint: "Current checked-in stays", tone: "active", icon: BedDouble, queue: "in_house" },
          { label: "Rooms ready", value: readyRooms, hint: `${summary.dirty} awaiting turnover · selected window`, tone: "done", icon: DoorOpen, queue: "ready" },
        ]}
      />

    <section aria-label={workspace === "rooms" ? "Room management" : "Room reservations"} className="data-panel room-rack">
      {workspace === "combined" && <div className="board-viewtabs" role="group" aria-label="Room reservations views">
        <button type="button" className={view === "board" ? "active" : ""} aria-pressed={view === "board"} onClick={() => setView("board")}>Room Board</button>
        <button type="button" className={view !== "board" ? "active" : ""} aria-pressed={view !== "board"} onClick={() => { setView("all"); setTab("all"); }}>Reservation List</button>
      </div>}
      {view === "board" && <div className="board-viewtabs" role="group" aria-label="Room board format"><button type="button" className={boardFormat === "calendar" ? "active" : ""} aria-pressed={boardFormat === "calendar"} onClick={() => setBoardFormat("calendar")}>Calendar</button><button type="button" className={boardFormat === "cards" ? "active" : ""} aria-pressed={boardFormat === "cards"} onClick={() => setBoardFormat("cards")}>Cards</button></div>}
      {notice && !notify && <p role="status" className="rack-notice">{notice}</p>}
      {error && snapshot && <div role="alert" className="rack-notice">{error} Displayed room data may be out of date. <button type="button" className="btn btn-soft" onClick={() => void reload()}>Retry room board</button></div>}
      <div className={`board-layout${workspace === "rooms" ? " room-calendar-layout" : ""}`}>
        <div className="board-main">
          <HavenDataToolbar
            label={view === "board" ? "Room board search and filters" : "Reservation search and filters"}
            filtersLayout={view === "board" ? "compact" : "stacked"}
            search={<HavenSearchInput value={query} onValueChange={setQuery} label={view === "board" ? "Search room board" : "Search reservations"} placeholder="Search room number, guest name, or reservation #…" />}
            quickFilters={view !== "board" ? <HavenFilterBadges value={tab} onChange={value => { setTab(value as BoardTab); setView(value as BoardTab); setClosedStatus("all"); }} label="Reservation queue" options={reservationQueues.map(q => ({ ...q, count: historyAvailable ? listRows.filter(r => inReservationQueue(r, q.value, today)).length : undefined }))} /> : undefined}
            advancedFilters={<>
              {view === "board" ? <>
                <div className="haven-filter"><HavenSelect value={typeFilter} onChange={setTypeFilter} ariaLabel="Filter by room type" options={[{ value: "all", label: "All room types" }, ...types.map(t => ({ value: t, label: t }))]} /></div>
                <div className="haven-filter"><HavenSelect value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by room status" options={[{ value: "all", label: "All statuses" }, { value: "available", label: "Clean" }, { value: "occupied", label: "Occupied" }, { value: "dirty", label: "Dirty" }, { value: "reserved", label: "Reserved" }, { value: "out_of_service", label: "Out of service" }]} /></div>
                <div className="haven-filter"><HavenSelect value={floorFilter} onChange={setFloorFilter} ariaLabel="Filter by floor" options={[{ value: "all", label: "All floors" }, ...floors.map(f => ({ value: f, label: `Floor ${f}` }))]} /></div>
              </> : <>
                <div className="haven-filter"><HavenSelect value={scope} onChange={setScope} ariaLabel="Reservation date scope" options={[{ value: "window", label: "Selected window" }, { value: "history", label: "Full history · all dates" }]} /></div>
                {tab === "closed" && <div className="haven-filter"><HavenSelect value={closedStatus} onChange={setClosedStatus} ariaLabel="Closed reservation outcome" options={[{ value: "all", label: "All closed outcomes" }, { value: "checked_out", label: "Completed" }, { value: "cancelled", label: "Cancelled" }, { value: "no_show", label: "No-show" }]} /></div>}
              </>}
              {(view === "board" || scope === "window") && <div className="haven-filter"><BoardDateRange from={from} days={days} notify={message => say(message, "warning")} onRange={(nextFrom, nextDays) => { setFrom(nextFrom); setDays(nextDays); }} /></div>}
            </>}
            resultCount={view === "board" ? visibleRooms.length : undefined}
            resultNoun="rooms"
            onClearFilters={() => { setQuery(""); setTypeFilter("all"); setStatusFilter("all"); setFloorFilter("all"); setTab("all"); setClosedStatus("all"); if (view !== "board") setView("all"); setScope("window"); }}
            hasActiveFilters={view === "board" ? hasActiveFilters : Boolean(query.trim() || tab !== "all" || scope !== "window" || closedStatus !== "all")}
          />
          <p className="board-window-note" aria-live="polite">{view !== "board" && scope === "history" ? "Full reservation history · All dates" : `${fullDay(from)} – ${fullDay(addDays(from, days - 1))} · ${view === "board" ? "Room status is current; linked stays follow this window" : "Stays overlapping selected dates"}`}</p>
          {view === "board" ? boardFormat === "calendar" ? (snapshot?.from !== from || snapshot?.days !== days) ? <p role="status">{loading ? "Loading assignments for selected dates…" : "Room allocations unavailable for selected dates. Retry the room board."}</p> : <RoomCalendar rooms={visibleRooms} reservations={reservations} assignments={snapshot?.assignments} from={from} days={days} today={today} blockedRoomIds={blockedIds} onSelectRoom={openRoom} onOpenReservation={onOpenFolio} /> : <RoomBoard rooms={visibleRooms} reservations={reservations} today={today} blockedRoomIds={blockedIds} selectedRoomId={activeRoom?.id ?? null} onSelectRoom={openRoom} /> : historyError ? <div className="rack-error" role="alert"><p>{historyError}</p><button type="button" disabled={historyLoading} onClick={retryHistory}>Retry history</button></div> : historyLoading && !history ? <div className="rack-skeleton" role="status" aria-label="Loading reservation history"><HavenSkeleton /></div> : <BoardReservationTabs reservations={listRows} today={today} tab={tab} onOpenFolio={onOpenFolio} onCheckIn={onCheckIn} canOperate={canAssign} search={query} rooms={rooms} blockedRoomIds={blockedIds} closedStatus={closedStatus} />}
        </div>
        {workspace !== "rooms" && <RoomBoardOps reservations={dailyRows} rooms={rooms} blockedRoomIds={blockedIds} today={today} onOpenFolio={onOpenFolio} error={historyError} loading={historyLoading} onRetry={retryHistory} />}
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
        <Modal
          isOpen
          onClose={() => setArrivalPick(null)}
          title={`Assign arrival to room ${arrivalPick.number}?`}
          description={`Only ${arrivalPick.type} arrivals fit this room. Assignment re-validates on the server.`}
          size="md"
          portal
        >
          <div className="board-actions" role="listbox" aria-label="Compatible arrivals">
            {queue.filter((r) => r.room_type === arrivalPick.type).map((r) => (
              <button key={r.id} type="button" role="option" aria-selected="false" className="board-action" onClick={() => setConfirm({ reservation: r, room: arrivalPick })}>
                <span><b>{r.guest_name ?? r.confirmation_number ?? r.id}</b><small>{r.check_in.slice(0, 10)} → {r.check_out.slice(0, 10)}</small></span>
                <span aria-hidden="true">›</span>
              </button>
            ))}
            {queue.filter((r) => r.room_type === arrivalPick.type).length === 0 && <p>No compatible arrivals waiting.</p>}
          </div>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          isOpen
          onClose={() => setConfirm(null)}
          onConfirm={() => void assign(confirm.reservation, confirm.room)}
          title={`Assign room ${confirm.room.number}?`}
          message={`${confirm.reservation.guest_name} · ${confirm.reservation.room_type} · ${confirm.reservation.check_in.slice(0, 10)} → ${confirm.reservation.check_out.slice(0, 10)}`}
          confirmText="Assign & check in"
          loading={busy}
          portal
        />
      )}

      {dispatchRoom && (
        <Modal
          isOpen
          onClose={() => setDispatchRoom(null)}
          title={`Dispatch reclean for room ${dispatchRoom.number}?`}
          description="Creates an urgent housekeeping task. The turnover queue owns completion."
          size="sm"
          portal
          footer={
            <div className="modal-footer">
              <button type="button" className="btn btn-soft" onClick={() => setDispatchRoom(null)} disabled={busy}>
                Cancel
              </button>
              <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void dispatch(dispatchRoom)}>
                {busy ? "Dispatching..." : "Dispatch reclean"}
              </button>
            </div>
          }
        >
          <p className="modal-note">The turnover queue owns completion.</p>
        </Modal>
      )}
    </section>
    </div>
  );
}
