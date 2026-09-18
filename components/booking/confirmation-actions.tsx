import Link from "next/link";

export function ConfirmationActions({ reservationId }: { reservationId: string }) {
  return (
    <div className="confirmation-actions" aria-label="Booking confirmation actions">
      <Link className="btn btn-accent" href={`/my-reservations/${reservationId}`}>
        Manage Reservation
      </Link>
      <Link className="btn btn-soft" href="/account">
        Go Home
      </Link>
    </div>
  );
}
