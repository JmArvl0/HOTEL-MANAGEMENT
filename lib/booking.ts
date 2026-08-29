import { z } from "zod";
import { formatPeso } from "@/lib/format";
import { supabase } from "@/lib/supabase";

export const BLOCKING_RESERVATION_STATUSES = ["pending", "confirmed", "checked_in"] as const;
export const HOLD_MINUTES = 15;

export type DepositPolicy = {
  enabled: boolean;
  calculationType: "percentage" | "fixed";
  percentageBasisPoints: number;
  fixedAmount: number;
  holdMinutes: number;
  remainingBalanceDue: string;
};

export const DEFAULT_DEPOSIT_POLICY: DepositPolicy = {
  enabled: true,
  calculationType: "percentage",
  percentageBasisPoints: 3000,
  fixedAmount: 0,
  holdMinutes: HOLD_MINUTES,
  remainingBalanceDue: "At hotel / check-in according to hotel policy",
};

export const rangesOverlap = (existingCheckIn: string, existingCheckOut: string, requestedCheckIn: string, requestedCheckOut: string) =>
  existingCheckIn < requestedCheckOut && existingCheckOut > requestedCheckIn;
export const isBlockingReservationStatus = (status: string) =>
  (BLOCKING_RESERVATION_STATUSES as readonly string[]).includes(status);

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export const hotelToday = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

export const searchSchema = z.object({
  checkIn: z.string().regex(datePattern, "Choose a valid check-in date."),
  checkOut: z.string().regex(datePattern, "Choose a valid check-out date."),
  guests: z.coerce.number().int().min(1).max(8),
}).superRefine((value, ctx) => {
  if (value.checkIn < hotelToday()) ctx.addIssue({ code: "custom", path: ["checkIn"], message: "Check-in cannot be in the past." });
  if (value.checkOut <= value.checkIn) ctx.addIssue({ code: "custom", path: ["checkOut"], message: "Check-out must be after check-in." });
});

export const guestDetailsSchema = z.object({
  roomType: z.string().min(1).max(100),
  checkIn: z.string().regex(datePattern),
  checkOut: z.string().regex(datePattern),
  guests: z.coerce.number().int().min(1).max(8),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  mobile: z.string().trim().min(7).max(30),
  address: z.string().trim().max(300).optional().default(""),
  nationality: z.string().trim().max(80).optional().default(""),
  expectedArrival: z.string().trim().max(40).optional().default(""),
  specialRequests: z.string().trim().max(1000).optional().default(""),
});

export const depositSubmissionSchema = z.object({
  paymentMethod: z.enum(["manual_bank_transfer", "manual_gcash"]),
  paymentReference: z.string().trim().min(4, "Enter the transfer reference supplied by your payment service.").max(120),
});

export type SearchInput = z.infer<typeof searchSchema>;
export type GuestDetailsInput = z.infer<typeof guestDetailsSchema>;

export type AvailableRoomType = {
  id: string; name: string; description: string; maxGuests: number; beds: string;
  sizeSqm: number | null; amenities: string[]; nightlyRate: number; nights: number;
  subtotal: number; availableUnits: number;
};

export function calculateNights(checkIn: string, checkOut: string) {
  return Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86_400_000);
}

export const toCentavos = (pesos: number | string) => Math.round(Number(pesos) * 100);
export const fromCentavos = (centavos: number) => centavos / 100;

export function calculateReservationDeposit(total: number | string, policy: DepositPolicy) {
  const totalCentavos = Math.max(0, toCentavos(total));
  if (!policy.enabled) return { total: fromCentavos(totalCentavos), requiredDeposit: 0, remainingBalance: fromCentavos(totalCentavos) };
  const requiredCentavos = policy.calculationType === "percentage"
    ? Math.round(totalCentavos * policy.percentageBasisPoints / 10_000)
    : Math.min(totalCentavos, toCentavos(policy.fixedAmount));
  return {
    total: fromCentavos(totalCentavos),
    requiredDeposit: fromCentavos(requiredCentavos),
    remainingBalance: fromCentavos(totalCentavos - requiredCentavos),
  };
}

