import { BookingSearchForm } from "@/components/booking/booking-search-form";
import { RoomResults } from "@/components/booking/room-results";
import { RoomFocus } from "@/components/booking/room-focus";
import { getAvailability, getRoomCatalog, parseSearchIntent, type AvailableRoomType, type RoomTypeSummary } from "@/lib/booking";
import { requireCustomerSession } from "@/lib/customer-auth";

const FIND_ROOM_PATH = "/account/find-room";

export default async function FindRoomPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  await requireCustomerSession();
  const raw = await searchParams;
  // Intent mirrors /booking/search: valid dates → availability, otherwise the browse catalog,
  // with an optional ?roomType focus from a landing Featured Stay card.
  const intent = parseSearchIntent(raw);
  let rooms: (AvailableRoomType | RoomTypeSummary)[] = [];
  let lookupError: string | undefined;
  let focusNotice: string | undefined;
  let focusRoomType: string | undefined;
  if (intent.mode === "availability") {
    try { rooms = await getAvailability(intent); }
    catch (error) {
      const code = error instanceof Error ? error.message.match(/\(([^)]+)\)$/)?.[1] : undefined;
      console.error("Availability lookup failed", { code: code ?? "unknown" });
      lookupError = "Live availability is temporarily unavailable. Please try your search again.";
    }
  } else {
    try { rooms = await getRoomCatalog(); }
    catch (error) {
      const code = error instanceof Error ? error.message.match(/\(([^)]+)\)$/)?.[1] : undefined;
      console.error("Room catalog lookup failed", { code: code ?? "unknown" });
      lookupError = "The room catalog is temporarily unavailable. Please try your search again.";
    }
  }
  if (intent.roomType && !lookupError) {
    if (rooms.some((room) => room.name === intent.roomType)) focusRoomType = intent.roomType;
    else if (intent.mode === "browse") focusNotice = "We couldn't find that room — here are all our rooms.";
    else {
      const catalog = await getRoomCatalog().catch(() => [] as RoomTypeSummary[]);
      focusNotice = catalog.some((room) => room.name === intent.roomType)
        ? `${intent.roomType} isn't available for those dates — here's what else is open.`
        : "We couldn't find that room — here are the rooms available for your dates.";
    }
  }
  if (focusRoomType) rooms = [...rooms.filter((room) => room.name === focusRoomType), ...rooms.filter((room) => room.name !== focusRoomType)];
  const availability = intent.mode === "availability" ? intent : undefined;
  const details = (roomType: string) => availability
    ? `/booking/details?${new URLSearchParams({ roomType, checkIn: availability.checkIn, checkOut: availability.checkOut, guests: String(availability.guests) })}`
    : "#book-form";
  const formInitial = availability
    ? { ...availability, roomType: focusRoomType }
    : { guests: Math.min(8, Math.max(1, Number(raw.guests) || 2)), roomType: focusRoomType };
  return <><section className="customer-page-title"><p className="eyebrow">Reserve your stay</p><h1>Find a Room</h1><p>{availability ? "Live availability from Haven's room inventory." : "Browse Haven's room types, then choose your dates to see live availability."}</p></section>
  {intent.mode === "browse" && intent.notice && <p className="booking-notice">Your search needs attention — {intent.notice.toLowerCase()}. Pick dates below to see live availability.</p>}
  {focusNotice && <p className="booking-notice">{focusNotice}</p>}
  <div id="book-form"><BookingSearchForm compact action={FIND_ROOM_PATH} initial={formInitial}/></div>
  {focusRoomType && <RoomFocus roomType={focusRoomType} searchKey={JSON.stringify(raw)}/>}
  <RoomResults rooms={rooms} error={lookupError} hrefFor={details} focusRoomType={focusRoomType}/></>;
}
