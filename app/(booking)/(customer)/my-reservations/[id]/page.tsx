import { notFound } from "next/navigation";
import { requireCustomerSession } from "@/lib/customer-auth";
import { getCustomerReservationDetail } from "@/lib/customer";
import { displayTime, operationalPolicyFromSnapshot } from "@/lib/hotel-policy";
import { getCustomerTransportation } from "@/lib/transportation";
import { supabase } from "@/lib/supabase";
import { ReservationDetailView } from "@/components/customer/reservation-detail-view";
import { StayReviewCard } from "@/components/customer/stay-review-card";

export default async function ReservationPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireCustomerSession();
  const { id } = await params;
  const [reservation, transportation] = await Promise.all([getCustomerReservationDetail(session.user.id, id), getCustomerTransportation(session.user.id)]);
  if (!reservation) notFound();

  const invoice = reservation.invoice;
  const stayTotal = Number(reservation.total || 0);
  const folioTotal = Number(invoice?.amount ?? stayTotal);
  const paid = Number(invoice?.paid ?? reservation.deposit ?? 0);
  const balance = Number(invoice?.balance ?? Math.max(folioTotal - paid, 0));
  const nightly = reservation.nights ? stayTotal / reservation.nights : stayTotal;
  const policy = operationalPolicyFromSnapshot(reservation.operational_policy_snapshot);

  const rawLines: unknown = reservation.transport_lines;
  const transportLines = (Array.isArray(rawLines) ? rawLines : [])
    .filter((line): line is { name: string; price: number | string; note?: string | null } =>
      line !== null && typeof line === "object" && Number((line as { price?: unknown }).price ?? 0) > 0)
    .map((line) => ({ name: line.name, price: Number(line.price), note: line.note ?? null }));

  // Stay review: only a completed stay can be reviewed, one per stay.
  let existingReview: { rating: number; comment: string } | null = null;
  if (reservation.status === "checked_out" && supabase) {
    const { data } = await supabase
      .from("stay_reviews")
      .select("rating,comment")
      .eq("reservation_id", id)
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (data) existingReview = { rating: Number(data.rating), comment: String(data.comment) };
  }

  const partialPct = policy.cancellationPartialRefundBasisPoints / 100;
  const policyItems = [
    { title: "Check-in & check-out", body: <>Check-in from <strong>{displayTime(policy.checkInTime)}</strong> · check-out by <strong>{displayTime(policy.checkOutTime)}</strong> ({policy.hotelTimezone}).</> },
    { title: "Valid ID", body: <>Valid government ID is <strong>{policy.validIdRequired ? "required" : "not required by the current configuration"}</strong> at check-in. Guests must be at least <strong>{policy.minimumBookingAge} years old</strong> to book.</> },
    { title: "Balance & incidentals", body: <>The remaining balance and incidental charges are due <strong>{policy.incidentalsDue.toLowerCase()}</strong>.</> },
    { title: "Cancellation refunds", body: <><strong>100% refund</strong> at least <strong>{policy.cancellationFullRefundDays} days</strong> before arrival · <strong>{partialPct}% refund</strong> at least <strong>{policy.cancellationPartialRefundDays} days</strong> before arrival · otherwise <strong>non-refundable</strong>. No-show past <strong>{displayTime(policy.noShowCutoffTime)}</strong> on arrival day forfeits the deposit.</> },
    { title: "Changes to your booking", body: <>Self-service change requests at least <strong>{policy.selfServiceModificationDays} days</strong> before arrival, subject to availability, repricing, and <strong>staff approval</strong>.</> },
    { title: "Special requests", body: <>Special requests are recorded but <strong>{policy.specialRequestsGuaranteed ? "guaranteed" : "not guaranteed"}</strong>.</> },
    { title: "House rules", body: <>Pets are <strong>{policy.petsAllowed ? "allowed" : "not allowed"}</strong> · smoking is <strong>{policy.smokingAllowed ? "allowed" : "not allowed"}</strong> · early check-in is <strong>{policy.earlyCheckInAllowed ? "available on request" : "not offered"}</strong>.</> },
  ];
  return (
    <>
    <ReservationDetailView
      data={{
        id: reservation.id,
        confirmationNumber: String(reservation.confirmation_number ?? reservation.id),
        roomType: reservation.room_type,
        checkIn: reservation.check_in,
        checkOut: reservation.check_out,
        nights: reservation.nights,
        guests: reservation.guests,
        status: reservation.status,
        paymentStatus: String(invoice?.status ?? reservation.payment_status),
        guestName: reservation.guest?.name ?? reservation.guest_name ?? "-",
        guestEmail: reservation.guest?.email ?? reservation.guest_email ?? "-",
        guestPhone: reservation.guest?.phone ?? "-",
        roomNumber: reservation.room_number ? String(reservation.room_number) : null,
        identityStatus: String(reservation.identity_status),
        source: String(reservation.source),
        specialRequests: reservation.special_requests ?? null,
        expectedArrival: reservation.expected_arrival ? String(reservation.expected_arrival) : null,
        cancellationReason: reservation.cancellation_reason ?? null,
        checkInTime: displayTime(policy.checkInTime),
        checkOutTime: displayTime(policy.checkOutTime),
        transportLines,
        pendingNotice: reservation.status === "pending"
          ? "This reservation is awaiting deposit verification and is not yet confirmed."
          : null,
        policyText: `Valid government ID is ${policy.validIdRequired ? "required" : "not required by the current configuration"} at check-in. The remaining balance and incidental charges are due ${policy.incidentalsDue.toLowerCase()}. Deposit refund: 100% at least ${policy.cancellationFullRefundDays} days before arrival, ${policy.cancellationPartialRefundBasisPoints / 100}% at least ${policy.cancellationPartialRefundDays} days before arrival, otherwise non-refundable. Special requests are recorded but ${policy.specialRequestsGuaranteed ? "guaranteed" : "not guaranteed"}.`,
        policyItems,
        money: {
          stayTotal,
          folioTotal,
          depositRequired: Number(reservation.deposit_required ?? 0),
          paid,
          balance,
          nightly,
        },
        charges: reservation.charges.map((charge) => ({ id: charge.id, description: charge.description, category: charge.category, amount: Number(charge.amount), status: charge.status, createdAt: String(charge.created_at) })),
        payments: reservation.payments.map((payment) => ({ id: payment.id, amount: Number(payment.amount), method: payment.method, purpose: payment.purpose, status: payment.status, createdAt: String(payment.created_at) })),
        refunds: reservation.refunds.map((refund) => ({ id: refund.id, reason: refund.reason, eligibleAmount: Number(refund.eligible_amount), status: refund.status, createdAt: String(refund.created_at) })),
        changeRequests: reservation.changeRequests.map((request) => ({ id: request.id, reason: request.reason, status: request.status, executionStatus: String(request.execution_status ?? ""), requestedCheckIn: request.requested_check_in ? String(request.requested_check_in) : null, requestedCheckOut: request.requested_check_out ? String(request.requested_check_out) : null, requestedRoomType: request.requested_room_type ? String(request.requested_room_type) : null, createdAt: String(request.created_at) })),
        transportation: transportation.filter((request) => request.reservation_id === id),
      }}
    />
    {reservation.status === "checked_out" && (
      <StayReviewCard reservationId={id} existing={existingReview} />
    )}
    </>
  );
}
