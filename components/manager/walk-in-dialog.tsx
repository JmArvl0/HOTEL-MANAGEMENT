"use client";
// Walk-in booking: a staged creation flow for a guest who arrives at the desk
// without a reservation. This is NOT a second reservation engine — it only
// gathers input, reads server-side availability/pricing (the same
// lib/booking.ts arithmetic the public search page uses), and posts to the
// authoritative POST /api/front-desk/reservations with source fixed to
// "Walk-In". Creation is atomic in the front_desk_create_reservation RPC
// (reservation + folio + audit in one transaction); after it succeeds the
// dashboard hands the reservation to the existing FrontDeskArrivalDialog for
// identity → payment → room → check-in.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BedDouble, CalendarCheck, Check, ChevronLeft, ChevronRight, RefreshCw, Search, UserPlus, Users } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { RecordItem } from "@/lib/types";
import type { AvailableRoomType } from "@/lib/booking";

const moneyExact = (v: unknown) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(Number(v || 0));
const human = (v: unknown) => String(v ?? "").replaceAll("_", " ");
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const STEPS = [
  { key: "guest", label: "Guest", icon: Users },
  { key: "stay", label: "Stay & room", icon: BedDouble },
  { key: "confirm", label: "Confirm", icon: CalendarCheck },
];

type GuestDraft = { guestName: string; email: string; phone: string };

