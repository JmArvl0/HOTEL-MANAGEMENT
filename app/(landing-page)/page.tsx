import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  Car,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  ConciergeBell,
  Dumbbell,
  Mail,
  MapPin,
  ParkingCircle,
  Phone,
  Plane,
  Shirt,
  Signal,
  Sparkles,
  UtensilsCrossed,
  Waves,
} from "lucide-react";
import { BookingSearchForm } from "@/components/booking/booking-search-form";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingMotion } from "@/components/landing/landing-motion";
import { roomPhotosFor, roomPrimary, SCENES } from "@/lib/room-images";
import { supabase } from "@/lib/supabase";
import "./landing.css";

type LandingRoom = { id: string; name: string; guests: number; beds: string; price: string; photos: string[] };

// Demo-safe fallback: what visitors see when Supabase is unconfigured or the
// catalog is empty. The live rows below always win when data exists.
const fallbackRooms: LandingRoom[] = [
  { id: "garden-twin", name: "Garden Twin", guests: 2, beds: "2 twin beds", price: "₱5,800", photos: [] },
  { id: "deluxe-king", name: "Deluxe King", guests: 2, beds: "1 king bed", price: "₱6,400", photos: [] },
  { id: "ocean-suite", name: "Ocean Suite", guests: 3, beds: "king bed + lounge", price: "₱8,900", photos: [] },
];

const peso = (value: unknown) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number(value || 0));

async function loadRooms(): Promise<LandingRoom[]> {
  if (!supabase) return fallbackRooms;
  const { data } = await supabase
    .from("room_types")
    .select("id,name,max_guests,beds,base_rate,photo_urls")
    .eq("active", true)
    .order("base_rate", { ascending: true });
  if (!data?.length) return fallbackRooms;
  return data.map((type) => {
    const photos = roomPhotosFor(Array.isArray(type.photo_urls) ? type.photo_urls : undefined, String(type.name));
    return {
      id: String(type.id),
      name: String(type.name),
      guests: Number(type.max_guests) || 1,
      beds: String(type.beds),
      price: peso(type.base_rate),
      photos,
    };
  });
}

// Rates come from the live catalog; a short revalidation keeps them fresh
// without making the landing page render per visitor.
export const revalidate = 300;

const amenities = [
  { name: "Swimming pool", icon: Waves, note: "Poolside towels and all-day access." },
  { name: "Restaurant", icon: UtensilsCrossed, note: "Breakfast and dining on site." },
  { name: "Hotel Wi-Fi", icon: Signal, note: "Available throughout the hotel." },
  { name: "Parking", icon: ParkingCircle, note: "On-site, subject to availability." },
  { name: "Fitness center", icon: Dumbbell, note: "Open daily for guests." },
  { name: "Room service", icon: ConciergeBell, note: "Assistance whenever you need it." },
  { name: "Airport transfer", icon: Plane, note: "Requestable in advance." },
  { name: "Laundry", icon: Shirt, note: "Same-day service on request." },
];

const facts = [
  "Check-in begins at 3:00 PM",
  "Check-out is by 12:00 PM",
  "Front Desk assistance is available 24 hours",
  "Wi-Fi is available throughout the hotel",
  "Parking and transfers are subject to availability",
  "Cancellation requests are reviewed under your booked terms",
];

const faqs = [
  {
    q: "Can I change my reservation?",
    a: "Contact Front Desk with your confirmation number. Changes depend on availability and your booking terms.",
  },
  {
    q: "When do I pay?",
    a: "Online bookings currently use a pay-at-hotel guarantee. Your final folio is settled with Front Desk.",
  },
  {
    q: "Are children welcome?",
    a: "Yes. Include every staying guest in your search so we can show suitable room types.",
  },
  {
    q: "Is parking available?",
    a: "Parking is listed as a hotel amenity but remains subject to availability. Contact the hotel before arrival.",
  },
];

const experienceScenes = [
  {
    label: "Morning",
    heading: "Slow starts.",
    text: "Warm light and breakfast when you're ready — no rush, no queue.",
    image: SCENES.morning,
    alt: "Morning breakfast spread in warm light at Haven",
  },
  {
    label: "Afternoon",
    heading: "Space to disappear for a while.",
    text: "The pool, the shade, or a quiet corner with nowhere to be.",
    image: SCENES.afternoon,
    alt: "Poolside afternoon at Haven",
  },
  {
    label: "Evening",
    heading: "Come back to somewhere quiet.",
    text: "A prepared room, a calm close to the day, and Front Desk within reach all night.",
    image: SCENES.evening,
    alt: "A calm guest room in the evening at Haven",
  },
];

