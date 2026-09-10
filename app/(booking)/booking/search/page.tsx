import { getServerSession } from "next-auth";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, Check, ChevronRight, Clock3, Headphones, ShieldCheck, Users, Waves } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { LandingNav } from "@/components/landing/landing-nav";
import { BookingSearchForm } from "@/components/booking/booking-search-form";
import { RoomResults } from "@/components/booking/room-results";
import { RoomFocus } from "@/components/booking/room-focus";
import { getAvailability, getRoomCatalog, parseSearchIntent, type AvailableRoomType, type RoomTypeSummary } from "@/lib/booking";
import { SCENES } from "@/lib/room-images";
import "./search.css";

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const session = await getServerSession(authOptions);
  const forwarded = new URLSearchParams();
  for (const key of ["checkIn", "checkOut", "guests", "roomType", "expired", "changed"]) {
    const value = raw[key];
    if (typeof value === "string") forwarded.set(key, value);
  }
  if (session?.user.role === "guest") redirect(`/account/find-room${forwarded.size ? `?${forwarded}` : ""}`);

  // Intent comes from the URL (see parseSearchIntent): valid dates → availability, otherwise browse.
  const intent = parseSearchIntent(raw);
  let rooms: (AvailableRoomType | RoomTypeSummary)[] = [];
  let lookupError: string | undefined;
  let focusNotice: string | undefined;
  let focusRoomType: string | undefined;

  if (intent.mode === "availability") {
    try {
      rooms = await getAvailability(intent);
    } catch (error) {
      const code = error instanceof Error ? error.message.match(/\(([^)]+)\)$/)?.[1] : undefined;
      console.error("Availability lookup failed", { code: code ?? "unknown" });
      lookupError = "Live availability is temporarily unavailable. Please try your search again.";
    }
  } else {
    try {
      rooms = await getRoomCatalog();
    } catch (error) {
      const code = error instanceof Error ? error.message.match(/\(([^)]+)\)$/)?.[1] : undefined;
      console.error("Room catalog lookup failed", { code: code ?? "unknown" });
      lookupError = "The room catalog is temporarily unavailable. Please try your search again.";
    }
  }

  // A ?roomType focus is only honored when the type is public; a valid-but-sold-out type gets a notice.
  if (intent.roomType && !lookupError) {
    if (rooms.some((room) => room.name === intent.roomType)) {
      focusRoomType = intent.roomType;
    } else if (intent.mode === "browse") {
      focusNotice = "We couldn't find that room — here are all our rooms.";
    } else {
      const catalog = await getRoomCatalog().catch(() => [] as RoomTypeSummary[]);
      focusNotice = catalog.some((room) => room.name === intent.roomType)
        ? `${intent.roomType} isn't available for those dates — here's what else is open.`
        : "We couldn't find that room — here are the rooms available for your dates.";
    }
  }
  if (focusRoomType) rooms = [...rooms.filter((room) => room.name === focusRoomType), ...rooms.filter((room) => room.name !== focusRoomType)];

  const availability = intent.mode === "availability" ? intent : undefined;
  const nights = availability ? (() => {
    const diff = Math.round((Date.parse(`${availability.checkOut}T00:00:00Z`) - Date.parse(`${availability.checkIn}T00:00:00Z`)) / 86_400_000);
    return diff > 0 ? diff : 1;
  })() : 0;
  const totalUnits = rooms.reduce((sum, room) => sum + ("availableUnits" in room ? room.availableUnits : 0), 0);

  const details = (roomType: string) => {
    if (!availability) return "#book-form";
    const query = new URLSearchParams({ roomType, checkIn: availability.checkIn, checkOut: availability.checkOut, guests: String(availability.guests) });
    const path = `/booking/details?${query}`;
    return session ? path : `/login?booking=1&callbackUrl=${encodeURIComponent(path)}`;
  };
  const formInitial = availability
    ? { ...availability, roomType: focusRoomType }
    : { guests: Math.min(8, Math.max(1, Number(raw.guests) || 2)), roomType: focusRoomType };

  return (
    <main className="booking-page">
      <LandingNav active="Rooms" rootLinks />
      <section className="booking-hero--search" aria-labelledby="search-title">
        <Image src={SCENES.story} alt="A calm, sunlit hotel interior" fill priority sizes="100vw" className="booking-search-hero-image" />
        <div className="booking-search-hero-shade" />
        <div className="booking-search-hero-inner">
          <nav className="booking-breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link><ChevronRight size={13} aria-hidden="true" />
            <Link href="/#stay">Rooms &amp; Suites</Link><ChevronRight size={13} aria-hidden="true" />
            <span aria-current="page">Select your room</span>
          </nav>
          <div className="booking-search-heading">
            <div>
              {focusRoomType && !availability ? <><h1 id="search-title">{focusRoomType}</h1><p>Explore this room, or compare it with the rest of the HAVEN collection.</p></>
              : availability ? <><h1 id="search-title">Choose the room that feels right.</h1><p>Live availability and current rates for the stay you selected.</p></>
              : <><h1 id="search-title">A room for your kind of stay.</h1><p>Browse HAVEN’s room types, then choose dates to see live availability.</p></>}
            </div>
            <ol className="booking-progress" aria-label="Booking progress">
              <li aria-current="step"><b>1</b><span>Select room</span></li>
              <li><b>2</b><span>Guest details</span></li>
              <li><b>3</b><span>Deposit</span></li>
            </ol>
          </div>
        </div>
        <div className="booking-search-summary" id="book-form">
          <BookingSearchForm compact initial={formInitial} />
          {availability && <div className="booking-active-filters" aria-label="Current search filters">
            <span className="booking-filter-chip"><CalendarDays size={14} aria-hidden="true" /> {availability.checkIn} → {availability.checkOut} · {nights} night{nights !== 1 ? "s" : ""}</span>
            <span className="booking-filter-chip"><Users size={14} aria-hidden="true" /> {availability.guests} guest{availability.guests !== 1 ? "s" : ""}</span>
            <span className="booking-filter-chip"><Waves size={14} aria-hidden="true" />{rooms.length ? `${rooms.length} room type${rooms.length !== 1 ? "s" : ""} · ${totalUnits} room${totalUnits !== 1 ? "s" : ""} available` : "No rooms available for these dates"}</span>
          </div>}
        </div>
      </section>

      <div className="booking-content--premium">
        {raw.expired && availability && <p className="booking-notice">Your hold expired. Please pick from today’s live rooms.</p>}
        {raw.changed && availability && <p className="booking-notice">Rates or availability changed — here are the latest results.</p>}
        {intent.mode === "browse" && intent.notice && <p className="booking-notice">Your search needs attention — {intent.notice.toLowerCase()}. Pick dates below to see live availability.</p>}
        {focusNotice && <p className="booking-notice">{focusNotice}</p>}

        <div className="booking-layout">
          <div className="booking-results">
            <div className="booking-results__head">
              <h2>
                {availability
                  ? rooms.length ? "Rooms for your dates" : "Choose different dates"
                  : focusRoomType ? `${focusRoomType} and every room type` : "All rooms & suites"}
              </h2>
              <span className="booking-results__count">
                {lookupError ? "Check details" : availability ? `${rooms.length} results` : `${rooms.length} room type${rooms.length !== 1 ? "s" : ""}`}
              </span>
            </div>
            {focusRoomType && <RoomFocus roomType={focusRoomType} searchKey={JSON.stringify(raw)} />}
            <RoomResults rooms={rooms} error={lookupError} hrefFor={details} focusRoomType={focusRoomType} />
          </div>

          <aside className="booking-sidebar" aria-label="Booking help">
            <div className="booking-sidebar__card">
              <ShieldCheck size={22} aria-hidden="true" />
              <h3>Booked with clarity</h3>
              <ul className="booking-sidebar__list">
                <li><Check size={14} aria-hidden="true" /> Availability is calculated from live room inventory.</li>
                <li><Check size={14} aria-hidden="true" /> Selecting a room starts a 15-minute hold.</li>
                <li><Check size={14} aria-hidden="true" /> Your required deposit and payment terms appear before submission.</li>
              </ul>
            </div>
            <div className="booking-sidebar__card">
              <Headphones size={22} aria-hidden="true" />
              <h3>Need a hand choosing?</h3>
              <p>Review the booking questions or contact Front Desk for help with your stay.</p>
              <Link href="/#faq" className="booking-sidebar__link">View booking questions <ArrowRight size={14} aria-hidden="true" /></Link>
            </div>
            {availability ? (
              <div className="booking-sidebar__card">
                <CalendarDays size={22} aria-hidden="true" />
                <h3>Your search</h3>
                <p>
                  Check-in <strong>{availability.checkIn}</strong> → Check-out <strong>{availability.checkOut}</strong>
                  <br />
                  {nights} night{nights !== 1 ? "s" : ""} · {availability.guests} guest{availability.guests !== 1 ? "s" : ""}
                </p>
                <a href="#book-form" className="booking-sidebar__link">Change stay details <ArrowRight size={14} aria-hidden="true" /></a>
              </div>
            ) : (
              <div className="booking-sidebar__card">
                <Clock3 size={22} aria-hidden="true" />
                <h3>Planning ahead?</h3>
                <p>Choose your check-in and check-out dates above to see live availability and exact rates for your stay.</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