export function calculateFinancialState(total: number | string, paid: number | string) {
  const totalCentavos = Math.max(0, toCentavos(total));
  const paidCentavos = Math.min(totalCentavos, Math.max(0, toCentavos(paid)));
  return { total: fromCentavos(totalCentavos), paid: fromCentavos(paidCentavos), balance: fromCentavos(totalCentavos - paidCentavos) };
}

export const depositPolicyLabel = (policy: DepositPolicy) =>
  policy.calculationType === "percentage" ? `${policy.percentageBasisPoints / 100}%` : formatPeso(policy.fixedAmount);

// Re-exported so existing server-side importers keep working; client components
// must import it from "@/lib/format" directly to stay off the supabase chain.
export { formatPeso };

export function safeInternalPath(value: string | null | undefined, fallback = "/manager_dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  try {
    const url = new URL(value, "http://haven.local");
    return url.origin === "http://haven.local" ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch { return fallback; }
}

export async function getDepositPolicy(): Promise<DepositPolicy> {
  if (!supabase) return DEFAULT_DEPOSIT_POLICY;
  const { data } = await supabase.from("reservation_deposit_policies")
    .select("enabled,calculation_type,percentage_basis_points,fixed_amount,hold_minutes,remaining_balance_due")
    .eq("key", "online_reservation").maybeSingle();
  if (!data) return DEFAULT_DEPOSIT_POLICY;
  return {
    enabled: Boolean(data.enabled),
    calculationType: data.calculation_type === "fixed" ? "fixed" : "percentage",
    percentageBasisPoints: Number(data.percentage_basis_points),
    fixedAmount: Number(data.fixed_amount),
    holdMinutes: Number(data.hold_minutes),
    remainingBalanceDue: String(data.remaining_balance_due),
  };
}

export function policyFromSnapshot(snapshot: unknown): DepositPolicy {
  if (!snapshot || typeof snapshot !== "object") return DEFAULT_DEPOSIT_POLICY;
  const value = snapshot as Record<string, unknown>;
  return {
    enabled: true,
    calculationType: value.calculationType === "fixed" ? "fixed" : "percentage",
    percentageBasisPoints: Number(value.percentageBasisPoints ?? DEFAULT_DEPOSIT_POLICY.percentageBasisPoints),
    fixedAmount: Number(value.fixedAmount ?? 0),
    holdMinutes: DEFAULT_DEPOSIT_POLICY.holdMinutes,
    remainingBalanceDue: String(value.remainingBalanceDue ?? DEFAULT_DEPOSIT_POLICY.remainingBalanceDue),
  };
}

export type InventoryRoomRow = { type: string; status: string; housekeeping: string | null };
export type BlockingReservationRow = {
  room_type: string; check_in: string; check_out: string; status: string;
  source?: string | null; payment_due_at?: string | null;
};
export type ActiveHoldRow = {
  room_type: string; check_in: string; check_out: string; status: string;
  expires_at: string; reservation_id?: string | null;
};
export type AvailabilityWindow = { checkIn: string; checkOut: string; now: string; today: string };

/**
 * Sellable units of one room type over the half-open stay `[checkIn, checkOut)`.
 * Pure: the rows may be any superset of the window, since the overlap rule filters
 * them here rather than relying on the caller's query. `getAvailability` narrows in
 * SQL only to move fewer rows.
 */
export function countAvailableUnits(
  roomType: string,
  window: AvailabilityWindow,
  rows: { rooms: InventoryRoomRow[]; reservations: BlockingReservationRow[]; holds: ActiveHoldRow[] },
) {
  const { checkIn, checkOut, now, today } = window;
  const overlaps = (row: { check_in: string; check_out: string }) =>
    rangesOverlap(row.check_in, row.check_out, checkIn, checkOut);
  // A room out of service can never be sold; a dirty one only once housekeeping has a day to reach it.
  const inventory = rows.rooms.filter((room) =>
    room.type === roomType && room.status !== "maintenance" && (checkIn > today || room.housekeeping === "clean")).length;
  const blocked = rows.reservations.filter((reservation) => {
    if (reservation.room_type !== roomType) return false;
    if (!isBlockingReservationStatus(reservation.status) || !overlaps(reservation)) return false;
    if (reservation.status !== "pending") return true;
    // An unpaid website reservation past its payment deadline has released its inventory.
    return String(reservation.source ?? "").toLowerCase() !== "website"
      || !reservation.payment_due_at || reservation.payment_due_at > now;
  }).length;
  const held = rows.holds.filter((hold) =>
    hold.room_type === roomType && !hold.reservation_id && overlaps(hold)
    && ["active", "payment_submitted"].includes(hold.status) && hold.expires_at > now).length;
  return Math.max(0, inventory - blocked - held);
}

