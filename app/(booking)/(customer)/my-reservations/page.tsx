import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Search, Users } from "lucide-react";
import { HavenEmptyState, StatusBadge } from "@/components/ui";
import { ReservationHistoryFooter } from "@/components/customer/reservation-history-footer";
import { ReservationHistoryToolbar } from "@/components/customer/reservation-history-toolbar";
import { calculateFinancialState, calculateNights, formatPeso, getGuestReservations } from "@/lib/booking";
import {
  filterReservationHistory,
  formatStayRange,
  groupReservations,
  reservationCategory,
  type ReservationCategory,
  type ReservationHistoryStatus,
} from "@/lib/customer";
import { requireCustomerSession } from "@/lib/customer-auth";
import { roomPrimary } from "@/lib/room-images";

const statusFilters: { value: ReservationHistoryStatus; label: string; heading: string; category?: ReservationCategory }[] = [
  { value: "all", label: "All reservations", heading: "All reservations" },
  { value: "current", label: "Current stay", heading: "Current stay", category: "current" },
  { value: "upcoming", label: "Upcoming", heading: "Upcoming reservations", category: "upcoming" },
  { value: "completed", label: "Completed", heading: "Completed reservations", category: "past" },
  { value: "cancelled", label: "Cancelled", heading: "Cancelled reservations", category: "cancelled" },
];

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function MyReservationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireCustomerSession();
  const [reservations, raw] = await Promise.all([
    getGuestReservations(session.user.id),
    searchParams,
  ]);
  const query = first(raw.q)?.trim() ?? "";
  const requestedStatus = first(raw.status) ?? "all";
  const status = statusFilters.some((filter) => filter.value === requestedStatus) ? requestedStatus : "all";
  const requestedSort = first(raw.sort) ?? "recommended";
  const sort = ["recommended", "stay-oldest", "stay-newest", "booked-newest"].includes(requestedSort) ? requestedSort : "recommended";
  const visible = filterReservationHistory(reservations, { query, status, sort });
  // Section-level pagination (same offset math as paginateTableRows).
  const PAGE_SIZE = 6;
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const requestedPage = Number(first(raw.page) ?? 1);
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), pageCount);
  const offset = (page - 1) * PAGE_SIZE;
  const pageRows = visible.slice(offset, offset + PAGE_SIZE);
  const totals = groupReservations(reservations);
  const hasActiveFilters = Boolean(query || status !== "all" || sort !== "recommended");
  const activeFilter = statusFilters.find((filter) => filter.value === status)!;
  return (
    <div className="customer-reservations-page">
      <section className="customer-page-title split">
        <div>
          <p className="eyebrow">My reservations</p>
          <h1>Your stay history, clearly arranged.</h1>
          <p>Find an upcoming visit, manage your current stay, or revisit completed and cancelled reservations.</p>
        </div>
        <Link className="btn btn-accent" href="/account/find-room">Book another stay</Link>
      </section>

      {reservations.length === 0 ? (
        <HavenEmptyState
          variant="customer"
          icon={<CalendarDays />}
          title="No stays yet"
          body="Your reservations will appear here after a deposit is submitted."
          action={<Link className="btn btn-accent" href="/account/find-room">Find a room</Link>}
        />
      ) : (
        <>
          <ReservationHistoryToolbar
            key={`${query}:${status}:${sort}`}
            initialQuery={query}
            initialStatus={status}
            initialSort={sort}
            statusOptions={statusFilters.map((filter) => ({
              value: filter.value,
              label: filter.label,
              count: filter.category ? totals[filter.category].length : reservations.length,
            }))}
          />

          {visible.length === 0 ? (
            <HavenEmptyState
              variant="customer"
              icon={<Search />}
              title="No reservations match your search"
              body="Try another reference, room name, or reservation status."
              action={<Link className="btn btn-soft" href="/my-reservations">Clear filters</Link>}
            />
          ) : (
            <div className="customer-reservation-groups">
              <section className="reservation-history-section">
                <header>
                  <div>
                    <h2>{activeFilter.heading}</h2>
                  </div>
                  <span>{visible.length}</span>
                </header>
                <div className="reservation-history-list">
                  {pageRows.map((reservation) => {
                      // Cancelled stays settle to a zero balance at cancel time
                      // (invoice zeroed, pendings expired), so the card must not
                      // recompute a balance from the frozen total/deposit pair.
                      const money = reservation.status === "cancelled"
                        ? { total: reservation.total, paid: reservation.deposit ?? 0, balance: 0 }
                        : calculateFinancialState(reservation.total, reservation.deposit ?? 0);
                      const photo = roomPrimary(undefined, reservation.room_type);
                      const nights = calculateNights(reservation.check_in, reservation.check_out);
                      return (
                        <article className="customer-reservation-card" key={reservation.id}>
                          {photo && (
                            <div className="customer-reservation-photo">
                              <Image
                                src={photo}
                                alt={`${reservation.room_type} at Haven`}
                                fill
                                sizes="(max-width: 700px) 100vw, 220px"
                              />
                            </div>
                          )}
                          <div className="reservation-card-copy">
                            <div className="reservation-card-badges">
                              <StatusBadge status={reservation.status} size="sm" />
                              <StatusBadge status={reservation.payment_status} size="sm" />
                            </div>
                            <p className="reservation-card-reference">{reservation.confirmation_number ?? reservation.id}</p>
                            <h3>{reservation.room_type}</h3>
                            <div className="reservation-card-facts">
                              <span><CalendarDays size={15} />{formatStayRange(reservation.check_in, reservation.check_out)}</span>
                              <span><Users size={15} />{reservation.guests} guest{reservation.guests !== 1 ? "s" : ""} · {nights} night{nights !== 1 ? "s" : ""}</span>
                            </div>
                          </div>
                          <div className="reservation-card-finance">
                            <small>Stay total</small>
                            <strong>{formatPeso(money.total)}</strong>
                            <p>Paid {formatPeso(money.paid)}</p>
                            <p>Balance {formatPeso(money.balance)}</p>
                            <Link className="reservation-card-action" href={`/my-reservations/${reservation.id}`}>
                              {["current", "upcoming"].includes(reservationCategory(reservation)) ? "Manage stay" : "View reservation"}
                              <ArrowRight size={15} />
                            </Link>
                          </div>
                        </article>
                      );
                    })}
                </div>
                <ReservationHistoryFooter
                  query={query}
                  status={status}
                  sort={sort}
                  page={page}
                  pageCount={pageCount}
                  start={pageRows.length ? offset + 1 : 0}
                  end={offset + pageRows.length}
                  total={visible.length}
                  hasActiveFilters={hasActiveFilters}
                />
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
