"use client";

import { useMemo, useState } from "react";
import { BedDouble, CalendarDays, DoorOpen, Sparkles, SprayCan } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ModuleSummaryCards } from "@/components/manager/module-summary-cards";
import { useFrontOfficeRack } from "@/hooks/use-front-office-rack";
import {
  assignableCell,
  barsForRoom,
  rackSummary,
  unassignedArrivals,
  windowDays,
  type RackReservation,
  type RackRoom,
} from "@/lib/room-rack";

const STATUS_CLASS: Record<string, string> = {
  confirmed: "rack-bar-confirmed",
  checked_in: "rack-bar-inhouse",
};

/**
 * Fused Room Rack & Reservations: unassigned arrivals queue + Gantt tape
 * chart over live room inventory. Click-to-assign is primary (keyboard
 * operable); HTML5 drag-and-drop calls the same handler. Every mutation
 * goes through the existing assign / check-in / task routes — the panel
 * decides nothing the server does not re-validate.
 */
export default function FrontOfficeRack({
  role,
  onOpenFolio,
  onCheckIn,
}: {
  role: string;
  onOpenFolio: (reservationId: string) => void;
  onCheckIn: (reservationId: string) => void;
}) {
  const { from, days, setDays, shift, goToday, snapshot, loading, error, reload } = useFrontOfficeRack();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ reservation: RackReservation; room: RackRoom } | null>(null);
  const [dispatchRoom, setDispatchRoom] = useState<RackRoom | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const daysList = useMemo(() => windowDays(from, days), [from, days]);
  const rooms = snapshot?.rooms ?? [];
  const reservations = snapshot?.reservations ?? [];
  const queue = useMemo(() => {
    const q = unassignedArrivals(reservations);
    const needle = query.trim().toLowerCase();
    if (!needle) return q;
    return q.filter((r) =>
      `${r.guest_name ?? ""} ${r.confirmation_number ?? ""} ${r.room_type}`.toLowerCase().includes(needle)
    );
  }, [reservations, query]);
  const selected = reservations.find((r) => r.id === selectedId) ?? null;
  const today = useMemo(
    () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date()),
    []
  );
  const summary = useMemo(() => rackSummary(rooms, reservations, today), [rooms, reservations, today]);
  // Counter authority is Front Desk alone (route + RPC gates): manager and
  // owner use the rack for oversight, folio review, and reclean dispatch.
  const canAssign = role === "front_desk";
  const canDispatch = role === "front_desk" || role === "manager";

  async function assign(reservation: RackReservation, room: RackRoom) {
    const bars = barsForRoom(reservations, room.id, from, days);
    const check = assignableCell(room, reservation, bars);
    if (!check.ok) {
      const reason = (check as { reason: string }).reason;
      setNotice(reason);
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
      setSelectedId(null);
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
      setNotice(`Reclean dispatched for room ${room.number}.`);
      await reload();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Unable to dispatch housekeeping.");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !snapshot) return <div className="rack-skeleton" aria-label="Loading room rack"><span className="pulse-bar" /><span className="pulse-bar" /><span className="pulse-bar short" /></div>;
  if (error && !snapshot) return <div className="rack-error" role="alert"><p>{error}</p><button type="button" onClick={() => void reload()}>Retry</button></div>;

  return (
    <section aria-label="Room rack and reservations" className="room-rack">
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

      <div className="rack-toolbar">
        <button type="button" onClick={() => shift(-days)} aria-label="Previous period">‹</button>
        <button type="button" onClick={goToday}>Today</button>
        <span aria-live="polite">{from}</span>
        <button type="button" onClick={() => shift(days)} aria-label="Next period">›</button>
        <div role="group" aria-label="Window length">
          <button type="button" aria-pressed={days === 7} onClick={() => setDays(7)}>7-day</button>
          <button type="button" aria-pressed={days === 14} onClick={() => setDays(14)}>14-day</button>
        </div>
      </div>

      {notice && <p role="status" className="rack-notice">{notice}</p>}

      <div className="rack-body">
        <aside aria-label="Unassigned arrivals" className="rack-queue">
          <h2>Unassigned arrivals ({queue.length})</h2>
          <input
            type="search"
            aria-label="Search unassigned arrivals"
            placeholder="Guest, reference, room type"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {queue.length === 0 && <p>No unassigned confirmed arrivals in this window.</p>}
          <ul>
            {queue.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  draggable={canAssign}
                  onDragStart={(e) => e.dataTransfer.setData("text/rack-reservation", r.id)}
                  onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}
                  aria-pressed={selectedId === r.id}
                  className={selectedId === r.id ? "rack-card selected" : "rack-card"}
                >
                  <strong>{r.guest_name ?? r.confirmation_number ?? r.id}</strong>
                  <span>{r.room_type} · {r.check_in.slice(0, 10)} → {r.check_out.slice(0, 10)}</span>
                  <span>{r.payment_status ?? "unpaid"}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="rack-chart" role="grid" aria-label="Room tape chart">
          <div className="rack-row rack-head" role="row">
            <span role="columnheader">Room</span>
            {daysList.map((d) => (
              <span key={d} role="columnheader">{d.slice(5)}</span>
            ))}
          </div>
          {rooms.map((room) => {
            const bars = barsForRoom(reservations, room.id, from, days);
            const dirty = room.housekeeping === "dirty" || room.status === "dirty";
            const outOfService = room.status === "maintenance" || room.housekeeping === "reclean_required";
            return (
              <div key={room.id} className="rack-row" role="row">
                <span role="rowheader">
                  {room.number}
                  <em>{room.housekeeping}</em>
                </span>
                <div
                  className="rack-cells"
                  style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}
                  onDragOver={canAssign && selected ? (e) => e.preventDefault() : undefined}
                  onDrop={
                    canAssign && selected
                      ? (e) => {
                          e.preventDefault();
                          const id = e.dataTransfer.getData("text/rack-reservation");
                          const res = reservations.find((r) => r.id === (id || selected.id));
                          if (res) setConfirm({ reservation: res, room });
                        }
                      : undefined
                  }
                  onClick={() => {
                    if (!selected) return;
                    if (!canAssign) {
                      setNotice("Room assignment and check-in are Front Desk operations — this view is read-only for your role.");
                      return;
                    }
                    if (dirty && canDispatch) {
                      setDispatchRoom(room);
                      return;
                    }
                    setConfirm({ reservation: selected, room });
                  }}
                >
                  {bars.map((bar) => (
                    <button
                      key={bar.reservation.id}
                      type="button"
                      role="gridcell"
                      className={STATUS_CLASS[bar.reservation.status] ?? "rack-bar-confirmed"}
                      style={{ gridColumn: `${bar.start + 1} / span ${bar.span}` }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenFolio(bar.reservation.id);
                      }}
                      aria-label={`${bar.reservation.guest_name ?? "Stay"} in room ${room.number}`}
                    >
                      {bar.reservation.guest_name ?? bar.reservation.confirmation_number ?? "Stay"}
                    </button>
                  ))}
                  {outOfService && (
                    <span className="rack-oos" style={{ gridColumn: "1 / -1" }}>
                      Out of service
                    </span>
                  )}
                  {dirty && !outOfService && (
                    <button
                      type="button"
                      className="rack-dirty-cell"
                      style={{ gridColumn: "1 / -1" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (canDispatch) setDispatchRoom(room);
                        else setNotice(`Room ${room.number} is dirty — Housekeeping owns the turnover queue.`);
                      }}
                      aria-label={`Room ${room.number} dirty — dispatch housekeeping`}
                    >
                      Dirty — request reclean
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rack-legend" aria-label="Status legend">
        <span className="rack-bar-confirmed">Confirmed</span>
        <span className="rack-bar-inhouse">Checked-in</span>
        <span className="rack-dirty-cell">Dirty</span>
        <span className="rack-oos">Out of service</span>
      </div>

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
  );
}
