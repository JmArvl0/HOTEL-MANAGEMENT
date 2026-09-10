import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Waves, UtensilsCrossed, Wifi, Car, Dumbbell, ConciergeBell, ParkingCircle, Shirt, MapPin, Phone, Mail, QrCode, Check } from "lucide-react";
import { BookingIntentProvider, FeaturedStays, HeroBookingForm } from "@/components/landing/booking-intent";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingMotion } from "@/components/landing/landing-motion";
import { WaveMark } from "@/components/landing/wave-mark";
import { ExperienceGallery } from "@/components/landing/experience-gallery";
import { SCENES } from "@/lib/room-images";
import { supabase } from "@/lib/supabase";
import { Sparkles, TrendingUp, CalendarCheck, Brush } from "lucide-react";
import "./landing.css";

export const revalidate = 300;
const amenities = [
  { name: "On-site dining", icon: UtensilsCrossed }, { name: "Swimming pool", icon: Waves },
  { name: "Hotel Wi-Fi", icon: Wifi }, { name: "Fitness center", icon: Dumbbell },
  { name: "Front Desk assistance", icon: ConciergeBell }, { name: "Airport transfers", icon: Car },
  { name: "Guest parking", icon: ParkingCircle }, { name: "Laundry service", icon: Shirt },
];
const faqs = [
  ["How is my reservation confirmed?", "Choose your dates and room, then follow the deposit instructions at checkout. Your booking is confirmed after the required deposit is verified. Payment and cancellation terms are shown before you reserve."],
  ["Can I change my reservation?", "Open My reservations in your guest account to request a change or cancellation. Availability, approval, and the cancellation terms accepted with your reservation apply."],
  ["Can you arrange my airport transfer?", "Request transportation through your guest account for an eligible stay. Front Desk will review your request and confirm the schedule and assignment."],
  ["What should I bring for check-in?", "Bring a valid government-issued ID and your reservation details. If a check-in QR code is available in your account, show it at Front Desk. Staff will verify your identity and complete your room assignment."],
];