const trustPoints = [
  { icon: BedDouble, title: "Direct booking", text: "Reserve with the hotel itself — no third-party middlemen." },
  { icon: Check, title: "Transparent rates", text: "Nightly base rates come straight from our live catalog." },
  { icon: ConciergeBell, title: "24-hour Front Desk", text: "Guest care and arrival assistance at any hour." },
  { icon: Clock3, title: "Real-time availability", text: "Search shows live inventory for your dates and guests." },
  { icon: Sparkles, title: "Prepared rooms", text: "Room readiness is checked before your arrival." },
];

const galleryCaptions = [
  "Pool & grounds",
  "Suites",
  "Dining",
  "Bath & details",
  "Seabreeze",
  "Lobby",
];

// Stagger helper: reveal delay as a CSS custom property consumed by landing.css
const rd = (ms: number) => ({ "--rd": `${ms}ms` }) as CSSProperties;
const wi = (i: number) => ({ "--i": i }) as CSSProperties;

export default async function LandingPage() {
  const rooms = await loadRooms();
  return (
    <LandingMotion>
      <main className="landing">
        <LandingNav />

        {/* 01 — Cinematic hero */}
        <section className="hero" aria-label="Haven hero">
          <div className="hero-media" aria-hidden="true">
            <Image
              src="/hotel-hero.png"
              alt=""
              fill
              priority
              sizes="100vw"
              className="hero-image"
            />
          </div>
          <div className="hero-shade" aria-hidden="true" />
          <div className="hero-content">
            <h1 data-reveal="words" aria-label="Stay somewhere unforgettable.">
              <span className="rw">
                <span className="rwi" style={wi(0)}>
                  Stay
                </span>
              </span>{" "}
              <span className="rw">
                <span className="rwi" style={wi(1)}>
                  somewhere
                </span>
              </span>
              <br />
              <span className="rw">
                <span className="rwi" style={wi(2)}>
                  <em>unforgettable.</em>
                </span>
              </span>
            </h1>
            <p className="hero-sub" data-reveal="up" style={rd(480)}>
              Quiet luxury, thoughtful service, and moments that feel entirely your own.
            </p>
            <div className="hero-actions" data-reveal="up" style={rd(620)}>
              <Link href="/booking/search" className="btn btn-cream">
                Find your room <ArrowRight size={17} aria-hidden="true" />
              </Link>
              <a href="#book" className="btn btn-outline-light">
                Check dates
              </a>
            </div>
          </div>
          <a href="#story" className="hero-scroll-cue" aria-label="Scroll to explore Haven">
            <ChevronDown size={18} aria-hidden="true" />
          </a>
          <div id="book">
            <BookingSearchForm />
          </div>
        </section>

        {/* 02 — Brand story */}
        <section className="story-section" id="story" aria-labelledby="story-heading">
          <div className="story-copy">
            <h2 id="story-heading" data-reveal="up">
              A slower kind
              <br />
              <em>of stay.</em>
            </h2>
            <p data-reveal="up" style={rd(140)}>
              Haven is a small hotel on Mactan Bay built around one idea: that the best
              trips feel unhurried. Rooms prepared with care, service that answers when
              you call, and a setting that asks nothing of you.
            </p>
          </div>
          <div className="story-media" data-reveal="clip">
            <Image
              src={SCENES.story}
              alt="Haven's tropical architecture in warm daylight"
              fill
              sizes="(max-width: 900px) 92vw, 44vw"
              className="story-image"
            />
          </div>
        </section>

        {/* 03 — Rooms & Suites, editorial alternating rows */}
        <section className="rooms-section" id="stay" aria-labelledby="rooms-heading">
          <div className="section-heading" data-reveal="up">
            <h2 id="rooms-heading">Rooms &amp; Suites</h2>
            <Link href="/booking/search" className="section-link">
              Check live availability <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          {rooms.map((room, index) => {
            const primary = room.photos[0] ?? roomPrimary(undefined, room.name);
            return (
              <article
                className={`room-row ${index % 2 === 1 ? "room-row-alt" : ""}`}
                key={room.id}
                aria-label={room.name}
              >
                <div className="room-row-media" data-reveal="clip">
                  {primary ? (
                    <Image
                      src={primary}
                      alt={`${room.name} — ${room.beds}`}
                      fill
                      sizes="(max-width: 900px) 92vw, 52vw"
                      className="room-row-image"
                    />
                  ) : null}
                </div>
                <div className="room-row-content">
                  <p className="room-row-label" data-reveal="up">
                    {String(index + 1).padStart(2, "0")} · {room.guests} guest{room.guests > 1 ? "s" : ""}
                  </p>
                  <h3 data-reveal="up" style={rd(90)}>
                    {room.name}
                  </h3>
                  <p className="room-row-beds" data-reveal="up" style={rd(150)}>
                    {room.beds}
                  </p>
                  <p className="room-row-rate" data-reveal="up" style={rd(210)}>
                    From <strong>{room.price}</strong> / night
                  </p>
                  <div className="room-row-actions" data-reveal="up" style={rd(270)}>
                    <Link
                      href={`/booking/search?roomType=${encodeURIComponent(room.name)}`}
                      className="btn btn-forest"
                      aria-label={`Check availability for ${room.name} — opens live inventory filtered to ${room.name}`}
                    >
                      Explore room <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                    <a href="#book" className="room-row-quick">
                      Check dates
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
          <p className="rooms-footnote" data-reveal="up">
            Nightly base rates from our live catalog — availability updates with your dates and guests.
          </p>
        </section>

        {/* 04 — The Haven Experience, time-of-day scenes */}
        <section className="experience-section" id="experience" aria-labelledby="experience-heading">
          <div className="experience-copy">
            <h2 id="experience-heading" data-reveal="up">
              A day at
              <br />
              <em>Haven.</em>
            </h2>
            <p data-reveal="up" style={rd(140)}>
              From the first coffee to the last quiet hour, the day moves at your pace.
            </p>
          </div>
          <div className="experience-scenes">
            {experienceScenes.map((scene, index) => (
              <article className="experience-scene" key={scene.label} data-reveal="up" style={rd(index * 120)}>
                <div className="experience-scene-media">
                  <Image
                    src={scene.image}
                    alt={scene.alt}
                    fill
                    sizes="(max-width: 900px) 92vw, 30vw"
                    className="experience-scene-image"
                  />
                </div>
                <div className="experience-scene-copy">
                  <p className="experience-scene-label">{scene.label}</p>
                  <h3>{scene.heading}</h3>
                  <p>{scene.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* 05 — Amenities, typographic list */}
        <section className="amenities-section" id="amenities" aria-labelledby="amenities-heading">
          <div className="section-heading" data-reveal="up">
            <h2 id="amenities-heading">Everything for an effortless stay.</h2>
          </div>
          <ul className="amenities-list">
            {amenities.map(({ name, icon: Icon, note }, index) => (
              <li key={name} data-reveal="up" style={rd((index % 4) * 70)}>
                <span className="amenity-name">{name}</span>
                <span className="amenity-note">
                  <Icon aria-hidden="true" /> {note}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* 06 — Gallery mosaic */}
        <section className="gallery-section" id="gallery" aria-labelledby="gallery-heading">
          <div className="section-heading" data-reveal="up">
            <h2 id="gallery-heading">Spaces made for slowing down.</h2>
          </div>
          <div className="gallery-grid">
            {SCENES.gallery.map((src, index) => (
              <figure
                key={src}
                className={`gallery-tile gallery-tile-${index + 1}`}
                data-reveal={index % 2 === 0 ? "clip" : "up"}
                style={rd(index * 90)}
              >
                <Image
                  src={src}
                  alt={`Haven ${galleryCaptions[index].toLowerCase()}`}
                  fill
                  sizes="(max-width: 680px) 100vw, (max-width: 1024px) 50vw, 33vw"
                />
                <figcaption>{galleryCaptions[index]}</figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* 07 — Why Haven / trust */}
        <section className="trust-section" id="about" aria-labelledby="trust-heading">
          <div className="trust-copy">
            <h2 id="trust-heading" data-reveal="up">
              Why book
              <br />
              <em>directly with us.</em>
            </h2>
          </div>
          <ul className="trust-list">
            {trustPoints.map(({ icon: Icon, title, text }, index) => (
              <li key={title} data-reveal="up" style={rd((index % 3) * 90)}>
                <Icon aria-hidden="true" />
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 08 — Plan your stay */}
        <section className="plan-section" aria-labelledby="plan-heading">
          <div className="plan-copy" data-reveal="up">
            <h2 id="plan-heading">Plan your stay.</h2>
            <p>Live availability, real rates, and a booking that takes about a minute.</p>
          </div>
          <div data-reveal="up" style={rd(140)}>
            <BookingSearchForm />
          </div>
          <p className="plan-note" data-reveal="up" style={rd(220)}>
            Payment is settled with Front Desk at the hotel.
          </p>
        </section>

        {/* 09 — Location & arrival */}
        <section className="location-section" id="location" data-reveal="up" aria-labelledby="location-heading">
          <div className="location-grid">
            {/* LEFT COLUMN: editorial copy + contact */}
            <div className="location-left">
              <h2 id="location-heading">
                Meet us at <em>Haven.</em>
              </h2>
              <address className="location-address">
                <strong>Haven Hotel &amp; Residences</strong>
                <br />
                128 Seabreeze Avenue, Mactan Bay
                <br />
                Lapu-Lapu City, Cebu 6015 · Philippines
              </address>
              <div className="location-contact">
                <a href="tel:+63324001234" className="location-link">
                  <Phone size={14} aria-hidden="true" /> +63 32 400 1234
                </a>
                <a href="mailto:hello@haven-hotel.ph" className="location-link">
                  <Mail size={14} aria-hidden="true" /> hello@haven-hotel.ph
                </a>
                <a
                  href="https://maps.google.com/?q=Mactan+Bay+Cebu"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="location-link"
                >
                  <MapPin size={14} aria-hidden="true" /> Open in Maps
                </a>
              </div>
            </div>

            {/* RIGHT COLUMN: property image + reservation support */}
            <div className="location-right">
              <div className="location-media">
                <Image
                  src={SCENES.location}
                  alt="Haven's coastal property on Mactan Bay"
                  fill
                  sizes="(max-width: 900px) 92vw, 44vw"
                  className="location-image"
                />
              </div>
              <div className="location-support">
                <h3 className="location-support-heading">Need help with your reservation?</h3>
                <p className="location-support-desc">
                  For existing bookings, manage your stay through <Link href="/my-reservations">My reservations</Link> or contact our Front Desk for assistance.
                </p>
                <div className="location-support-actions">
                  <a href="tel:+63324001234" className="btn btn-accent">
                    <Phone size={16} aria-hidden="true" /> Call Front Desk
                  </a>
                  <a href="mailto:hello@haven-hotel.ph" className="btn btn-soft">
                    <Mail size={16} aria-hidden="true" /> Email us
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Full-width arrival assistance strip — unified under both columns */}
          <div className="location-arrival-assistance">
            <Car aria-hidden="true" />
            <div>
              <h3>Arrival assistance</h3>
              <p>Parking and airport transfer can be requested in advance and remain subject to availability. Front Desk confirms within 2 hours.</p>
            </div>
            <a href="mailto:hello@haven-hotel.ph?subject=Arrival%20assistance%20request" className="location-arrival-link">
              Request assistance <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
        </section>

        {/* Good to know + FAQ stay together as the practical close */}
        <section className="good-to-know" aria-labelledby="good-to-know-heading">
          <div data-reveal="up">
            <h2 id="good-to-know-heading">Plan your arrival.</h2>
          </div>
          <ul data-reveal="up" style={rd(120)}>
            {facts.map((fact) => (
              <li key={fact}>
                <Check size={15} aria-hidden="true" />
                {fact}
              </li>
            ))}
          </ul>
        </section>

        <section className="faq-section" id="faq" aria-labelledby="faq-heading">
          <div data-reveal="up">
            <h2 id="faq-heading">Before you book.</h2>
          </div>
          <div data-reveal="up" style={rd(120)}>
            {faqs.map((item) => (
              <details key={item.q}>
                <summary>
                  {item.q}
                  <CircleHelp size={16} aria-hidden="true" />
                </summary>
                <div className="faq-body">
                  <div>
                    <p>{item.a}</p>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* 10 — Final cinematic CTA */}
        <section className="cta-band" data-reveal="fade" aria-labelledby="cta-heading">
          <div className="cta-band-media" aria-hidden="true">
            <Image
              src={SCENES.final}
              alt=""
              fill
              sizes="100vw"
              className="cta-band-image"
            />
          </div>
          <div className="cta-band-content">
            <h2 id="cta-heading" data-reveal="up">
              Your room <em>is waiting.</em>
            </h2>
            <p data-reveal="up" style={rd(140)}>
              Search live availability and book your stay — payment is settled with Front Desk at the hotel.
            </p>
            <Link href="/booking/search" className="btn btn-cream" data-reveal="up" style={rd(280)}>
              Check availability <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </section>

        {/* 11 — Footer */}
        <footer aria-label="Site footer">
          <div>
            <Link href="/" className="brand" aria-label="Haven home">
              <span className="brand-mark" aria-hidden="true">
                <Sparkles size={18} />
              </span>
              <span>
                HAVEN<small>HOTEL &amp; RESIDENCES</small>
              </span>
            </Link>
            <p>Thoughtful stays, beautifully prepared.</p>
          </div>
          <div className="footer-links">
            <div>
              <h2 className="footer-heading">Explore</h2>
              <a href="#stay">Rooms &amp; Suites</a>
              <a href="#experience">Experience</a>
              <a href="#amenities">Amenities</a>
            </div>
            <div>
              <h2 className="footer-heading">Plan</h2>
              <a href="#book">Book now</a>
              <Link href="/my-reservations">My reservations</Link>
              <a href="#faq">FAQ</a>
            </div>
            <div>
              <h2 className="footer-heading">Hotel</h2>
              <a href="#about">About</a>
              <a href="#gallery">Gallery</a>
              <a href="#location">Contact</a>
            </div>
          </div>
        </footer>
      </main>
    </LandingMotion>
  );
}
