"use client";
import Image from "next/image";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { BookingSearchForm } from "@/components/booking/booking-search-form";
import { roomPrimary, SCENES } from "@/lib/room-images";

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
export function HeroBookingForm() {
  const { setIntent } = useContext(BookingIntentContext);
  return <BookingSearchForm emptyDates onIntentChange={setIntent} />;
}

export type FeaturedRoom = {
  id: string; name: string; max_guests: number; beds: string;
  base_rate: number | string; photo_urls: string[] | null;
};

/** Featured Stays scroll pane. Every active room type sits in one horizontal, snap-aligned
 *  track (.coast-room-grid stays the GSAP reveal unit); prev/next step one card, the progress
 *  rail mirrors scroll position. Room links carry the focused room type, plus the hero form's
 *  dates/guests once the guest has picked them — otherwise the search page opens in browse mode. */
export function FeaturedStays({ rooms }: { rooms: FeaturedRoom[] }) {
  const { intent } = useContext(BookingIntentContext);
  const trackRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: rooms.length <= 1, progress: 0, thumb: 1 });

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft >= max - 2,
      progress: max > 0 ? el.scrollLeft / max : 0,
      thumb: el.scrollWidth > 0 ? Math.min(1, el.clientWidth / el.scrollWidth) : 1,
    });
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, [sync]);

  const step = (dir: 1 | -1) => {
    const el = trackRef.current;
    const card = el?.querySelector<HTMLElement>(".coast-room");
    if (!el || !card) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    el.scrollBy({ left: dir * (card.offsetWidth + gap), behavior: "smooth" });
  };

  const scrollable = !(edges.start && edges.end);

  return <div className="coast-room-pane" data-scrollable={scrollable || undefined} data-at-end={edges.end || undefined}>
    <div ref={trackRef} className="coast-room-grid" role="region" aria-label="Featured stays" tabIndex={0} onScroll={sync}>{rooms.map((room) => {
    const params = new URLSearchParams({ roomType: room.name });
    if (intent?.checkIn && intent?.checkOut) {
      params.set("checkIn", intent.checkIn);
      params.set("checkOut", intent.checkOut);
      params.set("guests", String(intent.guests));
    }
    const href = `/booking/search?${params.toString()}`;
    return <article className="coast-room" key={room.id}>
      <Link href={href} className="coast-room-photo" aria-label={"Explore " + room.name}><Image src={roomPrimary(Array.isArray(room.photo_urls) ? room.photo_urls : undefined, room.name) ?? SCENES.story} alt={room.name} fill sizes="(max-width: 600px) 100vw, (max-width: 1000px) 50vw, 25vw" /></Link>
      <div className="coast-room-copy"><h3 className="room-title"><Link href={href}>{room.name}</Link></h3><p>{room.beds} · Up to {room.max_guests} guests</p><div><span>From <strong>{new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number(room.base_rate))}</strong> / night</span><Link href={href} className="coast-arrow" aria-label={"View " + room.name + " rooms"}><ArrowRight size={18} /></Link></div></div>
    </article>;
  })}</div>
    {scrollable && <div className="coast-room-controls">
      <div className="coast-room-rail" aria-hidden="true"><span style={{ width: `${edges.thumb * 100}%`, left: `${edges.progress * (1 - edges.thumb) * 100}%` }} /></div>
      <button type="button" className="coast-room-nav" onClick={() => step(-1)} disabled={edges.start} aria-label="Previous stays"><ArrowLeft size={18} /></button>
      <button type="button" className="coast-room-nav" onClick={() => step(1)} disabled={edges.end} aria-label="Next stays"><ArrowRight size={18} /></button>
    </div>}
  </div>;
}