export default async function LandingPage() {
  const result = supabase ? await supabase.from("room_types").select("id,name,max_guests,beds,base_rate,photo_urls").eq("active", true).order("base_rate", { ascending: true }) : null;
  const rooms = result?.error ? [] : result?.data ?? [];
  return <main className="landing coastal-landing">
    <LandingNav />
    <LandingMotion />
    <BookingIntentProvider>
    <section className="coast-hero" aria-labelledby="coast-title">
      <Image src={SCENES.location} alt="A sunlit hotel pool surrounded by tropical greenery" fill priority sizes="100vw" className="coast-hero-image"/>
      <div className="coast-hero-wash"/>
      <div className="coast-hero-copy">
        <p className="coast-eyebrow">A brighter kind of stay</p>
        <h1 id="coast-title">Find Your Haven</h1>
        <p className="coast-hero-lead">Extraordinary stays. A little more breathing room.</p>
        <p>Beautiful spaces. Thoughtful hospitality.<br/>Your own corner of calm.</p>
        <a href="#stay" className="coast-text-link">Discover your stay <ArrowRight size={18}/></a>
      </div>
      <p className="coast-hero-note">Good stays.<br/>Brighter days.</p>
      <div className="coast-book" id="book"><HeroBookingForm/></div>
      <p className="coast-scroll-cue" aria-hidden="true">Scroll to explore</p>
    </section>

    <section className="coast-section" id="stay" aria-labelledby="stays-title">
      <header className="coast-section-heading"><div><h2 id="stays-title">Featured Stays</h2><p>A space for every kind of escape.</p></div><Link href="/booking/search" className="coast-text-link">View all rooms <ArrowRight size={18}/></Link></header>
      {rooms.length ? <FeaturedStays rooms={rooms}/> : <div className="coast-catalog-empty"><h3>Let’s find your next stay.</h3><p>The room catalog is currently unavailable. Search your dates to check the latest availability.</p><Link href="/booking/search" className="coast-button">Search rooms <ArrowRight size={16}/></Link></div>}
      <p className="coast-caption">Rates and availability are confirmed for your selected dates. Images without uploaded room photos are illustrative.</p>
    </section>
    </BookingIntentProvider>

    <section className="coast-section coast-amenities" id="amenities" aria-labelledby="amenities-title">
      <header className="coast-section-heading"><div><h2 id="amenities-title">More Than a Stay</h2><p>Thoughtful details. A more comfortable escape.</p></div><a className="coast-text-link" href="#location">Ask us about your stay <ArrowRight size={18}/></a></header>
      <ul>{amenities.map(({ name, icon: Icon }) => <li key={name}><span><Icon size={25} strokeWidth={1.3}/></span>{name}</li>)}</ul>
      <p className="coast-caption">Some services require advance arrangements or additional charges. Contact Front Desk for details.</p>
    </section>

    <section className="coast-section coast-experience-grid" id="experience" aria-label="Your Haven experience">
      <ExperienceGallery />
      <article className="coast-portal"><div><p className="coast-eyebrow">A little more effortless</p><h2>Your stay,<br/>beautifully organised.</h2><p>One guest account. Everything you need before you arrive and while you’re here.</p><ul>{["Manage your reservations", "Request transportation and assistance", "View payments and your folio", "Keep up with your stay updates"].map(item => <li key={item}><Check size={16}/>{item}</li>)}</ul><Link href="/account" className="coast-text-link">Explore your account <ArrowRight size={18}/></Link></div><div className="coast-phone" aria-label="Illustrative guest portal preview"><WaveMark/><b>HAVEN</b><h3>Made for<br/>your stay.</h3><Image src={SCENES.story} alt="A quiet hotel retreat" width={220} height={200}/><span>Your reservations</span><span>Payments &amp; folio</span><span>Guest assistance</span></div></article>
    </section>

    <section className="coast-section coast-service-grid" id="about" aria-label="Thoughtful hospitality">
      <article className="coast-arrival"><QrCode size={30} strokeWidth={1.3}/><h2>A smoother arrival.</h2><p>Your reservation, close at hand. Show your check-in QR at Front Desk, where our team verifies your details and gets you settled.</p><Link className="coast-text-link" href="/my-reservations">View your reservation <ArrowRight size={16}/></Link></article>
      <article className="coast-story" id="gallery"><Image src={SCENES.gallery[4]} alt="A peaceful place to unwind at the hotel" fill sizes="(max-width: 800px) 100vw, 40vw"/><div><h2>A place to slow down,<br/>and feel more at home.</h2><a href="#experience" className="coast-text-link">Discover the experience <ArrowRight size={16}/></a></div></article>
      <article className="coast-care"><WaveMark/><h2>Small details.<br/>Warmer welcomes.</h2><p>A helping hand with your plans, a room to return to, and time to make your own.</p><a href="#location" className="coast-text-link">Meet us at Haven <ArrowRight size={16}/></a></article>
    </section>

    <section className="coast-section coast-teaser" id="smarter" aria-labelledby="smarter-title">
      <header className="coast-section-heading"><div><p className="coast-eyebrow">Behind the scenes</p><h2 id="smarter-title">Smarter hospitality.</h2><p>Technology in service of a warmer welcome.</p></div><Sparkles size={30} strokeWidth={1.3} aria-hidden="true"/></header>
      <div className="coast-teaser-grid">
        <div className="coast-teaser-tile"><TrendingUp size={20} strokeWidth={1.5} aria-hidden="true"/><b>84%</b><span>Occupancy outlook</span></div>
        <div className="coast-teaser-tile"><CalendarCheck size={20} strokeWidth={1.5} aria-hidden="true"/><b>12</b><span>Tomorrow&rsquo;s arrivals</span></div>
        <div className="coast-teaser-tile"><Brush size={20} strokeWidth={1.5} aria-hidden="true"/><b>4</b><span>Rooms requiring attention</span></div>
      </div>
      <p className="coast-teaser-copy">Our team works alongside predictive insights and Gemini-assisted guidance — occupancy, housekeeping, and inventory forecasts that keep every stay ready before you arrive. QR-based operations and one connected workflow mean quicker answers and smoother arrivals.</p>
      <p className="coast-caption coast-teaser-note">Illustrative figures — shown to give a sense of the system. Actual live insights stay private to hotel operations.</p>
    </section>

    <section className="coast-section coast-contact" id="location" aria-labelledby="contact-title"><div><p className="coast-eyebrow">Find us</p><h2 id="contact-title">Your next chapter<br/>starts here.</h2><p>Haven Hotel &amp; Residences<br/>A quieter pace, a warmer welcome.</p><nav aria-label="Contact the hotel"><a href="tel:+63324001234"><Phone size={17}/>+63 32 400 1234</a><a href="mailto:hello@haven-hotel.ph"><Mail size={17}/>hello@haven-hotel.ph</a><a href="https://www.google.com/maps/search/?api=1&query=Haven+Hotel" target="_blank" rel="noreferrer"><MapPin size={17}/>Open in Maps <ArrowRight size={14}/></a></nav></div><div className="coast-contact-photo"><Image src={SCENES.afternoon} alt="Hotel pool ready for a relaxing afternoon" fill sizes="(max-width: 800px) 100vw, 50vw"/><div><h3>Let’s plan your<br/>time away.</h3><a href="#book" className="coast-button coast-button-light">Find your stay <ArrowRight size={16}/></a></div></div></section>

    <section className="coast-section coast-faq" id="faq" aria-labelledby="faq-title"><div><p className="coast-eyebrow">A few things to know</p><h2 id="faq-title">Before you arrive.</h2><p>More questions? Our Front Desk is here to help.</p><a className="coast-text-link" href="tel:+63324001234">Let’s talk <Phone size={16}/></a></div><div>{faqs.map(([question,answer]) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>

    <footer className="coast-footer"><div className="coast-footer-inner"><div><Link href="/" className="coast-footer-brand"><WaveMark/><span>HAVEN<small>HOTEL &amp; RESIDENCES</small></span></Link><p>A brighter stay. A little more you.</p></div><nav aria-label="Footer"><a href="#stay">Rooms &amp; suites</a><a href="#experience">Experiences</a><a href="#amenities">Amenities</a><a href="#location">Contact us</a><a href="#faq">Help &amp; FAQs</a><Link href="/account">My account</Link></nav><div><h2>Good people.<br/>Brighter places.</h2><a href="#book" className="coast-button coast-button-light">Book your stay <ArrowRight size={16}/></a></div><small className="coast-copyright">© {new Date().getFullYear()} Haven Hotel &amp; Residences. All rights reserved.</small></div></footer>
  </main>;
}
