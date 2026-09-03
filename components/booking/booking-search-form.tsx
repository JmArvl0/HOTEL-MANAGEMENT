"use client";
import { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

export function BookingSearchForm({
  initial,
  compact = false,
  action = "/booking/search",
}: {
  initial?: { checkIn?: string; checkOut?: string; guests?: number; roomType?: string };
  compact?: boolean;
  action?: string;
}) {
  const today = useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }, []);
  const tomorrow = useMemo(() => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }, [today]);
  const [checkIn, setCheckIn] = useState(initial?.checkIn ?? today);
  const [checkOut, setCheckOut] = useState(initial?.checkOut ?? tomorrow);
  const [submitting, setSubmitting] = useState(false);
  return (
    <form
      className={compact ? "booking-search compact" : "booking-bar"}
      action={action}
      method="get"
      aria-label="Check availability"
      onSubmit={() => setSubmitting(true)}
      noValidate
    >
      {initial?.roomType ? <input type="hidden" name="roomType" value={initial.roomType} /> : null}
      <label htmlFor="landing-checkin">
        Check in
        <input
          id="landing-checkin"
          name="checkIn"
          type="date"
          min={today}
          value={checkIn}
          onChange={(event) => {
            const value = event.target.value;
            setCheckIn(value);
            if (checkOut <= value) {
              const next = new Date(`${value}T00:00:00`);
              next.setDate(next.getDate() + 1);
              setCheckOut(next.toISOString().slice(0, 10));
            }
          }}
          required
          aria-required="true"
        />
      </label>
      <label htmlFor="landing-checkout">
        Check out
        <input
          id="landing-checkout"
          name="checkOut"
          type="date"
          min={checkIn || today}
          value={checkOut}
          onChange={(event) => setCheckOut(event.target.value)}
          required
          aria-required="true"
        />
      </label>
      <label htmlFor="landing-guests">
        Guests
        <select id="landing-guests" name="guests" defaultValue={String(initial?.guests ?? 2)} required aria-required="true">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => (
            <option value={count} key={count}>
              {count} guest{count > 1 ? "s" : ""}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-accent" type="submit" aria-busy={submitting} disabled={submitting}>
        {submitting ? "Searching…" : "Check availability"} <ArrowRight size={17} aria-hidden="true" />
      </button>
    </form>
  );
}