"use client";

import { BookingLoadError } from "@/components/booking/booking-load-error";

export default function PaymentsError({ retry }: { retry: () => void }) {
  return <BookingLoadError title="We couldn’t load Payments & Folio" message="Try again to see your payment and balance details." retry={retry} />;
}
