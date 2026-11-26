import Link from "next/link";
import { HotelPdfDownload } from "@/components/ui/hotel-pdf-download";

export function ConfirmationActions({ reservationId, canDownload = false }: { reservationId: string; canDownload?: boolean }) {
  return (
    <div className="confirmation-actions" aria-label="Booking confirmation actions">
      <Link className="btn btn-accent" href={`/my-reservations/${reservationId}`}>
        Manage Reservation
      </Link>
      {canDownload && <HotelPdfDownload kind="booking-confirmation" id={reservationId} label="Download confirmation PDF" />}
      <Link className="btn btn-soft" href="/account">
        Go Home
      </Link>
    </div>
  );
}
