import Link from "next/link";
import { ArrowRight, BedDouble, Check, Users } from "lucide-react";
import { formatPeso } from "@/lib/format";
import { type AvailableRoomType } from "@/lib/booking";

/** Availability results shared by the public search page and the portal Find a Room module. */
export function RoomResults({ rooms, error, hrefFor }: { rooms: AvailableRoomType[]; error?: string; hrefFor: (roomType: string) => string }) {
  if (error) return <div className="booking-empty"><h2>Check your stay details</h2><p>{error}</p></div>;
  if (rooms.length === 0) return <div className="booking-empty"><BedDouble/><h2>No rooms available</h2><p>Try different dates or fewer guests. Your search details have been preserved.</p></div>;
  return <div className="availability-grid">{rooms.map((room, index) => <article className={`available-room room-${(index % 3) + 1}`} key={room.id}><div className="available-room-image"><span>{room.availableUnits} available</span></div><div className="available-room-copy"><p className="eyebrow">Rooms & suites</p><h2>{room.name}</h2><p>{room.description}</p><div className="room-facts"><span><Users size={15}/>Up to {room.maxGuests}</span><span><BedDouble size={15}/>{room.beds}</span>{room.sizeSqm&&<span>{room.sizeSqm} m²</span>}</div><ul>{room.amenities.slice(0,4).map((amenity) => <li key={amenity}><Check size={13}/>{amenity}</li>)}</ul><div className="room-rate"><span><small>{room.nights} night{room.nights!==1?"s":""}</small><strong>{formatPeso(room.nightlyRate)}</strong> / night<br/><em>{formatPeso(room.subtotal)} estimated total</em></span><div><Link className="btn btn-soft" href={`${hrefFor(room.name)}#details`}>View details</Link><Link className="btn btn-accent" href={hrefFor(room.name)}>Select room <ArrowRight size={16}/></Link></div></div></div></article>)}</div>;
}
