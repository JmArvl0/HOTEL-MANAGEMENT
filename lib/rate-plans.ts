/**
 * Rate plans — the TS mirror of the `room_nightly_rates` SQL resolver.
 *
 * The RPC is the ONE pricing authority: every hold, reservation, extension, and
 * modification is priced server-side per night. This mirror exists only so the
 * booking search and room catalog can show honest ESTIMATES (never to compute a
 * charge). Where they can drift apart the RPC wins, and the frozen per-night
 * breakdown on the hold/reservation is what the guest actually pays.
 *
 * Priority (identical to the RPC, documented there): an active plan matching
 * date + day-of-week beats base_rate; among matches the narrowest date range
 * wins; ties break on decided_at desc, then id desc. Never DB order.
 */
import { toCentavos, fromCentavos } from "@/lib/booking";

export type RatePlanStatus = "pending" | "active" | "rejected" | "retired";

export type RatePlan = {
  id: string;
  room_type_id: string;
  name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  days_of_week: number; // bit 0 = Monday ... bit 6 = Sunday; 127 = every day
  nightly_rate: number | string;
  status: RatePlanStatus;
  reason?: string | null;
  decision_reason?: string | null;
  decided_at?: string | null;
  created_at?: string | null;
};

export type NightlyRate = { date: string; rate: number };

export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const EVERY_DAY = 127;

/** Days-of-week bitmask from the human labels (["Fri","Sat"] → 96). */
export const daysBitmask = (labels: readonly string[]) =>
  labels.reduce((mask, label) => mask | (1 << DAY_LABELS.indexOf(label as (typeof DAY_LABELS)[number])), 0);

export const daysLabel = (bitmask: number) => {
  const days = DAY_LABELS.filter((_, bit) => (bitmask & (1 << bit)) !== 0);
  if (days.length === 7) return "Every day";
  if (bitmask === 0b0011111) return "Weekdays"; // Mon–Fri (bits 0–4)
  if (bitmask === 0b1100000) return "Weekends"; // Sat + Sun (bits 5–6)
  return days.length === 0 ? "No days" : days.join(", ");
};

const isoDayBit = (isoDate: string) => {
  const dow = new Date(`${isoDate}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
  return 1 << (dow === 0 ? 7 : dow) - 1; // ISO Mon=1..Sun=7 → bit 0..6
};

const eachNight = (checkIn: string, checkOut: string) => {
  const nights: string[] = [];
  for (let t = Date.parse(`${checkIn}T00:00:00Z`), end = Date.parse(`${checkOut}T00:00:00Z`); t < end; t += 86400000) {
    nights.push(new Date(t).toISOString().slice(0, 10));
  }
  return nights;
};

const width = (plan: RatePlan) =>
  (Date.parse(`${plan.end_date}T00:00:00Z`) - Date.parse(`${plan.start_date}T00:00:00Z`)) / 86400000;

/**
 * Per-night rates for one room type over `[checkIn, checkOut)`. `plans` should be
 * the type's ACTIVE plans (pending/rejected/retired never price anything).
 */
export function nightlyRates(baseRate: number | string, plans: RatePlan[], checkIn: string, checkOut: string): NightlyRate[] {
  return eachNight(checkIn, checkOut).map((date) => {
    const matching = plans
      .filter((plan) => plan.status === "active"
        && plan.start_date <= date && plan.end_date >= date
        && (plan.days_of_week & isoDayBit(date)) !== 0)
      .sort((a, b) => (width(a) - width(b)) || String(b.decided_at ?? "").localeCompare(String(a.decided_at ?? "")) || (a.id < b.id ? 1 : -1));
    const winner = matching[0];
    return { date, rate: Number(winner ? winner.nightly_rate : baseRate) };
  });
}

/** Centavo-exact stay total from per-night rates — mirrors the RPC's sum. */
export const stayTotal = (rates: readonly NightlyRate[]) =>
  fromCentavos(rates.reduce((sum, night) => sum + toCentavos(night.rate), 0));

/** True when every night prices the same — a single "per night" figure is honest. */
export const uniformRate = (rates: readonly NightlyRate[]) =>
  rates.length === 0 || rates.every((night) => night.rate === rates[0].rate) ? (rates[0]?.rate ?? null) : null;

/** The lowest night over a window — the "From ₱X / night" catalog figure. */
export const fromRate = (baseRate: number | string, plans: RatePlan[]) => {
  const candidates = [Number(baseRate), ...plans.filter((plan) => plan.status === "active").map((plan) => Number(plan.nightly_rate))];
  return Math.min(...candidates);
};

/**
 * Parse a frozen nightly_rates jsonb array (from booking_holds/reservations).
 * Legacy rows have null → empty array; callers fall back to a base-rate display.
 */
export const parseFrozenRates = (value: unknown): NightlyRate[] =>
  Array.isArray(value)
    ? value.flatMap((entry) => {
      const date = String((entry as Record<string, unknown>)?.date ?? "");
      const rate = Number((entry as Record<string, unknown>)?.rate);
      return date && Number.isFinite(rate) ? [{ date, rate }] : [];
    })
    : [];
