"use client";

import { AlertTriangle, CalendarDays, ChevronRight, Clock3, CreditCard, ScanFace, UserRound } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { HavenEmptyState } from "@/components/ui";
import { reservationPreview } from "@/lib/reservation-workspace";
import type { RackReservation, RackRoom } from "@/lib/room-rack";

const ATTENTION = {
  overdue: { label: "Overdue checkout", status: "critical", icon: Clock3, priority: 0 },
  arrival: { label: "Arrival unresolved", status: "pending", icon: CalendarDays, priority: 1 },
  balance: { label: "Balance due", status: "pending", icon: CreditCard, priority: 1 },
  payment: { label: "Payment review", status: "info", icon: CreditCard, priority: 2 },
  identity: { label: "Identity review", status: "reserved", icon: ScanFace, priority: 3 },
};

export default function RoomBoardOps({ reservations, rooms, blockedRoomIds, today, through, onOpenFolio, error, loading, onRetry, onOpenReadyRooms, readyRooms }: {
  reservations: RackReservation[]; rooms: RackRoom[]; blockedRoomIds: Set<string>; today: string; through: string;
  onOpenFolio: (id: string) => void; error: string; loading: boolean; onRetry: () => void;
  onOpenReadyRooms?: () => void; readyRooms?: number;
}) {
  const attention = reservations.flatMap(r => {
    const issues = reservationPreview(r, rooms, blockedRoomIds, today);
    if (!issues.length) return [];
    const inHouse = r.status === "checked_in";
    const date = (inHouse ? r.check_out : r.check_in).slice(0, 10);
    if (!date) return [];
    if (inHouse && date <= today) return [{ r, date, issues, kind: date < today ? ATTENTION.overdue : ATTENTION.balance }];
    if (inHouse || (date > today && date > through)) return [];
    if (date <= today) return [{ r, date, issues, kind: ATTENTION.arrival }];
    const reviews = issues.filter(issue => issue === "Payment review required" || issue === "Identity review required");
    return reviews.length ? [{ r, date, issues: reviews, kind: reviews.includes("Payment review required") ? ATTENTION.payment : ATTENTION.identity }] : [];
  }).sort((a, b) => a.kind.priority - b.kind.priority || a.date.localeCompare(b.date));
  return <aside className="board-ops" aria-label="Needs attention">
    <section className="data-panel ops-panel">
      <h2><AlertTriangle size={21} aria-hidden="true" /> Needs attention {!error && !loading && <span className="ops-count">{attention.length}</span>}</h2>
      <p className="ops-attention-note">Arrivals, departures and reviews that need a follow-up.</p>
      <div className="board-rail-content" role="region" aria-label="Bookings needing attention" tabIndex={0}>
      {error ? <div role="alert"><p>{error}</p><button type="button" className="btn btn-soft" onClick={onRetry} disabled={loading}>Retry bookings</button></div> : loading ? <p role="status">Updating bookings…</p> : !attention.length ? <HavenEmptyState icon={<CalendarDays size={20} aria-hidden="true" />} title="No flagged stays" body="Final readiness remains available inside each booking." /> : (
        <ul className="ops-attention-list">{attention.map(({ r, date, issues, kind }) => {
          const name = r.guest_name ?? r.confirmation_number ?? r.id;
          const Icon = kind.icon;
          const remaining = issues.filter(issue => issue !== kind.label);
          return <li key={r.id} className="ops-attention-item">
            <div className="ops-attention-top"><StatusBadge status={kind.status} label={kind.label} size="sm" icon={<Icon size={14} aria-hidden="true" />} className={kind === ATTENTION.identity ? "ops-identity-badge" : undefined} /><time dateTime={date}>{date === today ? "Today" : new Date(`${date}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", timeZone: "UTC" })}</time></div>
            <div className="ops-attention-person"><UserRound size={17} aria-hidden="true" /><div><b>{name}</b><small>{r.confirmation_number ?? r.id}{r.room_number ? ` · Room ${r.room_number}` : ""}</small></div><button type="button" className="btn btn-accent" aria-label={`Review booking for ${name}`} onClick={() => onOpenFolio(r.id)}>Review</button></div>
            {remaining.length > 0 && <p className="ops-attention-issues">{remaining.join(" · ")}</p>}
          </li>;
        })}</ul>
      )}
      </div>
      {onOpenReadyRooms && <button className="ops-ready-link" type="button" onClick={onOpenReadyRooms}>Rooms ready <b>{readyRooms ?? "—"}</b><ChevronRight size={15} aria-hidden="true" /></button>}
    </section>
  </aside>;
}
