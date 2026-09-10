import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { issueReservationQrToken } from "@/lib/qr/tokens";

/**
 * Reservation check-in QR for the owning guest (or staff viewing on their
 * behalf). Issues lazily and rotates on every fetch — only the QR currently
 * displayed to the guest is scannable, and each fetch revokes the previous
 * one. Only a CONFIRMED reservation can carry a check-in QR.
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
  if (reservation.status !== "confirmed") {
    return NextResponse.json({ error: "A check-in QR is available once the reservation is confirmed." }, { status: 409 });
  }

  const issued = await issueReservationQrToken(id, session.user.id);
  if (!issued) return NextResponse.json({ error: "Unable to generate the check-in QR." }, { status: 500 });
  return NextResponse.json({ data: issued });
}
