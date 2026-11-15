import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { getServerSession } from "next-auth";

import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { guestDetailsSchema, hotelToday, searchSchemaFor } from "@/lib/booking";
import { supabase } from "@/lib/supabase";
import { findUnavailableSelections, getPreArrivalOptions, PRE_ARRIVAL_UNAVAILABLE_MESSAGE } from "@/lib/inventory-request-options";
import { escapeEmailText, guestEmailHtml } from "@/lib/email";
import { deliverGuestEmail } from "@/lib/guest-email-delivery";
import { xenditConfigured } from "@/lib/xendit";

function invalid(error: z.ZodError, fallback: string) {
  const fields = Object.fromEntries(error.issues.filter(issue => issue.path.length)
    .map(issue => [issue.path.filter(part => typeof part === "string").at(-1), issue.message]));
  return publicJson(validationBody(error, { error: error.issues[0]?.message ?? fallback, fields }), { status: 400 });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending) {
    return publicJson({ error: "Sign in to continue your reservation." }, { status: 401 });
  }
  if (session.user.role !== "guest") return publicJson({ error: "Please sign in with a guest account to continue." }, { status: 403 });
  if (!supabase) return publicJson({ error: "Booking is temporarily unavailable." }, { status: 503 });
  const input = await request.json().catch(() => null);
  const parsed = guestDetailsSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error, "Check your guest details.");
  const attempt = z.object({ attemptId: z.string().uuid() }).safeParse(input);
  if (!attempt.success) return invalid(attempt.error, "Reload the page to start a new booking attempt.");
  const details = parsed.data;

  try {
    const prior = await supabase.rpc("read_booking_hold_attempt", {
      p_user: session.user.id, p_attempt: attempt.data.attemptId, p_details: details,
    });
    if (prior.error) {
      const code = ["HOLD_ATTEMPT_EXPIRED", "RETRY_PAYLOAD_CONFLICT"].find(item => prior.error!.message.includes(item));
      if (code) return publicJson({ error: "Start a new attempt with the current booking details.", code }, { status: 409 });
      throw prior.error;
    }
    if (prior.data?.token) return publicJson({ token: prior.data.token });

    const policy = await supabase.from("hotel_operational_policies").select("deposit_method,hotel_timezone").eq("key", "default").single();
    if (policy.error) throw policy.error;
    if (policy.data.deposit_method !== "xendit" || !xenditConfigured()) {
      return publicJson({ error: "Online checkout is unavailable. Contact Front Desk for help booking this stay." }, { status: 409 });
    }
    const search = searchSchemaFor(hotelToday(policy.data.hotel_timezone)).safeParse(details);
    if (!search.success) return invalid(search.error, "Please choose valid check-in and check-out dates.");

    const live = await getPreArrivalOptions();
    if (findUnavailableSelections(details.requestOptions, live).length) {
      return publicJson({ error: PRE_ARRIVAL_UNAVAILABLE_MESSAGE, fields: { requestOptions: PRE_ARRIVAL_UNAVAILABLE_MESSAGE } }, { status: 400 });
    }
    const { data, error } = await supabase.rpc("create_booking_hold_attempt", {
      p_user: session.user.id, p_attempt: attempt.data.attemptId, p_details: details, p_breakfast_enabled: false,
    });
    if (error) {
      const conflicts: Record<string, string> = {
        ROOM_TYPE_UNAVAILABLE: "This room is no longer available for your selected dates. Please choose another room.",
        EXACT_ROOM_UNAVAILABLE: "This room is no longer available for your selected dates. Please choose another room.",
        HOLD_NOT_FOUND: "The previous hold expired. Choose an available room.",
        HOLD_ATTEMPT_EXPIRED: "This booking attempt expired. Start a new booking.",
        RETRY_PAYLOAD_CONFLICT: "These details differ from your earlier booking attempt. Review your bookings before starting again.",
        DEPOSIT_AMOUNT_UNAVAILABLE: "This stay cannot be booked online. Please contact Front Desk for help.",
        DEPOSIT_POLICY_UNAVAILABLE: "Online checkout is unavailable. Contact Front Desk to book.",
        GUEST_DO_NOT_RENT: "Contact Front Desk for help with this reservation.",
      };
      const key = Object.keys(conflicts).find(code => error.message.includes(code));
      if (key) return publicJson({ error: conflicts[key], code: key }, { status: 409 });
      if (/INVALID_TRANSPORTATION_PREFERENCES|INVALID_DATES|INVALID_GUEST_COUNT/.test(error.message)) {
        return publicJson({ error: "Check the stay and transportation details." }, { status: 400 });
      }
      throw error;
    }
    const hold = data as { token: string; expiresAt: string; replayed: boolean; roomType: string };
    if (details.email && Date.parse(hold.expiresAt) > Date.now()) {
      const base = new URL(process.env.NEXTAUTH_URL ?? request.url).origin;
      const expires = new Intl.DateTimeFormat("en-PH", { timeZone: policy.data.hotel_timezone, timeStyle: "short" }).format(new Date(hold.expiresAt));
      await deliverGuestEmail(`hold-payment:${hold.token}`, {
        to: details.email, subject: "Your Haven booking hold",
        html: guestEmailHtml("Your room is held", `<p>We are holding your ${escapeEmailText(hold.roomType)} from ${details.checkIn} to ${details.checkOut} until ${escapeEmailText(expires)} hotel time.</p><p><a href="${base}/booking/payment/${hold.token}">Open Haven checkout</a></p>`),
      }, hold.replayed);
    }
    return publicJson({ token: hold.token }, { status: hold.replayed ? 200 : 201 });
  } catch {
    return publicJson({ error: "We couldn't confirm your room hold. Try again with the same details to check this booking attempt." }, { status: 503 });
  }
}
