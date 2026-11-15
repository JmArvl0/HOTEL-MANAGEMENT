import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { calendarDate, integerInput } from "@/lib/input-validation";
import { getServerSession } from "next-auth";

import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { operationalPolicyFromSnapshot } from "@/lib/hotel-policy";
import { notifyWithOptionalEmail } from "@/lib/notifications";

const schema = z.object({
  checkIn: calendarDate.optional(),
  checkOut: calendarDate.optional(),
  roomType: z.string().trim().min(1).max(100).optional(),
  guests: integerInput(1, 8).optional(),
  specialRequests: z.string().trim().max(1000).optional(),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().uuid(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (session.user.role !== "guest") return publicJson({ error: "Please sign in with a guest account to continue." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: parsed.error.issues[0]?.message ?? "Please check the dates, room type and reason for this change." }), { status: 400 });
  const id = (await params).id;
  const { data: owned, error: lookupError } = await supabase
    .from("reservations")
    .select("id,guest_email,confirmation_number,operational_policy_snapshot,breakfast_snapshot,check_in,check_out,room_type,guests")
    .eq("id", id)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (lookupError) return publicJson({ error: "Unable to load the reservation." }, { status: 503 });
  if (!owned) return publicJson({ error: "Reservation not found." }, { status: 404 });
  if (owned.breakfast_snapshot && ((parsed.data.checkIn && parsed.data.checkIn !== owned.check_in)
    || (parsed.data.checkOut && parsed.data.checkOut !== owned.check_out) || (parsed.data.roomType && parsed.data.roomType !== owned.room_type)
    || (parsed.data.guests !== undefined && parsed.data.guests !== owned.guests))) {
    return publicJson({ error: "This stay includes breakfast. Contact Front Desk to review booking change options." }, { status: 409 });
  }
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
    if (error.message.includes("MODIFICATION_PAYMENT_IN_PROGRESS")) return publicJson({ error: "A payment is already in progress for this stay. Check its status before changing the reservation." }, { status: 409 });
    if (error.message.includes("AMENDMENT_BUSY") || error.message.includes("AMENDMENT_QUOTE_CHANGED")) return publicJson({ error: "Availability or pricing changed while saving. Refresh your reservation and try again." }, { status: 409 });
    if (error.message.includes("PARTY_CAPACITY")) return publicJson({ error: "The guest count cannot be lower than the number of guests already on the reservation." }, { status: 409 });
    if (error.message.includes("BREAKFAST_AMENDMENT_UNAVAILABLE")) return publicJson({ error: "This stay includes breakfast. Contact Front Desk for help changing the booking." }, { status: 409 });
    if (error.message.includes("RESERVATION_NOT_FOUND")) return publicJson({ error: "Reservation not found." }, { status: 404 });
    if (error.message.includes("MODIFICATION_INVENTORY_UNAVAILABLE") || error.message.includes("ROOM_TYPE_UNAVAILABLE")) return publicJson({ error: "This room type is no longer available for your selected dates. Choose another room type or change the dates." }, { status: 409 });
    if (error.message.includes("CHANGE_ALREADY_OPEN")) return publicJson({ error: "A change to this reservation is already being reviewed or completed. Check its status before requesting another change." }, { status: 409 });
    if (error.message.includes("RESERVATION_NOT_MODIFIABLE")) return publicJson({ error: "This reservation cannot be modified." }, { status: 409 });
    if (error.message.includes("TRANSPORT_REQUIRES_STAFF")) return publicJson({ error: "Contact Front Desk to coordinate your hotel transport before changing the stay." }, { status: 409 });
    if (error.message.includes("RETRY_PAYLOAD_CONFLICT")) return publicJson({ error: "These details differ from your earlier change request. Check its status before starting another request." }, { status: 409 });
    return publicJson({ error: "Unable to process the reservation change." }, { status: 503 });
  }
  // Bell entry, addressed per change request so replays of the same
  // idempotency key collapse into the partial unique index instead of a
  // second item. Never throws; the committed request stays authoritative.
  const confirmation = String(owned.confirmation_number ?? id);
  const executed = (data as { status?: string } | null)?.status === "executed";
  const changeId = String((data as { id?: string } | null)?.id ?? parsed.data.idempotencyKey);
  await notifyWithOptionalEmail(
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
  return publicJson({ data: { ...data, selfServiceModificationDays } }, { status: 201 });
}
