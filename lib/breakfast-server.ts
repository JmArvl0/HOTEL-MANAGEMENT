import "server-only";
import { cache } from "react";
import { supabase } from "@/lib/supabase";
import { calculateNights, calculateReservationDeposit, getDepositPolicy } from "@/lib/booking";
import { parseBreakfast, type BreakfastChoice } from "@/lib/breakfast";

export const hotelBreakfastEnabled = () => process.env.HAVEN_BREAKFAST_ENABLED === "true";

export async function getBreakfastChoice(roomTypeId: string, checkIn: string, checkOut: string, guests: number, roomSubtotal: number, frozen?: unknown): Promise<BreakfastChoice | null> {
  if (!hotelBreakfastEnabled() || !supabase) return null;
  const existing = parseBreakfast(frozen);
  const mornings = calculateNights(checkIn, checkOut);
  const first = new Date(`${checkIn}T00:00:00Z`);
  first.setUTCDate(first.getUTCDate() + 1);
  const published = existing ? null : await supabase.from("hotel_breakfast_offers")
    .select("id,mode,price_minor,venue,service_start,service_end").eq("room_type_id", roomTypeId)
    .eq("status", "published").neq("mode", "off").lte("first_day", first.toISOString().slice(0, 10)).gte("last_day", checkOut).maybeSingle();
  if (published?.error) throw new Error("Breakfast offers are temporarily unavailable.");
  const offer = existing ? { id: existing.offerId, mode: existing.mode, price_minor: existing.unitMinor, venue: existing.venue, service_start: existing.start, service_end: existing.end } : published?.data;
  if (!offer || (offer.mode !== "included" && offer.mode !== "optional")) return null;
  const price = offer.price_minor * guests * mornings / 100;
  const policy = await getDepositPolicy();
  const finance = calculateReservationDeposit(roomSubtotal + price, policy);
  const room = calculateReservationDeposit(roomSubtotal, policy);
  return { id: offer.id, mode: offer.mode, venue: offer.venue, start: offer.service_start.slice(0, 5), end: offer.service_end.slice(0, 5), guests, mornings, price, total: finance.total, deposit: finance.requiredDeposit, balance: finance.remainingBalance,
    roomTotal: room.total, roomDeposit: room.requiredDeposit, roomBalance: room.remainingBalance };
}

export const getGuestBreakfast = cache(async (userId: string, reservationId: string) => {
  if (!supabase) return null;
  const { data: stay, error } = await supabase.from("reservations")
    .select("id,check_out,checked_out_at,status,room_number,confirmation_number,breakfast_snapshot")
    .eq("id", reservationId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Breakfast passes are temporarily unavailable.");
  if (!stay) return null;
  const snapshot = parseBreakfast(stay.breakfast_snapshot);
  if (!snapshot) return { stay, snapshot, days: [] };
  const { data: days, error: dayError } = await supabase.from("hotel_breakfast_days").select("service_date,allowance,used,pass_code")
    .eq("reservation_id", reservationId).order("service_date");
  if (dayError) throw new Error("Breakfast passes are temporarily unavailable.");
  return { stay, snapshot, days: days ?? [] };
});

export function canShowBreakfastPass(stay: { status: string; check_out: string; checked_out_at: string | null }, date: string, timezone: string, serviceEnd: string) {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  function hotelClock(instant: Date) {
    const local = Object.fromEntries(format.formatToParts(instant).map(part => [part.type, part.value]));
    return { day: `${local.year}-${local.month}-${local.day}`, time: `${local.hour}:${local.minute}` };
  }
  const checkoutMorning = stay.status === "checked_out" && date === stay.check_out && stay.checked_out_at
    && hotelClock(new Date(stay.checked_out_at)).day === date;
  if (!(stay.status === "confirmed" || stay.status === "checked_in" || checkoutMorning)) return false;
  const today = hotelClock(new Date());
  return date > today.day || (date === today.day && today.time < serviceEnd);
}
