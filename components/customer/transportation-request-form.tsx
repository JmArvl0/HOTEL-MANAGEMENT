"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CarTaxiFront, Hotel, Plane, PlaneTakeoff, Repeat, Send } from "lucide-react";
import { Modal } from "@/components/ui/Modal";

type EligibleReservation = { id: string; confirmation_number: string | null; room_type: string; check_in: string; check_out: string };

function formatStayDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

const SERVICE_OPTIONS = [
  { value: "PICKUP", label: "Airport pickup", hint: "Arrival to the hotel", icon: Plane },
  { value: "DROPOFF", label: "Hotel drop-off", hint: "Departure from the hotel", icon: PlaneTakeoff },
  { value: "ROUND_TRIP", label: "Round trip", hint: "Pickup + return ride", icon: Repeat },
] as const;

export function TransportationRequestForm({ reservations, hotelLabel }: { reservations: EligibleReservation[]; hotelLabel: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serviceType, setServiceType] = useState<string>("PICKUP");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedReservationId, setSelectedReservationId] = useState(reservations[0]?.id ?? "");
  const [pickupDate, setPickupDate] = useState("");
  const [returnDate, setReturnDate] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    const payload = { reservationId: String(form.get("reservationId")), serviceType, pickupDate: String(form.get("pickupDate")), pickupTime: String(form.get("pickupTime")), passengerCount: Number(form.get("passengerCount")),
      ...(serviceType === "PICKUP" || serviceType === "ROUND_TRIP" ? { pickupLocation: String(form.get("pickupLocation") ?? "").trim() || undefined } : {}),
      ...(serviceType === "DROPOFF" ? { dropoffLocation: String(form.get("dropoffLocation") ?? "").trim() || undefined } : {}),
      ...(serviceType === "ROUND_TRIP" ? { returnLocation: String(form.get("returnLocation") ?? "").trim() || undefined, returnDate: String(form.get("returnDate") ?? ""), returnTime: String(form.get("returnTime") ?? "") } : {}),
      specialInstructions: String(form.get("specialInstructions") ?? "").trim() || undefined,
      idempotencyKey: crypto.randomUUID() };
    const response = await fetch("/api/account/transportation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json(); setLoading(false);
    if (!response.ok) { setError(body.error ?? "Unable to submit your transportation request."); return; }
    setOpen(false); router.refresh();
  }

  if (!reservations.length) return <p className="customer-empty-note">A confirmed or current reservation is required before requesting transportation.</p>;
  const selectedReservation = reservations.find((reservation) => reservation.id === selectedReservationId) ?? reservations[0];
  const stayStart = selectedReservation.check_in;
  const stayEnd = selectedReservation.check_out;
  const hotelEndCaption = serviceType === "DROPOFF" ? "Pickup at the hotel" : serviceType === "ROUND_TRIP" ? "The hotel end of both legs is fixed" : "Drop-off at the hotel";

  return <><section className="ctr-request-invitation"><span className="ctr-invitation-icon"><CarTaxiFront size={22} aria-hidden="true" /></span><div><h2>Need a ride?</h2><p>Tell us where and when. Front Desk will confirm the schedule and driver details here.</p></div><button type="button" className="btn btn-accent" onClick={() => setOpen(true)}><CarTaxiFront size={15} aria-hidden="true" />Request transportation</button></section><Modal isOpen={open} onClose={() => setOpen(false)} title="Request transportation" description="Choose your service and share the pickup details. Front Desk will confirm the schedule." size="xl" headerVariant="branded" className="customer-transportation-dialog"><form className="customer-request-form wide ctr-form" onSubmit={submit}>
    <fieldset className="ctr-service-options">
      <legend>Service type</legend>
      {SERVICE_OPTIONS.map(({ value, label, hint, icon: Icon }) => (
        <label key={value} className={`ctr-service-option${serviceType === value ? " picked" : ""}`}>
          <input type="radio" name="serviceType" value={value} checked={serviceType === value} onChange={() => setServiceType(value)} />
          <Icon size={17} aria-hidden="true" />
          <span><b>{label}</b><small>{hint}</small></span>
        </label>
      ))}
    </fieldset>
    <label>Reservation<select name="reservationId" required value={selectedReservationId} onChange={(event) => { setSelectedReservationId(event.target.value); setPickupDate(""); setReturnDate(""); setError(""); }}>{reservations.map((reservation) => <option value={reservation.id} key={reservation.id}>{reservation.confirmation_number ?? reservation.id} · {reservation.room_type} · {reservation.check_in} to {reservation.check_out}</option>)}</select></label>
    <p className="ctr-stay-window" aria-live="polite"><span>Available ride dates</span><b>{formatStayDate(stayStart)} – {formatStayDate(stayEnd)}</b><small>Dates outside this reservation are disabled.</small></p>
    {(serviceType === "PICKUP" || serviceType === "ROUND_TRIP") && <label>{serviceType === "ROUND_TRIP" ? "Arrival pickup location" : "Pickup location"}<input name="pickupLocation" required minLength={5} maxLength={200} placeholder="e.g. NAIA Terminal 3, Pasay City" /></label>}
    <div className="ctr-hotel-end" aria-label={`${hotelEndCaption}: ${hotelLabel}`}>
      <Hotel size={14} aria-hidden="true" />
      <span>{hotelEndCaption}</span>
      <b>{hotelLabel}</b>
    </div>
    {serviceType === "DROPOFF" && <label>Destination<input name="dropoffLocation" required minLength={5} maxLength={200} placeholder="e.g. SM North EDSA, Quezon City" /></label>}
    {serviceType === "ROUND_TRIP" && <><label>Departure destination<input name="returnLocation" required minLength={5} maxLength={200} placeholder="e.g. NAIA Terminal 1, Pasay City" /></label><label>Return date<input name="returnDate" type="date" min={pickupDate || stayStart} max={stayEnd} value={returnDate} onChange={(event) => setReturnDate(event.target.value)} required /></label><label>Return time<input name="returnTime" type="time" required /></label></>}
    <div className="ctr-grid">
      <label>Pickup date<input name="pickupDate" type="date" min={stayStart} max={stayEnd} value={pickupDate} onChange={(event) => { setPickupDate(event.target.value); if (returnDate && returnDate < event.target.value) setReturnDate(""); }} required /><small className="ctr-date-hint">Choose a date within your stay.</small></label>
      <label>Pickup time<input name="pickupTime" type="time" required /></label>
      {(serviceType === "DROPOFF" || serviceType === "ROUND_TRIP") && <label>Pickup at<input value={hotelLabel} readOnly aria-readonly tabIndex={-1} /></label>}
      <label>Passengers<input name="passengerCount" type="number" min={1} max={20} defaultValue={1} required /></label>
    </div>
    <label>Special instructions <small className="customer-data-note">Optional</small><textarea name="specialInstructions" rows={3} maxLength={500} placeholder="e.g. flight number, luggage, child seat" /></label>
    {error && <p className="booking-error" role="alert">{error}</p>}
    <div className="ctr-modal-actions"><button type="button" className="btn btn-soft" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-accent" disabled={loading}><Send size={15} aria-hidden="true" />{loading ? "Submitting…" : "Submit transportation request"}</button></div>
  </form></Modal></>;
}
