"use client";

import Link from "next/link";

export function BookingLoadError({ title, message, retry }: { title: string; message: string; retry: () => void }) {
  return (
    <section className="booking-empty" role="alert">
      <h1>{title}</h1>
      <p>{message}</p>
      <div className="booking-load-error-actions">
        <button type="button" className="btn btn-accent" onClick={retry}>Try again</button>
        <Link href="/my-reservations" className="btn btn-soft">My reservations</Link>
      </div>
    </section>
  );
}
