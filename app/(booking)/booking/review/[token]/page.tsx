import { AmenitySnapshot } from "@/components/booking/amenity-snapshot";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Clock3 } from "lucide-react";
import { getAuthenticatedSession } from "@/lib/authorization";
import { supabase } from "@/lib/supabase";
import { BookingPageFrame } from "@/components/booking/booking-page-frame";
import { ReviewDepositTiles, ReviewGuestCard, ReviewStayCard } from "@/components/booking/booking-review";
import { HoldCountdown } from "@/components/booking/hold-countdown";
import { calculateNights, depositPolicyLabel, getOwnedHold, policyFromSnapshot, transportTotal } from "@/lib/booking";
import { parseFrozenRates } from "@/lib/rate-plans";
import { requestLabel } from "@/lib/request-options";
import { breakfastLine } from "@/lib/breakfast";
import { SERVICE_TYPE_LABELS, type TransportationPreferences } from "@/lib/transportation-display";

type TransportLineRow = { name: string; price: number | string; note?: string | null };

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const session = await getAuthenticatedSession(); const { token } = await params;
  if (!session) redirect(`/login?booking=1&callbackUrl=${encodeURIComponent(`/booking/review/${token}`)}`); if(session.user.role!=="guest")redirect("/manager_dashboard");
  const hold = await getOwnedHold(token, session.user.id); if (!hold) notFound();
  if (hold.status === "payment_submitted" && hold.reservation_id) redirect(`/booking/confirmation/${hold.reservation_id}`);
  if (hold.status === "completed") redirect("/my-reservations");
  const recovery = `/booking/rooms/${encodeURIComponent(hold.room_type)}?${new URLSearchParams({ checkIn: hold.check_in, checkOut: hold.check_out, guests: String(hold.guest_count), expired: "1" })}`;
  if (hold.status !== "active" || new Date(hold.expires_at) <= new Date()) return <BookingPageFrame session={session}><div className="booking-empty"><Clock3/><h1>Your reservation hold expired</h1><p>Your reservation hold expired before payment was completed. Please choose from the currently available rooms.</p><Link className="btn btn-accent" href={recovery}>Search rooms</Link></div></BookingPageFrame>;
  const nights = calculateNights(hold.check_in, hold.check_out);
  const policy = policyFromSnapshot(hold.deposit_policy_snapshot);
  const requested = Array.isArray(hold.request_options) ? hold.request_options.map((value: string) => requestLabel(value)) : [];
  const transport = Array.isArray(hold.transport_lines) ? (hold.transport_lines as TransportLineRow[]).filter((line) => line && Number(line.price) > 0) : [];
  const ride = hold.transportation_preferences as TransportationPreferences | null ?? null;
  const detailsHref = `/booking/details?${new URLSearchParams({ roomType: hold.room_type, ...(hold.selected_room_id?{roomId:hold.selected_room_id}:{}), checkIn: hold.check_in, checkOut: hold.check_out, guests: String(hold.guest_count), hold: token })}`;
  const breadcrumb = [
    { label: "Find a Room", href: `/account/find-room?${new URLSearchParams({ checkIn: hold.check_in, checkOut: hold.check_out, guests: String(hold.guest_count) })}` },
    { label: "Guest details", href: detailsHref },
    { label: "Review", current: true },
  ];
  // Display-only room photo: DB photo_urls for the held room type, teal fallback when none.
  let stayPhotos: string[] = [];
  if (supabase) {
    const { data } = await supabase.from("room_types").select("photo_urls").eq("name", hold.room_type).eq("active", true).maybeSingle();
    const urls = (data as { photo_urls?: unknown } | null)?.photo_urls;
    if (Array.isArray(urls)) stayPhotos = urls.map(String).filter((url) => url.trim() !== "");
  }
  return <BookingPageFrame session={session} step="Review" breadcrumb={breadcrumb}><section className="booking-stage customer-booking-stage-inner review-stage"><div><p className="eyebrow">Review booking</p><h1>Does everything look right?</h1><p className="review-lede">Review your guest details, stay, and deposit before continuing.</p><div className="review-card">
    <ReviewGuestCard firstName={hold.first_name} lastName={hold.last_name} email={hold.email} mobile={hold.mobile} address={hold.address} expectedArrival={hold.expected_arrival} requested={requested} specialRequests={hold.special_requests} detailsHref={detailsHref}/>
    {ride && <section className="review-section review-ride">
      <header className="review-section-heading"><h2>Transportation request</h2></header>
      <p><strong>{SERVICE_TYPE_LABELS[ride.serviceType]}</strong> · {ride.passengerCount} passenger{ride.passengerCount === 1 ? "" : "s"}</p>
      <p>{ride.serviceType === "DROPOFF" ? `Hotel → ${ride.dropoffLocation}` : `${ride.pickupLocation} → Hotel`} · {ride.pickupDate} at {ride.pickupTime}</p>
      {ride.returnDate && <p>Hotel → {ride.returnLocation} · {ride.returnDate} at {ride.returnTime}</p>}
      {ride.specialInstructions && <p>{ride.specialInstructions}</p>}
      <p className="review-note">Fare to be confirmed. Front Desk will review your request after payment and add the confirmed fare to your folio.</p>
    </section>}
    {!ride && <Link className="customer-inline-action" href={`${detailsHref}#booking-transportation`}>Add transportation</Link>}
    <AmenitySnapshot value={hold.amenity_snapshot} /><ReviewDepositTiles depositRequired={hold.deposit_required} remainingBalance={Number(hold.total)-Number(hold.deposit_required)} depositLabel={depositPolicyLabel(policy)} remainingNote={`Due ${policy.remainingBalanceDue.toLowerCase()}.`}/>
    <footer className="review-actions"><HoldCountdown expiresAt={hold.expires_at} recoveryUrl={recovery}/><Link className="btn btn-accent" href={`/booking/payment/${token}`}>Continue to payment <ArrowRight size={17}/></Link></footer>
  </div></div><ReviewStayCard roomNumber={hold.selected_room_number??undefined} roomType={hold.room_type} checkIn={hold.check_in} checkOut={hold.check_out} guests={hold.guest_count} nights={nights} rate={hold.nightly_rate==null?null:Number(hold.nightly_rate)} total={Number(hold.total)} nightly={parseFrozenRates(hold.nightly_rates)} lines={[...breakfastLine(hold.breakfast_snapshot), ...(transport.length > 0 ? [{ label: "Hotel transfer", amount: transportTotal(transport) }] : [])]} photos={stayPhotos}/></section></BookingPageFrame>;
}
