import { getBookingTimezone } from "@/lib/booking";
import { bookingCheckoutEnabled } from "@/lib/booking-checkout-policy";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Check, ChevronRight, Clock3, Headphones, ShieldCheck } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { PublicWebsiteNav } from "@/components/landing/public-website-nav";
import { BookingNoticeToast } from "@/components/booking/booking-notice-toast";
import { StaySearchPanel } from "@/components/booking/stay-search-panel";
import { BackButton } from "@/components/booking/back-button";
import { RoomResults } from "@/components/booking/room-results";
import { RoomFocus } from "@/components/booking/room-focus";
import { bookingGuestCapacity, getDepositPolicy, getAvailability, getRoomCatalog, parseSearchIntent, type AvailableRoomType, type RoomTypeSummary } from "@/lib/booking";
import "./search.css";

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const session = await getServerSession(authOptions);
  const forwarded = new URLSearchParams();
  for (const key of ["checkIn", "checkOut", "guests", "roomType", "expired", "changed"]) {
    const value = raw[key];
    if (typeof value === "string") forwarded.set(key, value);
  }
  if (typeof raw.roomType === 'string') redirect(`/booking/rooms/${encodeURIComponent(raw.roomType)}?${forwarded}`);
  if (session?.user.role === "guest") redirect(`/account/find-room${forwarded.size ? `?${forwarded}` : ""}`);

  // Intent comes from the URL (see parseSearchIntent): valid dates → availability, otherwise browse.
  const timeZone = await getBookingTimezone();
  const intent = parseSearchIntent(raw, new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date()));
  const depositPolicy = await getDepositPolicy();
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

  const capacityCatalog = intent.mode === "browse" ? rooms : await Promise.resolve(getRoomCatalog()).catch(() => []);
  const maxGuests = bookingGuestCapacity(capacityCatalog);
  const availability = intent.mode === "availability" ? intent : undefined;
  const checkoutOpen = !availability || await bookingCheckoutEnabled();
  const correction = intent.mode === "browse" ? intent.correction : undefined;
  const validation = correction && intent.mode === "browse" && intent.notice ? { field: correction.field, message: intent.notice } : undefined;
  const totalUnits = rooms.reduce((sum, room) => sum + ("availableUnits" in room ? room.availableUnits : 0), 0);

  const details = (roomType: string) => {
    if (!availability) return "#book-form";
    const query = new URLSearchParams({ roomType, checkIn: availability.checkIn, checkOut: availability.checkOut, guests: String(availability.guests) });
    return `/booking/rooms/${encodeURIComponent(roomType)}?${query}`;
  };
  const formInitial = availability
    ? { ...availability, roomType: focusRoomType }
    : { checkIn: correction?.checkIn, checkOut: correction?.checkOut, guests: Math.min(99, Math.max(1, Math.trunc(Number(raw.guests)) || 2)), roomType: focusRoomType };

  return (
    <main className="booking-page room-search-page">
      <PublicWebsiteNav bookingHref="#book-form" active="Rooms" rootLinks />
      <section className="booking-hero--search" aria-labelledby="search-title">
        <div className="booking-search-hero-shade" />
        <div className="booking-search-hero-inner">
          <nav className="booking-breadcrumbs" aria-label="Breadcrumb">
            <Link href="/">Home</Link><ChevronRight size={13} aria-hidden="true" />
            <Link href="/#stay">Rooms &amp; Suites</Link><ChevronRight size={13} aria-hidden="true" />
            <span aria-current="page">Select your room</span>
          </nav>
          <BackButton />
          <div className="booking-search-heading">
            <div>
              {focusRoomType && !availability ? <><h1 id="search-title" className="room-title">{focusRoomType}</h1><p>Explore this room, or compare it with the rest of the HAVEN collection.</p></>
              : availability ? <><h1 id="search-title">Find your room</h1><p>Compare available rooms and rates for your stay.</p></>
              : <><h1 id="search-title">A room for your kind of stay.</h1><p>Browse HAVEN’s room types, then choose dates to see live availability.</p></>}
            </div>
            <ol className="booking-progress" aria-label="Booking progress">
              <li aria-current="step"><b>1</b><span>Select room</span></li>
              <li><b>2</b><span>Guest details</span></li>
              <li><b>3</b><span>Deposit</span></li>
            </ol>
          </div>
        </div>
        <StaySearchPanel className="booking-search-summary" initial={formInitial} maxGuests={maxGuests} searched={availability} timeZone={timeZone} validation={validation} />
      </section>

      <div className="booking-content--premium">
        {raw.expired && availability && <BookingNoticeToast text="Your hold expired. Please pick from today’s live rooms." />}
        {raw.changed && availability && <BookingNoticeToast text="Rates or availability changed — here are the latest results." />}
        {focusNotice && <BookingNoticeToast text={focusNotice} />}

        <div className="booking-layout">
          <div className="booking-results">
            {(!availability || totalUnits > 0 || lookupError) && <div className="booking-results__head">
              <h2>
                {lookupError ? "Unable to load rooms" : availability
                  ? rooms.length ? "Rooms for your dates" : "Choose different dates"
                  : focusRoomType ? `${focusRoomType} and every room type` : "All rooms & suites"}
              </h2>
              <span className="booking-results__count">
                {lookupError ? "Availability unavailable" : availability
                  ? rooms.length ? `${rooms.length} room type${rooms.length !== 1 ? "s" : ""} · ${totalUnits} room${totalUnits !== 1 ? "s" : ""} available` : "No rooms available for these dates"
                  : `${rooms.length} room type${rooms.length !== 1 ? "s" : ""}`}
              </span>
            </div>}
            {focusRoomType && <RoomFocus roomType={focusRoomType} searchKey={JSON.stringify(raw)} />}
            <RoomResults depositPolicy={depositPolicy} rooms={rooms} error={lookupError} retryHref={`/booking/search${forwarded.size ? `?${forwarded}` : ""}`} hrefFor={details} focusRoomType={focusRoomType} searched={Boolean(availability)} checkoutOpen={checkoutOpen} />
          </div>

          <aside className="booking-sidebar" aria-label="Booking help">
            <div className="booking-sidebar__card">
              <ShieldCheck size={22} aria-hidden="true" />
              <h3>Booked with clarity</h3>
              <ul className="booking-sidebar__list">
                <li><Check size={14} aria-hidden="true" /> Availability is calculated from live room inventory.</li>
                <li><Check size={14} aria-hidden="true" /> Your room hold begins after you submit guest details.</li>
                <li><Check size={14} aria-hidden="true" /> Your required deposit and payment terms appear before submission.</li>
              </ul>
            </div>
            <div className="booking-sidebar__card">
              <Headphones size={22} aria-hidden="true" />
              <h3>Need a hand choosing?</h3>
              <p>Review the booking questions or contact Front Desk for help with your stay.</p>
              <Link href="/booking-policy" className="booking-sidebar__link">Read deposit &amp; cancellation terms <ArrowRight size={14} aria-hidden="true" /></Link>
              <Link href="/#contact" className="booking-sidebar__link">Contact Front Desk <ArrowRight size={14} aria-hidden="true" /></Link>
            </div>
            {!availability && (
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
