"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, BedDouble, CalendarDays, Check, Search, UserRound } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { fetchPublic, readResponse } from "@/lib/client-errors";
import { userMessage } from "@/lib/errors";
import { formatPeso } from "@/lib/format";
import { isCalendarDate, normalizePhone } from "@/lib/input-validation";
import type { AvailableRoomType } from "@/lib/booking";
import styles from "./staff-booking-dialog.module.css";

export type BookingSource = "Walk-In" | "Front Desk" | "Phone";
export type BookingGuest = { id: string; name: string; email: string | null; phone: string | null };
export type CreatedBooking = { id: string; guest_name: string; total: number; confirmation_number: string; source: BookingSource };

const steps = ["Guest", "Stay and room", "Review"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const formId = "front-desk-booking-form";
const nextDay = (date: string) => new Date(Date.parse(date) + 86_400_000).toISOString().slice(0, 10);
const day = (date: string) => date && isCalendarDate(date) ? new Intl.DateTimeFormat("en-PH", {
  month: "short", day: "numeric", timeZone: "UTC",
}).format(new Date(date)) : "";

type Lookup = { query: string; guests: BookingGuest[]; error?: string };
type Quote = { key: string; rooms: AvailableRoomType[]; error?: string };
type DraftGuest = { name: string; email: string; phone: string };

export default function WalkInDialog({ hotelToday, initialSource = "Walk-In", initialGuest, onClose, onCreated, onReviewBookings }: {
  hotelToday: string;
  initialSource?: BookingSource;
  initialGuest?: BookingGuest;
  onClose: () => void;
  onCreated: (reservation: CreatedBooking) => void;
  onReviewBookings?: () => void;
}) {
  const walkIn = initialSource === "Walk-In";
  const [source, setSource] = useState(initialSource);
  const [step, setStep] = useState(0);
  const [selectedGuest, setSelectedGuest] = useState<BookingGuest | null>(initialGuest ?? null);
  const [newGuest, setNewGuest] = useState(false);
  const [guest, setGuest] = useState<DraftGuest>({ name: "", email: "", phone: "" });
  const [query, setQuery] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [lookupVersion, setLookupVersion] = useState(0);
  const [checkIn, setCheckIn] = useState(walkIn ? hotelToday : "");
  const [checkOut, setCheckOut] = useState(walkIn ? nextDay(hotelToday) : "");
  const [calendarToday, setCalendarToday] = useState(hotelToday);
  const [party, setParty] = useState("1");
  const [quoted, setQuoted] = useState<Quote | null>(null);
  const [quoteVersion, setQuoteVersion] = useState(0);
  const [room, setRoom] = useState("");
  const [stayEmail, setStayEmail] = useState("");
  const [stayPhone, setStayPhone] = useState("");
  const [arrival, setArrival] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const submitting = useRef(false);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const stepRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);

  const search = query.trim();
  const results = lookup?.query === search ? lookup : null;
  const guestName = selectedGuest?.name ?? guest.name.trim();
  const guestEmail = selectedGuest ? selectedGuest.email || stayEmail.trim() : guest.email.trim();
  const needsEmail = Boolean(selectedGuest && !selectedGuest.email);
  const needsPhone = Boolean(selectedGuest && !normalizePhone(selectedGuest.phone ?? ""));
  const guestPhone = selectedGuest ? stayPhone.trim() || selectedGuest.phone || "" : guest.phone.trim();
  const dateValid = isCalendarDate(checkIn) && isCalendarDate(checkOut) && checkIn >= calendarToday && checkOut > checkIn;
  const partyValid = /^\d+$/.test(party) && Number(party) >= 1 && Number(party) <= 20;
  const quoteKey = dateValid && partyValid ? [checkIn, checkOut, party, quoteVersion].join(":") : "";
  const currentQuote = quoted?.key === quoteKey ? quoted : null;
  const selectedRoom = currentQuote?.rooms.find(type => type.id === room);
  const stayLabel = day(checkIn) && day(checkOut) ? [day(checkIn), day(checkOut)].join(" – ") : "Dates pending";

  useEffect(() => {
    const controller = new AbortController();
    async function loadHotelDate() {
      const response = await fetchPublic("/api/front-desk/availability?calendar=1", { signal: controller.signal });
      const body = await readResponse(response);
      const date: unknown = body.data?.hotelToday;
      if (controller.signal.aborted || !response.ok || typeof date !== "string" || !isCalendarDate(date)) return;
      setCalendarToday(date);
      if (walkIn && date !== hotelToday) {
        setCheckIn(date);
        setCheckOut(current => current === nextDay(hotelToday) || current <= date ? nextDay(date) : current);
      }
    }
    void loadHotelDate().catch(() => { /* The server rechecks dates when quoting and booking. */ });
    return () => controller.abort();
  }, [hotelToday, walkIn]);

  useEffect(() => {
    if (selectedGuest || newGuest || search.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetchPublic("/api/front-desk/guests?query=" + encodeURIComponent(search), { signal: controller.signal, cache: "no-store" });
        const body = await readResponse(response);
        if (controller.signal.aborted) return;
        setLookup({ query: search, guests: body.data ?? [], error: response.ok ? undefined : body.error });
      } catch {
        if (!controller.signal.aborted) setLookup({ query: search, guests: [], error: "Guest search is unavailable. Try again." });
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [lookupVersion, newGuest, search, selectedGuest]);

  useEffect(() => {
    if (step !== 1 || !quoteKey) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ checkIn, checkOut, guests: party });
        const response = await fetchPublic("/api/front-desk/availability?" + params, { signal: controller.signal, cache: "no-store" });
        const body = await readResponse(response);
        if (controller.signal.aborted) return;
        const available = (body.data ?? []) as AvailableRoomType[];
        setQuoted({ key: quoteKey, rooms: available.filter(type => type.availableUnits > 0), error: response.ok ? undefined : body.error });
      } catch {
        if (!controller.signal.aborted) setQuoted({ key: quoteKey, rooms: [], error: "Availability could not be checked. Try again." });
      }
    }, 240);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [checkIn, checkOut, party, quoteKey, step]);

  function moveTo(next: number) {
    setError("");
    setStep(next);
    window.requestAnimationFrame(() => stepRef.current?.focus());
  }

  function showError(message: string) {
    setError(message);
    window.requestAnimationFrame(() => errorRef.current?.focus());
  }

  function changeCheckIn(value: string) {
    setCheckIn(value);
    setRoom("");
    if (isCalendarDate(value) && (!checkOut || checkOut <= value)) setCheckOut(nextDay(value));
  }

  function complete(row: Record<string, unknown>) {
    if (typeof row.reservation_id !== "string" || typeof row.confirmation_number !== "string") return false;
    onCreated({ id: row.reservation_id, confirmation_number: row.confirmation_number, guest_name: typeof row.guest_name === "string" ? row.guest_name : guestName, total: Number(row.total), source });
    return true;
  }

  async function submit() {
    if (!selectedRoom || submitting.current) return;
    const payload = {
      guestId: selectedGuest?.id, guestName: selectedGuest ? "" : guestName.trim(), email: selectedGuest && !needsEmail ? "" : guestEmail.trim(), phone: selectedGuest ? "" : guestPhone.trim(),
      stayPhone: stayPhone.trim() || undefined, expectedArrival: arrival || undefined, specialRequests: notes.trim() || undefined,
      roomType: selectedRoom.name, quotedTotal: selectedRoom.subtotal, checkIn, checkOut, guests: Number(party), source,
    };
    const signature = JSON.stringify(payload);
    if (attempt.current?.signature !== signature) attempt.current = { signature, key: crypto.randomUUID() };
    const idempotencyKey = attempt.current.key;
    submitting.current = true;
    setSaving(true);
    setError("");
    try {
      if (uncertain) {
        const lookup = await fetchPublic("/api/front-desk/reservations?requestId=" + encodeURIComponent(idempotencyKey), { cache: "no-store" });
        const found = await readResponse(lookup);
        if (!lookup.ok) {
          showError(userMessage(found.error, "We couldn't check the earlier booking. Try checking again."));
          return;
        }
        if (found.data && complete(found.data)) return;
      }
      const response = await fetchPublic("/api/front-desk/reservations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, idempotencyKey }),
      });
      const body = await readResponse(response);
      if (response.ok && body.data && complete(body.data)) return;
      if ((response.ok && !body.data) || body.outcome === "unknown" || response.status >= 500) {
        setUncertain(true);
        showError("The booking may have been saved. Check this request before continuing.");
        return;
      }
      setUncertain(false);
      if (body.code === "ROOM_TYPE_UNAVAILABLE" || body.code === "BOOKING_QUOTE_CHANGED") {
        setRoom("");
        setQuoteVersion(value => value + 1);
        moveTo(1);
      }
      if (body.code === "GUEST_PROFILE_CHANGED" || body.code === "GUEST_SELECTION_REQUIRED") {
        setSelectedGuest(null);
        setNewGuest(false);
        setLookup(null);
        setQuery(guestEmail || guestName);
        moveTo(0);
      }
      showError(userMessage(body.error, "The booking could not be saved. Review the details and try again."));
    } catch {
      setUncertain(true);
      showError("The booking may have been saved. Check this request before continuing.");
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  function advance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === 0) {
      if ((selectedGuest || newGuest) && guestName.length >= 2 && emailPattern.test(guestEmail) && normalizePhone(guestPhone)) moveTo(1);
      else if (selectedGuest) showError("Enter the missing or invalid contact details for this stay.");
      else showError(newGuest ? "Enter the guest's name, a valid email, and a valid phone number." : "Select a saved profile or enter a new guest.");
      return;
    }
    if (step === 1) {
      if (!selectedRoom) showError("Choose an available room type.");
      else if (stayPhone && !normalizePhone(stayPhone)) showError("Enter a valid contact number for this stay.");
      else moveTo(2);
      return;
    }
    void submit();
  }

  function close() {
    if (!submitting.current && !uncertain) onClose();
  }

  return (
    <Modal
      isOpen onClose={close} title={walkIn ? "Check in a guest without a reservation" : "New reservation"}
      description={walkIn ? "Create this stay, then continue to check-in." : "Find the guest, choose an available room type and review the stay."}
      size="xl" className={styles.dialog} initialFocusRef={initialGuest ? stepRef : searchRef}
      showCloseButton={!uncertain && !saving}
      footer={<div className={styles.footer}>
        {step === 1 && selectedRoom && <p className={styles.compactQuote}><span>{selectedRoom.name}</span><strong>{formatPeso(selectedRoom.subtotal)}</strong></p>}
        <div className={styles.footerActions}>
          {step > 0 && <button type="button" className="btn btn-soft" onClick={() => moveTo(step - 1)} disabled={saving || uncertain}><ArrowLeft size={16} aria-hidden="true" /> Back</button>}
          <button type="submit" form={formId} className="btn btn-accent" disabled={saving || (step === 1 && !selectedRoom)}>
            {saving ? "Checking booking…" : uncertain ? "Check booking status" : step === 2 ? "Create reservation" : step === 1 ? "Review reservation" : "Continue"}
            {step < 2 && <ArrowRight size={16} aria-hidden="true" />}
          </button>
        </div>
      </div>}
    >
      <div className={styles.frame}>
        <div className={styles.sheet}>
          <ol className={styles.steps} aria-label="Booking progress">
            {steps.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined}>
              {index < step ? <button type="button" aria-label={`Edit ${label.toLowerCase()}`} disabled={uncertain || saving} onClick={() => moveTo(index)}><Check size={14} aria-hidden="true" />{label}</button> : label}
            </li>)}
          </ol>
          <form id={formId} className={styles.form} onSubmit={advance}>
            <h3 tabIndex={-1} ref={stepRef}>{step === 0 ? "Who is staying?" : step === 1 ? "Choose the stay and room type" : "Review this reservation"}</h3>
            {error && <p className={styles.error} ref={errorRef} tabIndex={-1} role="alert">{error}</p>}
            {step === 0 && (selectedGuest ? <>
              <div className={styles.profile}>
                <UserRound size={20} aria-hidden="true" />
                <div><strong>{selectedGuest.name}</strong><span>{[selectedGuest.email, selectedGuest.phone].filter(Boolean).join(" · ") || "No contact details on file"}</span></div>
                <button type="button" className="btn btn-soft" onClick={() => { setSelectedGuest(null); setStayEmail(""); setStayPhone(""); setQuery(""); window.requestAnimationFrame(() => searchRef.current?.focus()); }}>Change guest</button>
              </div>
              {(needsEmail || needsPhone) && <div className={styles.fields}>
                {needsEmail && <label>Email for this stay<input type="email" required maxLength={200} value={stayEmail} onChange={event => setStayEmail(event.target.value)} /></label>}
                {needsPhone && <label>Phone for this stay<input type="tel" required maxLength={40} value={stayPhone} onChange={event => setStayPhone(event.target.value)} /></label>}
              </div>}
            </> : newGuest ? <>
              <div className={styles.fields}>
                <label className={styles.wide}>Guest full name<input required minLength={2} maxLength={120} autoComplete="off" value={guest.name} onChange={event => setGuest({ ...guest, name: event.target.value })} /></label>
                <label>Email<input type="email" required maxLength={200} autoComplete="off" value={guest.email} onChange={event => setGuest({ ...guest, email: event.target.value })} /></label>
                <label>Phone<input type="tel" required maxLength={40} autoComplete="off" value={guest.phone} onChange={event => setGuest({ ...guest, phone: event.target.value })} /></label>
              </div>
              <button type="button" className="btn btn-soft" onClick={() => { setNewGuest(false); window.requestAnimationFrame(() => searchRef.current?.focus()); }}>Find a saved guest</button>
            </> : <>
              <label>Find an existing guest
                <span className={styles.search}><Search size={17} aria-hidden="true" /><input ref={searchRef} type="search" maxLength={120} value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, email or phone" autoComplete="off" /></span>
              </label>
              {search.length >= 2 && (!results ? <p role="status">Searching guest profiles…</p> : results.error ? <div role="alert">{results.error} <button type="button" className="btn btn-soft" onClick={() => { setLookup(null); setLookupVersion(value => value + 1); }}>Retry search</button></div> : !results.guests.length ? <p role="status">No profiles match this search.</p> :
                <ul className={styles.matches} aria-label="Matching guest profiles">{results.guests.map(profile => <li key={profile.id}><button type="button" onClick={() => setSelectedGuest(profile)}><span><strong>{profile.name}</strong><small>{[profile.email, profile.phone].filter(Boolean).join(" · ") || profile.id}</small></span><ArrowRight size={16} aria-hidden="true" /></button></li>)}</ul>)}
              <button type="button" className="btn btn-soft" onClick={() => { setNewGuest(true); window.requestAnimationFrame(() => document.getElementById(formId)?.querySelector("input")?.focus()); }}>Enter a new guest</button>
            </>)}
            {step === 1 && <>
              <div className={styles.fields}>
                <label>Check-in<input type="date" required min={calendarToday} readOnly={walkIn} value={checkIn} onChange={event => changeCheckIn(event.target.value)} /></label>
                <label>Checkout<input type="date" required min={isCalendarDate(checkIn) ? nextDay(checkIn) : nextDay(calendarToday)} value={checkOut} onChange={event => { setCheckOut(event.target.value); setRoom(""); }} /></label>
                <label>Guests<input type="number" required min={1} max={20} value={party} onChange={event => { setParty(event.target.value); setRoom(""); }} /></label>
                {!walkIn && <label>Booking source<select value={source} onChange={event => setSource(event.target.value === "Phone" ? "Phone" : "Front Desk")}><option value="Front Desk">Front Desk</option><option value="Phone">Phone</option></select></label>}
              </div>
              {quoteKey && (!currentQuote ? <p role="status">Checking live availability…</p> : currentQuote.error ? <div role="alert">{currentQuote.error} <button type="button" className="btn btn-soft" onClick={() => setQuoteVersion(value => value + 1)}>Retry availability</button></div> : !currentQuote.rooms.length ? <p role="status">No room types are available for this stay. Try different dates or a smaller party.</p> :
                <fieldset className={styles.rooms}>
                  <legend>Available room types</legend>
                  {currentQuote.rooms.map(type => <label key={type.id} className={styles.room}>
                    <input type="radio" name="staff-booking-room" checked={room === type.id} onChange={() => setRoom(type.id)} />
                    <span><strong>{type.name}</strong><small>{type.beds} · Sleeps {type.maxGuests} · {type.availableUnits} available</small></span>
                    <span className={styles.price}><strong>{formatPeso(type.subtotal)}</strong><small>{type.nights} {type.nights === 1 ? "night" : "nights"}</small></span>
                  </label>)}
                </fieldset>)}
              <details className={styles.options}>
                <summary>Arrival and contact details <span>Optional</span></summary>
                <div className={styles.fields}>
                  {!walkIn && <label>Expected arrival<input type="time" value={arrival} onChange={event => setArrival(event.target.value)} /></label>}
                  {!needsPhone && <label>Phone for this stay<input type="tel" maxLength={40} placeholder={guestPhone || undefined} value={stayPhone} onChange={event => setStayPhone(event.target.value)} /></label>}
                  <label className={styles.wide}>Special requests<textarea rows={2} maxLength={1000} value={notes} onChange={event => setNotes(event.target.value)} /></label>
                </div>
              </details>
            </>}
            {step === 2 && selectedRoom && <dl className={styles.review}>
              <div><dt>Guest</dt><dd>{guestName}</dd></div>
              <div><dt>Source</dt><dd>{source}</dd></div>
              <div><dt>Check-in and checkout</dt><dd>{checkIn} to {checkOut}</dd></div>
              <div><dt>Room type</dt><dd>{selectedRoom.name}</dd></div>
              {guestEmail && <div><dt>Email</dt><dd>{guestEmail}</dd></div>}
              {(stayPhone || guestPhone) && <div><dt>Stay contact</dt><dd>{stayPhone || guestPhone}</dd></div>}
              {arrival && <div><dt>Expected arrival</dt><dd>{arrival}</dd></div>}
              {notes && <div className={styles.wide}><dt>Special requests</dt><dd>{notes}</dd></div>}
              <div className={styles.wide}><dt>Quoted total</dt><dd>{formatPeso(selectedRoom.subtotal)}</dd></div>
            </dl>}
            {uncertain && !saving && <button type="button" className="btn btn-soft" onClick={onReviewBookings ?? onClose}>{onReviewBookings ? "Review bookings" : "Close booking form"}</button>}
          </form>
        </div>
        <aside className={styles.summary} aria-label="Stay summary">
          <h3>{guestName || "Stay summary"}</h3>
          <dl>
            <div><dt><CalendarDays size={17} aria-hidden="true" /> Dates</dt><dd>{stayLabel}</dd></div>
            <div><dt><BedDouble size={17} aria-hidden="true" /> Room type</dt><dd>{selectedRoom?.name ?? "To be selected"}</dd></div>
            <div><dt><UserRound size={17} aria-hidden="true" /> Guests</dt><dd>{party || "—"}</dd></div>
          </dl>
          {selectedRoom && <p className={styles.total}><span>Quoted total</span><strong>{formatPeso(selectedRoom.subtotal)}</strong></p>}
        </aside>
      </div>
    </Modal>
  );
}
