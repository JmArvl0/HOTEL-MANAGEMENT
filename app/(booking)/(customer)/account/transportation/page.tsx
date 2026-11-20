import Link from "next/link";
import { notFound } from "next/navigation";
import { getGuestProfile, getGuestReservation, getGuestReservations, hotelToday } from "@/lib/booking";
import { requireCustomerSession } from "@/lib/customer-auth";
import { getCustomerTransportation, getHotelTransferLabel } from "@/lib/transportation";
import { TransportationRequestForm } from "@/components/customer/transportation-request-form";
import { TransportationRequestList } from "@/components/customer/transportation-request-list";
import { scheduleFleetDelivery } from "@/lib/fleet-delivery";
import { supabase } from "@/lib/supabase";

export default async function TransportationPage({
  searchParams,
}: {
  searchParams: Promise<{ reservation?: string; arrange?: string }>;
}) {
  const session = await requireCustomerSession();
  const { reservation: reservationId, arrange } = await searchParams;
  const openRideForm = Boolean(reservationId && arrange === "1");
  const userId = session.user.id;
  const requestedStay = reservationId ? await getGuestReservation(userId, reservationId) : null;
  if (reservationId && !requestedStay) notFound();

  const [requests, reservations, hotelLabel, profile] = await Promise.all([
    getCustomerTransportation(userId, requestedStay?.id),
    requestedStay ? [requestedStay] : getGuestReservations(userId),
    getHotelTransferLabel(),
    getGuestProfile(userId, session.user.email),
  ]);
  if (supabase && requests.some(ride => ride.fleetDelivery && ride.fleetDelivery !== "accepted")) {
    scheduleFleetDelivery(supabase, { guestId: userId });
  }
  const today = hotelToday();
  const eligible = reservations
    .filter((stay) => ["confirmed", "checked_in"].includes(stay.status) && stay.check_out >= today)
    .map(({ id, confirmation_number, room_type, check_in, check_out, guests, guest_name }) =>
      ({ id, confirmation_number, room_type, check_in, check_out, guests,
        passenger: { name: guest_name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || session.user.name || "",
          phone: profile?.phone || "" } }));

  return (
    <div className="customer-transportation-page">
      <section className="customer-page-title">
        <h1>Transportation</h1>
        {requestedStay
          ? <p><Link href={`/my-reservations/${requestedStay.id}`}>Reservation {requestedStay.confirmation_number ?? requestedStay.id}</Link> · {requestedStay.room_type}</p>
          : <p>Arrange a pickup or drop-off for your stay. Confirmed fares appear on your stay folio.</p>}
      </section>
      {(!requestedStay || eligible.length > 0) &&
        <TransportationRequestForm key={`${requestedStay?.id ?? "all"}:${openRideForm ? "arrange" : "list"}`} reservations={eligible} hotelLabel={hotelLabel}
          today={today} reservationSelected={Boolean(requestedStay)} openInitially={openRideForm} />}
      <TransportationRequestList requests={requests} />
    </div>
  );
}
