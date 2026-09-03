import { BookingSearchForm } from "@/components/booking/booking-search-form";
import { RoomResults } from "@/components/booking/room-results";
import { getAvailability, hotelToday, searchSchema } from "@/lib/booking";
import { requireCustomerSession } from "@/lib/customer-auth";

const FIND_ROOM_PATH = "/account/find-room";

export default async function FindRoomPage({ searchParams }: { searchParams: Promise<Record<string,string|string[]|undefined>> }) {
  await requireCustomerSession();
  const raw = await searchParams;
  // Arriving from the sidebar carries no dates, so default to tonight instead of an error card.
  const today = hotelToday(); const next = new Date(`${today}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  const input = { checkIn: String(raw.checkIn || today), checkOut: String(raw.checkOut || next.toISOString().slice(0,10)), guests: Number(raw.guests) || 2 };
  const parsed = searchSchema.safeParse(input);
  let rooms: Awaited<ReturnType<typeof getAvailability>>=[];let availabilityError:string|undefined;if(parsed.success){try{rooms=await getAvailability(parsed.data)}catch(error){const code=error instanceof Error?error.message.match(/\(([^)]+)\)$/)?.[1]:undefined;console.error("Availability lookup failed",{code:code??"unknown"});availabilityError="Live availability is temporarily unavailable. Please try your search again."}}
  const details = (roomType: string) => `/booking/details?${new URLSearchParams({ roomType, checkIn: input.checkIn, checkOut: input.checkOut, guests: String(input.guests) })}`;
  return <><section className="customer-page-title"><p className="eyebrow">Reserve your stay</p><h1>Find a Room</h1><p>Plan your next Haven stay. Live availability from Haven&apos;s room inventory.</p></section><BookingSearchForm compact action={FIND_ROOM_PATH} initial={input}/><RoomResults rooms={rooms} error={availabilityError??(parsed.success?undefined:parsed.error.issues[0]?.message)} hrefFor={details}/></>;
}
