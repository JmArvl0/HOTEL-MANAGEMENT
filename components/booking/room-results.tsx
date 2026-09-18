import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BedDouble, Check, Ruler, Users } from "lucide-react";
import { formatPeso } from "@/lib/format";
import { type AvailableRoomType, type RoomTypeSummary } from "@/lib/booking";
import { RoomDetailsButton } from "@/components/booking/room-details";
import { ChooseDatesButton } from "@/components/booking/choose-dates-button";
import { RoomPhotoTrigger } from "@/components/booking/room-photo-lightbox";
import { roomPhotosFor, roomPrimary } from "@/lib/room-images";

/** Max amenities shown on the card; overflow collapses to a "+N more" note. */
const CARD_AMENITY_LIMIT = 4;

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
    const soldOut = priced && room.availableUnits <= 0;
    const photo = roomPrimary(room.photos, room.name);
    const focused = focusRoomType === room.name;
    const extraAmenities = Math.max(0, room.amenities.length - CARD_AMENITY_LIMIT);
    return <article
      className={`available-room room-${(index % 3) + 1}${focused ? " is-focused" : ""}`}
      key={room.id}
      data-room-type={room.name}
    >
      <div className={`available-room-image${photo ? " room-photo" : ""}`}>
        {photo ? <Image src={photo} alt={`${room.name} room`} fill sizes="(max-width: 760px) 100vw, 420px" /> : null}
        {photo ? <RoomPhotoTrigger photos={roomPhotosFor(room.photos, room.name)} roomName={room.name} /> : null}
        <span className={`room-availability-chip${soldOut ? " is-off" : ""}`}>{priced ? (soldOut ? "Unavailable" : `${room.availableUnits} available`) : "Check dates"}</span>
        {room.photos.length > 1 ? <small className="room-photo-count">{room.photos.length} photos</small> : null}
      </div>
      <div className="available-room-copy">
        {focused && <p className="room-focus-chip">Selected from homepage</p>}
        <h2 className="room-title">{room.name}</h2>
        <p className="room-description">{room.description}</p>
        <div className="room-facts"><span><Users size={15} aria-hidden="true" />Up to {room.maxGuests}</span><span><BedDouble size={15} aria-hidden="true" />{room.beds}</span>{room.sizeSqm && <span><Ruler size={15} aria-hidden="true" />{room.sizeSqm} m²</span>}</div>
        <ul className="room-amenities" aria-label={`${room.name} amenities preview`}>{room.amenities.slice(0, CARD_AMENITY_LIMIT).map((amenity) => <li key={amenity}><Check size={13} aria-hidden="true" />{amenity}</li>)}{extraAmenities > 0 && <li className="room-amenities-more">+{extraAmenities} more</li>}</ul>
        <div className="room-rate">
          {priced ? (
            <span className="room-price"><small className="room-price-nights">{room.nights} night{room.nights !== 1 ? "s" : ""}</small><strong className="room-price-nightly">{formatPeso(room.nightlyRate)}</strong> / night<br /><em className="room-price-total">{formatPeso(room.subtotal)} estimated total</em></span>
          ) : (
            <span className="room-price"><small className="room-price-nights">From</small><strong className="room-price-nightly">{formatPeso(room.nightlyRate)}</strong> / night</span>
          )}
          <div className="room-actions">
            <RoomDetailsButton room={room} bookHref={hrefFor(room.name)} />
            {priced ? (
              soldOut ? (
                <button type="button" className="btn btn-accent" disabled>Unavailable</button>
              ) : (
                <Link className="btn btn-accent" href={hrefFor(room.name)}>Select room <ArrowRight size={16} aria-hidden="true"/></Link>
              )
            ) : (
              <ChooseDatesButton />
            )}
          </div>
        </div>
      </div>
    </article>;
  })}</div>;
}
