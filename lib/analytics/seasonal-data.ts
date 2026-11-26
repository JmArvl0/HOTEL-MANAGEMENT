import { readAllRows } from "@/lib/read-all-rows";
import { supabase } from "@/lib/supabase";
import { getAnalyticsInputs } from "./data";
import { readRecordedOccupancy } from "./evaluation-data";
import { calculateSeasonalOccupancy, matchingHotelDate, type OccupancyActual, type SeasonalOccupancy, type SeasonalRange } from "./seasonal-occupancy";
import { NIGHT_COVERING_STATUSES, shiftDate, type ReservationLike, type RoomLike } from "./types";

export async function loadSeasonalOccupancy(range: SeasonalRange, today: string): Promise<SeasonalOccupancy> {
  const db = supabase;
  if (!db) {
    const input = await getAnalyticsInputs();
    const rooms = input.rooms.filter(room => room.administratively_active !== false).length;
    return { ...calculateSeasonalOccupancy(range, today, rooms, input.reservations, new Map()), databaseMode: "demo" };
  }

  const referenceDates: string[] = [];
  for (let target = range.from; target <= range.through; target = shiftDate(target, 1)) {
    const match = matchingHotelDate(target, range.referenceYear, range.match);
    if (match) referenceDates.push(match);
  }
  referenceDates.sort();
  const referenceFrom = referenceDates[0];
  const referenceThrough = referenceDates.at(-1);
  const openFrom = range.from < today ? today : range.from;
  const closedThrough = range.through < today ? range.through : shiftDate(today, -1);

  const [rooms, reservations, referenceActuals, targetActuals, auditBookings] = await Promise.all([
    readAllRows<Pick<RoomLike, "id" | "administratively_active">>(() => db.from("rooms")
      .select("id,administratively_active").returns<Pick<RoomLike, "id" | "administratively_active">[]>()),
    openFrom <= range.through ? readAllRows<ReservationLike>(() => db.from("reservations")
      .select("id,status,check_in,check_out,created_at").in("status", NIGHT_COVERING_STATUSES)
      .gt("check_out", openFrom).lte("check_in", range.through).returns<ReservationLike[]>()) : [],
    referenceFrom && referenceThrough ? readRecordedOccupancy(referenceFrom, referenceThrough) : new Map(),
    readRecordedOccupancy(range.from, closedThrough),
    referenceFrom && referenceThrough ? readAllRows<{ business_date: string; closed_at: string; snapshot: { bookedNights?: number; serviceableCapacity?: number } }>(
      () => db.from("hotel_night_audits").select("business_date,closed_at,snapshot")
        .gte("business_date", referenceFrom).lte("business_date", referenceThrough), "business_date") : []
  ]);

  const activeRooms = rooms.filter(room => room.administratively_active !== false).length;
  const actuals = new Map([...referenceActuals, ...targetActuals]);
  const booked = new Map<string, OccupancyActual>();
  for (const row of auditBookings) {
    const { bookedNights, serviceableCapacity } = row.snapshot;
    if (typeof bookedNights !== "number" || bookedNights < 0 || !serviceableCapacity || serviceableCapacity < 0) continue;
    booked.set(row.business_date, { percent: bookedNights / serviceableCapacity * 100, recordedAt: row.closed_at });
  }
  return { ...calculateSeasonalOccupancy(range, today, activeRooms, reservations, actuals, booked), databaseMode: "supabase" };
}
