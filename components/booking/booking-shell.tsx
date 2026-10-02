import Link from "next/link";
import { UserRound, BedDouble } from "lucide-react";
import { HavenLogo } from "@/components/ui/haven-logo";

export function BookingHeader({ step }: { step?: string }) {
  const normalizedStep = step === "Choose a room" ? "Select your room · Step 1 of 3" : step;
  return (
    <header className="booking-header checkout-header">
      <Link href="/" className="brand" aria-label="Back to Haven home">
        <span className="brand-mark" aria-hidden="true"><HavenLogo size={32} /></span>
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