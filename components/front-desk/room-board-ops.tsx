"use client";

import { ArrowUpRight } from "lucide-react";
import { reservationPreview } from "@/lib/reservation-workspace";
import type { RackReservation, RackRoom } from "@/lib/room-rack";

export default function RoomBoardOps({ reservations, rooms, blockedRoomIds, today, onOpenFolio, onCheckIn, error, loading, onRetry }: {
  reservations: RackReservation[]; rooms: RackRoom[]; blockedRoomIds: Set<string>; today: string;
  onOpenFolio: (id: string) => void; onCheckIn?: (id: string) => void; error: string; loading: boolean; onRetry: () => void;
}) {
  const attention = reservations.map(r => ({ r, issues: reservationPreview(r, rooms, blockedRoomIds, today) }))
    .filter(({ r, issues }) => issues.length && ((["pending", "confirmed"].includes(r.status) && r.check_in.slice(0, 10) <= today) || (r.status === "checked_in" && r.check_out.slice(0, 10) <= today)))
    .sort((a, b) => a.r.check_in.localeCompare(b.r.check_in));
  return <aside className="board-ops" aria-label="Needs attention">
    <section className="data-panel ops-panel">
      <h2>Needs attention {!error && !loading && attention.length > 0 && <span className="ops-attention-count">{attention.length}</span>}</h2>
      <p className="ops-attention-note">Today and overdue stays</p>
      {error ? <div role="alert"><p>{error}</p><button type="button" className="btn btn-soft" onClick={onRetry} disabled={loading}>Retry bookings</button></div> : loading ? <p role="status">Updating bookings…</p> : !attention.length ? <p className="ops-attention-note">No flagged stays</p> : <>
        <ul>{attention.slice(0, 5).map(({ r, issues }) => <li key={r.id} className="ops-attention-item">
          <button type="button" onClick={() => r.status === "confirmed" && onCheckIn ? onCheckIn(r.id) : onOpenFolio(r.id)}>
            <span><b>{r.guest_name ?? r.confirmation_number ?? r.id}</b><small>{issues[0]}</small></span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </button>
        </li>)}</ul>
        {attention.length > 5 && <p className="ops-attention-note">Showing 5 of {attention.length} flagged stays. Review the booking list for more.</p>}
      </>}
    </section>
  </aside>;
}
