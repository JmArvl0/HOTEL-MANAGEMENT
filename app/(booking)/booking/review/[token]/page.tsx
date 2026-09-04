import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { ArrowRight, Clock3 } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { BookingPageFrame } from "@/components/booking/booking-page-frame";
import { BookingSummary } from "@/components/booking/booking-shell";
import { HoldCountdown } from "@/components/booking/hold-countdown";
import { calculateNights, depositPolicyLabel, formatPeso, getOwnedHold, policyFromSnapshot, transportTotal } from "@/lib/booking";
import { requestLabel } from "@/lib/request-options";

type TransportLineRow = { name: string; price: number | string; note?: string | null };

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
  return <BookingPageFrame session={session} step="Review"><section className="booking-stage customer-booking-stage-inner"><div><p className="eyebrow">Review booking</p><h1>Everything look right?</h1><div className="review-card"><h2>Guest details</h2><dl><div><dt>Name</dt><dd>{hold.first_name} {hold.last_name}</dd></div><div><dt>Email</dt><dd>{hold.email}</dd></div><div><dt>Mobile</dt><dd>{hold.mobile}</dd></div>{hold.expected_arrival&&<div><dt>Arrival</dt><dd>{hold.expected_arrival}</dd></div>}{requested.length>0&&<div><dt>We will prepare</dt><dd>{requested.join(", ")}</dd></div>}{hold.special_requests&&<div><dt>Anything else?</dt><dd>{hold.special_requests}</dd></div>}</dl>{transport.length>0&&<div className="review-block"><h2>Hotel transport</h2><ul className="review-transport-list">{transport.map((line)=><li key={line.name}><span className="review-transport-name">{line.name}</span>{line.note?<small>{line.note}</small>:null}<strong>{formatPeso(Number(line.price))}</strong></li>)}</ul><p className="review-note">Your {transport.length} transport selection{transport.length>1?"s are":" is"} reserved with this booking and covered by the {formatPeso(hold.deposit_required)} reservation deposit below.</p></div>}<h2>Reservation deposit</h2><p>A {depositPolicyLabel(policy)} reservation deposit of <strong>{formatPeso(hold.deposit_required)}</strong> is required before this online reservation can be confirmed.</p><p>The remaining balance of <strong>{formatPeso(Number(hold.total)-Number(hold.deposit_required))}</strong> is due {policy.remainingBalanceDue.toLowerCase()}.</p><HoldCountdown expiresAt={hold.expires_at} recoveryUrl={recovery}/></div><Link className="btn btn-accent" href={`/booking/payment/${token}`}>Continue to reservation deposit <ArrowRight size={17}/></Link></div><BookingSummary roomType={hold.room_type} checkIn={hold.check_in} checkOut={hold.check_out} guests={hold.guest_count} nights={nights} rate={Number(hold.nightly_rate)} total={Number(hold.total)} lines={transport.length>0?[{label:"Hotel transfer",amount:transportTotal(transport)}]:undefined}/></section></BookingPageFrame>;
}
