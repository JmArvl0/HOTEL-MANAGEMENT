import { Type, type Schema } from "@google/genai";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { getOperationalPolicy } from "@/lib/hotel-policy";
import { portalCatalogOptions } from "@/lib/request-catalog";
import { generateJson } from "@/lib/ai/gemini-client";

/** Guest-facing disclosure + degraded fallback (never a 5xx). */
export const GUEST_CONCIERGE_DISCLOSURE =
  "AI-generated operational guidance. Verify important details with Front Desk staff.";
export const GUEST_CONCIERGE_UNAVAILABLE_MESSAGE =
  "AI assistance is temporarily unavailable. Your bookings, requests, and stay details remain available in the portal.";

export const GUEST_CONCIERGE_SYSTEM_PROMPT = `You are HAVEN Virtual Concierge, a courteous professional hotel concierge for HAVEN Hotel & Residences guests.
- Answer only from the provided stay/policy/amenity context. Never invent times, rates, or availability. If data is missing, say so and direct the guest to the Front Desk.
- You are READ-ONLY: you cannot submit requests, change bookings, or process payments. When the guest wants a service, describe the draft and tell them to use the Confirm Request button.
- Format concisely: short ### headings, bullets, never HTML, tables, or code fences.`;

/** Curated static local guide — no external API by design. */
export const GUEST_LOCAL_GUIDE =
  "Nearby: Greenbelt/Glorietta malls (10-min walk), Ayala Museum, Legazpi Sunday Market. " +
  "Airport ~30-45 min by car depending on traffic; ask Front Desk for the house transfer service. " +
  "House quiet hours 22:00-07:00.";

export const GuestActionDraftSchema = z.object({
  requestTypes: z.array(z.string().min(1).max(60)).min(1).max(3),
  description: z.string().trim().max(500).default(""),
  reservationId: z.string().min(1).max(80),
});
export type GuestActionDraft = z.infer<typeof GuestActionDraftSchema>;

export const GuestConciergeReplySchema = z.object({
  replyText: z.string().min(1).max(2000),
  suggestedPicks: z.array(z.string().min(1).max(80)).max(4).default([]),
  actionDraft: GuestActionDraftSchema.optional(),
});
export type GuestConciergeReply = z.infer<typeof GuestConciergeReplySchema>;

export const GuestConciergeResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    replyText: { type: Type.STRING },
    suggestedPicks: { type: Type.ARRAY, items: { type: Type.STRING } },
    actionDraft: {
      type: Type.OBJECT,
      properties: {
        requestTypes: { type: Type.ARRAY, items: { type: Type.STRING } },
        description: { type: Type.STRING },
        reservationId: { type: Type.STRING },
      },
      required: ["requestTypes", "reservationId"],
    },
  },
  required: ["replyText"],
};

export interface GuestStayContext {
  reservationId: string | null;
  roomType: string | null;
  checkIn: string | null;
  checkOut: string | null;
  status: string | null;
  roomNumber: string | null;
}

export interface GuestConciergeContext {
  policy: string;
  stay: GuestStayContext;
  amenities: string;
  catalog: { value: string; label: string }[];
}

/** PII-safe context: policy + own stay dates/type + amenities + catalog. No contact, payment, or folio data. */
export async function buildGuestConciergeContext(
  userId: string,
  reservationId?: string
): Promise<GuestConciergeContext> {
  const policy = await getOperationalPolicy();
  const policyText =
    `Check-in ${policy.checkInTime}, check-out ${policy.checkOutTime} (${policy.hotelTimezone}). ` +
    `Cancellation: full refund ${policy.cancellationFullRefundDays}+ days before arrival, ` +
    `${policy.cancellationPartialRefundBasisPoints / 100}% at ${policy.cancellationPartialRefundDays}+ days, none after. ` +
    `Incidentals due ${policy.incidentalsDue}. Pets ${policy.petsAllowed ? "allowed" : "not allowed"}, ` +
    `smoking ${policy.smokingAllowed ? "allowed" : "not allowed"}.`;

  const catalog = await portalCatalogOptions();
  const stay: GuestStayContext = {
    reservationId: null,
    roomType: null,
    checkIn: null,
    checkOut: null,
    status: null,
    roomNumber: null,
  };
  let amenities = "No active stay on record — answers use general hotel policy.";

  if (supabase) {
    const query = supabase
      .from("reservations")
      .select("id,room_type,check_in,check_out,status,room_number")
      .eq("user_id", userId)
      .in("status", ["pending", "confirmed", "checked_in"])
      .order("check_in", { ascending: true })
      .limit(5);
    const { data } = await query;
    const rows = (data ?? []) as Record<string, unknown>[];
    const pick = reservationId
      ? rows.find((r) => String(r.id) === reservationId) ?? null
      : rows[0] ?? null;
    if (pick) {
      stay.reservationId = String(pick.id);
      stay.roomType = (pick.room_type as string) ?? null;
      stay.checkIn = (pick.check_in as string) ?? null;
      stay.checkOut = (pick.check_out as string) ?? null;
      stay.status = (pick.status as string) ?? null;
      stay.roomNumber = (pick.room_number as string | null) ?? null;
      if (stay.roomType) {
        const { data: typeRow } = await supabase
          .from("room_types")
          .select("description,amenities")
          .eq("name", stay.roomType)
          .maybeSingle();
        const t = typeRow as { description?: string; amenities?: string[] } | null;
        amenities = t
          ? `${stay.roomType}: ${t.description ?? ""} Amenities: ${(t.amenities ?? []).join(", ")}.`
          : `${stay.roomType} (amenity details unavailable).`;
      }
    }
  }

  return { policy: policyText, stay, amenities, catalog };
}

export function guestConciergeContents(
  context: GuestConciergeContext,
  question: string,
  history: { role: "user" | "assistant"; text: string }[]
): string {
  const stayLine = context.stay.reservationId
    ? `Stay: ${context.stay.roomType ?? "?"} ${context.stay.checkIn ?? ""} to ${context.stay.checkOut ?? ""} (${context.stay.status ?? ""}${context.stay.roomNumber ? `, room ${context.stay.roomNumber}` : ""}), reservation ${context.stay.reservationId}.`
    : "Stay: none on record.";
  const transcript = history.map((t) => `${t.role === "user" ? "Guest" : "Concierge"}: ${t.text}`).join("\n");
  return [
    `POLICY: ${context.policy}`,
    stayLine,
    `AMENITIES: ${context.amenities}`,
    `REQUESTABLE: ${context.catalog.map((c) => c.value).join(", ")}`,
    `LOCAL: ${GUEST_LOCAL_GUIDE}`,
    transcript ? `HISTORY:\n${transcript}` : "",
    `GUEST QUESTION: ${question}`,
    context.stay.reservationId
      ? `If the guest wants a service, set actionDraft with requestTypes from REQUESTABLE and reservationId "${context.stay.reservationId}".`
      : "No stay on record: do not set actionDraft; direct the guest to their reservations.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Server-side ask: returns validated structured reply, never throws. */
export function askGuestConcierge(
  context: GuestConciergeContext,
  question: string,
  history: { role: "user" | "assistant"; text: string }[] = []
) {
  return generateJson({
    systemInstruction: GUEST_CONCIERGE_SYSTEM_PROMPT,
    contents: guestConciergeContents(context, question, history),
    temperature: 0.4,
    responseSchema: GuestConciergeResponseSchema,
    schema: GuestConciergeReplySchema,
  });
}
