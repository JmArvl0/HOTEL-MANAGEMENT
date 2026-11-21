import { getBookingTimezone } from "@/lib/booking";
import { BookingNoticeToast } from "@/components/booking/booking-notice-toast";
import { StaySearchPanel } from "@/components/booking/stay-search-panel";
import { RoomResults } from "@/components/booking/room-results";
import { RoomFocus } from "@/components/booking/room-focus";
import { bookingGuestCapacity, getDepositPolicy, getAvailability, getRoomCatalog, parseSearchIntent, type AvailableRoomType, type RoomTypeSummary } from "@/lib/booking";
import { requireCustomerSession } from "@/lib/customer-auth";

const FIND_ROOM_PATH = "/account/find-room";

export default async function FindRoomPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  await requireCustomerSession();
  const raw = await searchParams;
  const retryQuery = new URLSearchParams();
  for (const key of ["checkIn", "checkOut", "guests", "roomType"]) {
    const value = raw[key];
    if (typeof value === "string") retryQuery.set(key, value);
  }
  // Intent mirrors /booking/search: valid dates → availability, otherwise the browse catalog,
  // with an optional ?roomType focus from a landing Featured Stay card.
  const timeZone = await getBookingTimezone();
  const intent = parseSearchIntent(raw, new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date()));
  const depositPolicy = await getDepositPolicy();
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
  const maxGuests = bookingGuestCapacity(availability ? await getRoomCatalog().catch(() => []) : rooms);
  const details = (roomType: string) => availability
    ? `/booking/rooms/${encodeURIComponent(roomType)}?${new URLSearchParams({ roomType, checkIn: availability.checkIn, checkOut: availability.checkOut, guests: String(availability.guests) })}`
    : `/booking/rooms/${encodeURIComponent(roomType)}`;
  const formInitial = availability
    ? { ...availability, roomType: focusRoomType }
    : { guests: Math.min(8, Math.max(1, Number(raw.guests) || 2)), roomType: focusRoomType };
  return <><section className="customer-page-title"><p className="eyebrow">Reserve your stay</p><h1>Find a Room</h1><p>{availability ? "Live availability from Haven's room inventory." : "Browse Haven's room types, then choose your dates to see live availability."}</p></section>
  {intent.mode === "browse" && intent.notice && <BookingNoticeToast text={`Your search needs attention — ${intent.notice.toLowerCase()}. Pick dates below to see live availability.`} />}
  {focusNotice && <BookingNoticeToast text={focusNotice} />}
  <StaySearchPanel className="portal-stay-search" action={FIND_ROOM_PATH} initial={formInitial} maxGuests={maxGuests} searched={availability} timeZone={timeZone}/>
  {focusRoomType && <RoomFocus roomType={focusRoomType} searchKey={JSON.stringify(raw)}/>}
  <RoomResults depositPolicy={depositPolicy} rooms={rooms} error={lookupError} retryHref={`${FIND_ROOM_PATH}${retryQuery.size ? `?${retryQuery}` : ""}`} hrefFor={details} focusRoomType={focusRoomType}/></>;
}
