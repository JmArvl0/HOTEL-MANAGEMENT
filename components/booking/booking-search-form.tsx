"use client";
import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { StayCalendar } from "./stay-calendar";
import { ArrowRight, CalendarDays, ChevronDown, UsersRound } from "lucide-react";
import { BookingNoticeToast } from "./booking-notice-toast";

export function BookingSearchForm({
  initial,
  compact = false,
  action = "/booking/search",
  emptyDates = false,
  hero = false,
  onIntentChange,
  searched,
  maxGuests = 8,
  timeZone = "Asia/Manila",
  validation,
}: {
  initial?: { checkIn?: string; checkOut?: string; guests?: number; roomType?: string };
  compact?: boolean;
  action?: string;
  /** Start with empty date fields (landing hero) — dates are the guest's own choice there. */
  emptyDates?: boolean;
  hero?: boolean;
  /** Live form values for surfaces that link elsewhere with the current search (landing featured cards). */
  onIntentChange?: (intent: { checkIn: string; checkOut: string; guests: number }) => void;
  /** The search the visible results were computed for. When the fields drift from
   *  it, the results are stale until the guest checks again. Absent = no results
   *  on screen (browse/landing), so no staleness signal. */
  searched?: { checkIn: string; checkOut: string; guests: number };
  maxGuests?: number;
  timeZone?: string;
  validation?: { field: "checkIn" | "checkOut" | "guests"; message: string };
}) {
  const id = useId();
  const today = useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date());
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
  }, [timeZone]);
  const tomorrow = useMemo(() => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
  }, [today]);
  const [checkIn, setCheckIn] = useState(initial?.checkIn ?? (emptyDates ? "" : today));
  const [checkOut, setCheckOut] = useState(initial?.checkOut ?? (emptyDates ? "" : tomorrow));
  const [guests, setGuests] = useState(initial?.guests ?? Math.min(maxGuests, 2));
  const [submitting, setSubmitting] = useState(false);
  const [dateError, setDateError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [serverError, setServerError] = useState(validation);
  useEffect(() => {
    if (!validation) return;
    const field = formRef.current?.elements.namedItem(validation.field);
    if (field instanceof HTMLElement) field.focus();
  }, [validation]);
  useEffect(() => {
    onIntentChange?.({ checkIn, checkOut, guests });
  }, [checkIn, checkOut, guests, onIntentChange]);
  const nextDate = new Date(`${checkIn || today}T00:00:00Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  const earliestCheckout = Number.isNaN(nextDate.getTime()) ? tomorrow : nextDate.toISOString().slice(0, 10);
  const stale = searched !== undefined
    && (checkIn !== searched.checkIn || checkOut !== searched.checkOut || guests !== searched.guests);

  function changeCheckIn(event: ChangeEvent<HTMLInputElement>) {
    const value = event.currentTarget.value;
    setCheckIn(value);
    if (value && checkOut <= value) {
      const next = new Date(`${value}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      setCheckOut(next.toISOString().slice(0, 10));
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    if (!hero && guests > maxGuests) {
      event.preventDefault();
      setServerError({ field: "guests", message: `Choose up to ${maxGuests} guests for one room.` });
      event.currentTarget.querySelector<HTMLSelectElement>('select[name="guests"]')?.focus();
      return;
    }
    if (hero && (checkIn < today || checkOut <= checkIn)) {
      event.preventDefault();
      const missingField = checkIn < today ? "checkIn" : "checkOut";
      setDateError(missingField === "checkIn" ? "Choose your check-in and check-out dates." : "Choose a check-out date after check-in.");
      event.currentTarget.querySelector<HTMLButtonElement>(`[data-date-field="${missingField}"]`)?.focus();
      return;
    }
    setSubmitting(true);
  }

  const calendar = <StayCalendar hero={hero} checkIn={checkIn} checkOut={checkOut} today={today} onChange={(start, end) => {
    setCheckIn(start);
    setCheckOut(end);
    setDateError("");
    if (serverError?.field !== "guests") setServerError(undefined);
  }} />;
  const guestSelect = (
    <select id={`${id}-guests`} name="guests" value={guests} onChange={(event) => setGuests(Number(event.target.value))} required aria-required="true" aria-invalid={serverError?.field === "guests" || undefined} aria-describedby={serverError?.field === "guests" ? `${id}-error` : undefined}>
      {guests > maxGuests && <option value={guests} disabled>{guests} guests</option>}
      {Array.from({ length: maxGuests }, (_, i) => i + 1).map((count) => (
        <option value={count} key={count}>{count} guest{count > 1 ? "s" : ""}</option>
      ))}
    </select>
  );
  const submitButton = <button className={hero ? "hero-booking-submit" : "btn btn-accent"} type="submit" aria-busy={submitting} disabled={submitting}>
    {submitting ? "Searching…" : "Check availability"} <ArrowRight size={17} aria-hidden="true" />
  </button>;
  const partyHelp = <p className="booking-party-help">One room per reservation. For parties larger than {maxGuests}, book separate rooms or <Link href="/#contact">contact Front Desk</Link> for assistance.</p>;

  if (hero) return <form className="hero-booking-form" action={action} method="get" aria-label="Check availability" onSubmit={submit}>
    <div className="hero-booking-bar">
      <div className="hero-booking-intro">
        <span><CalendarDays size={21} aria-hidden="true" /></span>
        <h2 id="booking-title">Plan your stay</h2>
      </div>
      {calendar}
      <div className="hero-booking-field hero-booking-guests">
        <label className="hero-booking-label" htmlFor={`${id}-guests`}>Guests</label>
        <div className="hero-booking-value">
          <UsersRound size={18} aria-hidden="true" />{guestSelect}
          <ChevronDown className="hero-field-chevron" size={16} aria-hidden="true" />
        </div>
      </div>
      <input type="hidden" name="checkIn" value={checkIn} />
      <input type="hidden" name="checkOut" value={checkOut} />
      {submitButton}
    </div>
    {dateError && <p className="hero-booking-error" role="alert">{dateError}</p>}
    {partyHelp}
  </form>;

  return (
    <form
      className={compact ? "booking-search compact" : "booking-bar"}
      ref={formRef}
      action={action}
      method="get"
      aria-label="Check availability"
      onSubmit={submit}
      onChange={(event) => {
        const name = (event.target as HTMLInputElement).name;
        if (serverError && (name === serverError.field || (serverError.field === "checkOut" && name === "checkIn"))) setServerError(undefined);
      }}
    >
      {calendar}
      {stale && !submitting ? <BookingNoticeToast text="Your dates changed — check availability again for current counts." /> : null}
      {initial?.roomType ? <input type="hidden" name="roomType" value={initial.roomType} /> : null}
      <label htmlFor={`${id}-checkin`}>
        Check in
        <input
          id={`${id}-checkin`}
          name="checkIn"
          type="date"
          min={today}
          value={checkIn}
          onInput={changeCheckIn}
          onChange={changeCheckIn}
          required
          aria-required="true"
          aria-invalid={serverError?.field === "checkIn" || undefined}
          aria-describedby={serverError?.field === "checkIn" ? `${id}-error` : undefined}
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
          onInput={(event) => setCheckOut(event.currentTarget.value)}
          onChange={(event) => setCheckOut(event.currentTarget.value)}
          required
          aria-required="true"
          aria-invalid={serverError?.field === "checkOut" || undefined}
          aria-describedby={serverError?.field === "checkOut" ? `${id}-error` : undefined}
        />
      </label>
      <label htmlFor={`${id}-guests`}>
        Guests
        {guestSelect}
      </label>
      {serverError && <p id={`${id}-error`} role="alert" className="booking-error booking-search-feedback">{serverError.message}</p>}
      {submitButton}
      {partyHelp}
    </form>
  );
}
