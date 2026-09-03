// lib/request-options.ts
// Guest-request options offered at booking checkout (pre-arrival) and in the portal
// Requests module (in-stay). Values/labels mirror public.guest_request_route() in
// 20260904020000_structured_guest_requests.sql, which owns department routing and the
// request text filed on confirmation — keep keys and labels in lockstep with that SQL
// CASE. The DB is permissive for unknown keys; the zod enums built from the value lists
// below are the real gate for what a guest can send.

export type RequestOption = { value: string; label: string };

const LABELS: Record<string, string> = {
  extra_towels: "Extra towels",
  extra_pillows: "Extra pillows",
  toiletries: "Toiletries",
  baby_crib: "Baby crib",
  housekeeping: "Housekeeping request",
  maintenance: "Maintenance concern",
  room_assistance: "Room assistance",
  room_change: "Room change request",
  stay_extension: "Stay extension request",
  general: "General hotel assistance",
  high_floor_quiet: "High floor / quiet room request",
  early_check_in: "Early check-in request",
  late_check_out: "Late check-out request",
  celebration: "Celebration arrangement request",
};

// Shown at booking checkout; each checked value rides on the hold and is auto-filed as
// a guest_requests row once the reservation is confirmed.
export const CHECKOUT_REQUEST_VALUES = [
  "extra_towels", "extra_pillows", "toiletries", "baby_crib",
  "high_floor_quiet", "early_check_in", "celebration",
] as const;

// Shown in the portal Requests module for confirmed / in-stay reservations.
export const PORTAL_REQUEST_VALUES = [
  "extra_towels", "extra_pillows", "toiletries", "housekeeping",
  "maintenance", "room_assistance", "room_change", "stay_extension",
  "late_check_out", "general",
] as const;

export const preArrivalOptions = (): RequestOption[] =>
  CHECKOUT_REQUEST_VALUES.map((value) => ({ value, label: LABELS[value] }));
export const portalOptions = (): RequestOption[] =>
  PORTAL_REQUEST_VALUES.map((value) => ({ value, label: LABELS[value] }));
export const requestLabel = (value: string) => LABELS[value] ?? value.replaceAll("_", " ");
