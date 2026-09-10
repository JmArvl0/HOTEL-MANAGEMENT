"use client";
import Image from "next/image";
import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { BookingSearchForm } from "@/components/booking/booking-search-form";
import { roomPrimary, SCENES } from "@/lib/room-images";

/** Landing booking intent: the hero form's live values, shared with the Featured Stays
 *  cards so a guest who picked dates and then clicks a room keeps them (TEST D).
 *  ponytail: one producer + one consumer; lift to a store if more surfaces need it. */

export type BookingIntent = { checkIn: string; checkOut: string; guests: number };

const BookingIntentContext = createContext<{ intent: BookingIntent | null; setIntent: (intent: BookingIntent) => void }>({
  intent: null,
  setIntent: () => {},
});

export function BookingIntentProvider({ children }: { children: ReactNode }) {
  const [intent, setIntent] = useState<BookingIntent | null>(null);
  return <BookingIntentContext.Provider value={{ intent, setIntent }}>{children}</BookingIntentContext.Provider>;
}

/** Hero search form wired to the intent context. Dates start empty — the guest's own choice. */
export function HeroBookingForm() {
  const { setIntent } = useContext(BookingIntentContext);
  return <BookingSearchForm emptyDates onIntentChange={setIntent} />;
}

export type FeaturedRoom = {
  id: string; name: string; max_guests: number; beds: string;
  base_rate: number | string; photo_urls: string[] | null;
};

/** Featured Stays grid. Room links carry the focused room type, plus the hero form's
 *  dates/guests once the guest has picked them — otherwise the search page opens in browse mode. */
export function FeaturedStays({ rooms }: { rooms: FeaturedRoom[] }) {
  const { intent } = useContext(BookingIntentContext);
  return <div className="coast-room-grid">{rooms.slice(0, 4).map((room) => {
    const params = new URLSearchParams({ roomType: room.name });
    if (intent?.checkIn && intent?.checkOut) {
      params.set("checkIn", intent.checkIn);
      params.set("checkOut", intent.checkOut);
      params.set("guests", String(intent.guests));
    }
    const href = `/booking/search?${params.toString()}`;
    return <article className="coast-room" key={room.id}>
      <Link href={href} className="coast-room-photo" aria-label={"Explore " + room.name}><Image src={roomPrimary(Array.isArray(room.photo_urls) ? room.photo_urls : undefined, room.name) ?? SCENES.story} alt={room.name} fill sizes="(max-width: 600px) 100vw, (max-width: 1000px) 50vw, 25vw"/></Link>
      <div className="coast-room-copy"><h3><Link href={href}>{room.name}</Link></h3><p>{room.beds} · Up to {room.max_guests} guests</p><div><span>From <strong>{new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number(room.base_rate))}</strong> / night</span><Link href={href} className="coast-arrow" aria-label={"View " + room.name + " rooms"}><ArrowRight size={18}/></Link></div></div>
    </article>;
  })}</div>;
}
