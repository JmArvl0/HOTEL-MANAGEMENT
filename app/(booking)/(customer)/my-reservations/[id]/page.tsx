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
  const paid = Number(invoice?.paid ?? reservation.deposit ?? 0) + Number(invoice?.credit_balance ?? 0);
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
    {
      title: "Check-in & check-out",
      body: (
        <div className="crd-policy-metrics">
          <div className="crd-policy-metric">
            <span className="crd-metric-label">Check-in</span>
            <span className="crd-metric-val">From <strong>{displayTime(policy.checkInTime)}</strong></span>
          </div>
          <div className="crd-policy-metric">
            <span className="crd-metric-label">Check-out</span>
            <span className="crd-metric-val">By <strong>{displayTime(policy.checkOutTime)}</strong></span>
          </div>
          <div className="crd-policy-metric">
            <span className="crd-metric-label">Timezone</span>
            <span className="crd-metric-val"><strong>{policy.hotelTimezone}</strong></span>
          </div>
        </div>
      ),
    },
    {
      title: "Valid ID & Age Requirement",
      body: (
        <div className="crd-policy-spec-list">
          <div className="crd-policy-spec-row">
            <span className="crd-spec-label">Government ID</span>
            <span className={`crd-spec-badge ${policy.validIdRequired ? "positive" : "neutral"}`}>
              {policy.validIdRequired ? "Required at check-in" : "Not required"}
            </span>
            <span className="crd-spec-desc">Original government-issued photo ID is required for verification at reception.</span>
          </div>
          <div className="crd-policy-spec-row">
            <span className="crd-spec-label">Minimum Age</span>
            <span className="crd-spec-badge neutral">{policy.minimumBookingAge}+ years old</span>
            <span className="crd-spec-desc">Primary guest must meet the minimum age requirement to book.</span>
          </div>
        </div>
      ),
    },
    {
      title: "Balance & incidentals",
      body: (
        <div className="crd-policy-spec-list">
          <div className="crd-policy-spec-row">
            <span className="crd-spec-label">Settlement</span>
            <span className="crd-spec-badge neutral">Due {policy.incidentalsDue.toLowerCase()}</span>
            <span className="crd-spec-desc">Remaining stay balance and any incidental charges incurred are finalized upon departure.</span>
          </div>
        </div>
      ),
    },
    {
      title: "Cancellation refunds",
      body: (
        <div className="crd-policy-tiers">
          <div className="crd-policy-tier positive">
            <div className="crd-tier-header">
              <span className="crd-tier-badge">100% Refund</span>
              <span className="crd-tier-timeline">≥ {policy.cancellationFullRefundDays} days before arrival</span>
            </div>
            <p className="crd-tier-desc">Full deposit refund returned to original payment method.</p>
          </div>
          <div className="crd-policy-tier warning">
            <div className="crd-tier-header">
              <span className="crd-tier-badge">{partialPct}% Refund</span>
              <span className="crd-tier-timeline">≥ {policy.cancellationPartialRefundDays} days before arrival</span>
            </div>
            <p className="crd-tier-desc">Partial {partialPct}% refund of deposit paid.</p>
          </div>
          <div className="crd-policy-tier critical">
            <div className="crd-tier-header">
              <span className="crd-tier-badge">Non-Refundable</span>
              <span className="crd-tier-timeline">&lt; {policy.cancellationPartialRefundDays} days before arrival</span>
            </div>
            <p className="crd-tier-desc">Cancellations made within {policy.cancellationPartialRefundDays} days of check-in are not eligible for a refund.</p>
          </div>
          <div className="crd-policy-tier-footer">
            <span className="crd-tier-alert-label">No-show:</span> Past <strong>{displayTime(policy.noShowCutoffTime)}</strong> on arrival day forfeits the deposit.
          </div>
        </div>
      ),
    },
    {
      title: "Changes to your booking",
      body: (
        <div className="crd-policy-spec-list">
          <div className="crd-policy-spec-row">
            <span className="crd-spec-label">Notice Window</span>
            <span className="crd-spec-badge neutral">At least {policy.selfServiceModificationDays} days before arrival</span>
            <span className="crd-spec-desc">Self-service change requests can be initiated from this reservation page.</span>
          </div>
          <div className="crd-policy-spec-row">
            <span className="crd-spec-label">Conditions</span>
            <span className="crd-spec-desc">Subject to room availability, seasonal repricing, and staff approval.</span>
          </div>
        </div>
      ),
    },
    {
      title: "Special requests",
      body: (
        <div className="crd-policy-spec-list">
          <div className="crd-policy-spec-row">
            <span className="crd-spec-label">Fulfillment</span>
            <span className={`crd-spec-badge ${policy.specialRequestsGuaranteed ? "positive" : "neutral"}`}>
              {policy.specialRequestsGuaranteed ? "Guaranteed" : "Subject to availability"}
            </span>
            <span className="crd-spec-desc">Special requests are recorded upon booking and accommodated based on check-in availability.</span>
          </div>
        </div>
      ),
    },
    {
      title: "House rules",
      body: (
        <div className="crd-policy-rules-grid">
          <div className={`crd-rule-card ${policy.petsAllowed ? "allowed" : "prohibited"}`}>
            <span className="crd-rule-icon" aria-hidden="true">{policy.petsAllowed ? "✓" : "✕"}</span>
            <div className="crd-rule-info">
              <strong>Pets {policy.petsAllowed ? "Allowed" : "Not Allowed"}</strong>
              <small>{policy.petsAllowed ? "Pets permitted per property guidelines" : "Strict no-pet policy across all suites"}</small>
            </div>
          </div>
          <div className={`crd-rule-card ${policy.smokingAllowed ? "allowed" : "prohibited"}`}>
            <span className="crd-rule-icon" aria-hidden="true">{policy.smokingAllowed ? "✓" : "✕"}</span>
            <div className="crd-rule-info">
              <strong>{policy.smokingAllowed ? "Smoking Allowed" : "100% Smoke-Free"}</strong>
              <small>{policy.smokingAllowed ? "Designated smoking areas only" : "Smoking is strictly prohibited in rooms and corridors"}</small>
            </div>
          </div>
          <div className={`crd-rule-card ${policy.earlyCheckInAllowed ? "allowed" : "neutral"}`}>
            <span className="crd-rule-icon" aria-hidden="true">{policy.earlyCheckInAllowed ? "✓" : "—"}</span>
            <div className="crd-rule-info">
              <strong>Early Check-in {policy.earlyCheckInAllowed ? "Offered" : "Not Offered"}</strong>
              <small>{policy.earlyCheckInAllowed ? "Available upon advance request" : "Standard 3:00 PM check-in schedule applies"}</small>
            </div>
          </div>
        </div>
      ),
    },
  ];
  return (
    <>
    <ReservationDetailView
      data={{
        id: reservation.id,
        confirmationNumber: String(reservation.confirmation_number ?? reservation.id),
        roomType: reservation.room_type,
        amenitySnapshot: reservation.amenity_snapshot,
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
        cancellationPolicy: {
          fullRefundDays: policy.cancellationFullRefundDays,
          partialRefundDays: policy.cancellationPartialRefundDays,
          partialRefundPercent: partialPct,
          noShowCutoffTime: displayTime(policy.noShowCutoffTime),
          hotelTimezone: policy.hotelTimezone,
        },
        money: {
          stayTotal,
          folioTotal,
          depositRequired: Number(reservation.deposit_required ?? 0),
          paid,
          balance,
          nightly,
          creditBalance: Number(invoice?.credit_balance ?? 0),
        },
        adjustments: reservation.adjustments.map((row) => ({ id: String(row.id), reason: String(row.reason), direction: String(row.direction), amount: Number(row.amount), createdAt: String(row.created_at) })),
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
