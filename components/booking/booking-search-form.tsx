"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";

export function BookingSearchForm({
  initial,
  compact = false,
  action = "/booking/search",
  emptyDates = false,
  onIntentChange,
}: {
  initial?: { checkIn?: string; checkOut?: string; guests?: number; roomType?: string };
  compact?: boolean;
  action?: string;
  /** Start with empty date fields (landing hero) — dates are the guest's own choice there. */
  emptyDates?: boolean;
  /** Live form values for surfaces that link elsewhere with the current search (landing featured cards). */
  onIntentChange?: (intent: { checkIn: string; checkOut: string; guests: number }) => void;
}) {
  const id = useId();
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
  const [checkIn, setCheckIn] = useState(initial?.checkIn ?? (emptyDates ? "" : today));
  const [checkOut, setCheckOut] = useState(initial?.checkOut ?? (emptyDates ? "" : tomorrow));
  const [guests, setGuests] = useState(initial?.guests ?? 2);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    onIntentChange?.({ checkIn, checkOut, guests });
  }, [checkIn, checkOut, guests, onIntentChange]);
  const nextDate = new Date(`${checkIn || today}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const earliestCheckout = Number.isNaN(nextDate.getTime()) ? tomorrow : nextDate.toISOString().slice(0, 10);
  return (
    <form
      className={compact ? "booking-search compact" : "booking-bar"}
      action={action}
      method="get"
      aria-label="Check availability"
      onSubmit={() => setSubmitting(true)}
    >
      {initial?.roomType ? <input type="hidden" name="roomType" value={initial.roomType} /> : null}
      <label htmlFor={`${id}-checkin`}>
        Check in
        <input
          id={`${id}-checkin`}
          name="checkIn"
          type="date"
          min={today}
          value={checkIn}
          onChange={(event) => {
            const value = event.target.value;
            setCheckIn(value);
            if (checkOut <= value) {
              const next = new Date(`${value}T00:00:00Z`);
              next.setUTCDate(next.getUTCDate() + 1);
              setCheckOut(next.toISOString().slice(0, 10));
            }
          }}
          required
          aria-required="true"
        />
      </label>
      <label htmlFor={`${id}-checkout`}>
        Check out
        <input
          id={`${id}-checkout`}
          name="checkOut"
          type="date"
          min={earliestCheckout}
          value={checkOut}
          onChange={(event) => setCheckOut(event.target.value)}
          required
          aria-required="true"
        />
      </label>
      <label htmlFor={`${id}-guests`}>
        Guests
        <select id={`${id}-guests`} name="guests" value={guests} onChange={(event) => setGuests(Number(event.target.value))} required aria-required="true">
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
