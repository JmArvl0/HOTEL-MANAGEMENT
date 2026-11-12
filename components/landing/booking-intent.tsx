"use client";
import Link from "next/link";
import Image from "next/image";
import { createContext, useContext, useState, type ReactNode } from "react";
import { ArrowRight, Expand } from "lucide-react";
import { BookingSearchForm } from "@/components/booking/booking-search-form";
import { RoomPhotoFigure, RoomPhotoLightbox } from "@/components/booking/room-photo-lightbox";
import { roomPhotosFor, roomPhotoNeedsDirectUrl } from "@/lib/room-images";

/** Landing booking intent: the hero form's live values, shared with the Featured Stays
 *  cards so a guest who picked dates and then clicks a room keeps them (TEST D).
 *  ponytail: one producer + one consumer; lift to a store if more surfaces need it. */

export type BookingIntent = { checkIn: string; checkOut: string; guests: number };

const BookingIntentContext = createContext<{ intent: BookingIntent | null; setIntent: (intent: BookingIntent) => void }>({
  intent: null,
  setIntent: () => { },
});

export function BookingIntentProvider({ children }: { children: ReactNode }) {
  const [intent, setIntent] = useState<BookingIntent | null>(null);
  return <BookingIntentContext.Provider value={{ intent, setIntent }}>{children}</BookingIntentContext.Provider>;
}

/** Hero search form wired to the intent context. Dates start empty — the guest's own choice. */
export function HeroBookingForm({ maxGuests, timeZone }: { maxGuests?: number; timeZone?: string }) {
  const { setIntent } = useContext(BookingIntentContext);
  return <BookingSearchForm hero emptyDates onIntentChange={setIntent} maxGuests={maxGuests} timeZone={timeZone} />;
}

export type FeaturedRoom = {
  id: string; name: string; max_guests: number; beds: string;
  base_rate: number | string; photo_urls: string[] | null;
  description: string; size_sqm: number | null; amenities: unknown;
};

/** Every active catalog type is visible in the grid. Room links retain the hero's
 * dates/guests; the shared photo viewer never navigates away from that intent. */
export function FeaturedStays({ rooms }: { rooms: FeaturedRoom[] }) {
  const { intent } = useContext(BookingIntentContext);
  return <div className="coast-room-grid" role="region" aria-label="Featured stays" tabIndex={0}>{rooms.map((room) => {
    const params = new URLSearchParams({ roomType: room.name });
    if (intent?.checkIn && intent?.checkOut) {
      params.set("checkIn", intent.checkIn);
      params.set("checkOut", intent.checkOut);
      params.set("guests", String(intent.guests));
    }
    const href = `/booking/rooms/${encodeURIComponent(room.name)}?${params.toString()}`;
    return <FeaturedStayCard room={room} href={href} key={room.id} />;
  })}</div>;
}

// Cover crops can scale a landscape source wider than the visible photo panel.
const roomCoverSizes = "(max-width: 480px) calc(140vw - 56px), (max-width: 900px) 640px, 720px";

function FeaturedStayCard({ room, href }: { room: FeaturedRoom; href: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const photos = roomPhotosFor(Array.isArray(room.photo_urls) ? room.photo_urls : undefined, room.name)
    .filter((photo) => !failed.has(photo));
  const index = Math.max(0, photos.indexOf(selected ?? ""));
  const src = photos[index];
  const highlights = Array.isArray(room.amenities)
    ? room.amenities.filter((value): value is string => typeof value === "string" && value.trim().length > 0).slice(0, 4)
    : [];
  const onPhotoError = (photo: string) => setFailed((previous) => new Set(previous).add(photo));

  return <article className="coast-room">
    {src ? <RoomPhotoFigure photos={photos} roomName={room.name} index={index} onOpen={setLightbox}
      className="coast-room-photo" label={`Open ${room.name} photo gallery`}>
      <Image
        src={src}
        alt={`${room.name} — room photo ${index + 1}`}
        fill
        sizes={roomCoverSizes}
        quality={85}
        unoptimized={roomPhotoNeedsDirectUrl(src)}
        onError={() => onPhotoError(src)}
      />
      <span className="coast-room-photo-hint"><Expand size={12} aria-hidden="true" /> View full photo</span>
    </RoomPhotoFigure> : <div className="coast-room-photo coast-room-photo-empty"><span>Room photos are currently unavailable.</span></div>}
    <div className="coast-room-copy">
      <h3 className="room-title"><Link href={href}>{room.name}</Link></h3>
      <p className="coast-room-facts">{room.beds}{room.size_sqm ? ` · ${room.size_sqm} m²` : ""} · Up to {room.max_guests} guests</p>
      <p className="coast-room-description">{room.description}</p>
      {highlights.length > 0 && <ul className="coast-room-highlights" aria-label={`${room.name} highlights`}>{highlights.map((highlight, i) => <li key={`${highlight}-${i}`}>{highlight}</li>)}</ul>}
      {photos.length > 1 && <div className="coast-room-thumbs" role="group" aria-label={`${room.name} photos`}>
        {photos.slice(0, 3).map((photo, i) => <button key={photo} type="button" aria-label={`View photo ${i + 1} of ${room.name}`}
          aria-pressed={index === i} onClick={() => setSelected(photo)}>
          <Image src={photo} alt="" width={88} height={60} sizes="(min-width: 701px) and (max-width: 900px) 130px, 100px" unoptimized={roomPhotoNeedsDirectUrl(photo)} onError={() => onPhotoError(photo)} />
          {i === 2 && photos.length > 3 && <span>+{photos.length - 3}</span>}
        </button>)}
      </div>}
      <div className="coast-room-price-row"><span className="coast-room-price">From <strong>{new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number(room.base_rate))}</strong><small>per night</small></span>
        <Link href={href} className="coast-room-action" aria-label={`Choose ${room.name} type`}>Choose this type <ArrowRight size={16} aria-hidden="true" /></Link>
      </div>
    </div>
    <RoomPhotoLightbox photos={photos} roomName={room.name} index={lightbox} onClose={() => setLightbox(null)}
      onIndexChange={(next) => { setSelected(photos[next]); setLightbox(next); }} />
  </article>;
}
