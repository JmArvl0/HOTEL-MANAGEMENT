import { AmenitySnapshot } from "@/components/booking/amenity-snapshot";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, Clock3 } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { BookingPageFrame } from "@/components/booking/booking-page-frame";
import { calculateFinancialState, calculateNights, formatPeso, policyFromSnapshot } from "@/lib/booking";
import { friendlyStatus, getCustomerReservationDetail } from "@/lib/customer";
import { CheckInQr } from "@/components/customer/check-in-qr";
import { ProofThumbnail } from "@/components/booking/proof-thumbnail";
import { ConfirmationActions } from "@/components/booking/confirmation-actions";
import { GatewayPendingActions } from "@/components/booking/gateway-pending-actions";
import { PaymentStatusPoller } from "@/components/booking/payment-status-poller";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { XenditCheckout } from "@/components/booking/xendit-checkout";

export default async function ConfirmationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ checkout?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const { id } = await params;
  const returned = (await searchParams).checkout;
  if (!session) redirect(`/login?callbackUrl=${encodeURIComponent(`/booking/confirmation/${id}`)}`);
  if (session.user.role !== "guest") redirect("/manager_dashboard");

  const reservation = await getCustomerReservationDetail(session.user.id, id);
  if (!reservation) notFound();

  const finance = calculateFinancialState(
    reservation.invoice?.amount ?? reservation.total,
    reservation.invoice?.paid ?? reservation.deposit ?? 0,
  );
  const confirmed = reservation.status === "confirmed";
  const policy = policyFromSnapshot(reservation.deposit_policy_snapshot);

  const rideRequest = reservation.transportation_preferences as
    | {
        serviceType: "PICKUP" | "DROPOFF" | "ROUND_TRIP";
        pickupLocation?: string;
        dropoffLocation?: string;
        pickupDate: string;
        pickupTime: string;
        returnLocation?: string;
        returnDate?: string;
        passengerCount: number;
      }
    | null ?? null;

  const depositPayment =
    reservation.payments.find((payment) => payment.purpose === "reservation_deposit") ?? null;
  const xendit = reservation.payment_method === "gateway_xendit";
  const paidInFull = xendit && finance.paid > 0 && finance.balance === 0;
  const terminal = reservation.status === "cancelled";
  let xenditHold: string | null = null;
  let checkoutAmount = Number(reservation.deposit_required ?? 0);
  if (xendit && !confirmed && !terminal && supabase) {
    const [hold, payment] = await Promise.all([
      supabase.from("booking_holds").select("token").eq("reservation_id", id).eq("user_id", session.user.id).maybeSingle(),
      supabase.from("payments").select("gateway_checkout_amount").eq("reservation_id", id).eq("purpose", "reservation_deposit").eq("payment_gateway", "xendit").maybeSingle(),
    ]);
    xenditHold = payment.error ? null : hold.data?.token ?? null;
    checkoutAmount = Number(payment.data?.gateway_checkout_amount ?? checkoutAmount);
  }
  const gatewayPending =
    !confirmed &&
    (reservation.payment_method === "gateway_paymongo" ||
      (depositPayment as { method?: unknown } | null)?.method === "gateway_paymongo");

  const rideLabel = rideRequest
    ? {
        PICKUP: "Airport Pickup",
        DROPOFF: "Hotel Drop-off",
        ROUND_TRIP: "Round Trip Transportation",
      }[rideRequest.serviceType]
    : null;

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
      step={confirmed ? "Confirmed" : xendit && terminal ? "Checkout expired" : "Verification pending"}
      breadcrumb={breadcrumb}
    >
      <section className="confirmation-card deposit-confirmation">
        {confirmed ? <CheckCircle2 /> : <Clock3 />}
        <p>{xendit ? "Xendit sandbox · Test mode · No real money" : confirmed ? "Reservation confirmed" : "Deposit awaiting verification"}</p>
        <h1>
          {confirmed
            ? "Your Haven stay is reserved."
            : xendit && terminal
            ? "This checkout has expired."
            : xendit && returned === "cancelled"
            ? "Checkout was not completed."
            : xendit
            ? "Waiting for payment verification."
            : gatewayPending
            ? "No payment received yet."
            : "Your payment reference was submitted."}
        </h1>
        <p>
          {confirmed
            ? paidInFull ? "Haven verified your full stay payment." : "Haven verified your reservation deposit."
            : xendit && terminal
            ? "Your reservation is not confirmed and its temporary room hold has been released. Choose an available room to try again. Contact the hotel if you completed a simulated payment."
            : xendit
            ? "Returning from checkout does not confirm payment. This page updates after Haven verifies Xendit’s notification. You can safely retry to reopen an existing checkout."
            : gatewayPending
            ? "You left the online checkout before paying, so nothing was charged and your room is not held yet. Wait here and this page updates on its own if the payment lands, or cancel the attempt below to try again."
            : "Your reservation is not confirmed yet. Front Desk or Accounting must verify the submitted deposit before the hold expires."}
        </p>
        {!confirmed && !terminal && <PaymentStatusPoller reservationId={reservation.id} status={reservation.status} />}
        {xenditHold && <XenditCheckout holdToken={xenditHold} amount={checkoutAmount} retry />}
        {xendit && terminal && <Link className="btn btn-accent" href={`/account/find-room?${new URLSearchParams({ checkIn: reservation.check_in, checkOut: reservation.check_out, guests: String(reservation.guests) })}`}>Retry payment with a new room hold</Link>}
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
              {reservation.check_in} - {reservation.check_out}
            </dd>
          </div>
          <div>
            <dt>Nights / guests</dt>
            <dd>
              {calculateNights(reservation.check_in, reservation.check_out)} / {reservation.guests}
            </dd>
          </div>
          <div>
            <dt>Stay total</dt>
            <dd>{formatPeso(finance.total)}</dd>
          </div>
          {rideLabel && rideRequest && (
            <div className="dl-note-row">
              <dt>Transportation request</dt>
              <dd>
                {rideLabel} ·{" "}
                {rideRequest.serviceType === "DROPOFF"
                  ? `Hotel → ${rideRequest.dropoffLocation}`
                  : `${rideRequest.pickupLocation} → Hotel`}
                <small className="summary-note">
                  {rideRequest.passengerCount} passenger{rideRequest.passengerCount !== 1 ? "s" : ""} ·{" "}
                  {rideRequest.pickupDate} {rideRequest.pickupTime} —{" "}
                  {confirmed
                    ? "filed for the Front Desk to review and schedule"
                    : "will be filed once your reservation is confirmed"}
                  . Transportation is settled with the hotel directly.
                </small>
              </dd>
            </div>
          )}
          <div>
            <dt>Required reservation deposit</dt>
            <dd>{formatPeso(reservation.deposit_required ?? 0)}</dd>
          </div>
          <div>
            <dt>{xendit ? "Amount paid" : "Deposit paid"}</dt>
            <dd>{formatPeso(finance.paid)}</dd>
          </div>
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
            <dd>{friendlyStatus(reservation.invoice?.status ?? reservation.payment_status)}</dd>
          </div>
          {xendit && depositPayment && <div><dt>{depositPayment.status === "paid" ? "Transaction reference" : "Payment reference"}</dt><dd>{depositPayment.reference}</dd></div>}
          {xendit && !confirmed && !terminal && reservation.payment_due_at && <div><dt>Sandbox checkout deadline</dt><dd>{new Date(reservation.payment_due_at).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })} (Philippine time)</dd></div>}
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
        <p className="remaining-policy">Remaining balance due: {policy.remainingBalanceDue}.</p>
        <p className="remaining-policy">
          Rates are VAT-inclusive — service charge and VAT are itemised on your official receipt and folio statement.
        </p>
        {confirmed && (
          <CheckInQr reservationId={reservation.id} confirmationNumber={reservation.confirmation_number} />
        )}
        <AmenitySnapshot value={reservation.amenity_snapshot} /><ConfirmationActions reservationId={reservation.id} />
      </section>
    </BookingPageFrame>
  );
}
