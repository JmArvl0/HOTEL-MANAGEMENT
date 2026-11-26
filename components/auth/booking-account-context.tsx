import { ArrowRight, BedDouble, CalendarDays, Info, Pencil, Tag, UsersRound } from "lucide-react";
import Link from "next/link";
import { calculateNights, getBookingTimezone, getRoomCatalog, getRoomType, hotelToday, searchSchemaFor } from "@/lib/booking";
import { breakfastOfferId } from "@/lib/breakfast";
import { getBreakfastChoice } from "@/lib/breakfast-server";
import { formatStayRange } from "@/lib/customer";
import { getExactRooms } from "@/lib/exact-rooms";
import { formatPeso } from "@/lib/format";
import { roomPhotosFor } from "@/lib/room-images";
import { BookingAccountPhotos } from "./booking-account-photos";

export async function bookingAccountContext(callback: string) {
  const url = new URL(callback, "http://localhost");
  if (url.pathname !== "/booking/details") return null;

  const type = url.searchParams.get("roomType");
  const id = url.searchParams.get("roomId");
  if (!type || !id) return null;
  const stay = searchSchemaFor(hotelToday(await getBookingTimezone())).safeParse(Object.fromEntries(url.searchParams));
  if (!stay.success) return null;

  const room = (await getRoomCatalog()).find(entry => entry.name === type);
  if (!room) return null;

  const [rooms, priced] = await Promise.all([getExactRooms(type, stay.data), getRoomType(type, stay.data)]);
  const selected = rooms.find(entry => entry.id === id);
  if (!selected) return null;

  const { checkIn, checkOut, guests } = stay.data;
  const offer = breakfastOfferId.safeParse(url.searchParams.get("breakfast")).data;
  const breakfast = offer && priced
    ? await getBreakfastChoice(room.id, checkIn, checkOut, guests, priced.subtotal).catch(() => null)
    : null;
  const breakfastTotal = breakfast && breakfast.id === offer ? breakfast.total : null;
  const total = breakfastTotal ?? priced?.subtotal;
  const priceContext = breakfastTotal !== null ? " with breakfast" : offer ? " · room only" : "";
  const nights = calculateNights(checkIn, checkOut);
  const nightLabel = `${nights} ${nights === 1 ? "night" : "nights"}`;
  const roomName = `${room.name} — Floor ${selected.floor}`;
  const photos = roomPhotosFor(room.photos.filter(photo => photo.trim()), room.name);
  const query = new URLSearchParams({ ...stay.data, guests: String(guests) });
  const changeRoom = `/booking/rooms/${encodeURIComponent(type)}?${query}`;

  return (
    <article className="booking-account-context" aria-label="Selected stay">
      <BookingAccountPhotos key={room.id} photos={photos} roomName={room.name} />
      <div className="booking-account-body">
        <h2 className="booking-account-title">Reservation Summary</h2>

        <dl className="booking-account-facts">
          <div>
            <dt><CalendarDays className="booking-account-detail-icon" aria-hidden="true" /> Dates</dt>
            <dd><strong>{formatStayRange(checkIn, checkOut)}</strong><span>{nightLabel}</span></dd>
          </div>
          <div>
            <dt><UsersRound className="booking-account-detail-icon" aria-hidden="true" /> Guests</dt>
            <dd><strong>{guests} {guests === 1 ? "guest" : "guests"}</strong></dd>
          </div>
        </dl>

        <div className="booking-account-room">
          <BedDouble className="booking-account-detail-icon" aria-hidden="true" />
          <div>
            <span className="booking-account-label">Room</span>
            <h3>{roomName}</h3>
            {room.description && <p>{room.description}</p>}
          </div>
        </div>

        {total !== undefined && (
          <dl className="booking-account-rate">
            <dt><Tag className="booking-account-detail-icon" aria-hidden="true" /> Estimated Total</dt>
            <dd><strong>{formatPeso(total)}</strong><span>for {nightLabel}{priceContext}</span></dd>
          </dl>
        )}
        <Link className="booking-account-change" href={changeRoom}>
          <Pencil size={18} aria-hidden="true" /> Change room or dates <ArrowRight size={19} aria-hidden="true" />
        </Link>
        <p className="booking-account-hold"><Info size={18} aria-hidden="true" /> Your room hold begins after you submit guest details.</p>
      </div>
    </article>
  );
}
