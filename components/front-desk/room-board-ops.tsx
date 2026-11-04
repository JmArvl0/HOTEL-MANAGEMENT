"use client";

import { ClipboardCheck } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { HavenEmptyState } from "@/components/ui";
import { reservationPreview } from "@/lib/reservation-workspace";
import type { RackReservation, RackRoom } from "@/lib/room-rack";

export default function RoomBoardOps({ reservations, rooms, blockedRoomIds, today, onOpenFolio, error, loading, onRetry }: {
  reservations: RackReservation[]; rooms: RackRoom[]; blockedRoomIds: Set<string>; today: string;
  onOpenFolio: (id: string) => void; error: string; loading: boolean; onRetry: () => void;
}) {
  const attention = reservations.map(r => ({ r, issues: reservationPreview(r, rooms, blockedRoomIds, today) }))
    .filter(({ r, issues }) => issues.length && ((["pending", "confirmed"].includes(r.status) && r.check_in.slice(0, 10) <= today) || (r.status === "checked_in" && r.check_out.slice(0, 10) <= today)))
    .sort((a, b) => a.r.check_in.localeCompare(b.r.check_in));
  return <aside className="board-ops" aria-label="Needs attention">
    <section className="data-panel ops-panel">
      <h2><ClipboardCheck size={16} aria-hidden="true" /> Needs attention</h2>
      <p className="ops-attention-note">Today and overdue stays · {today}</p>
      {error ? <div role="alert"><p>{error}</p><button type="button" className="btn btn-soft" onClick={onRetry} disabled={loading}>Retry reservations</button></div> : loading ? <p role="status">Updating reservations…</p> : !attention.length ? <HavenEmptyState icon={<ClipboardCheck size={20} aria-hidden="true" />} title="No flagged stays" body="Final readiness remains available inside each reservation." /> : <>
        <ul>{attention.slice(0, 5).map(({ r, issues }) => <li key={r.id} className="ops-attention-item"><StatusBadge status="pending" label={issues[0]} size="sm" /><b>{r.guest_name ?? r.confirmation_number ?? r.id}</b><small>{r.confirmation_number ?? r.id}{r.room_number ? ` · Room ${r.room_number}` : ""}</small>{issues.length > 1 && <small>{issues.slice(1).join(" · ")}</small>}<button type="button" onClick={() => onOpenFolio(r.id)}>{r.status === "checked_in" ? "Review departure" : "Review arrival"}</button></li>)}</ul>
        {attention.length > 5 && <p className="ops-attention-note">Showing 5 of {attention.length} flagged stays. Review the reservation list for more.</p>}
      </>}
    </section>
  </aside>;
}
