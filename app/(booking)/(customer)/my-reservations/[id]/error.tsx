"use client";

import { BookingLoadError } from "@/components/booking/booking-load-error";

export default function ReservationError({ retry }: { retry: () => void }) {
  return <BookingLoadError title="We couldn’t load this reservation" message="Try again or go back to My reservations." retry={retry} />;
}
