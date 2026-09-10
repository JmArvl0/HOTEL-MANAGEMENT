import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BedDouble, Check, Users } from "lucide-react";
import { formatPeso } from "@/lib/format";
import { type AvailableRoomType, type RoomTypeSummary } from "@/lib/booking";
import { RoomDetailsButton } from "@/components/booking/room-details";
import { roomPrimary } from "@/lib/room-images";

/** Availability results shared by the public search page and the portal Find a Room module.
 *  Summary rooms (no `availableUnits`) render as browse cards: catalog rate, no fabricated
 *  availability — the CTA sends the guest to the date form instead of /booking/details. */
export function RoomResults({
  rooms,
  error,
  hrefFor,
  focusRoomType,
}: {
  rooms: (AvailableRoomType | RoomTypeSummary)[];
  error?: string;
  hrefFor: (roomType: string) => string;
  focusRoomType?: string;
}) {
  if (error) return <div className="booking-empty"><h2>Check your stay details</h2><p>{error}</p></div>;
  if (rooms.length === 0) return <div className="booking-empty"><BedDouble/><h2>No rooms available</h2><p>Try different dates or fewer guests. Your search details have been preserved.</p></div>;
  return <div className="availability-grid">{rooms.map((room, index) => {
    const priced = "availableUnits" in room;
    const photo = roomPrimary(room.photos, room.name);
    const focused = focusRoomType === room.name;
    return <article
      className={`available-room room-${(index % 3) + 1}${focused ? " is-focused" : ""}`}
      key={room.id}
      data-room-type={room.name}
    >
      <div className={`available-room-image${photo ? " room-photo" : ""}`}>
        {photo ? <Image src={photo} alt={`${room.name} room`} fill sizes="(max-width: 760px) 100vw, 420px" /> : null}
        <span className="room-availability-chip">{priced ? `${room.availableUnits} available` : "Check dates"}</span>
        {room.photos.length > 1 ? <small className="room-photo-count">{room.photos.length} photos</small> : null}
      </div>
      <div className="available-room-copy">
        {focused && <p className="room-focus-chip">Selected from homepage</p>}
        <h2>{room.name}</h2>
        <p>{room.description}</p>
        <div className="room-facts"><span><Users size={15}/>Up to {room.maxGuests}</span><span><BedDouble size={15}/>{room.beds}</span>{room.sizeSqm && <span>{room.sizeSqm} m²</span>}</div>
        <ul>{room.amenities.slice(0, 4).map((amenity) => <li key={amenity}><Check size={13}/>{amenity}</li>)}</ul>
        <div className="room-rate">
          {priced ? (
            <span><small>{room.nights} night{room.nights !== 1 ? "s" : ""}</small><strong>{formatPeso(room.nightlyRate)}</strong> / night<br/><em>{formatPeso(room.subtotal)} estimated total</em></span>
          ) : (
            <span><small>From</small><strong>{formatPeso(room.nightlyRate)}</strong> / night</span>
          )}
          <div className="room-actions">
            <RoomDetailsButton room={room} bookHref={hrefFor(room.name)} />
            {priced ? (
              <Link className="btn btn-accent" href={hrefFor(room.name)}>Select room <ArrowRight size={16} aria-hidden="true"/></Link>
            ) : (
              <Link className="btn btn-accent" href={hrefFor(room.name)}>Choose dates <ArrowRight size={16} aria-hidden="true"/></Link>
            )}
          </div>
        </div>
      </div>
    </article>;
  })}</div>;
}
