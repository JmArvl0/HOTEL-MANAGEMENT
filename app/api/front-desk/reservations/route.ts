import { NextResponse } from "next/server";
import { z } from "zod";
import { validationBody } from "@/lib/errors";
import { hotelGuard } from "@/lib/hotel-operations-route";
import { calendarDate, integerInput, localTimePattern, pesoAmount, phoneInput } from "@/lib/input-validation";
import { publicJson } from "@/lib/server-errors";

const requestKey = z.string().uuid();
const schema = z.object({
  guestId: z.string().trim().min(1).max(60).optional(),
  guestName: z.string().trim().max(120),
  email: z.string().trim().max(200),
  phone: z.string().trim().max(40),
  stayPhone: phoneInput.optional(),
  roomType: z.string().trim().min(2).max(100),
  checkIn: calendarDate,
  checkOut: calendarDate,
  guests: integerInput(1, 20),
  source: z.enum(["Front Desk", "Walk-In", "Phone"]),
  specialRequests: z.string().trim().max(1000).optional(),
  expectedArrival: z.union([z.literal(""), z.string().trim().regex(localTimePattern)]).optional(),
  quotedTotal: pesoAmount(0, 100_000_000).optional(),
  idempotencyKey: requestKey,
}).superRefine((value, context) => {
  if (value.checkOut <= value.checkIn) context.addIssue({ code: "custom", path: ["checkOut"], message: "Check-out must be after check-in." });
  if (value.guestId) {
    if (value.email && !z.string().email().safeParse(value.email).success) context.addIssue({ code: "custom", path: ["email"], message: "Enter a valid email for this stay." });
    return;
  }
  if (value.guestName.length < 2) context.addIssue({ code: "custom", path: ["guestName"], message: "Enter the guest's full name." });
  if (!z.string().email().safeParse(value.email).success) context.addIssue({ code: "custom", path: ["email"], message: "Enter a valid guest email." });
  if (!phoneInput.safeParse(value.phone).success) context.addIssue({ code: "custom", path: ["phone"], message: "Enter a valid guest phone number." });
});

const rejected: Record<string, string> = {
  INVALID_DATES: "Choose valid stay dates in the hotel’s time zone.",
  ROOM_TYPE_UNAVAILABLE: "That room type is no longer available for those dates. Review the updated availability.",
  BOOKING_QUOTE_CHANGED: "The rate changed. Review the updated total before booking.",
  INVALID_GUEST_DETAILS: "Confirm the contact details for this stay before booking.",
  GUEST_PROFILE_CHANGED: "The selected guest profile changed. Search again to confirm the correct profile.",
  GUEST_SELECTION_REQUIRED: "A saved profile already uses that email. Select it to continue.",
  GUEST_DO_NOT_RENT: "This reservation requires Management review.",
  IDEMPOTENCY_CONFLICT: "This request was already used. Review Reservations before making a new booking.",
};

export async function GET(request: Request) {
  const context = await hotelGuard(["front_desk"]);
  if (context instanceof NextResponse) return context;
  const key = requestKey.safeParse(new URL(request.url).searchParams.get("requestId"));
  if (!key.success) return publicJson({ error: "A valid booking request is required." }, { status: 400 });
  const { data, error } = await context.client.rpc("hotel_staff_booking_result", { p_actor: context.actor, p_key: key.data });
  if (error) return publicJson({ error: "The earlier booking could not be checked. Try checking again." }, { status: 503 });
  return publicJson({ data });
}

export async function POST(request: Request) {
  const context = await hotelGuard(["front_desk"]);
  if (context instanceof NextResponse) return context;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: parsed.error.issues[0]?.message ?? "Check the guest and stay details." }), { status: 400 });

  const booking = parsed.data;
  const { data, error } = await context.client.rpc("hotel_staff_booking_create", {
    p_actor: context.actor,
    p_key: booking.idempotencyKey,
    p_guest_id: booking.guestId ?? null,
    p_guest_name: booking.guestId ? null : booking.guestName,
    p_email: booking.email || null,
    p_phone: booking.guestId ? null : phoneInput.parse(booking.phone),
    p_stay_phone: booking.stayPhone ?? null,
    p_room_type: booking.roomType,
    p_check_in: booking.checkIn,
    p_check_out: booking.checkOut,
    p_guest_count: booking.guests,
    p_source: booking.source,
    p_requests: booking.specialRequests ?? null,
    p_arrival: booking.expectedArrival || null,
    p_quoted_total: booking.quotedTotal ?? null,
    p_legacy: booking.quotedTotal === undefined && !booking.guestId && !booking.stayPhone,
  });
  if (!error) return publicJson({ data }, { status: 201 });
  const code = Object.keys(rejected).find(value => error.message.includes(value));
  if (code) return publicJson({ error: rejected[code], code, outcome: "rejected" }, { status: 409 });
  if (error.message.includes("HOTEL_FORBIDDEN")) return publicJson({ error: "Only Front Desk can create a booking here." }, { status: 403 });
  return publicJson({ error: "The booking could not be confirmed. Check this request before retrying.", outcome: "unknown" }, { status: 503 });
}
