import { countNights } from "./occupancy";
import { shiftDate, type ReservationLike } from "./types";

export type SeasonalView = "month" | "date";
export type SeasonalSelection = { view: SeasonalView; target: string; referenceYear: number };
export type SeasonalRange = SeasonalSelection & { from: string; through: string };
export type OccupancyActual = { percent: number; recordedAt: string };

function isHotelDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function nextHotelMonth(date: string): string {
  const month = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  month.setUTCMonth(month.getUTCMonth() + 1);
  return month.toISOString().slice(0, 7);
}

export function seasonalTargetLimit(today: string): string {
  return shiftDate(`${nextHotelMonth(shiftDate(today, 730))}-01`, -1);
}

export function seasonalRange(selection: SeasonalSelection, today: string): SeasonalRange | null {
  const { view, target, referenceYear } = selection;
  if (view === "month" && !/^\d{4}-\d{2}$/.test(target)) return null;
  const from = view === "month" ? `${target}-01` : target;
  const targetYear = Number(from.slice(0, 4));
  if (!isHotelDate(from) || from > seasonalTargetLimit(today) || !Number.isInteger(referenceYear)
    || referenceYear < 1000 || referenceYear >= targetYear) return null;
  const through = view === "month" ? shiftDate(`${nextHotelMonth(from)}-01`, -1) : from;
  return { ...selection, from, through };
}

export function matchingHotelDate(targetDate: string, referenceYear: number): string | null {
  const referenceDate = `${referenceYear}${targetDate.slice(4)}`;
  return isHotelDate(referenceDate) ? referenceDate : null;
}

export function calculateSeasonalOccupancy(
  range: SeasonalRange,
  today: string,
  activeRooms: number,
  reservations: ReservationLike[],
  actuals: ReadonlyMap<string, OccupancyActual>
) {
  const days = [];
  for (let date = range.from; date <= range.through; date = shiftDate(date, 1)) {
    const referenceDate = matchingHotelDate(date, range.referenceYear);
    const reference = referenceDate ? actuals.get(referenceDate) ?? null : null;
    const closed = date < today;
    const actual = closed ? actuals.get(date) ?? null : null;
    const bookedRooms = closed ? null : countNights(reservations, date, false);
    const bookedPercent = bookedRooms !== null && activeRooms > 0 ? bookedRooms / activeRooms * 100 : null;
    const overCapacity = bookedRooms !== null && bookedRooms > activeRooms;
    const projectedRooms = reference && bookedRooms !== null && activeRooms > 0 && !overCapacity
      ? Math.max(bookedRooms, Math.round(reference.percent * activeRooms / 100))
      : null;
    days.push({
      date, referenceDate, reference, actual, bookedRooms, bookedPercent, projectedRooms, overCapacity,
      projectedPercent: projectedRooms !== null ? projectedRooms / activeRooms * 100 : null
    });
  }

  const meanOfCompleteDates = (values: (number | null)[]) => values.every(value => value !== null)
    ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0) / values.length : null;
  const booked = days.flatMap(day => day.bookedRooms === null ? [] : [day.bookedRooms]);
  const hasOpenDates = booked.length > 0;
  const comparisonDays = days.filter(day => day.reference !== null).length;

  return {
    today,
    activeRooms,
    days,
    summary: {
      comparisonDays,
      targetDays: days.length,
      hasOpenDates,
      bookedRoomNights: hasOpenDates ? booked.reduce((sum, count) => sum + count, 0) : null,
      baselinePercent: meanOfCompleteDates(days.map(day => day.reference?.percent ?? null)),
      periodOccupancy: meanOfCompleteDates(days.map(day => day.date < today ? day.actual?.percent ?? null : day.projectedPercent))
    }
  };
}

export type SeasonalOccupancy = ReturnType<typeof calculateSeasonalOccupancy> & { databaseMode: "demo" | "supabase" };
