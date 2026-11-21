"use client";

import { FormFieldError, formFieldProps, focusFirstFormError, type FormFieldErrors } from "@/components/ui/form-field-errors";
import { fetchPublic, readResponse } from "@/lib/client-errors";

import { userMessage } from "@/lib/errors";
import { FormEvent, useEffect, useRef, useState } from "react";
import { HavenErrorAlert } from "@/components/ui/haven-data-controls";
import { useRouter } from "next/navigation";
import { CarTaxiFront, Hotel, Plane, PlaneTakeoff, Repeat, Send } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { FleetRideOptions } from "@/components/customer/fleet-ride-options";
import { RideLocationField } from "@/components/customer/ride-location-field";
import { readFleetOptions } from "@/lib/fleet-pickup-input";
import { reservationTransportationHref } from "@/lib/transportation-display";
import { normalizePhone } from "@/lib/input-validation";

export type EligibleRideReservation = {
  id: string; confirmation_number: string | null; room_type: string; check_in: string; check_out: string; guests: number;
  passenger?: { name: string; phone: string };
};

function formatStayDate(value: string) {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

const SERVICE_OPTIONS = [
  { value: "PICKUP", label: "Airport pickup", hint: "Arrival to the hotel", icon: Plane },
  { value: "DROPOFF", label: "Hotel drop-off", hint: "Departure from the hotel", icon: PlaneTakeoff },
  { value: "ROUND_TRIP", label: "Round trip", hint: "Pickup + return ride", icon: Repeat },
] as const;

export function TransportationRequestForm({ reservations, hotelLabel, today, reservationSelected, openInitially, staff, onClose }: {
  reservations: EligibleRideReservation[];
  hotelLabel: string;
  today: string;
  reservationSelected: boolean;
  openInitially: boolean;
  staff?: boolean;
  onClose?: (submitted: boolean) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [serviceType, setServiceType] = useState<string>("PICKUP");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState<FormFieldErrors>({});
  const submitting = useRef(false);
  const retry = useRef<{ signature: string; key: string } | null>(null);
  const [selectedReservationId, setSelectedReservationId] = useState(reservations[0]?.id ?? "");
  const [pickupDate, setPickupDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const selectedReservation = reservations.find(reservation => reservation.id === selectedReservationId) ?? reservations[0];
  const savedName = selectedReservation?.passenger?.name?.trim() ?? "";
  const savedPhone = normalizePhone(selectedReservation?.passenger?.phone ?? "") ?? "";
  const needsName = staff || savedName.length < 2 || savedName.length > 120;
  const needsPhone = staff || !savedPhone;

  useEffect(() => {
    if (!openInitially) return;
    const timer = window.setTimeout(() => setOpen(true), 0);
    return () => window.clearTimeout(timer);
  }, [openInitially]);

  function close(submitted = false) {
    setOpen(false);
    onClose?.(submitted);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current) return; submitting.current = true; setLoading(true); setError("");
    const formElement = event.currentTarget;
    setFields({});
    const form = new FormData(formElement);
    const payload = { reservationId: String(form.get("reservationId")), serviceType, pickupDate: String(form.get("pickupDate")), pickupTime: String(form.get("pickupTime")), passengerCount: Number(form.get("passengerCount")),
      ...(serviceType === "PICKUP" || serviceType === "ROUND_TRIP" ? { pickupLocation: String(form.get("pickupLocation") ?? "").trim() || undefined } : {}),
      ...(serviceType === "DROPOFF" ? { dropoffLocation: String(form.get("dropoffLocation") ?? "").trim() || undefined } : {}),
      ...(serviceType === "ROUND_TRIP" ? { returnLocation: String(form.get("returnLocation") ?? "").trim() || undefined, returnDate: String(form.get("returnDate") ?? ""), returnTime: String(form.get("returnTime") ?? "") } : {}),
      specialInstructions: String(form.get("specialInstructions") ?? "").trim() || undefined,
      fleetPickup: {
        ...readFleetOptions(form),
        travelerName: needsName ? String(form.get("travelerName") ?? "") : savedName,
        phone: needsPhone ? String(form.get("phone") ?? "") : savedPhone,
      },
    };
    const signature = JSON.stringify(payload);
    if (retry.current?.signature !== signature) retry.current = { signature, key: crypto.randomUUID() };
    try {
    const response = await fetchPublic(staff ? "/api/transportation" : "/api/account/transportation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, idempotencyKey: retry.current.key }) });
    const body = await readResponse(response); setLoading(false);
    if (!response.ok) { setFields(body.fields ?? {}); focusFirstFormError(formElement, body.fields ?? {}); setError(Object.keys(body.fields ?? {}).length ? "Please check the highlighted details." : userMessage(body.error, "Unable to submit your transportation request.")); return; }
    retry.current = null;
    close(true);
    if (!staff) {
      if (openInitially && selectedReservationId) {
        router.replace(reservationTransportationHref(selectedReservationId), { scroll: false });
      } else {
        router.refresh();
      }
    }
    } catch { setError("We couldn't confirm your transportation request. Check your transportation requests before sending it again."); }
    finally { submitting.current = false; setLoading(false); }
  }

  if (!selectedReservation) return <p className="customer-empty-note">A confirmed or current reservation is required before requesting transportation.</p>;
  const stayStart = selectedReservation.check_in < today ? today : selectedReservation.check_in;
  const stayEnd = selectedReservation.check_out;
  const hotelEndCaption = serviceType === "DROPOFF" ? "Pickup at the hotel" : serviceType === "ROUND_TRIP" ? "The hotel end of both legs is fixed" : "Drop-off at the hotel";

  return <>{!staff && <section className="ctr-request-invitation"><span className="ctr-invitation-icon"><CarTaxiFront size={22} aria-hidden="true" /></span><div><h2>Need a ride?</h2><p>Send your ride request to Fleet. The confirmed fare will appear on your folio.</p></div><button type="button" className="btn btn-accent" onClick={() => setOpen(true)}><CarTaxiFront size={15} aria-hidden="true" />Request transportation</button></section>}<Modal isOpen={open} onClose={() => close()} title={staff ? "Book a ride for the guest" : "Request transportation"} description={staff ? "Confirm the trip and passenger details with the guest." : "Share where and when you need a ride."} size="xl" headerVariant="branded" className="customer-transportation-dialog"><form className="customer-request-form wide ctr-form" onSubmit={submit}>
    <fieldset className="ctr-service-options">
      <legend>Service type</legend>
      {SERVICE_OPTIONS.map(({ value, label, hint, icon: Icon }) => (
        <label key={value} className={`ctr-service-option${serviceType === value ? " picked" : ""}`}>
          <input type="radio" name="serviceType" value={value} checked={serviceType === value} onChange={() => { setServiceType(value); setPickupDate(""); setReturnDate(""); }} />
          <Icon size={17} aria-hidden="true" />
          <span><b>{label}</b><small>{hint}</small></span>
        </label>
      ))}
    </fieldset>
    {reservationSelected ? <input type="hidden" name="reservationId" value={selectedReservation.id} /> :
      <label>Reservation<select name="reservationId" required value={selectedReservationId} onChange={(event) => { setSelectedReservationId(event.target.value); setPickupDate(""); setReturnDate(""); setError(""); }}>{reservations.map((reservation) => <option value={reservation.id} key={reservation.id}>{reservation.confirmation_number ?? reservation.id} · {reservation.room_type} · {reservation.check_in} to {reservation.check_out}</option>)}</select></label>}
    <p className="ctr-stay-window" aria-live="polite"><span>Available ride dates</span><b>{formatStayDate(stayStart)} – {formatStayDate(stayEnd)}</b><small>Dates outside this reservation are disabled.</small></p>
    {(serviceType === "PICKUP" || serviceType === "ROUND_TRIP") && <RideLocationField name="pickupLocation"
      label={serviceType === "ROUND_TRIP" ? "Arrival pickup location" : "Pickup location"} placeholder="e.g. NAIA Terminal 3, Pasay City"
      fields={fields} prefix="request" allowMap={!staff} />}
    <div className="ctr-hotel-end" aria-label={`${hotelEndCaption}: ${hotelLabel}`}>
      <Hotel size={14} aria-hidden="true" />
      <span>{hotelEndCaption}</span>
      <b>{hotelLabel}</b>
    </div>
    {serviceType === "DROPOFF" && <RideLocationField name="dropoffLocation" label="Destination" placeholder="e.g. SM North EDSA, Quezon City"
      fields={fields} prefix="request" allowMap={!staff} />}
    {serviceType === "ROUND_TRIP" && <>
      <RideLocationField name="returnLocation" label="Departure destination" placeholder="e.g. NAIA Terminal 1, Pasay City"
        fields={fields} prefix="request" allowMap={!staff} />
      <label>Return date<input name="returnDate" type="date" min={pickupDate || stayStart} max={stayEnd} value={returnDate || stayEnd} onChange={(event) => setReturnDate(event.target.value)} required {...formFieldProps(fields, "returnDate", "request")} /><FormFieldError errors={fields} field="returnDate" prefix="request" /></label>
      <label>Return time<input name="returnTime" type="time" required {...formFieldProps(fields, "returnTime", "request")} /><FormFieldError errors={fields} field="returnTime" prefix="request" /></label>
    </>}
    <div className="ctr-grid">
      <label>Pickup date<input name="pickupDate" type="date" min={stayStart} max={stayEnd} value={pickupDate || (serviceType === "DROPOFF" ? stayEnd : stayStart)} onChange={(event) => { setPickupDate(event.target.value); if (returnDate && returnDate < event.target.value) setReturnDate(""); }} required {...formFieldProps(fields, "pickupDate", "request")} /><FormFieldError errors={fields} field="pickupDate" prefix="request" /><small className="ctr-date-hint">Choose a date within your stay.</small></label>
      <label>Pickup time<input name="pickupTime" type="time" required {...formFieldProps(fields, "pickupTime", "request")} /><FormFieldError errors={fields} field="pickupTime" prefix="request" /></label>
      <label>Passengers<input name="passengerCount" type="number" min={1} max={20} key={selectedReservation.id} defaultValue={Math.min(selectedReservation.guests, 20)} required {...formFieldProps(fields, "passengerCount", "request")} /><FormFieldError errors={fields} field="passengerCount" prefix="request" /></label>
    </div>
    <label>Special instructions <small className="customer-data-note">Optional</small><textarea name="specialInstructions" rows={3} maxLength={500} placeholder="e.g. flight number, terminal, luggage or child seat" {...formFieldProps(fields, "specialInstructions", "request")} /><FormFieldError errors={fields} field="specialInstructions" prefix="request" /></label>
    {(needsName || needsPhone) && <div className="ctr-grid" key={selectedReservation.id}>
      {needsName && <label>Passenger name<input name="travelerName" required minLength={2} maxLength={120} defaultValue={staff ? savedName : ""}
        {...formFieldProps(fields, "travelerName", "request")} /><FormFieldError errors={fields} field="travelerName" prefix="request" /></label>}
      {needsPhone && <label>Contact number<input name="phone" type="tel" required maxLength={40} defaultValue={staff ? selectedReservation.passenger?.phone : ""}
        {...formFieldProps(fields, "phone", "request")} /><FormFieldError errors={fields} field="phone" prefix="request" /></label>}
    </div>}
    <FleetRideOptions fields={fields} prefix="request" staff={staff} />
    {error && <HavenErrorAlert title="Request needs attention" body={error} variant="customer" />}
    <div className="ctr-modal-actions"><button type="button" className="btn btn-soft" onClick={() => close()}>Cancel</button><button className="btn btn-accent" disabled={loading}><Send size={15} aria-hidden="true" />{loading ? "Submitting…" : "Send ride request"}</button></div>
  </form></Modal></>;
}
