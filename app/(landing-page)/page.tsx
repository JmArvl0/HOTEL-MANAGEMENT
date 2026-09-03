import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  Car,
  Check,
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
  Star,
  UtensilsCrossed,
  Waves,
} from "lucide-react";
import { BookingSearchForm } from "@/components/booking/booking-search-form";
import { LandingNav } from "@/components/landing/landing-nav";
import "./landing.css";

const rooms = [
  { name: "Garden Twin", details: "2 guests · 2 twin beds", price: "₱5,800" },
  { name: "Deluxe King", details: "2 guests · 1 king bed", price: "₱6,400" },
  { name: "Ocean Suite", details: "3 guests · king bed + lounge", price: "₱8,900" },
];

const amenities = [
  { name: "Swimming pool", icon: Waves },
  { name: "Restaurant", icon: UtensilsCrossed },
  { name: "Hotel Wi-Fi", icon: Signal },
  { name: "Parking", icon: ParkingCircle },
  { name: "Fitness center", icon: Dumbbell },
  { name: "Room service", icon: ConciergeBell },
  { name: "Airport transfer", icon: Plane },
  { name: "Laundry", icon: Shirt },
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

const testimonials = [
  {
    quote: "The kind of place that anticipates what you need before you need it.",
    name: "Ava T.",
    stay: "Ocean Suite · Feb 2026",
  },
  {
    quote: "Quiet luxury without the stiffness. The team remembered our names on day two.",
    name: "Marco & Lea",
    stay: "Deluxe King · Jan 2026",
  },
  {
    quote: "Booking took a minute, the rest felt effortless. Will be back with family.",
    name: "Sofia R.",
    stay: "Garden Twin · Dec 2025",
  },
];

export default function LandingPage() {
  return (
    <main className="landing">
      <LandingNav />

      <section className="hero" aria-label="Haven hero">
        <Image
          src="/hotel-hero.png"
          alt="Haven's tropical hotel lobby at sunset"
          fill
          priority
          sizes="100vw"
          className="hero-image"
        />
        <div className="hero-shade" aria-hidden="true" />
        <div className="hero-content">
          <p className="eyebrow light">Welcome to Haven</p>
          <h1>
            Stay somewhere
            <br />
            <em>unforgettable.</em>
          </h1>
          <p>Quiet luxury, thoughtful service, and moments that feel entirely your own.</p>
          <div className="hero-actions">
            <Link href="/booking/search" className="btn btn-cream">
              Find your room <ArrowRight size={17} aria-hidden="true" />
            </Link>
            <a href="#book" className="btn btn-outline-light">
              Check dates
            </a>
          </div>
          <div className="hero-social-proof" aria-label="Guest rating">
            <div className="hero-stars" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={14} fill="currentColor" />
              ))}
            </div>
            <span>4.9/5 from 1,200+ verified stays</span>
          </div>
        </div>
        <div id="book">
          <BookingSearchForm />
        </div>
      </section>

      <section className="intro" id="about">
        <div>
          <p className="eyebrow">A slower kind of luxury</p>
          <h2>Every detail, considered.</h2>
        </div>
        <p>
          From the moment you arrive, Haven is designed to make everything feel effortless. Warm spaces, genuine
          hospitality, and a team who remembers the little things.
        </p>
      </section>

      <section className="rooms-section" id="stay" aria-labelledby="rooms-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Rooms & suites</p>
            <h2 id="rooms-heading">Rest beautifully.</h2>
          </div>
          <Link href="/booking/search" className="section-link">
            Check live availability <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="room-grid">
          {rooms.map((room, index) => (
            <article className={`room-card room-${index + 1}`} key={room.name} aria-label={room.name}>
              <div className="room-card-content">
                <p>{room.details}</p>
                <h3>{room.name}</h3>
                <div>
                  <span>
                    From <strong>{room.price}</strong> / night
                  </span>
                  <div className="room-card-actions">
                    <Link
                      href={`/booking/search?roomType=${encodeURIComponent(room.name)}`}
                      className="btn-cream-sm"
                      aria-label={`Check availability for ${room.name} — opens live inventory filtered to ${room.name}`}
                    >
                      Check availability <ArrowRight size={12} aria-hidden="true" />
                    </Link>
                    <Link href="#book" className="btn-soft-sm" aria-label={`Jump to booking form for ${room.name}`}>
                      Quick check
                    </Link>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
        <p className="rooms-footnote">Sample rates shown — live inventory updates with your dates and guests.</p>
      </section>

      <section className="experience" id="experience">
        <div className="experience-copy">
          <p className="eyebrow light">The Haven experience</p>
          <h2>Hospitality that feels human.</h2>
          <p>Warm welcomes, beautifully prepared rooms, and responsive assistance whenever you need it.</p>
          <ul>
            <li>
              <ConciergeBell aria-hidden="true" /> 24-hour guest care
            </li>
            <li>
              <Clock3 aria-hidden="true" /> Comfortable arrival
            </li>
            <li>
              <BedDouble aria-hidden="true" /> Rooms prepared with care
            </li>
            <li>
              <Check aria-hidden="true" /> Easy checkout
            </li>
          </ul>
        </div>
        <div className="experience-panel" aria-label="Featured testimonial">
          <p>Guest note · verified stay</p>
          <blockquote>“{testimonials[0].quote}”</blockquote>
          <div>
            — {testimonials[0].name} <span aria-label="5 stars">★★★★★</span>
          </div>
        </div>
      </section>

      {/* Social proof carousel - non-rotating for accessibility, pause-safe */}
      <section className="testimonials-strip" aria-label="Guest testimonials">
        <div className="testimonials-strip-inner">
          {testimonials.map((t) => (
            <figure key={t.name} className="testimonial-card">
              <blockquote>“{t.quote}”</blockquote>
              <figcaption>
                <strong>{t.name}</strong>
                <span>{t.stay}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="amenities-section" id="amenities" aria-labelledby="amenities-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">At your service</p>
            <h2 id="amenities-heading">Everything for an effortless stay.</h2>
          </div>
        </div>
        <div className="amenities-grid">
          {amenities.map(({ name, icon: Icon }) => (
            <div key={name}>
              <Icon aria-hidden="true" />
              <span>{name}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="good-to-know" aria-labelledby="good-to-know-heading">
        <div>
          <p className="eyebrow">Good to know</p>
          <h2 id="good-to-know-heading">Plan your arrival.</h2>
        </div>
        <ul>
          {facts.map((fact) => (
            <li key={fact}>
              <Check size={15} aria-hidden="true" />
              {fact}
            </li>
          ))}
        </ul>
      </section>

      <section className="gallery-section" id="gallery" aria-labelledby="gallery-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">A glimpse of Haven</p>
            <h2 id="gallery-heading">Spaces made for slowing down.</h2>
          </div>
          <span className="gallery-note">Real photography coming soon — preview using hero art</span>
        </div>
        <div className="gallery-grid">
          {[
            { label: "Lobby", pos: "center 40%" },
            { label: "Rooms", pos: "70% 30%" },
            { label: "Pool & facilities", pos: "30% 70%" },
            { label: "Dining", pos: "center 55%" },
          ].map(({ label, pos }, index) => (
            <figure key={label} className={`gallery-${index + 1}`}>
              <Image
                src="/hotel-hero.png"
                alt={`Haven ${label.toLowerCase()} — preview image, final photography pending`}
                fill
                sizes="(max-width: 680px) 100vw, (max-width: 1024px) 50vw, 33vw"
                style={{ objectPosition: pos }}
              />
              <figcaption>{label}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="location-section" id="location" aria-labelledby="location-heading">
        <div className="location-grid">
          {/* LEFT COLUMN: Location & Contact */}
          <div className="location-left">
            <MapPin aria-hidden="true" />
            <p className="eyebrow">Location & contact</p>
            <h2 id="location-heading">Meet us at Haven.</h2>
            <address className="location-address">
              <strong>Haven Hotel & Residences</strong>
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

          {/* RIGHT COLUMN: Reservation Support Panel */}
          <div className="location-right">
            <h2 className="location-support-heading">Need help with your reservation?</h2>
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

        {/* Full-width arrival assistance strip — unified under both columns */}
        <div className="location-arrival-assistance">
          <Car aria-hidden="true" />
          <div>
            <h3>Arrival assistance</h3>
            <p>Parking and airport transfer can be requested in advance and remain subject to availability. Front Desk confirms within 2 hours.</p>
          </div>
        </div>
      </section>

      <section className="faq-section" id="faq" aria-labelledby="faq-heading">
        <div>
          <p className="eyebrow">Frequently asked</p>
          <h2 id="faq-heading">Before you book.</h2>
        </div>
        <div>
          {faqs.map((item) => (
            <details key={item.q}>
              <summary>
                {item.q}
                <CircleHelp size={16} aria-hidden="true" />
              </summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="operations" id="operations" aria-labelledby="ops-heading">
        <p className="eyebrow">A stay that flows naturally</p>
        <h2 id="ops-heading">From reservation to checkout, every moment feels easy.</h2>
        <div className="feature-grid">
          <div>
            <BedDouble aria-hidden="true" />
            <h3>Effortless booking</h3>
            <p>Search real-time availability and keep every stay detail together.</p>
          </div>
          <div>
            <ConciergeBell aria-hidden="true" />
            <h3>Responsive assistance</h3>
            <p>Your requests reach the team ready to help.</p>
          </div>
          <div>
            <Sparkles aria-hidden="true" />
            <h3>Beautifully prepared rooms</h3>
            <p>Room readiness is checked before your arrival.</p>
          </div>
          <div>
            <Check aria-hidden="true" />
            <h3>Simple checkout</h3>
            <p>Clear folios and straightforward settlement.</p>
          </div>
        </div>
      </section>

      <footer aria-label="Site footer">
        <div>
          <Link href="/" className="brand" aria-label="Haven home">
            <span className="brand-mark" aria-hidden="true">
              <Sparkles size={18} />
            </span>
            <span>
              HAVEN<small>HOTEL & RESIDENCES</small>
            </span>
          </Link>
          <p>Thoughtful stays, beautifully prepared.</p>
        </div>
        <div className="footer-links">
          <div>
            <h2 className="footer-heading">Explore</h2>
            <a href="#stay">Rooms & Suites</a>
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
  );
}
