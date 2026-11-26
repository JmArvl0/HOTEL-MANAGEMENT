import { AmenitySnapshot } from "@/components/booking/amenity-snapshot";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Clock3 } from "lucide-react";
import { getAuthenticatedSession } from "@/lib/authorization";
import { BookingPageFrame } from "@/components/booking/booking-page-frame";
import { calculateNights, formatPeso, hotelToday, policyFromSnapshot } from "@/lib/booking";
import { folioMoney, friendlyStatus, formatStayRange, getCustomerReservationDetail } from "@/lib/customer";
import { formatStayDate } from "@/lib/format";
import { summarizeCollections } from "@/lib/accounting";
import { isBookingConfirmationStatus } from "@/lib/hotel-document-data";
import { BreakfastEntry } from "@/components/customer/breakfast-entry";
import { CheckInQr } from "@/components/customer/check-in-qr";
import { ProofThumbnail } from "@/components/booking/proof-thumbnail";
import { ConfirmationActions } from "@/components/booking/confirmation-actions";
import { GatewayPendingActions } from "@/components/booking/gateway-pending-actions";
import { PaymentStatusPoller } from "@/components/booking/payment-status-poller";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { scheduleFleetDelivery } from "@/lib/fleet-delivery";
import { XenditCheckout } from "@/components/booking/xendit-checkout";
import { FLEET_RIDE_STATUS_LABELS, getCustomerTransportation, isTerminalStatus, reservationTransportationHref, SERVICE_TYPE_LABELS, TRANSPORTATION_STATUS_LABELS } from "@/lib/transportation";

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const session = await getAuthenticatedSession();
  const { id } = await params;
  const returned = (await searchParams).checkout;
  if (!session) redirect(`/login?callbackUrl=${encodeURIComponent(`/booking/confirmation/${id}`)}`);
  if (session.user.role !== "guest") redirect("/manager_dashboard");

  const reservation = await getCustomerReservationDetail(session.user.id, id);
  if (!reservation) notFound();

  const finance = folioMoney(reservation);
  const confirmed = reservation.status === "confirmed";
  const fulfilled = isBookingConfirmationStatus(reservation.status);
  const completed = reservation.status === "checked_out";
  const pending = reservation.status === "pending";
  const policy = policyFromSnapshot(reservation.deposit_policy_snapshot);

  const canArrangeRide = confirmed && reservation.check_out >= hotelToday();
  const rideRequests = confirmed
    ? await getCustomerTransportation(session.user.id, reservation.id).catch(() => null)
    : [];
  const ride = rideRequests?.find((request) => !isTerminalStatus(request.status)) ?? rideRequests?.[0];
  if (supabase && !session.user.disabled && !session.user.otpPending && confirmed &&
      ride?.fleetDelivery && ride.fleetDelivery !== "accepted") {
    scheduleFleetDelivery(supabase, { reservationId: reservation.id });
  }
  const transportationHref = reservationTransportationHref(reservation.id);

  const depositPayment =
    reservation.payments.find((payment) => payment.purpose === "reservation_deposit") ?? null;
  const xendit = reservation.payment_method === "gateway_xendit";
  const review = xendit && supabase ? await supabase.rpc("guest_xendit_review_status", { p_reservation: reservation.id, p_guest: session.user.id }) : null;
  const paymentUnderReview = review?.data === true;
  const stayTotal = Number(reservation.total);
  const paidInFull = xendit && stayTotal > 0 && finance.paid >= stayTotal;
  const terminal = reservation.status === "cancelled" || reservation.status === "no_show";
  const collections = terminal ? summarizeCollections(reservation.payments) : null;
  const checkoutExpired = reservation.status === "cancelled" && xendit &&
    reservation.cancellation_reason === "Xendit sandbox checkout expired" &&
    depositPayment?.status === "expired" && collections?.grossCollected === 0;
  const settlement = reservation.invoice?.terminal_settlement as { feeAmount?: number } | null;
  const refunds = reservation.refunds.filter((item) => ["pending", "failed", "processed"].includes(item.status));
  const collected = terminal ? collections?.grossCollected ?? 0 : finance.paid;
  const collectionAvailable = !terminal || collected > 0 || Boolean(settlement) || checkoutExpired;
  const manualDepositPending = pending && !xendit && depositPayment?.status === "pending_verification" &&
    (depositPayment.method === "manual_gcash" || depositPayment.method === "manual_bank_transfer");
  let xenditHold: string | null = null;
  let checkoutAmount = Number(reservation.deposit_required ?? 0);
  if (xendit && pending && supabase) {
    const [hold, payment] = await Promise.all([
      supabase.from("booking_holds").select("token").eq("reservation_id", id).eq("user_id", session.user.id).maybeSingle(),
      supabase.from("payments").select("gateway_checkout_amount").eq("reservation_id", id).eq("purpose", "reservation_deposit").eq("payment_gateway", "xendit").maybeSingle(),
    ]);
    xenditHold = payment.error ? null : hold.data?.token ?? null;
    checkoutAmount = Number(payment.data?.gateway_checkout_amount ?? checkoutAmount);
  }
  const gatewayPending =
    pending &&
    (reservation.payment_method === "gateway_paymongo" ||
      depositPayment?.method === "gateway_paymongo");

  const breadcrumb = [
    {
      label: "Find a Room",
      href: `/account/find-room?${new URLSearchParams({
        checkIn: reservation.check_in,
        checkOut: reservation.check_out,
        guests: String(reservation.guests),
      })}`,
    },
    { label: "Confirmation", current: true },
  ];

  return (
    <BookingPageFrame
      session={session}
      step={checkoutExpired ? "Checkout expired" : pending ? "Payment" : friendlyStatus(reservation.status)}
      breadcrumb={breadcrumb}
    >
      <section className="confirmation-card deposit-confirmation">
        {fulfilled || completed ? <CheckCircle2 /> : <Clock3 />}
        {xendit && pending && <p>Xendit sandbox · Test mode · No real money</p>}
        <h1>
          {confirmed
            ? "Your Haven stay is reserved."
            : reservation.status === "checked_in"
            ? "You’re checked in."
            : reservation.status === "checked_out"
            ? "Your Haven stay is complete."
            : reservation.status === "no_show"
            ? "This reservation was closed as a no-show."
            : terminal
            ? checkoutExpired ? "This checkout has expired." : "This reservation was cancelled."
            : xendit && returned === "cancelled"
            ? "Checkout was not completed."
            : xendit
            ? "Waiting for payment verification."
            : gatewayPending
            ? "This online checkout has closed."
            : manualDepositPending ? "Contact Front Desk about your deposit." : "Your reservation is awaiting payment."}
        </h1>
        <p>
          {confirmed
            ? paidInFull ? "Haven verified your full stay payment." : "Haven verified your reservation deposit."
            : checkoutExpired
            ? "Your reservation is not confirmed and its temporary room hold has been released. Choose an available room to try again. Contact the hotel if you completed a simulated payment."
            : terminal
            ? "View your reservation for its cancellation and payment details."
            : fulfilled || completed
            ? "Manage your stay or review your booking and payment details."
            : xendit
            ? "Returning from checkout does not confirm payment. This page updates after Haven verifies Xendit’s notification. You can safely retry to reopen an existing checkout."
            : gatewayPending
            ? "If you attempted payment, ask Front Desk to check the transaction before paying again."
            : manualDepositPending
            ? "Have your original payment reference ready so Front Desk can look up the transaction before you pay again."
            : "Check your reservation for the latest payment status and available actions."}
        </p>
        {manualDepositPending && <Link className="btn btn-soft" href="/account/help">Contact Front Desk</Link>}
        {pending && !manualDepositPending && <PaymentStatusPoller reservationId={reservation.id} status={reservation.status} />}
        {paymentUnderReview && <p role="status" className="booking-error">Accounting is reviewing your Xendit payment. Contact Front Desk with your booking reference before paying again.</p>}
        {xenditHold && !paymentUnderReview && <XenditCheckout holdToken={xenditHold} amount={checkoutAmount} retry />}
        {checkoutExpired && !paymentUnderReview && <Link className="btn btn-accent" href={`/account/find-room?${new URLSearchParams({ checkIn: reservation.check_in, checkOut: reservation.check_out, guests: String(reservation.guests) })}`}>Find another room</Link>}
        {gatewayPending && (
          <GatewayPendingActions
            reservationId={reservation.id}
            checkIn={reservation.check_in}
            checkOut={reservation.check_out}
            guests={reservation.guests}
          />
        )}
        <p className="confirmation-number">{reservation.confirmation_number}</p>
        <dl>
          <div>
            <dt>Room type</dt>
            <dd>{reservation.room_type}{reservation.room_number ? ` · Room ${reservation.room_number}` : ""}</dd>
          </div>
          <div>
            <dt>Dates</dt>
            <dd>
              {formatStayRange(reservation.check_in, reservation.check_out)}
            </dd>
          </div>
          <div>
            <dt>Nights / guests</dt>
            <dd>
              {calculateNights(reservation.check_in, reservation.check_out)} / {reservation.guests}
            </dd>
          </div>
          <div>
            <dt>Folio total</dt>
            <dd>{formatPeso(finance.total)}</dd>
          </div>
          {!terminal && <div>
            <dt>Required reservation deposit</dt>
            <dd>{formatPeso(reservation.deposit_required ?? 0)}</dd>
          </div>}
          {manualDepositPending && <div><dt>Previously submitted</dt><dd>{formatPeso(depositPayment.amount)}</dd></div>}
          <div>
            <dt>{terminal ? "Original payments collected" : xendit ? "Amount paid" : "Deposit paid"}</dt>
            <dd>{collectionAvailable ? formatPeso(collected) : "Unavailable in guest records"}</dd>
          </div>
          {terminal && typeof settlement?.feeAmount === "number" && <div>
            <dt>{reservation.status === "no_show" ? "No-show fee assessed" : "Cancellation fee assessed"}</dt>
            <dd>{formatPeso(settlement.feeAmount)}</dd>
          </div>}
          {terminal && refunds.map((refund) => <div key={refund.id}>
            <dt>{refund.status === "processed" ? "Refund issued" : "Eligible refund"}</dt>
            <dd>{formatPeso(refund.eligible_amount)} · {refund.status === "processed" ? "Processed" : refund.status === "failed" ? "Needs review" : "Pending processing"}</dd>
          </div>)}
          <div>
            <dt>Remaining balance</dt>
            <dd>{formatPeso(finance.balance)}</dd>
          </div>
          <div>
            <dt>Reservation</dt>
            <dd>{friendlyStatus(reservation.status)}</dd>
          </div>
          <div>
            <dt>Payment</dt>
            <dd>{manualDepositPending ? "Unsettled legacy payment" : friendlyStatus(reservation.invoice?.status ?? reservation.payment_status)}</dd>
          </div>
          {xendit && depositPayment && <div><dt>{depositPayment.status === "paid" ? "Transaction reference" : "Payment reference"}</dt><dd>{depositPayment.reference}</dd></div>}
          {xendit && pending && reservation.payment_due_at && <div><dt>Sandbox checkout deadline</dt><dd>{new Date(reservation.payment_due_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })} (Philippine time)</dd></div>}
          {depositPayment?.proof_original_name && (
            <div>
              <dt>Payment proof</dt>
              <dd>
                <ProofThumbnail
                  paymentId={depositPayment.id}
                  alt={depositPayment.proof_original_name}
                />
              </dd>
            </div>
          )}
        </dl>
        {confirmed && (ride || rideRequests === null || reservation.transportation_preferences || canArrangeRide) ? (
          <section className="confirmation-transportation" aria-label="Transportation">
            {ride ? <>
              <h2>{ride.status === "REQUESTED" ? "Transportation request submitted" : "Transportation"}</h2>
              <p><strong>{SERVICE_TYPE_LABELS[ride.service_type]}</strong>{!ride.rideUpdates.length && ` · ${TRANSPORTATION_STATUS_LABELS[ride.status]}`}</p>
              <p>{ride.pickup_location} → {ride.dropoff_location} · {formatStayDate(ride.pickup_date)} at {ride.pickup_time}</p>
              {ride.return_location && ride.return_date && <p>{ride.dropoff_location} → {ride.return_location} · {formatStayDate(ride.return_date)} at {ride.return_time}</p>}
              {ride.rideUpdates.map(({ leg, status }) => <p key={leg}>{leg === "RETURN" ? "Return ride" : "Outbound ride"} · {FLEET_RIDE_STATUS_LABELS[status]}</p>)}
              {ride.status === "REQUESTED" && <p>{ride.fleetDelivery === "pending"
                ? "We’re sending your request to Fleet. The confirmed fare will appear on your folio."
                : ride.fleetDelivery === "attention"
                  ? "We saved your request. Front Desk can help check Fleet delivery."
                  : "The confirmed fare will appear on your folio."}</p>}
              <Link className="btn btn-soft" href={transportationHref}>View transportation</Link>
            </> : rideRequests === null ? <>
              <h2>Transportation</h2>
              <p>Your stay is confirmed. We couldn&apos;t check your ride details right now.</p>
              <Link className="btn btn-soft" href={transportationHref}>Check transportation</Link>
            </> : <>
              <h2>{reservation.transportation_preferences ? "Transportation request needs attention" : "Getting to the hotel?"}</h2>
              <p>{reservation.transportation_preferences
                ? "Your stay is confirmed. We couldn’t submit your ride request automatically."
                : "Request a pickup or drop-off for this stay."}</p>
              {canArrangeRide && <Link className="btn btn-soft" href={reservationTransportationHref(reservation.id, true)}>Arrange transportation</Link>}
            </>}
          </section>
        ) : null}
        {!terminal && finance.balance > 0 && <p className="remaining-policy">Remaining balance due: {policy.remainingBalanceDue}.</p>}
        <p className="remaining-policy">
          Rates are VAT-inclusive — service charge and VAT are itemised on your official receipt and folio statement.
        </p>
        {confirmed && (
          <CheckInQr reservationId={reservation.id} confirmationNumber={reservation.confirmation_number} />
        )}
        <BreakfastEntry id={reservation.id} snapshot={reservation.breakfast_snapshot} status={reservation.status} />
        <AmenitySnapshot value={reservation.amenity_snapshot} /><ConfirmationActions reservationId={reservation.id} canDownload={fulfilled} />
      </section>
    </BookingPageFrame>
  );
}