export default function WalkInDialog({ guests, hotelToday, onClose, onCreated }: {
  guests: RecordItem[];
  hotelToday: string;
  onClose: () => void;
  /** Receives { id, guest_name, total, confirmation_number } of the created reservation. */
  onCreated: (reservation: { id: string; guest_name: string; total: number | string; confirmation_number?: string | null }) => void;
}) {
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  // Step 1 — guest identity. Picking an existing profile prefills the contact
  // fields; the RPC still dedups by normalized email at creation.
  const [guestQuery, setGuestQuery] = useState("");
  const [draft, setDraft] = useState<GuestDraft>({ guestName: "", email: "", phone: "" });
  const searchRef = useRef<HTMLInputElement>(null);

  // Step 2 — stay. Check-in is the hotel's authoritative local date, never the
  // browser's clock.
  const [checkOut, setCheckOut] = useState("");
  const [guestCount, setGuestCount] = useState(1);
  const [availability, setAvailability] = useState<AvailableRoomType[] | null>(null);
  const [selectedType, setSelectedType] = useState("");
  const availRef = useRef("");

  useEffect(() => { setTimeout(() => searchRef.current?.focus(), 0); }, []);

  const matches = useMemo(() => {
    const q = guestQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return guests.filter((g) =>
      [g.name, g.email, g.phone].some((field) => String(field ?? "").toLowerCase().includes(q))
    ).slice(0, 8);
  }, [guestQuery, guests]);

  // Re-fetch availability whenever a new stay window is (re)entered. The server
  // filters to availableUnits > 0 and computes every price; the client only
  // selects a room type and repeats the server's numbers back.
  const fetchAvailability = useCallback(async (nextCheckOut: string, nextGuests: number) => {
    setBusy(true); setError("");
    const key = `${hotelToday}:${nextCheckOut}:${nextGuests}`;
    availRef.current = key;
    try {
      const res = await fetch(`/api/front-desk/availability?checkIn=${hotelToday}&checkOut=${nextCheckOut}&guests=${nextGuests}`, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setAvailability([]); setError(body.error ?? "Unable to check availability right now."); return; }
      if (availRef.current !== key) return; // a newer edit superseded this response
      setAvailability((body.data ?? []) as AvailableRoomType[]);
    } finally { setBusy(false); }
  }, [hotelToday]);

  const guestValid = draft.guestName.trim().length >= 2 && /.+@.+\..+/.test(draft.email.trim()) && draft.phone.trim().length >= 5;
  const stayValid = datePattern.test(checkOut) && checkOut > hotelToday && guestCount >= 1;
  const selected = availability?.find((type) => type.name === selectedType) ?? null;

  const next = () => {
    setError("");
    if (step === 0 && !guestValid) { setError("Enter the guest's full name, a valid email, and a phone number."); return; }
    if (step === 1) {
      if (!stayValid) { setError("Choose a check-out date after today's check-in and at least one guest."); return; }
      if (!selected) { setError("Choose an available room type for this stay."); return; }
    }
    setNotice(""); setStep((s) => Math.min(2, s + 1));
  };
  const back = () => { setError(""); setNotice(""); setStep((s) => Math.max(0, s - 1)); };

  const enterStayStep = () => {
    setStep(1);
    if (!availability) void fetchAvailability(checkOut, guestCount);
  };

  const nightsOf = (type: AvailableRoomType) => type.nights;

  // Step 3 — create via the atomic RPC. The idempotency key is minted once per
  // attempt and kept stable across any retry so a network replay cannot double-book.
  const submit = async () => {
    setBusy(true); setError("");
    const idempotencyKey = crypto.randomUUID();
    try {
      const res = await fetch("/api/front-desk/reservations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName: draft.guestName.trim(), email: draft.email.trim(), phone: draft.phone.trim(),
          roomType: selectedType, checkIn: hotelToday, checkOut, guests: guestCount,
          source: "Walk-In", expectedArrival: "Walk-in (at the desk)", idempotencyKey,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          // Stale room selection (or sold out between steps) — re-check and go back.
          setError("That room type is no longer available for those dates. Review the updated availability.");
          setSelectedType("");
          setAvailability(null);
          setStep(1);
          await fetchAvailability(checkOut, guestCount);
        } else {
          setError(body.error ?? "Unable to create the walk-in reservation.");
        }
        return;
      }
      const row = body.data ?? {};
      onCreated({ id: String(row.reservation_id ?? row.id ?? ""), guest_name: String(row.guest_name ?? draft.guestName.trim()), total: row.total ?? selected?.subtotal ?? 0, confirmation_number: row.confirmation_number ?? null });
    } finally { setBusy(false); }
  };

  // Escape closes unless a request is in flight — handled by the shared Modal
  // through the busy-guarded onClose below (overlay click and the header close
  // button route through the same guard).

  const guardedClose = () => { if (!busy) onClose(); };

  return (
    <Modal
      isOpen
      onClose={guardedClose}
      title="Check in a guest without a reservation"
      description="Walk-in booking — the reservation is created and confirmed at the desk."
      size="xl"
      headerVariant="branded"
      className="walk-in-dialog"
      footer={
        <div className="arrival-footer">
          {step > 0 && <button className="btn btn-soft" onClick={back} disabled={busy}><ChevronLeft size={15} /> Back</button>}
          {step < 2
            ? <button className="btn btn-accent" onClick={step === 0 ? enterStayStep : next} disabled={busy || (step === 0 ? !guestValid : !stayValid || !selected)}>{step === 0 ? <>Continue <ChevronRight size={15} /></> : <>Review <ChevronRight size={15} /></>}</button>
            : <button className="btn btn-accent" onClick={submit} disabled={busy}><UserPlus size={15} /> {busy ? "Creating…" : "Create walk-in reservation"}</button>}
        </div>
      }
    >
      <div className="arrival-summary">
          <span><b>Check-in today</b> · {human(hotelToday)}</span>
          <span>Created as <b>Walk-In</b> · confirmed immediately</span>
        </div>

        <div className="arrival-steps" role="tablist" aria-label="Walk-in steps">
          {STEPS.map((item, index) => (
            <div key={item.key} className={`arrival-step ${index < step ? "done" : ""} ${index === step ? "active" : ""}`}>
              <span className="arrival-step-badge">{index < step ? <Check size={14} /> : index + 1}</span>
              <span className="arrival-step-label"><item.icon size={13} /> {item.label}</span>
            </div>
          ))}
        </div>

        <div className="arrival-body">
          {error && <p className="arrival-error" role="alert">{error}</p>}
          {notice && !error && <p className="arrival-notice">{notice}</p>}

          {step === 0 && (
            <section className="arrival-section">
              <h3>Who is checking in?</h3>
              <p className="arrival-section-copy">Search existing guest profiles by name, email, or phone — or enter a new guest. The reservation is created from these details; no online account is needed.</p>
              <div className="walk-in-search">
                <label className="arrival-field">
                  Find an existing guest
                  <div className="walk-in-search-row">
                    <Search size={14} aria-hidden="true" />
                    <input
                      ref={searchRef}
                      type="search"
                      value={guestQuery}
                      onChange={(e) => setGuestQuery(e.target.value)}
                      placeholder="Search guests by name, email, or phone"
                      aria-describedby="walk-in-search-hint"
                    />
                  </div>
                </label>
                <p id="walk-in-search-hint" className="walk-in-search-hint">{guestQuery.trim().length < 2 ? "Type at least two characters to search." : matches.length ? `${matches.length} matching guest${matches.length === 1 ? "" : "s"}.` : "No matching guest — fill in the details below to create one."}</p>
                {matches.length > 0 && (
                  <div className="arrival-options" role="listbox" aria-label="Matching guests">
                    {matches.map((g) => (
                      <button
                        key={String(g.id)}
                        type="button"
                        className="arrival-option walk-in-guest-option"
                        role="option"
                        aria-selected={draft.email === g.email}
                        onClick={() => { setDraft({ guestName: String(g.name ?? ""), email: String(g.email ?? ""), phone: String(g.phone ?? "") }); setGuestQuery(""); }}
                      >
                        <span className="arrival-option-name"><b>{label(g.name)}</b><small>{label(g.email)}{g.phone ? ` · ${label(g.phone)}` : ""}</small></span>
                        <span className="arrival-option-ready"><Check size={14} /> Use profile</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="walk-in-fields">
                <label className="arrival-field">Guest full name<input type="text" value={draft.guestName} onChange={(e) => setDraft({ ...draft, guestName: e.target.value }) } placeholder="e.g. Maria Santos" required minLength={2} autoComplete="off" /></label>
                <label className="arrival-field">Email<input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder="guest@example.com" required autoComplete="off" /></label>
                <label className="arrival-field">Phone<input type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} placeholder="+63 917 000 0000" required minLength={5} autoComplete="off" /></label>
              </div>
              <p className="arrival-notice">An email match reuses the guest&apos;s existing profile — duplicates are merged server-side.</p>
            </section>
          )}

          {step === 1 && (
            <section className="arrival-section">
              <h3>Stay and room type</h3>
              <p className="arrival-section-copy">Check-in is today ({human(hotelToday)}), the hotel&apos;s local date. Only room types with availability for the whole stay are shown; prices come from the live rate sheet.</p>
              <div className="walk-in-fields">
                <label className="arrival-field">Check-in (today — fixed)<input type="text" value={hotelToday} readOnly aria-readonly="true" /></label>
                <label className="arrival-field">Check-out<input type="date" value={checkOut} min={addDays(hotelToday, 1)} onChange={(e) => { setCheckOut(e.target.value); setSelectedType(""); setAvailability(null); }} required /></label>
                <label className="arrival-field">Guests<input type="number" value={guestCount} min={1} max={8} onChange={(e) => { const n = Math.max(1, Number(e.target.value) || 1); setGuestCount(n); setSelectedType(""); setAvailability(null); }} required /></label>
              </div>
              {availability === null && !busy && (
                <div className="arrival-empty"><p>Set a check-out date and guest count, then load availability.</p>
                  <div className="arrival-actions"><button className="btn btn-soft" disabled={!stayValid} onClick={() => void fetchAvailability(checkOut, guestCount)}><RefreshCw size={14} /> Check availability</button></div>
                </div>
              )}
              {busy && <p className="arrival-notice" role="status">Checking live availability…</p>}
              {availability !== null && !busy && (
                availability.length === 0
                  ? <div className="arrival-empty" role="status"><p>No rooms are available for {human(hotelToday)} to {human(checkOut)} with {guestCount} guest{guestCount !== 1 ? "s" : ""}. Try a different date or fewer guests — walk-ins have no separate inventory pool.</p></div>
                  : <>
                    <div className="arrival-options" role="radiogroup" aria-label="Available room types">
                      {availability.map((type) => (
                        <label key={type.id} className={`arrival-option ${selectedType === type.name ? "selected" : ""}`}>
                          <input type="radio" name="walk-in-room-type" value={type.name} checked={selectedType === type.name} onChange={() => setSelectedType(type.name)} />
                          <span className="arrival-option-name">
                            <b>{human(type.name)}</b>
                            <small>{human(type.beds)} · sleeps {type.maxGuests} · {moneyExact(type.nightlyRate)}/night</small>
                          </span>
                          <span className="arrival-option-ready walk-in-price">
                            <b>{moneyExact(type.subtotal)}</b>
                            <small>{nightsOf(type)} night{nightsOf(type) !== 1 ? "s" : ""} · {type.availableUnits} unit{type.availableUnits !== 1 ? "s" : ""} left</small>
                          </span>
                        </label>
                      ))}
                    </div>
                    <button className="btn btn-soft arrival-refresh" disabled={busy} onClick={() => { setError(""); setSelectedType(""); void fetchAvailability(checkOut, guestCount); }}><RefreshCw size={14} /> Refresh availability</button>
                  </>
              )}
            </section>
          )}

          {step === 2 && selected && (
            <section className="arrival-section">
              <h3>Confirm the walk-in reservation</h3>
              <p className="arrival-section-copy">The reservation, folio, and audit entry are created in one server transaction as <b>Walk-In · confirmed</b>. Payment settles at the desk during check-in.</p>
              <div className="arrival-facts">
                <div><dt>Guest</dt><dd>{human(draft.guestName)}</dd></div>
                <div><dt>Contact</dt><dd>{human(draft.email)}</dd></div>
                <div><dt>Stay</dt><dd>{human(hotelToday)} to {human(checkOut)} · {nightsOf(selected)} night{nightsOf(selected) !== 1 ? "s" : ""}</dd></div>
                <div><dt>Guests</dt><dd>{guestCount}</dd></div>
                <div><dt>Room type</dt><dd>{human(selected.name)}</dd></div>
                <div><dt>Stay total (server-priced)</dt><dd>{moneyExact(selected.subtotal)}</dd></div>
              </div>
              <p className="arrival-notice">After creating, the arrival workflow opens to verify ID, collect payment, and assign a room.</p>
            </section>
          )}
        </div>
    </Modal>
  );
}

const label = (value: unknown) => String(value ?? "").replaceAll("_", " ");

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
