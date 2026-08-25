import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BellRing, BedDouble, CalendarCheck, Check, ConciergeBell, CreditCard, ShieldCheck, Sparkles } from "lucide-react";

const roomTypes = [
  { name: "Garden Twin", details: "2 guests · 2 twin beds", price: "₱5,800" },
  { name: "Deluxe King", details: "2 guests · 1 king bed", price: "₱6,400" },
  { name: "Ocean Suite", details: "3 guests · king bed + lounge", price: "₱8,900" }
];

export default function LandingPage() {
  return <main className="landing">
    <nav className="landing-nav">
      <Link href="/" className="brand brand-light"><span className="brand-mark"><Sparkles size={18}/></span><span>HAVEN<small>HOTEL & RESIDENCES</small></span></Link>
      <div className="nav-links"><a href="#stay">Stay</a><a href="#experience">Experience</a><a href="#about">Our story</a></div>
      <Link href="/login" className="btn btn-outline-light">Staff portal</Link>
    </nav>

    <section className="hero">
      <Image src="/hotel-hero.png" alt="Haven's tropical hotel lobby at sunset" fill priority sizes="100vw" className="hero-image"/>
      <div className="hero-shade" />
      <div className="hero-content"><p className="eyebrow light">Welcome to Haven</p><h1>Stay somewhere<br/><em>unforgettable.</em></h1><p>Quiet luxury, thoughtful service, and moments that feel entirely your own.</p><a href="#stay" className="btn btn-cream">Find your room <ArrowRight size={17}/></a></div>
      <form className="booking-bar" action="/login">
        <label>Check in<input type="date" defaultValue="2026-09-04"/></label><label>Check out<input type="date" defaultValue="2026-09-07"/></label><label>Guests<select defaultValue="2"><option>1 guest</option><option value="2">2 guests</option><option>3 guests</option><option>4 guests</option></select></label><button className="btn btn-accent">Check availability <ArrowRight size={17}/></button>
      </form>
    </section>

    <section className="intro" id="about"><div><p className="eyebrow">A slower kind of luxury</p><h2>Every detail, considered.</h2></div><p>From the moment you arrive, Haven is designed to make everything feel effortless. Warm spaces, genuine hospitality, and a team who remembers the little things.</p></section>

    <section className="rooms-section" id="stay"><div className="section-heading"><div><p className="eyebrow">Rooms & suites</p><h2>Rest beautifully.</h2></div><a href="#stay">View all rooms <ArrowRight size={16}/></a></div><div className="room-grid">{roomTypes.map((room, index) => <article className={`room-card room-${index + 1}`} key={room.name}><div className="room-card-content"><p>{room.details}</p><h3>{room.name}</h3><div><span>From <strong>{room.price}</strong> / night</span><button aria-label={`View ${room.name}`}><ArrowRight size={18}/></button></div></div></article>)}</div></section>

    <section className="experience" id="experience"><div className="experience-copy"><p className="eyebrow light">The Haven experience</p><h2>Hospitality that feels human.</h2><p>We combine warm, personal service with technology that stays quietly in the background.</p><ul><li><ConciergeBell/>24-hour guest care</li><li><CalendarCheck/>Flexible arrival and departure</li><li><CreditCard/>Simple, secure payments</li><li><ShieldCheck/>Privacy at every step</li></ul></div><div className="experience-panel"><p>Guest favorite</p><blockquote>“The kind of place that anticipates what you need before you need it.”</blockquote><div>— Ava T. <span>★★★★★</span></div></div></section>

    <section className="operations"><p className="eyebrow">Behind every great stay</p><h2>One thoughtful team. One connected system.</h2><div className="feature-grid"><div><BedDouble/><h3>Effortless booking</h3><p>Real-time availability and a smooth reservation experience.</p></div><div><BellRing/><h3>Responsive service</h3><p>Requests reach the right team member without delay.</p></div><div><Sparkles/><h3>Impeccable rooms</h3><p>Housekeeping and maintenance always stay in sync.</p></div><div><Check/><h3>Simple checkout</h3><p>Clear folios, flexible payment, and no surprises.</p></div></div></section>

    <footer><Link href="/" className="brand"><span className="brand-mark"><Sparkles size={18}/></span><span>HAVEN<small>HOTEL & RESIDENCES</small></span></Link><p>Thoughtful stays, seamlessly managed.</p></footer>
  </main>;
}