export async function getAvailability(input: SearchInput): Promise<AvailableRoomType[]> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success || !supabase) return [];
  const { checkIn, checkOut, guests } = parsed.data;
  const now = new Date().toISOString();
  const [{ data: types, error: typeError }, { data: rooms, error: roomError }, { data: reservations, error: reservationError }, { data: holds, error: holdError }] = await Promise.all([
    supabase.from("room_types").select("id,name,description,max_guests,beds,size_sqm,amenities,base_rate").eq("active", true).gte("max_guests", guests),
    supabase.from("rooms").select("type,status,housekeeping"),
    supabase.from("reservations").select("room_type,check_in,check_out,status,source,payment_due_at").in("status", [...BLOCKING_RESERVATION_STATUSES]).lt("check_in", checkOut).gt("check_out", checkIn),
    supabase.from("booking_holds").select("room_type,check_in,check_out,status,expires_at,reservation_id").in("status", ["active","payment_submitted"]).gt("expires_at", now).lt("check_in", checkOut).gt("check_out", checkIn),
  ]);
  if (typeError || roomError || reservationError || holdError) throw typeError || roomError || reservationError || holdError;
  const nights = calculateNights(checkIn, checkOut);
  const window = { checkIn, checkOut, now, today: hotelToday() };
  const rows = { rooms: rooms ?? [], reservations: reservations ?? [], holds: holds ?? [] };
  return (types ?? []).map((type) => {
    const rate = Number(type.base_rate);
    return { id: type.id, name: type.name, description: type.description, maxGuests: type.max_guests, beds: type.beds, sizeSqm: type.size_sqm, amenities: Array.isArray(type.amenities) ? type.amenities.map(String) : [], nightlyRate: rate, nights, subtotal: rate * nights, availableUnits: countAvailableUnits(type.name, window, rows) };
  }).filter((type) => type.availableUnits > 0).sort((a, b) => a.nightlyRate - b.nightlyRate);
}

export async function getRoomType(name: string, search: SearchInput) {
  return (await getAvailability(search)).find((room) => room.name === name) ?? null;
}

export async function getGuestProfile(userId: string, email?: string | null) {
  if (!supabase) return null;
  const columns = "first_name,last_name,email,phone,address,nationality,special_requests";
  const { data: linked } = await supabase.from("guests").select(columns).eq("user_account_id", userId).limit(1).maybeSingle();
  if (linked || !email) return linked;
  const { data } = await supabase.from("guests").select(columns).eq("email", email.toLowerCase()).is("user_account_id",null).limit(1).maybeSingle();
  return data;
}

export async function getOwnedHold(token: string, userId: string) {
  if (!supabase || !z.string().uuid().safeParse(token).success) return null;
  await supabase.rpc("expire_booking_holds");
  const { data } = await supabase.from("booking_holds").select("*").eq("token", token).eq("user_id", userId).maybeSingle();
  return data;
}

const reservationColumns = "id,confirmation_number,guest_name,guest_email,room_type,room_number,check_in,check_out,guests,status,total,deposit,deposit_required,deposit_policy_snapshot,payment_due_at,payment_status,payment_method,source,special_requests,expected_arrival,created_at";

export async function getGuestReservations(userId: string) {
  if (!supabase) return [];
  await supabase.rpc("expire_booking_holds");
  const { data, error } = await supabase.from("reservations").select(reservationColumns).eq("user_id", userId).order("check_in", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getGuestReservation(userId: string, id: string) {
  if (!supabase) return null;
  await supabase.rpc("expire_booking_holds");
  const { data } = await supabase.from("reservations").select(reservationColumns).eq("id", id).eq("user_id", userId).maybeSingle();
  return data;
}
