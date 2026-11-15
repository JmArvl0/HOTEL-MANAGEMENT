"use client";

import { BookingLoadError } from "@/components/booking/booking-load-error";

export default function ConfirmationError({ retry }: { retry: () => void }) {
  return <main className="confirmation-stay"><BookingLoadError title="We couldn’t load your confirmation" message="Try again or check the reservation status in My reservations before submitting another payment." retry={retry} /></main>;
}
