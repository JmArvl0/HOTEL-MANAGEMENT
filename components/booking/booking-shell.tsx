import Link from "next/link";
import { Sparkles, UserRound, BedDouble } from "lucide-react";

export function BookingHeader({ step }: { step?: string }) {
  const normalizedStep = step === "Choose a room" ? "Select your room · Step 1 of 3" : step;
  return (
    <header className="booking-header checkout-header">
      <Link href="/" className="brand" aria-label="Back to Haven home">
        <span className="brand-mark" aria-hidden="true"><Sparkles size={18} /></span>
        <span>HAVEN<small>HOTEL & RESIDENCES</small></span>
      </Link>
      {normalizedStep && (
        <span className="booking-step" aria-current="step" title="Booking progress — you are selecting a room">
          <BedDouble size={13} aria-hidden="true" /> {normalizedStep}
        </span>
      )}
      <Link className="checkout-account-link" href="/account" aria-label="Go to My account — view your bookings and profile" title="My account — your bookings & profile">
        <UserRound size={14} aria-hidden="true" /> My account
      </Link>
    </header>
  );
}
export function BookingSummary({ roomType, checkIn, checkOut, guests, nights, rate, total }: { roomType:string;checkIn:string;checkOut:string;guests:number;nights:number;rate:number;total:number }) { const peso=(v:number)=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP",maximumFractionDigits:0}).format(v);return <aside className="booking-summary"><p className="eyebrow">Your stay</p><h2>{roomType}</h2><dl><div><dt>Check-in</dt><dd>{checkIn}</dd></div><div><dt>Check-out</dt><dd>{checkOut}</dd></div><div><dt>Guests</dt><dd>{guests}</dd></div><div><dt>Nights</dt><dd>{nights}</dd></div><div><dt>Nightly rate</dt><dd>{peso(rate)}</dd></div><div className="summary-total"><dt>Stay total</dt><dd>{peso(total)}</dd></div></dl><small>Taxes and service charges are currently included at ₱0 under the configured hotel policy.</small></aside>; }