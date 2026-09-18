import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
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
  if (!session || session.user.disabled) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (session.user.role !== "guest")
    return { error: NextResponse.json({ error: "Customer access required." }, { status: 403 }) };
  if (!supabase) return { error: NextResponse.json({ error: "Database unavailable." }, { status: 503 }) };
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
    return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
  if (!["pending", "confirmed"].includes(String(reservation.status)))
    return NextResponse.json({ error: "This reservation can no longer be cancelled." }, { status: 409 });
  const { data: deposits } = await db
    .from("payments")
    .select("amount")
    .eq("reservation_id", reservation.id)
    .eq("purpose", "reservation_deposit")
    .eq("status", "paid");
  const depositPaid = (deposits ?? []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const policy = cancellationWindowsFromSnapshot(reservation.operational_policy_snapshot);
  const preview = previewCancellationRefund({
    checkIn: String(reservation.check_in),
    today: hotelToday(policy.hotelTimezone),
    policy,
    depositPaid,
  });
  return NextResponse.json({ data: preview });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await guestSession();
  if ("error" in gate) return gate.error;
  const { session, db } = gate;
  const id = (await params).id;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "A cancellation reason is required." }, { status: 400 });
  const { data, error } = await db.rpc("cancel_reservation", {
    p_reservation_id: id,
    p_actor_user_id: session.user.id,
    p_reason: parsed.data.reason,
  });
  if (error) {
    const message = error.message.includes("OWNERSHIP")
      ? "Reservation not found."
      : error.message.includes("NOT_CANCELLABLE")
        ? "This reservation can no longer be cancelled."
        : "Unable to cancel this reservation.";
    return NextResponse.json(
      { error: message },
      { status: error.message.includes("OWNERSHIP") ? 404 : 409 },
    );
  }
  const row = data?.[0] ?? null;
  const eligible = Number(row?.eligible_refund ?? 0);
  // Persistent bell entry + optional email copy. Never throws and never
  // blocks the already-committed cancellation (see lib/notifications).
  void notifyWithOptionalEmail(
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
  return NextResponse.json({ data: row });
}
