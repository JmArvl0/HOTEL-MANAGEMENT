"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ReservationAccessRecovery() {
  const pathname = usePathname();
  const callback = pathname?.startsWith("/booking/confirmation/") ? pathname : "/my-reservations";
  return <section className="booking-empty" aria-label="Reservation access help">
    <h1>We can&apos;t open this reservation</h1>
    <p>The reference is unavailable or doesn&apos;t belong to the account currently signed in.</p>
    <p>If you just returned from checkout, sign in with the same guest account used to book. A successful wallet payment may already be recorded; don&apos;t pay again while checking access.</p>
    <div className="btn-row">
      <Link className="btn btn-accent" href={`/login?callbackUrl=${encodeURIComponent(callback)}`}>Sign in to the booking account</Link>
      <Link className="btn btn-soft" href="/my-reservations">My reservations</Link>
      <Link className="btn btn-soft" href="/account/help">Contact Front Desk</Link>
    </div>
  </section>;
}
