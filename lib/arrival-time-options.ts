// Canonical 24-hour "HH:MM" values are what the backend stores (reservations.expected_arrival,
// matching create_booking_hold's other time params); labels are hotel-locale 12-hour display,
// formatted the same way lib/hotel-policy.ts displayTime renders policy times.
export type ArrivalTimeOption = { value: string; label: string };

export const ARRIVAL_TIME_OPTIONS: ArrivalTimeOption[] = Array.from({ length: 48 }, (_, slot) => {
  const hour = Math.floor(slot / 2), minute = (slot % 2) * 30;
  const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const label = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
    .format(new Date(Date.UTC(2026, 0, 1, hour, minute)));
  return { value, label };
});

// Stored values are "HH:MM" since the dropdown shipped; earlier rows and staff-side
// updates (front_desk_update_guest) may hold free text — pass those through untouched.
export function formatArrival(value: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
    .format(new Date(Date.UTC(2026, 0, 1, Number(value.slice(0, 2)), Number(value.slice(3)))));
}

// ---- Picker math — one model, minutes-of-day 0..1439, shared by the clock and wheel UIs.
// Keeping a single total (mod 1440) makes hour/period rollover (1:59 PM → 2:00 PM,
// 11:59 PM → 12:00 AM) fall out of the arithmetic instead of special cases.
export function parseArrival(value: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

export function arrivalValue(total: number): string {
  const hour = Math.floor(total / 60) % 24, minute = total % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export type ArrivalParts = { hour12: number; minute: number; period: "AM" | "PM" };

export function arrivalParts(total: number): ArrivalParts {
  const hour24 = Math.floor(total / 60) % 24;
  return { hour12: hour24 % 12 || 12, minute: total % 60, period: hour24 < 12 ? "AM" : "PM" };
}

export function arrivalFromParts(hour12: number, minute: number, period: "AM" | "PM"): number {
  return ((hour12 % 12) + (period === "PM" ? 12 : 0)) * 60 + minute;
}
