"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BedDouble, CalendarDays, ChevronDown, DoorOpen, List, Plus, QrCode, LogOut, Users, ClipboardCheck } from "lucide-react";
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
import RoomFocusPanel from "./room-focus-panel";
import {
  assignableCell,
  barsForRoom,
  roomBoardState,
  unassignedArrivals,
  type RackBoardState,
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
const fullDay = (iso: string) => `${iso.slice(5).replace("-", "/")}/${iso.slice(0, 4)}`;
const displayDay = (iso: string, options: Intl.DateTimeFormatOptions) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", { ...options, timeZone: "UTC" });
const isDailyQueue = (queue: BoardTab) => queue === "arrivals" || queue === "unassigned" || queue === "departures";

/**
 * Single stay-window control: the trigger shows the range, opening two native date inputs that apply immediately on
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
  const endLabel = displayDay(end, { month: "short", day: "numeric", year: "numeric" });
  const label = days === 1 ? endLabel : `${displayDay(from, { month: "short", day: "numeric", ...(from.slice(0, 4) !== end.slice(0, 4) ? { year: "numeric" } : {}) })} – ${endLabel}`;
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
        <ChevronDown size={14} aria-hidden="true" />
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
  refreshVersion = 0,
  workspace = "combined",
  onNavigateReservations,
  onNavigateRooms,
  onManageRooms,
  initialRoomStatus,
}: {
  refreshVersion?: number;
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
  const { from, days, setDays, setFrom, shift, goToday, snapshot, loading, error, reload } = useFrontOfficeRack();
  useEffect(() => {
    if (refreshVersion > 0) void reload(true);
  }, [refreshVersion, reload]);
  const [query, setQuery] = useState("");
  const [bookingQuery, setBookingQuery] = useState("");
  const [bookingRange, setBookingRange] = useState<{ from: string; days: number } | null>(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<string>(initialRoomStatus ?? "all");
  const [floorFilter, setFloorFilter] = useState("all");
  const [tab, setTab] = useState<BoardTab>(initialTab ?? "all");
  const entryView = workspace === "rooms" ? "board" : initialView ?? "board";
  const [view, setView] = useState<"board" | BoardTab>(entryView);
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
  }, [refreshVersion, historyVersion]);

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
  const currentStays = useMemo(() => history && !historyError
    ? history.filter(r => r.status === "checked_in" || reservationOverlapsWindow(r, today, addDays(today, 6)))
    : reservations, [history, historyError, reservations, today]);
  const states = useMemo(
    () => new Map(rooms.map((room) => [room.id, roomBoardState(room, currentStays, today, blockedIds)] as const)),
    [rooms, currentStays, today, blockedIds]
  );
  const roomCounts: Record<RackBoardState, number> = { available: 0, occupied: 0, dirty: 0, reserved: 0, out_of_service: 0 };
  for (const { state } of states.values()) roomCounts[state]++;

  const visibleRooms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rooms.filter((room) => {
      if (typeFilter !== "all" && room.type !== typeFilter) return false;
      if (floorFilter !== "all" && String(room.floor ?? "—") !== floorFilter) return false;
      if (statusFilter !== "all" && states.get(room.id)?.state !== statusFilter) return false;
      if (!needle) return true;
      if (`${room.number} ${room.type} ${room.floor ?? ""}`.toLowerCase().includes(needle)) return true;
      return (workspace === "rooms" ? currentStays : reservations).some(
        (r) =>
          (r.room_id === room.id || snapshot?.assignments?.some(a => a.reservation_id === r.id && a.room_id === room.id && a.status !== "cancelled")) &&
          `${r.guest_name ?? ""} ${r.confirmation_number ?? ""} ${r.id}`.toLowerCase().includes(needle)
      );
    });
  }, [rooms, reservations, currentStays, workspace, query, typeFilter, floorFilter, statusFilter, states, snapshot?.assignments]);

  const hasActiveFilters = query.trim() !== "" || typeFilter !== "all" || statusFilter !== "all" || floorFilter !== "all";
  const historyAvailable = history !== null && !historyError;
  const calendarView = workspace === "reservations" && view === "board";
  const bookingListView = workspace === "reservations" && view !== "board";
  const listFrom = bookingRange?.from ?? from;
  const listDays = bookingRange?.days ?? days;
  const search = bookingListView ? bookingQuery : query;
  const hasRightPanel = workspace !== "reservations" || calendarView;
  const dailyRows = historyAvailable ? history : [];
  const countQueue = (queue: BoardTab) => historyAvailable ? dailyRows.filter(r => inReservationQueue(r, queue, today)).length : "—";
  const dailyQueue = isDailyQueue(tab);
  const scopedRows = useMemo(() => {
    if (!history || historyError) return [];
    if (scope === "history") return history;
    const end = addDays(listFrom, listDays - 1);
    return history.filter(r => reservationOverlapsWindow(r, listFrom, end));
  }, [history, historyError, scope, listFrom, listDays]);
  const listRows = dailyQueue ? dailyRows : scopedRows;
  function filterRooms(status: string) {
    setQuery("");
    setTypeFilter("all");
    setFloorFilter("all");
    setStatusFilter(status);
  }
  function selectQueue(target: string) {
    if (workspace === "rooms") {
      filterRooms(target === "ready" ? "available" : target === "cleaning" ? "dirty" : target);
      return;
    }
    if (target === "ready") {
      if (workspace === "reservations" && onNavigateRooms) { onNavigateRooms(); return; }
      setQuery("");
      setTypeFilter("all"); setFloorFilter("all"); setStatusFilter("available"); setView("board");
      return;
    }
    setTab(target as BoardTab); setView(target as BoardTab); setClosedStatus("all");
    setScope(target === "in_house" ? "history" : "window");
    if (bookingListView) setBookingQuery("");
    else { setQuery(""); setFrom(today); setDays(7); }
  }

  function openBookingList() {
    setBookingQuery("");
    setBookingRange(null);
    setTab("all");
    setView("all");
    setScope("history");
    setClosedStatus("all");
  }

  function clearFilters() {
    if (bookingListView) {
      setBookingQuery("");
      setBookingRange(null);
    } else {
      setQuery("");
      setTypeFilter("all");
      setStatusFilter("all");
      setFloorFilter("all");
    }
    setTab("all");
    setClosedStatus("all");
    if (view !== "board") setView("all");
    setScope(bookingListView ? "history" : "window");
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
    const board = states.get(room.id) ?? roomBoardState(room, currentStays, today, blockedIds);
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

  if (workspace !== "reservations" && loading && !snapshot) return <div className="rack-skeleton" role="status" aria-label="Loading room rack"><HavenSkeleton radius={8} /><HavenSkeleton radius={8} /><HavenSkeleton radius={8} width="60%" /></div>;
  if (workspace !== "reservations" && error && !snapshot) return <div className="rack-error" role="alert"><p>{error}</p><button type="button" onClick={() => void reload()}>Retry</button></div>;

  const activeBoard = activeRoom ? states.get(activeRoom.id) ?? roomBoardState(activeRoom, currentStays, today, blockedIds) : null;

  const pageHeader = (
    <PageHeader variant="default" title={workspace === "rooms" ? "Room Management" : calendarView ? "Bookings" : bookingListView ? "Booking List" : "Room Bookings"}
      subtitle={workspace === "rooms" ? "Monitor room status, occupancy, and housekeeping at a glance."
        : bookingListView ? "Search current and past bookings, review reservation details, and manage arrivals."
          : "Manage reservations, view room occupancy, and track guest stays."}
      actions={(onScan || onNewReservation || onManageRooms || workspace === "reservations") && <>
            {workspace === "rooms" && onManageRooms && <button type="button" className="btn btn-soft" onClick={onManageRooms}>Manage rooms</button>}
            {onScan && workspace !== "reservations" && (
              <button type="button" className="btn btn-soft" onClick={onScan}>
                <QrCode size={17} aria-hidden="true" /> Scan QR
              </button>
            )}
            {workspace === "reservations" && <button type="button" className="btn btn-soft" onClick={calendarView ? openBookingList : () => setView("board")}>
              {calendarView ? <><List size={16} aria-hidden="true" /> Booking list</> : <><ArrowLeft size={16} aria-hidden="true" /> Back to calendar</>}
            </button>}
            {onNewReservation && (
              <button type="button" className="btn btn-accent" onClick={onNewReservation}>
                <Plus size={17} aria-hidden="true" /> New booking
              </button>
            )}
          </>} />
  );

  const summaryCards = (
    <ModuleSummaryCards
        ariaLabel="Front office summary"
        activeQueue={workspace === "rooms" ? ({ available: "ready", occupied: "occupied", dirty: "cleaning" } as Record<string, string>)[statusFilter] : view === "board" ? statusFilter === "available" ? "ready" : undefined : tab}
        onSelect={selectQueue}
        cards={workspace === "rooms"
          ? [
              { label: "Total rooms", value: rooms.length, hint: "All physical rooms on record", tone: "active", icon: BedDouble },
              { label: "Occupied", value: roomCounts.occupied, hint: "Rooms with guests in house", tone: "today", icon: Users, queue: "occupied" },
              { label: "Ready", value: roomCounts.available, hint: "Clean and available to assign", tone: "done", icon: DoorOpen, queue: "ready" },
              { label: "Cleaning", value: roomCounts.dirty, hint: "Awaiting housekeeping turnover", tone: "attention", icon: ClipboardCheck, queue: "cleaning" },
            ]
          : [
              { label: "Arrivals today", value: countQueue("arrivals"), hint: "Expected arrivals still to check in", tone: "today", icon: CalendarDays, queue: "arrivals" },
              { label: "Departures today", value: countQueue("departures"), hint: "In-house stays due to check out", tone: "today", icon: LogOut, queue: "departures" },
              { label: "In-house", value: countQueue("in_house"), hint: "Current checked-in stays", tone: "active", icon: BedDouble, queue: "in_house" },
              { label: "Rooms ready", value: snapshot ? roomCounts.available : "—", hint: snapshot ? `${roomCounts.dirty} awaiting turnover` : "Room status unavailable", tone: "done", icon: DoorOpen, queue: "ready" },
            ]}
      />
  );
  const rangeControl = <BoardDateRange from={from} days={days} notify={message => say(message, "warning")} onRange={(nextFrom, nextDays) => { setFrom(nextFrom); setDays(nextDays); }} />;

  return (
    <div className={`reservation-workspace${workspace === "rooms" || calendarView ? " has-fixed-rail" : ""}`} data-workspace={workspace}>
      {workspace !== "rooms" && pageHeader}
      {workspace !== "rooms" && !calendarView && summaryCards}

    <section aria-label={workspace === "rooms" ? "Room management" : "Room reservations"} className="data-panel room-rack">
      {workspace === "combined" && <div className="board-viewtabs" role="group" aria-label="Room bookings views">
        <button type="button" className={view === "board" ? "active" : ""} aria-pressed={view === "board"} onClick={() => setView("board")}>Board</button>
        <button type="button" className={view !== "board" ? "active" : ""} aria-pressed={view !== "board"} onClick={() => { setView("all"); setTab("all"); }}>Booking List</button>
      </div>}
      {notice && !notify && <p role="status" className="rack-notice">{notice}</p>}
      {error && snapshot && <div role="alert" className="rack-notice">{error} Displayed room data may be out of date. <button type="button" className="btn btn-soft" onClick={() => void reload()}>Retry room board</button></div>}
      <div className={`board-layout${hasRightPanel ? " board-layout-twocol" : " board-layout-single"}`}>
        <div className={calendarView ? "board-main board-calendar-main" : "board-main"}
          role={workspace === "rooms" ? "region" : undefined} aria-label={workspace === "rooms" ? "Room cards and filters" : undefined}
          tabIndex={workspace === "rooms" ? 0 : undefined}>
          {workspace === "rooms" && <>{pageHeader}{summaryCards}</>}
          {calendarView && <div className="board-date-nav" role="group" aria-label="Calendar date navigation">
            <button type="button" className="board-nav-btn" onClick={() => shift(-days)} aria-label="Previous dates"><span aria-hidden="true">←</span> Previous</button>
            <button type="button" className="board-nav-btn board-nav-btn-today" aria-pressed={from === today} onClick={goToday}>Today</button>
            <button type="button" className="board-nav-btn" onClick={() => shift(days)} aria-label="Next dates">Next <span aria-hidden="true">→</span></button>
            {rangeControl}
          </div>}
          <HavenDataToolbar
            label={view === "board" ? "Room search and filters" : "Booking search and filters"}
            filtersLayout={view === "board" ? "compact" : "stacked"}
            search={<HavenSearchInput key={bookingListView ? "booking-list" : "rack"} value={search} onValueChange={bookingListView ? setBookingQuery : setQuery} label={view === "board" ? "Search rooms" : "Search bookings"} placeholder="Search room number, guest name, or booking #…" />}
            quickFilters={view !== "board" ? <HavenFilterBadges value={tab} onChange={value => { setTab(value as BoardTab); setView(value as BoardTab); setClosedStatus("all"); }} label="Booking queue" options={reservationQueues.map(q => ({ ...q, count: historyAvailable ? (isDailyQueue(q.value) ? dailyRows : scopedRows).filter(r => inReservationQueue(r, q.value, today)).length : undefined }))} /> : undefined}
            advancedFilters={<>
              {view === "board" ? <>
                <div className="haven-filter"><HavenSelect value={typeFilter} onChange={setTypeFilter} ariaLabel="Filter by room type" options={[{ value: "all", label: "All room types" }, ...types.map(t => ({ value: t, label: t }))]} /></div>
                <div className="haven-filter"><HavenSelect value={statusFilter} onChange={setStatusFilter} ariaLabel="Filter by room status" options={[{ value: "all", label: "All statuses" }, { value: "available", label: "Available / Clean" }, { value: "occupied", label: "Occupied" }, { value: "dirty", label: "Dirty" }, { value: "reserved", label: "Reserved" }, { value: "out_of_service", label: "Out of service" }]} /></div>
                <div className="haven-filter"><HavenSelect value={floorFilter} onChange={setFloorFilter} ariaLabel="Filter by floor" options={[{ value: "all", label: "All floors" }, ...floors.map(f => ({ value: f, label: `Floor ${f}` }))]} /></div>
              </> : <>
                {!dailyQueue && <div className="haven-filter"><HavenSelect value={scope} onChange={setScope} ariaLabel="Booking date scope" options={[{ value: "window", label: "Selected window" }, { value: "history", label: "Full history · all dates" }]} /></div>}
                {tab === "closed" && <div className="haven-filter"><HavenSelect value={closedStatus} onChange={setClosedStatus} ariaLabel="Closed booking outcome" options={[{ value: "all", label: "All closed outcomes" }, { value: "checked_out", label: "Completed" }, { value: "cancelled", label: "Cancelled" }, { value: "no_show", label: "No-show" }]} /></div>}
              </>}
              {bookingListView && scope === "window" && !dailyQueue && <div className="haven-filter"><BoardDateRange
                from={listFrom} days={listDays} notify={message => say(message, "warning")}
                onRange={(nextFrom, nextDays) => setBookingRange({ from: nextFrom, days: nextDays })} /></div>}
            </>}
            onClearFilters={clearFilters}
            hasActiveFilters={view === "board" ? hasActiveFilters : Boolean(search.trim() || tab !== "all" || scope !== (bookingListView ? "history" : "window") || closedStatus !== "all")}
          />
          {view !== "board" && <p className="board-window-note" aria-live="polite">{dailyQueue ? `Hotel day · ${fullDay(today)}` : scope === "history" ? "Full booking history · All dates" : `${fullDay(listFrom)} – ${fullDay(addDays(listFrom, listDays - 1))} · Stays overlapping selected dates`}</p>}
          {calendarView ? snapshot?.from === from && snapshot.days === days ? (
            <RoomCalendar rooms={visibleRooms} reservations={reservations} currentStays={currentStays} assignments={snapshot.assignments} from={from} days={days} today={today} blockedRoomIds={blockedIds} onSelectRoom={openRoom} onOpenReservation={onOpenFolio} />
          ) : loading ? <div className="rack-skeleton" role="status" aria-label="Loading calendar assignments"><HavenSkeleton /></div>
            : <div className="rack-error" role="alert"><p>{error || "Booking allocations are unavailable for the selected dates."}</p><button type="button" onClick={() => void reload()}>Retry calendar</button></div>
            : view === "board" ? <RoomBoard rooms={visibleRooms} reservations={currentStays} today={today} blockedRoomIds={blockedIds} selectedRoomId={activeRoom?.id ?? null} onSelectRoom={openRoom} />
            : historyError ? <div className="rack-error" role="alert"><p>{historyError}</p><button type="button" disabled={historyLoading} onClick={retryHistory}>Retry history</button></div>
            : historyLoading && !history ? <div className="rack-skeleton" role="status" aria-label="Loading booking history"><HavenSkeleton /></div>
            : <BoardReservationTabs reservations={listRows} today={today} tab={tab} onOpenFolio={onOpenFolio} onCheckIn={onCheckIn} canOperate={canAssign} search={search} rooms={rooms} blockedRoomIds={blockedIds} closedStatus={closedStatus} />}
          {view === "board" && snapshot && (
            <div className="haven-toolbar-footer">
              <span className="haven-result-count" aria-live="polite">
                Showing {visibleRooms.length} rooms
              </span>
            </div>
          )}
        </div>
        {hasRightPanel && (
          <div className="board-right">
            {workspace === "rooms" ? <RoomFocusPanel counts={roomCounts} arrivals={countQueue("arrivals")} unassigned={countQueue("unassigned")}
              selected={statusFilter} roomDataReady={Boolean(snapshot)} onRoomFilter={state => filterRooms(statusFilter === state ? "all" : state)} onBookingQueue={canAssign ? onNavigateReservations : undefined} />
              : <RoomBoardOps reservations={dailyRows} rooms={rooms} blockedRoomIds={blockedIds} today={today} through={addDays(from, days - 1)} onOpenFolio={onOpenFolio} error={historyError} loading={historyLoading && !history} onRetry={retryHistory} onOpenReadyRooms={onNavigateRooms} readyRooms={snapshot ? roomCounts.available : undefined} />}
          </div>
        )}
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
