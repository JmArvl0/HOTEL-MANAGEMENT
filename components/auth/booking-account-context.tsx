import { ArrowUpRight, CalendarDays, UsersRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { getRoomCatalog, getRoomType, searchSchema } from "@/lib/booking";
import { formatStayRange } from "@/lib/customer";
import { getExactRooms } from "@/lib/exact-rooms";
import { formatPeso } from "@/lib/format";
import { roomPhotosFor, roomPhotoNeedsDirectUrl } from "@/lib/room-images";

export async function bookingAccountContext(callback: string) {
  const url = new URL(callback, "http://localhost");
  if (url.pathname !== "/booking/details") return null;

  const stay = searchSchema.safeParse(Object.fromEntries(url.searchParams));
  const type = url.searchParams.get("roomType");
  const id = url.searchParams.get("roomId");
  if (!stay.success || !type || !id) return null;

  const room = (await getRoomCatalog()).find(entry => entry.name === type);
  if (!room) return null;

  const selected = (await getExactRooms(type, stay.data)).find(entry => entry.id === id);
  if (!selected) return null;

  const priced = await getRoomType(type, stay.data);
  const photo = roomPhotosFor(room.photos, type)[0];
  const image = photo || "/hotel-hero.png";
  const { checkIn, checkOut, guests } = stay.data;
  const query = new URLSearchParams({ ...stay.data, guests: String(guests) });
  const changeRoom = `/booking/rooms/${encodeURIComponent(type)}?${query}`;

  return (
    <article className="booking-account-context" aria-label="Selected stay">
      <Image className="booking-account-photo" src={image}
        alt={photo ? `${type} representative room photo` : ""}
        width={700} height={440} sizes="(max-width: 900px) 72px, (max-width: 1180px) 48vw, 540px"
        unoptimized={roomPhotoNeedsDirectUrl(image)} />
      <div className="booking-account-room">
        <h2>{type}</h2>
        <p>Room {selected.number} · Floor {selected.floor}</p>
      </div>
      <ul className="booking-account-facts" aria-label="Stay dates and guests">
        <li><CalendarDays size={17} aria-hidden="true" /> {formatStayRange(checkIn, checkOut)}</li>
        <li><UsersRound size={17} aria-hidden="true" /> {guests} {guests === 1 ? "guest" : "guests"}</li>
      </ul>
      <div className="booking-account-stay">
        {priced && <dl className="booking-account-rate">
          <dt>Estimated total <span>for {priced.nights} {priced.nights === 1 ? "night" : "nights"}</span></dt>
          <dd>{formatPeso(priced.subtotal)}</dd>
        </dl>}
        <Link href={changeRoom}>
          Change room or dates <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </div>
      <p className="booking-account-hold">Your room hold begins after you submit guest details.</p>
    </article>
  );
}
