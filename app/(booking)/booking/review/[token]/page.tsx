import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Clock3, PencilLine } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { BookingPageFrame } from "@/components/booking/booking-page-frame";
import { BookingSummary } from "@/components/booking/booking-shell";
import { HoldCountdown } from "@/components/booking/hold-countdown";
import { calculateNights, depositPolicyLabel, formatPeso, getOwnedHold, policyFromSnapshot, transportTotal } from "@/lib/booking";
import { formatArrival } from "@/lib/arrival-time-options";
import { requestLabel } from "@/lib/request-options";

type TransportLineRow = { name: string; price: number | string; note?: string | null };
type TransportationPreferences = { serviceType: "PICKUP" | "DROPOFF" | "ROUND_TRIP"; pickupLocation?: string; dropoffLocation?: string; pickupDate: string; pickupTime: string; returnLocation?: string; returnDate?: string; returnTime?: string; passengerCount: number; specialInstructions?: string };

const SERVICE_LABELS: Record<TransportationPreferences["serviceType"], string> = { PICKUP: "Airport Pickup", DROPOFF: "Hotel Drop-off", ROUND_TRIP: "Round Trip Transportation" };

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const session = await getServerSession(authOptions); const { token } = await params;
  if (!session) redirect(`/login?booking=1&callbackUrl=${encodeURIComponent(`/booking/review/${token}`)}`); if(session.user.role!=="guest")redirect("/manager_dashboard");
  const hold = await getOwnedHold(token, session.user.id); if (!hold) notFound();
  if (hold.status === "payment_submitted" && hold.reservation_id) redirect(`/booking/confirmation/${hold.reservation_id}`);
  if (hold.status === "completed") redirect("/my-reservations");
  const recovery = `/booking/search?${new URLSearchParams({ checkIn: hold.check_in, checkOut: hold.check_out, guests: String(hold.guest_count), expired: "1" })}`;
  if (hold.status !== "active" || new Date(hold.expires_at) <= new Date()) return <BookingPageFrame session={session}><div className="booking-empty"><Clock3/><h1>Your reservation hold expired</h1><p>Your reservation hold expired before payment was completed. Please choose from the currently available rooms.</p><Link className="btn btn-accent" href={recovery}>Search rooms</Link></div></BookingPageFrame>;
  const nights = calculateNights(hold.check_in, hold.check_out);
  const policy = policyFromSnapshot(hold.deposit_policy_snapshot);
  const requested = Array.isArray(hold.request_options) ? hold.request_options.map((value: string) => requestLabel(value)) : [];
  const transport = Array.isArray(hold.transport_lines) ? (hold.transport_lines as TransportLineRow[]).filter((line) => line && Number(line.price) > 0) : [];
  const ride = hold.transportation_preferences as TransportationPreferences | null ?? null;
  const detailsHref = `/booking/details?${new URLSearchParams({ roomType: hold.room_type, checkIn: hold.check_in, checkOut: hold.check_out, guests: String(hold.guest_count) })}`;
  const breadcrumb = [
    { label: "Find a Room", href: `/account/find-room?${new URLSearchParams({ checkIn: hold.check_in, checkOut: hold.check_out, guests: String(hold.guest_count) })}` },
    { label: "Guest details", href: detailsHref },
    { label: "Review", current: true },
  ];
  return <BookingPageFrame session={session} step="Review" breadcrumb={breadcrumb}><section className="booking-stage customer-booking-stage-inner review-stage"><div><p className="eyebrow">Review booking</p><h1>Everything look right?</h1><p className="review-lede">Review your guest details, stay, and deposit before continuing.</p><div className="review-card">
    <section className="review-section"><header className="review-section-heading"><h2>Guest details</h2><Link className="review-edit-link" href={detailsHref}><PencilLine size={13} aria-hidden="true"/>Edit guest details</Link></header><dl className="review-details"><div><dt>Name</dt><dd>{hold.first_name} {hold.last_name}</dd></div><div><dt>Email</dt><dd>{hold.email}</dd></div><div><dt>Mobile</dt><dd>{hold.mobile}</dd></div>{hold.expected_arrival&&<div><dt>Expected arrival</dt><dd>{formatArrival(hold.expected_arrival)}</dd></div>}</dl></section>
    <section className="review-section"><header className="review-section-heading"><h2>Stay preparations</h2></header><dl className="review-details">{requested.length>0&&<div className="review-preparations"><dt>We will prepare</dt><dd><ul className="review-chips">{requested.map((item: string)=><li key={item}>{item}</li>)}</ul></dd></div>}{requested.length===0&&<div><dt>We will prepare</dt><dd className="review-none">Nothing requested</dd></div>}{hold.special_requests&&<div className="review-preparations"><dt>Anything else?</dt><dd><blockquote className="review-quote">{hold.special_requests}</blockquote></dd></div>}</dl></section>
    {ride&&<section className="review-section"><header className="review-section-heading"><h2>Transportation request</h2></header><ul className="review-transport-list"><li><span className="review-transport-name">{SERVICE_LABELS[ride.serviceType]} · {ride.serviceType==="DROPOFF"?`Hotel → ${ride.dropoffLocation}`:`${ride.pickupLocation} → Hotel`}{ride.serviceType==="ROUND_TRIP"&&ride.returnLocation?` · Hotel → ${ride.returnLocation}`:""}</span>{ride.specialInstructions?<small>{ride.specialInstructions}</small>:null}<strong>{ride.passengerCount} passenger{ride.passengerCount!==1?"s":""} · {ride.pickupDate} {ride.pickupTime}{ride.returnDate?` · return ${ride.returnDate} ${ride.returnTime}`:""}</strong></li></ul><p className="review-note">This is a request — our Front Desk reviews and schedules it once your reservation is confirmed. No fare is charged to this booking; transportation is settled with the hotel directly.</p></section>}
    <section className="review-section"><header className="review-section-heading"><h2>Reservation deposit</h2></header><dl className="review-finance"><div><dt>Deposit due now</dt><dd>{formatPeso(hold.deposit_required)}</dd><small>{depositPolicyLabel(policy)} of your stay total, required before this online reservation can be confirmed.</small></div><div><dt>Remaining balance</dt><dd>{formatPeso(Number(hold.total)-Number(hold.deposit_required))}</dd><small>Due {policy.remainingBalanceDue.toLowerCase()}.</small></div></dl></section>
    <footer className="review-actions"><HoldCountdown expiresAt={hold.expires_at} recoveryUrl={recovery}/><Link className="btn btn-accent" href={`/booking/payment/${token}`}>Continue to reservation deposit <ArrowRight size={17}/></Link></footer>
  </div></div><BookingSummary roomType={hold.room_type} checkIn={hold.check_in} checkOut={hold.check_out} guests={hold.guest_count} nights={nights} rate={Number(hold.nightly_rate)} total={Number(hold.total)} lines={transport.length>0?[{label:"Hotel transfer",amount:transportTotal(transport)}]:undefined}/></section></BookingPageFrame>;
}
