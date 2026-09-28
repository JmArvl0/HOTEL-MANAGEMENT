"use client";

import { useMemo } from "react";
import { CalendarDays } from "lucide-react";
import { TablePagination, useTablePagination } from "@/components/ui/table-pagination";
import { HavenEmptyState, HavenSearchInput } from "@/components/ui";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { RackReservation } from "@/lib/room-rack";

export type BoardTab = "all" | "arrivals" | "in_house" | "departures" | "completed";

const TABS: { value: BoardTab; label: string }[] = [
  { value: "all", label: "All Reservations" },
  { value: "arrivals", label: "Upcoming Arrivals" },
  { value: "in_house", label: "Current Guests" },
  { value: "departures", label: "Departures Today" },
  { value: "completed", label: "Completed" },
];

const EMPTY_COPY: Record<BoardTab, { title: string; body: string }> = {
  all: { title: "No reservations on record", body: "No stays have been created yet." },
  arrivals: { title: "No upcoming arrivals", body: "All clear for the selected window." },
  in_house: { title: "No guests in house", body: "No checked-in stays overlap this window." },
  departures: { title: "No departures today", body: "No stays end today in this window." },
  completed: { title: "No completed stays", body: "No guest has checked out properly yet." },
};

// Window tabs read the rack snapshot (operational truth for the selected
// dates). All + Completed read full history: closed past stays fall outside
// the window. Completed = checked_out only — cancelled/no_show are closed
// but not done, and stay visible under All.
function tabFilter(tab: BoardTab, today: string) {
  return (r: RackReservation) => {
    if (tab === "completed") return r.status === "checked_out";
    if (tab === "arrivals") return ["pending", "confirmed"].includes(r.status) && r.check_in.slice(0, 10) >= today;
    if (tab === "in_house") return r.status === "checked_in";
    if (tab === "departures") return r.check_out.slice(0, 10) === today && !["cancelled", "no_show", "checked_out"].includes(r.status);
    return true;
  };
}

/**
 * Reservation content under the module view-tabs: renders the active
 * reservation view over window rows or full history. Navigation lives in the
 * parent view-tabs (single navigation); row click routes to the existing
 * folio workflow — no new flows.
 */
export default function BoardReservationTabs({
  reservations,
  history,
  today,
  tab,
  onOpenFolio,
  search,
  onSearchChange,
}: {
  reservations: RackReservation[];
  history: RackReservation[] | null;
  today: string;
  tab: BoardTab;
  onOpenFolio: (reservationId: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const source = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = tab === "all" || tab === "completed" ? history ?? reservations : reservations;
    return needle
      ? rows.filter((r) =>
          `${r.guest_name ?? ""} ${r.confirmation_number ?? ""} ${r.room_number ?? ""} ${r.id}`.toLowerCase().includes(needle)
        )
      : rows;
  }, [reservations, history, search, tab]);
  const visible = useMemo(() => source.filter(tabFilter(tab, today)), [source, tab, today]);
  const page = useTablePagination(visible);
  const empty = EMPTY_COPY[tab];

  return (
    <>
      <section className="board-tabs-searchpanel" aria-label="Reservation search">
        <HavenSearchInput value={search} onValueChange={onSearchChange} label="Search reservations" placeholder="Search guest name, reservation #, or room..." />
        <span className="haven-result-count" aria-live="polite">Showing {visible.length} {visible.length === 1 ? "reservation" : "reservations"}</span>
      </section>
    <section className="data-panel board-tabs" aria-label="Reservations">
      {visible.length === 0 ? (
        <HavenEmptyState icon={<CalendarDays size={22} aria-hidden="true" />} title={empty.title} body={empty.body} />
      ) : (
        <div className="table-scroll">
          <table aria-label={`${TABS.find((t) => t.value === tab)?.label}`}>
            <thead><tr><th>Date</th><th>Guest name</th><th>Room</th><th>Reservation #</th><th>Type</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {page.rows.map((r) => (
                <tr key={r.id} tabIndex={0} onClick={() => onOpenFolio(r.id)} onKeyDown={(e) => { if (e.key === "Enter") onOpenFolio(r.id); }}>
                  <td>{tab === "departures" || tab === "completed" ? r.check_out.slice(0, 10) : r.check_in.slice(0, 10)}</td>
                  <td><b>{r.guest_name ?? "—"}</b></td>
                  <td>{r.room_number ?? "Not assigned"}</td>
                  <td>{r.confirmation_number ?? r.id.slice(0, 8)}</td>
                  <td>{r.room_type}</td>
                  <td><StatusBadge status={r.status} size="sm" /></td>
                  <td><button type="button" className="table-action action-neutral" onClick={(e) => { e.stopPropagation(); onOpenFolio(r.id); }}>View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <TablePagination {...page} onPageChange={page.setPage} noun="reservations" note="Window tabs follow the selected dates; All and Completed read full history." />
    </section>
    </>
  );
}
