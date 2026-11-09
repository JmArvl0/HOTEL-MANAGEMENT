"use client";

import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import { TablePagination, useTablePagination } from "@/components/ui/table-pagination";
import { HavenEmptyState } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatPeso } from "@/lib/format";
import { inReservationQueue, reservationNextAction, reservationPreview, type ReservationQueue } from "@/lib/reservation-workspace";
import type { RackReservation, RackRoom } from "@/lib/room-rack";

export type BoardTab = ReservationQueue;
const date = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default function BoardReservationTabs({ reservations, today, tab, onOpenFolio, onCheckIn, canOperate, search, rooms, blockedRoomIds, closedStatus }: {
  reservations: RackReservation[]; today: string; tab: BoardTab;
  onOpenFolio: (id: string) => void; onCheckIn: (id: string) => void;
  canOperate: boolean; search: string; rooms: RackRoom[]; blockedRoomIds: Set<string>; closedStatus: string;
}) {
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return reservations.filter(r => inReservationQueue(r, tab, today)
      && (tab !== "closed" || closedStatus === "all" || r.status === closedStatus)
      && `${r.guest_name ?? ""} ${r.confirmation_number ?? ""} ${r.room_number ?? ""} ${r.id}`.toLowerCase().includes(needle));
  }, [reservations, tab, today, closedStatus, search]);
  const page = useTablePagination(visible);
  return <section className="data-panel board-tabs" aria-label="Bookings">
    {!visible.length ? <HavenEmptyState icon={<CalendarDays size={22} aria-hidden="true" />} title="No bookings match" body="Try clearing the search, choosing another queue, or changing the date scope." /> : <div className="table-scroll">
      <table aria-label="Booking list"><thead><tr><th>Guest / reference</th><th>Room / stay</th><th>Payment</th><th>Status / readiness</th><th>Next action</th></tr></thead>
        <tbody>{page.rows.map(r => {
          const issues = reservationPreview(r, rooms, blockedRoomIds, today);
          const action = reservationNextAction(r, canOperate, today);
          const checkIn = action === "Assign room" || action === "Start check-in";
          const nights = Math.max(0, Math.round((Date.parse(r.check_out.slice(0, 10)) - Date.parse(r.check_in.slice(0, 10))) / 86400000));
          return <tr key={r.id}>
            <td><div className="cell-stack"><b>{r.guest_name ?? "Guest"}</b><small>{r.confirmation_number ?? r.id}</small></div></td>
            <td><div className="cell-stack"><b>{r.room_number ? `Room ${r.room_number}` : "Not assigned"}</b><small>{r.room_type}</small><span>{date(r.check_in)} → {date(r.check_out)}</span><small>{nights} {nights === 1 ? "night" : "nights"}</small></div></td>
            <td><div className="cell-stack">{r.payment_status ? <StatusBadge status={r.payment_status} size="sm" /> : <span>Payment not recorded</span>}<small>{r.folio_balance == null ? "Folio balance unavailable" : Number(r.folio_balance) > 0 ? `${formatPeso(r.folio_balance)} due` : "No outstanding folio balance"}</small></div></td>
            <td><div className="cell-stack"><StatusBadge status={r.status} size="sm" /><small>{issues[0] ?? (["pending", "confirmed", "checked_in"].includes(r.status) ? "Review final readiness in details" : "Closed stay")}{issues.length > 1 ? ` · +${issues.length - 1} to review` : ""}</small></div></td>
            <td><div className="reservation-actions"><button type="button" className="table-action action-neutral" onClick={() => checkIn ? onCheckIn(r.id) : onOpenFolio(r.id)}>{action}</button>{checkIn && <button type="button" className="table-action action-neutral" onClick={() => onOpenFolio(r.id)}>View</button>}</div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
    <TablePagination {...page} onPageChange={page.setPage} noun="bookings" note="Readiness is an advisory preview. The protected workflow checks again before saving." />
  </section>;
}
