import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { operationalPolicyFromSnapshot } from "@/lib/hotel-policy";
import { notifyWithOptionalEmail } from "@/lib/notifications";

const date = /^\d{4}-\d{2}-\d{2}$/;
const schema = z.object({
  checkIn: z.string().regex(date).optional(),
  checkOut: z.string().regex(date).optional(),
  roomType: z.string().trim().min(1).max(100).optional(),
  guests: z.coerce.number().int().min(1).max(8).optional(),
  specialRequests: z.string().trim().max(1000).optional(),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().uuid(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "guest") return NextResponse.json({ error: "Customer access required." }, { status: 403 });
  if (!supabase) return NextResponse.json({ error: "Database unavailable." }, { status: 503 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid change request." }, { status: 400 });
  const id = (await params).id;
  const { data: owned } = await supabase
    .from("reservations")
    .select("id,guest_email,confirmation_number,operational_policy_snapshot")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!owned) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
  const { selfServiceModificationDays } = operationalPolicyFromSnapshot(owned.operational_policy_snapshot);
  const { data, error } = await supabase.rpc("customer_request_reservation_change", {
    p_user_id: session.user.id,
    p_reservation_id: id,
    p_check_in: parsed.data.checkIn ?? null,
    p_check_out: parsed.data.checkOut ?? null,
    p_room_type: parsed.data.roomType ?? null,
    p_guests: parsed.data.guests ?? null,
    p_special_requests: parsed.data.specialRequests ?? null,
    p_reason: parsed.data.reason,
    p_idempotency_key: parsed.data.idempotencyKey,
  });
  if (error) {
    if (error.message.includes("RESERVATION_NOT_FOUND")) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    if (error.message.includes("MODIFICATION_INVENTORY_UNAVAILABLE") || error.message.includes("ROOM_TYPE_UNAVAILABLE")) return NextResponse.json({ error: "The requested room type or dates are no longer available." }, { status: 409 });
    if (error.message.includes("CHANGE_ALREADY_OPEN")) return NextResponse.json({ error: "A reservation change is already awaiting review or execution." }, { status: 409 });
    if (error.message.includes("RESERVATION_NOT_MODIFIABLE")) return NextResponse.json({ error: "This reservation cannot be modified." }, { status: 409 });
    if (error.message.includes("TRANSPORT_REQUIRES_STAFF")) return NextResponse.json({ error: "This reservation has hotel transport charged to its folio, which cannot be recalculated automatically. Please message Front Desk to change your dates or room." }, { status: 409 });
    return NextResponse.json({ error: "Unable to process the reservation change." }, { status: 409 });
  }
  // Bell entry, addressed per change request so replays of the same
  // idempotency key collapse into the partial unique index instead of a
  // second item. Never throws; the committed request stays authoritative.
  const confirmation = String(owned.confirmation_number ?? id);
  const executed = (data as { status?: string } | null)?.status === "executed";
  const changeId = String((data as { id?: string } | null)?.id ?? parsed.data.idempotencyKey);
  void notifyWithOptionalEmail(
    {
      userId: session.user.id,
      type: "reservation_change_submitted",
      title: executed ? "Reservation change completed" : "Change request submitted",
      detail: executed
        ? `${confirmation} was updated as requested.`
        : `${confirmation} — your requested changes are now under review.`,
      href: `/my-reservations/${id}#change-${changeId}`,
    },
    typeof owned.guest_email === "string" ? owned.guest_email : null,
    executed
      ? {
          subject: "Your reservation change is complete",
          heading: "Reservation updated",
          bodyHtml: `<p>Reservation <strong>${confirmation}</strong> was updated as you requested.</p>`,
        }
      : {
          subject: "Your reservation change is under review",
          heading: "Change request submitted",
          bodyHtml: `<p>Your requested changes to reservation <strong>${confirmation}</strong> are now under review. We will notify you when there is an update.</p>`,
        }
  );
  return NextResponse.json({ data: { ...data, selfServiceModificationDays } }, { status: 201 });
}
