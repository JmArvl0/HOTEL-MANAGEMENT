import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { ensureReservationQrToken, RESERVATION_QR_ACTIVE_STATUSES } from "@/lib/qr/tokens";

/**
 * Reservation stay-lifecycle QR for the owning guest (or staff viewing on
 * their behalf). Idempotent: returns the existing stable QR for an active
 * reservation/stay — viewing never rotates or duplicates it. Only confirmed
 * and checked-in reservations hold a QR; terminal states (checked_out,
 * cancelled, no_show) and pending are refused here AND at resolve time, so a
 * hidden button alone never guards regeneration.
 */

const STAFF = new Set(["front_desk", "manager", "owner", "admin"]);

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });

  const { id } = await context.params;
  const { data: reservation } = await supabase.from("reservations").select("id,user_id,status").eq("id", id).maybeSingle();
  if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

  const isOwner = session.user.role === "guest" && reservation.user_id === session.user.id;
  if (!STAFF.has(session.user.role) && !isOwner) {
    return NextResponse.json({ error: "Not authorized to view this reservation." }, { status: 403 });
  }
  if (!(RESERVATION_QR_ACTIVE_STATUSES as readonly string[]).includes(reservation.status)) {
    return NextResponse.json({ error: reservation.status === "pending" ? "A check-in QR is available once the reservation is confirmed." : "This reservation is closed — its QR is permanently inactive and cannot be reissued." }, { status: 409 });
  }

  const issued = await ensureReservationQrToken(id, session.user.id);
  if (!issued) return NextResponse.json({ error: "Unable to generate the check-in QR." }, { status: 500 });
  return NextResponse.json({ data: issued });
}
