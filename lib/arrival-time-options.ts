// Canonical 24-hour "HH:MM" values are what the backend stores (reservations.expected_arrival,
// matching create_booking_hold's other time params); display is hotel-locale 12-hour, formatted
// the same way lib/hotel-policy.ts displayTime renders policy times.
// The booking form collects this value with a native <input type="time">, whose value is already
// canonical "HH:MM" — no picker math or option list lives here anymore.

// Stored values are "HH:MM" since the dropdown shipped; earlier rows and staff-side
// updates (front_desk_update_guest) may hold free text — pass those through untouched.
export function formatArrival(value: string): string {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return value;
  return new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
    .format(new Date(Date.UTC(2026, 0, 1, Number(value.slice(0, 2)), Number(value.slice(3)))));
}
