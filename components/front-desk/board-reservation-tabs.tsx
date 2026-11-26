"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { TablePagination, useTablePagination } from "@/components/ui/table-pagination";
import { HavenEmptyState } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatPeso } from "@/lib/format";
import { inReservationQueue, reservationNextAction, reservationPreview, type ReservationQueue } from "@/lib/reservation-workspace";
import type { RackReservation, RackRoom } from "@/lib/room-rack";
import { arrivalReadinessAction, readinessLabels, type Readiness } from "@/lib/hotel-operations";
import { fetchPublic, readResponse } from "@/lib/client-errors";

export type BoardTab = ReservationQueue;
const stayDates = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default function BoardReservationTabs({ reservations, today, tab, onOpenFolio, onCheckIn, canOperate, search, rooms, blockedRoomIds, closedStatus, refreshVersion = 0, serverPage }: {
  reservations: RackReservation[]; today: string; tab: BoardTab;
  onOpenFolio: (id: string) => void; onCheckIn: (id: string) => void;
  canOperate: boolean; search: string; rooms: RackRoom[]; blockedRoomIds: Set<string>; closedStatus: string; refreshVersion?: number;
  serverPage?: { page: number; total: number; onChange: (page: number) => void };
}) {
  const visible = useMemo(() => {
    if (serverPage) return reservations;
    const needle = search.trim().toLowerCase();
    return reservations.filter(r => inReservationQueue(r, tab, today)
      && (tab !== "closed" || closedStatus === "all" || r.status === closedStatus)
      && `${r.guest_name ?? ""} ${r.confirmation_number ?? ""} ${r.room_number ?? ""} ${r.id}`.toLowerCase().includes(needle));
  }, [reservations, tab, today, closedStatus, search, serverPage]);
  const localPage = useTablePagination(visible);
  const page = serverPage ? {
    rows: reservations, page: serverPage.page, pageCount: Math.max(1, Math.ceil(serverPage.total / 10)),
    start: serverPage.total ? (serverPage.page - 1) * 10 + 1 : 0,
    end: (serverPage.page - 1) * 10 + reservations.length,
    total: serverPage.total, setPage: serverPage.onChange,
  } : localPage;
  const arrivalQuery = new URLSearchParams(page.rows.filter(row => canOperate && row.status === "confirmed" && row.check_in.slice(0, 10) <= today).slice(0, 20).map(row => ["id", row.id])).toString();
  const [assessments, setAssessments] = useState<{ query: string; version: number; entries: Record<string, Readiness> } | null>(null);
  useEffect(() => {
    if (!arrivalQuery) return;
    const controller = new AbortController();
    void fetchPublic(`/api/front-desk/arrivals/readiness?${arrivalQuery}`, { signal: controller.signal, cache: "no-store" })
      .then(async response => {
        const entries = response.ok ? (await readResponse(response)).data ?? {} : {};
        if (!controller.signal.aborted) setAssessments({ query: arrivalQuery, version: refreshVersion, entries });
      }).catch(() => { /* The guarded arrival dialog still loads the final assessment. */ });
    return () => controller.abort();
  }, [arrivalQuery, refreshVersion, reservations]);
  return <section className="data-panel board-tabs" aria-label="Bookings">
    {!visible.length ? <HavenEmptyState icon={<CalendarDays size={22} aria-hidden="true" />} title="No bookings match" body="Try clearing the search, choosing another queue, or changing the date scope." /> : <div className="table-scroll booking-table-scroll">
      <table className="booking-table" role="table" aria-label="Booking list"><thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Guest / reference</th><th role="columnheader" scope="col">Room / stay</th><th role="columnheader" scope="col">Payment</th><th role="columnheader" scope="col">Status / readiness</th><th role="columnheader" scope="col">Next action</th></tr></thead>
        <tbody role="rowgroup">{page.rows.map(r => {
          const assessment = assessments?.query === arrivalQuery && assessments.version === refreshVersion ? assessments.entries[r.id] : undefined;
          const task = assessment && arrivalReadinessAction(assessment.checkIn);
          const issues = assessment ? assessment.checkIn.map(code => readinessLabels[code] ?? code.replaceAll("_", " ")) : reservationPreview(r, rooms, blockedRoomIds, today);
          const checkIn = canOperate && r.status === "confirmed" && r.check_in.slice(0, 10) <= today;
          const action = task?.label ?? reservationNextAction(r, canOperate, today);
          const checkInDay = new Date(`${r.check_in.slice(0, 10)}T00:00:00Z`);
          const checkOutDay = new Date(`${r.check_out.slice(0, 10)}T00:00:00Z`);
          const dateRange = checkInDay <= checkOutDay ? stayDates.formatRange(checkInDay, checkOutDay) : "Stay dates unavailable";
          return <tr key={r.id} role="row">
            <td role="cell" className="booking-identity"><div className="cell-stack"><b>{r.guest_name ?? "Guest"}</b><small>{r.confirmation_number ?? r.id}</small></div></td>
            <td role="cell" className="booking-stay"><div className="cell-stack"><b>{r.room_number ? `Room ${r.room_number}` : "Not assigned"}</b><small>{r.room_type}</small><span>{dateRange}</span></div></td>
            <td role="cell" className="booking-payment"><div className="cell-stack">{r.payment_status ? <StatusBadge status={r.payment_status} size="sm" /> : <span>Payment not recorded</span>}<small>{r.folio_balance == null ? "Folio balance unavailable" : Number(r.folio_balance) > 0 ? `${formatPeso(r.folio_balance)} due` : "No outstanding folio balance"}</small></div></td>
            <td role="cell" className="booking-readiness"><div className="cell-stack"><StatusBadge status={r.status} size="sm" /><small>{issues[0] ?? (assessment ? "Ready for final review" : ["pending", "confirmed", "checked_in"].includes(r.status) ? "Review readiness in details" : "Closed stay")}{issues.length > 1 ? ` · +${issues.length - 1} to review` : ""}</small></div></td>
            <td role="cell" className="booking-next-action"><div className="reservation-actions"><button type="button" className="table-action action-neutral booking-action-primary" onClick={() => checkIn ? onCheckIn(r.id) : onOpenFolio(r.id)}>{action}<ArrowUpRight size={14} aria-hidden="true" /></button>{checkIn && <button type="button" className="table-action action-neutral booking-action-details" onClick={() => onOpenFolio(r.id)}>View booking</button>}</div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}
    <TablePagination {...page} onPageChange={page.setPage} noun="bookings" />
  </section>;
}
