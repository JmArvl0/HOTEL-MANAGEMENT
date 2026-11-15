import { z } from "zod";

export const breakfastDate = z.string().date();
export const breakfastOfferId = z.string().uuid();
const serviceTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const breakfastPassCode = z.string().regex(/^HBF1\.[0-9a-f]{64}$/);
export const breakfastOfferInput = z.object({
  mode: z.enum(["optional", "included", "off"]),
  priceMinor: z.number().int().min(0).max(10_000_000),
  firstDay: breakfastDate,
  lastDay: breakfastDate,
  start: serviceTime,
  end: serviceTime,
  venue: z.string().trim().min(1).max(100),
}).strict().refine(offer => offer.firstDay <= offer.lastDay && offer.start < offer.end
  && (offer.mode === "optional" ? offer.priceMinor > 0 : offer.priceMinor === 0), "Check the service dates, hours, and price.");

const snapshotSchema = z.object({
  offerId: z.string().uuid(), mode: z.enum(["optional", "included"]), unitMinor: z.number().int().nonnegative(),
  guests: z.number().int().min(1).max(8), mornings: z.number().int().positive(),
  firstDate: breakfastDate, lastDate: breakfastDate, start: serviceTime, end: serviceTime,
  venue: z.string(), timezone: z.string(),
});
export type BreakfastSnapshot = z.infer<typeof snapshotSchema>;
export function parseBreakfast(value: unknown): BreakfastSnapshot | null {
  const parsed = snapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function breakfastLine(value: unknown) {
  const meal = parseBreakfast(value);
  if (!meal) return [];
  return [{ label: `Breakfast · ${meal.guests} guests × ${meal.mornings} ${meal.mornings === 1 ? "morning" : "mornings"}`, amount: meal.unitMinor * meal.guests * meal.mornings / 100 }];
}

export function breakfastDayLabel(value: string) {
  return new Intl.DateTimeFormat("en-PH", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${value}T00:00:00Z`));
}

export type BreakfastChoice = {
  id: string;
  mode: "optional" | "included";
  guests: number;
  mornings: number;
  venue: string;
  start: string;
  end: string;
  price: number;
  total: number;
  deposit: number;
  balance: number;
  roomTotal: number;
  roomDeposit: number;
  roomBalance: number;
};
