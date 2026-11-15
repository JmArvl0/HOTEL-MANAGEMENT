import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { getServerSession } from "next-auth";

import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { hotelToday } from "@/lib/booking";
import {
  cancellationWindowsFromSnapshot,
  previewCancellationRefund,
} from "@/lib/cancellation-preview";
import { notifyWithOptionalEmail } from "@/lib/notifications";

const schema = z.object({ reason: z.string().trim().min(3).max(500) });

async function guestSession() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return { error: publicJson({ error: "Please sign in to continue." }, { status: 401 }) };
  if (session.user.role !== "guest")
    return { error: publicJson({ error: "Please sign in with a guest account to continue." }, { status: 403 }) };
  if (!supabase) return { error: publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 }) };
  return { session, db: supabase };
}

/**
 * Read-only cancellation preview. Shows the snapshot-derived consequences
 * BEFORE the customer commits. Never writes: final eligibility is always
 * recalculated by cancel_reservation on POST.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await guestSession();
  if ("error" in gate) return gate.error;
  const { session, db } = gate;
  const { data: reservation } = await db
    .from("reservations")
    .select("id,user_id,status,check_in,operational_policy_snapshot")
    .eq("id", (await params).id)
    .maybeSingle();
  if (!reservation || reservation.user_id !== session.user.id)
    return publicJson({ error: "Reservation not found." }, { status: 404 });
  if (!["pending", "confirmed"].includes(String(reservation.status)))
    return publicJson({ error: "This reservation can no longer be cancelled online. Please contact Front Desk for help." }, { status: 409 });
  const [paymentResult, chargeResult, adjustmentResult, invoiceResult] = await Promise.all([
    db.from("payments").select("amount,purpose").eq("reservation_id", reservation.id).eq("status", "paid"),
    db.from("folio_charges").select("id,amount,status").eq("reservation_id", reservation.id).eq("category", "transportation"),
    db.from("financial_adjustments").select("source_charge_id,amount,transaction_type").eq("reservation_id", reservation.id),
    db.from("invoices").select("amount").eq("reservation_id", reservation.id).maybeSingle(),
  ]);
  if (paymentResult.error || chargeResult.error || adjustmentResult.error || invoiceResult.error || !invoiceResult.data)
    return publicJson({ error: "We couldn't load the cancellation charges and refund details. Please try again before confirming the cancellation." }, { status: 503 });
  const deposits = paymentResult.data;
  const retainedCharges = Math.min(Number(invoiceResult.data.amount), (chargeResult.data ?? []).reduce((sum, charge) => {
    if (charge.status === "reversed") return sum;
    const reversed = (adjustmentResult.data ?? []).filter((row) => row.source_charge_id === charge.id && row.transaction_type === "reversal").reduce((total, row) => total + Math.round(Number(row.amount) * 100), 0);
    return sum + Math.max(0, Math.round(Number(charge.amount) * 100) - reversed) / 100;
  }, 0));
  const depositPaid = (deposits ?? []).filter((row) => row.purpose === "reservation_deposit").reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const policy = cancellationWindowsFromSnapshot(reservation.operational_policy_snapshot);
  const preview = previewCancellationRefund({
    checkIn: String(reservation.check_in),
    today: hotelToday(policy.hotelTimezone),
    policy,
    depositPaid,
    retainedCharges,
    netPaid: (deposits ?? []).reduce((sum, row) => sum + (row.purpose === "refund" ? -1 : 1) * Number(row.amount || 0), 0),
  });
  return publicJson({ data: preview });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await guestSession();
  if ("error" in gate) return gate.error;
  const { session, db } = gate;
  const id = (await params).id;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Please enter a reason for cancelling." }), { status: 400 });
  const { data, error } = await db.rpc("cancel_reservation", {
    p_reservation_id: id,
    p_actor_user_id: session.user.id,
    p_reason: parsed.data.reason,
  });
  if (error) {
    const message = error.message.includes("OWNERSHIP")
      ? "Reservation not found."
      : error.message.includes("NOT_CANCELLABLE")
        ? "This reservation can no longer be cancelled online. Please contact Front Desk for help."
        : "Unable to cancel this reservation.";
    return publicJson(
      { error: message },
      { status: error.message.includes("OWNERSHIP") ? 404 : 409 },
    );
  }
  const row = data?.[0] ?? null;
  const eligible = Number(row?.eligible_refund ?? 0);
  // Persistent bell entry + optional email copy. Never throws and never
  // blocks the already-committed cancellation (see lib/notifications).
  await notifyWithOptionalEmail(
    {
      userId: session.user.id,
      type: "reservation_cancelled",
      title: "Reservation cancelled",
      detail:
        eligible > 0
          ? "Your eligible refund has been sent to Accounting for processing."
          : "No refund is due under the policy that applied to this reservation.",
      href: `/my-reservations/${id}`,
    },
    session.user.email ?? null,
    {
      subject: "Your Haven reservation was cancelled",
      heading: "Reservation cancelled",
      bodyHtml:
        eligible > 0
          ? "Your reservation has been cancelled. Your eligible refund has been sent to Accounting for processing — track it in Payments & Folio."
          : "Your reservation has been cancelled. No refund is due under the policy that applied to this reservation.",
    },
  );
  return publicJson({ data: row });
}
