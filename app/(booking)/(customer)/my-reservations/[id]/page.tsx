import { notFound } from "next/navigation";
import { requireCustomerSession } from "@/lib/customer-auth";
import { getCustomerReservationDetail } from "@/lib/customer";
import { formatPeso } from "@/lib/booking";
import { displayTime, operationalPolicyFromSnapshot } from "@/lib/hotel-policy";
import { getCustomerTransportation } from "@/lib/transportation";
import { ReservationDetailView } from "@/components/customer/reservation-detail-view";

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

  return (
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
        changeRequests: reservation.changeRequests.map((request) => ({ id: request.id, reason: request.reason, status: request.status, createdAt: String(request.created_at) })),
        transportation: transportation.filter((request) => request.reservation_id === id),
      }}
    />
  );
}
