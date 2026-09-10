import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, Search, Users } from "lucide-react";
import { StatusBadge } from "@/components/ui";
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
  { value: "upcoming", label: "Upcoming", heading: "Upcoming reservations", category: "upcoming" },
  { value: "current", label: "Current stay", heading: "Current stay", category: "current" },
  { value: "completed", label: "Completed", heading: "Completed reservations", category: "past" },
  { value: "cancelled", label: "Cancelled", heading: "Cancelled reservations", category: "cancelled" },
];

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

function filterHref(raw: Record<string, string | string[] | undefined>, status: ReservationHistoryStatus) {
  const params = new URLSearchParams();
  const query = first(raw.q)?.trim();
  const sort = first(raw.sort);
  if (status !== "all") params.set("status", status);
  if (query) params.set("q", query);
  if (sort && sort !== "recommended") params.set("sort", sort);
  const suffix = params.toString();
  return suffix ? `/my-reservations?${suffix}` : "/my-reservations";
}

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
  const totals = groupReservations(reservations);
  const activeFilter = statusFilters.find((filter) => filter.value === status)!;
  const hasFilters = Boolean(query || status !== "all" || sort !== "recommended");

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
        <div className="customer-empty">
          <CalendarDays />
          <h2>No stays yet</h2>
          <p>Your reservations will appear here after a deposit is submitted.</p>
          <Link className="btn btn-accent" href="/account/find-room">Find a room</Link>
        </div>
      ) : (
        <>
          <section className="reservation-history-controls" aria-label="Reservation history filters">
            <nav className="reservation-filter-chips" aria-label="Filter reservations by status">
              {statusFilters.map((filter) => {
                const count = filter.category ? totals[filter.category].length : reservations.length;
                const active = status === filter.value;
                return (
                  <Link
                    key={filter.value}
                    className={`reservation-filter-chip${active ? " is-active" : ""}`}
                    href={filterHref(raw, filter.value)}
                    aria-current={active ? "page" : undefined}
                    scroll={false}
                  >
                    {filter.label}<b>{count}</b>
                  </Link>
                );
              })}
            </nav>

            <form className="reservation-filter-form" action="/my-reservations">
              {status !== "all" && <input type="hidden" name="status" value={status} />}
              <label className="reservation-search-field">
                <span>Search reservations</span>
                <Search aria-hidden="true" size={17} />
                <input
                  type="search"
                  name="q"
                  defaultValue={query}
                  placeholder="Reference, room, or guest"
                  autoComplete="off"
                />
              </label>
              <label className="reservation-sort-field">
                <span>Sort by</span>
                <select name="sort" defaultValue={sort}>
                  <option value="recommended">Recommended</option>
                  <option value="stay-oldest">Stay date: oldest first</option>
                  <option value="stay-newest">Stay date: newest first</option>
                  <option value="booked-newest">Recently booked</option>
                </select>
              </label>
              <button className="btn btn-accent reservation-filter-submit" type="submit">Apply</button>
              {hasFilters && <Link className="reservation-filter-reset" href="/my-reservations">Clear filters</Link>}
            </form>
          </section>

          <div className="reservation-results-summary" aria-live="polite">
            <span>{visible.length} reservation{visible.length === 1 ? "" : "s"}</span>
            {query && <small>matching {query}</small>}
          </div>

          {visible.length === 0 ? (
            <div className="customer-empty reservation-history-empty">
              <Search />
              <h2>No matching reservations</h2>
              <p>Try another reference, room name, guest name, or reservation status.</p>
              <Link className="btn btn-soft" href="/my-reservations">Clear filters</Link>
            </div>
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
                  {visible.map((reservation) => {
                      const money = calculateFinancialState(reservation.total, reservation.deposit ?? 0);
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
                              <span><Users size={15} />{reservation.guests} guest{reservation.guests !== 1 ? "s" : ""} � {nights} night{nights !== 1 ? "s" : ""}</span>
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
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
