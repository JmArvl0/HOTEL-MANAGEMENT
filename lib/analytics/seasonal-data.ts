import { readAllRows } from "@/lib/read-all-rows";
import { supabase } from "@/lib/supabase";
import { getAnalyticsInputs } from "./data";
import { readRecordedOccupancy } from "./evaluation-data";
import { calculateSeasonalOccupancy, matchingHotelDate, nextHotelMonth, type SeasonalOccupancy, type SeasonalRange } from "./seasonal-occupancy";
import { NIGHT_COVERING_STATUSES, shiftDate, type ReservationLike, type RoomLike } from "./types";

export async function loadSeasonalOccupancy(range: SeasonalRange, today: string): Promise<SeasonalOccupancy> {
  const db = supabase;
  if (!db) {
    const input = await getAnalyticsInputs();
    const rooms = input.rooms.filter(room => room.administratively_active !== false).length;
    return { ...calculateSeasonalOccupancy(range, today, rooms, input.reservations, new Map()), databaseMode: "demo" };
  }

  const referenceFrom = matchingHotelDate(range.from, range.referenceYear);
  const referenceThrough = range.view === "month" && referenceFrom
    ? shiftDate(`${nextHotelMonth(referenceFrom)}-01`, -1)
    : referenceFrom;
  const openFrom = range.from < today ? today : range.from;
  const closedThrough = range.through < today ? range.through : shiftDate(today, -1);

  const [rooms, reservations, referenceActuals, targetActuals] = await Promise.all([
    readAllRows<Pick<RoomLike, "id" | "administratively_active">>(() => db.from("rooms")
      .select("id,administratively_active").returns<Pick<RoomLike, "id" | "administratively_active">[]>()),
    openFrom <= range.through ? readAllRows<ReservationLike>(() => db.from("reservations")
      .select("id,status,check_in,check_out,created_at").in("status", NIGHT_COVERING_STATUSES)
      .gt("check_out", openFrom).lte("check_in", range.through).returns<ReservationLike[]>()) : [],
    referenceFrom && referenceThrough ? readRecordedOccupancy(referenceFrom, referenceThrough) : new Map(),
    readRecordedOccupancy(range.from, closedThrough)
  ]);

  const activeRooms = rooms.filter(room => room.administratively_active !== false).length;
  const actuals = new Map([...referenceActuals, ...targetActuals]);
  return { ...calculateSeasonalOccupancy(range, today, activeRooms, reservations, actuals), databaseMode: "supabase" };
}
