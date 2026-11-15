"use client";
import { fetchPublic, readResponse } from "@/lib/client-errors";

import { userMessage } from "@/lib/errors";
import { FormFieldError, focusFirstFormError, formFieldProps, type FormFieldErrors } from "@/components/ui/form-field-errors";
import { MobileNumberField } from "@/components/ui/mobile-number-field";
import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CarTaxiFront } from "lucide-react";
import { preArrivalServices, type PreArrivalOptions } from "@/lib/inventory-request-options";
import { HavenErrorAlert } from "@/components/ui/haven-data-controls";
import type { BreakfastChoice } from "@/lib/breakfast";
import { formatPeso } from "@/lib/format";

type TransportationPreferences = { serviceType: "PICKUP" | "DROPOFF" | "ROUND_TRIP"; pickupLocation?: string; dropoffLocation?: string; pickupDate: string; pickupTime: string; returnLocation?: string; returnDate?: string; returnTime?: string; passengerCount: number; specialInstructions?: string };

type Props = { roomId?: string; holdToken?: string; roomType: string; checkIn: string; checkOut: string; guests: number; checkInFrom: string; defaults: Record<string, string>; initialRequests?: string[]; initialArrival?: string; initialTransport?: TransportationPreferences | null; preArrival?: PreArrivalOptions; breakfast?: BreakfastChoice | null; initialBreakfast?: boolean };

const SERVICE_OPTIONS = [
  { value: "PICKUP", label: "Pickup to Hotel (e.g. airport pickup)" },
  { value: "DROPOFF", label: "Drop-off from Hotel (e.g. hotel to airport)" },
  { value: "ROUND_TRIP", label: "Round Trip (pickup + return drop-off)" },
] as const;

export function GuestDetailsForm({ roomId, holdToken, roomType, checkIn, checkOut, guests, checkInFrom, defaults, initialRequests = [], initialArrival = "", initialTransport = null, preArrival, breakfast, initialBreakfast }: Props) {
  const router = useRouter(); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState<FormFieldErrors>({});
  const [noArrival, setNoArrival] = useState(false);
  const pending = useRef(false);
  const attempt = useRef<{ body: string; id: string }>();
  const prefix = "booking-field";
  const fieldProps = (field: string) => formFieldProps(fields, field, prefix);
  const fieldError = (field: string) => <FormFieldError errors={fields} field={field} prefix={prefix} />;
  const [withBreakfast, setWithBreakfast] = useState(Boolean(initialBreakfast || breakfast?.mode === "included"));
  // Amenities come from live Manager-linked inventory (server-supplied); services stay
  // structured constants. No hardcoded amenity fallback ever renders here.
  const amenities = preArrival?.amenities ?? [];
  const services = preArrival?.services ?? preArrivalServices();
  // Optional transportation request: pure client state, no pricing, no fetch. Filed as a
  // REQUESTED row for the Front Desk workflow once the reservation is confirmed.
  const [needRide, setNeedRide] = useState(Boolean(initialTransport));
  const [serviceType, setServiceType] = useState<string>(initialTransport?.serviceType ?? "PICKUP");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setError(""); setFields({});
    if (!noArrival && !form.get("expectedArrival")) {
      const errors = { expectedArrival: "Choose an arrival time or select that you do not know it yet." };
      setFields(errors); setError("Please check the highlighted details."); focusFirstFormError(formElement, errors); return;
    }
    const field = (key: string) => String(form.get(key) ?? "");
    const payload: Record<string, unknown> = {
      roomId, holdToken, roomType: field("roomType"), checkIn: field("checkIn"), checkOut: field("checkOut"),
      breakfastOfferId: withBreakfast ? breakfast?.id : undefined,
      guests: Number(field("guests")), firstName: field("firstName"), lastName: field("lastName"),
      email: field("email"), mobile: field("mobile"), address: field("address"), nationality: field("nationality"),
      expectedArrival: field("expectedArrival"),
      // Checkboxes repeat names; collect them explicitly instead of FormData's last-value-wins.
      requestOptions: form.getAll("requestOption").map(String),
      specialRequests: field("specialRequests"),
      ...(needRide ? { transportationPreferences: {
        serviceType,
        ...(serviceType === "PICKUP" || serviceType === "ROUND_TRIP" ? { pickupLocation: field("pickupLocation").trim() } : {}),
        ...(serviceType === "DROPOFF" ? { dropoffLocation: field("dropoffLocation").trim() } : {}),
        ...(serviceType === "ROUND_TRIP" ? { returnLocation: field("returnLocation").trim(), returnDate: field("returnDate"), returnTime: field("returnTime") } : {}),
        pickupDate: field("pickupDate"), pickupTime: field("pickupTime"),
        passengerCount: Number(field("passengerCount")),
        specialInstructions: field("rideNote").trim() || undefined,
      } } : {}),
    };
    pending.current = true; setLoading(true);
    try {
      const bodyKey = JSON.stringify(payload);
      let storedKey: string | undefined;
      if (globalThis.crypto.subtle) {
        const hash = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(bodyKey));
        storedKey = "haven-hold:" + Array.from(new Uint8Array(hash), part => part.toString(16).padStart(2, "0")).join("");
      }
      let storedId: string | null = null;
      try { if (storedKey) storedId = sessionStorage.getItem(storedKey); } catch { /* Private browsing can disable storage. */ }
      const attemptId = attempt.current?.body === bodyKey ? attempt.current.id : storedId ?? crypto.randomUUID();
      attempt.current = { body: bodyKey, id: attemptId };
      try { if (storedKey) sessionStorage.setItem(storedKey, attemptId); } catch { /* In-memory retry remains available. */ }
      const response = await fetchPublic("/api/booking/holds", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, attemptId }) });
      const body = await readResponse(response);
      if (!response.ok) {
        const issues = body.fields && typeof body.fields === "object" ? body.fields as FormFieldErrors : {};
        setFields(issues);
        setError(Object.keys(issues).length ? "Please check the highlighted details." : userMessage(body.error, "We couldn't confirm your room hold. Try again with the same details to check this booking attempt."));
        focusFirstFormError(formElement, issues);
        if (body.code === "HOLD_ATTEMPT_EXPIRED" || body.code === "RETRY_PAYLOAD_CONFLICT") {
          attempt.current = undefined;
          try { if (storedKey) sessionStorage.removeItem(storedKey); } catch { /* In-memory retry remains available. */ }
        }
        return;
      }
      if (typeof body.token !== "string") throw new Error("Missing hold");
      try { if (storedKey) sessionStorage.removeItem(storedKey); } catch { /* The booking succeeded. */ }
      router.push(`/booking/review/${body.token}`);
    } catch { setError("We couldn't confirm your room hold. Try again with the same details to check this booking attempt."); }
    finally { pending.current = false; setLoading(false); }
  }
  return <form className="booking-form-card" onSubmit={submit} onChange={event => { const name = (event.target as HTMLInputElement).dataset.errorField ?? (event.target as HTMLInputElement).name; if (fields[name]) { setFields(current => Object.fromEntries(Object.entries(current).filter(([key]) => key !== name))); if (Object.keys(fields).length === 1 && error === "Please check the highlighted details.") setError(""); } }}>
    {breakfast && <fieldset className="booking-form-options breakfast-choice">
      <legend>Breakfast</legend>
      {breakfast.mode === "optional" && <div className="request-options-list">
        <label className="request-option"><input type="radio" name="breakfast" checked={!withBreakfast} onChange={() => setWithBreakfast(false)} />Room only</label>
        <label className="request-option"><input type="radio" name="breakfast" checked={withBreakfast} onChange={() => setWithBreakfast(true)} />Room with breakfast · +{formatPeso(breakfast.price)}</label>
      </div>}
      <div aria-live="polite">
        {withBreakfast && <p>{breakfast.mode === "included" ? "Included in this offer. " : ""}{breakfast.guests} guests × {breakfast.mornings} {breakfast.mornings === 1 ? "morning" : "mornings"} at {breakfast.venue} · {breakfast.start}–{breakfast.end} hotel time.</p>}
        <p><strong>Estimated total {formatPeso(withBreakfast ? breakfast.total : breakfast.roomTotal)}</strong> · Deposit {formatPeso(withBreakfast ? breakfast.deposit : breakfast.roomDeposit)} · Balance {formatPeso(withBreakfast ? breakfast.balance : breakfast.roomBalance)}</p>
      </div>
    </fieldset>}
    <input type="hidden" name="roomType" value={roomType}/><input type="hidden" name="checkIn" value={checkIn}/><input type="hidden" name="checkOut" value={checkOut}/><input type="hidden" name="guests" value={guests}/>
    <div className="booking-form-grid">
      <label>First name<input name="firstName" defaultValue={defaults.firstName} autoComplete="given-name" required maxLength={80} {...fieldProps("firstName")} />{fieldError("firstName")}</label>
      <label>Last name<input name="lastName" defaultValue={defaults.lastName} autoComplete="family-name" required maxLength={80} {...fieldProps("lastName")} />{fieldError("lastName")}</label>
      <label>Email<input name="email" type="email" defaultValue={defaults.email} autoComplete="email" required maxLength={200} {...fieldProps("email")} />{fieldError("email")}</label>
      <MobileNumberField name="mobile" defaultValue={defaults.mobile} error={fields.mobile} errorId="booking-field-mobile-error" />
      <label className="wide">Address<input name="address" defaultValue={defaults.address} autoComplete="street-address" required maxLength={300} {...fieldProps("address")} />{fieldError("address")}</label>
      <label>Nationality (optional)<input name="nationality" defaultValue={defaults.nationality} maxLength={80} {...fieldProps("nationality")} />{fieldError("nationality")}</label>
      <div className="arrival-field">
        <label htmlFor="expected-arrival">Expected arrival</label>
        <input id="expected-arrival" name="expectedArrival" type="time" required={!noArrival} disabled={noArrival}
          defaultValue={initialArrival} aria-invalid={Boolean(fields.expectedArrival) || undefined}
          aria-describedby={fields.expectedArrival ? "booking-field-expectedArrival-error arrival-note" : "arrival-note"} />
        {fieldError("expectedArrival")}
        <label className="request-option"><input type="checkbox" checked={noArrival} onChange={event => setNoArrival(event.target.checked)} />I don’t know my arrival time yet</label>
        <small id="arrival-note" className="arrival-note">Standard check-in starts at {checkInFrom}. Front Desk can confirm an earlier arrival when the room is ready.</small>
      </div>
    </div>
    <details className="booking-optional" open={initialRequests.length > 0}><summary>Room preferences & requests (optional)</summary><div className="booking-form-options">
      <span className="booking-form-option-heading">What can we prepare before you arrive? <small>Optional — choose up to 12 items and requests. Each will be filed with the right team once your stay is confirmed.</small></span>
      {fieldError("requestOptions")}
      <p className="request-options-subhead">Amenities &amp; items</p>
      {amenities.length ? (
        <div className="request-options-list">{amenities.map((option) => <label className="request-option" key={option.value}><input type="checkbox" name="requestOption" data-error-field="requestOptions" aria-invalid={Boolean(fields.requestOptions) || undefined} aria-describedby={fields.requestOptions ? "booking-field-requestOptions-error" : undefined} value={option.value} defaultChecked={initialRequests.includes(option.value)}/><span>{option.label}</span></label>)}</div>
      ) : (
        <p className="request-options-unavailable">Request items are temporarily unavailable.</p>
      )}
      <p className="request-options-subhead">Special requests</p>
      <div className="request-options-list">{services.map((option) => <label className="request-option" key={option.value}><input type="checkbox" name="requestOption" data-error-field="requestOptions" aria-invalid={Boolean(fields.requestOptions) || undefined} aria-describedby={fields.requestOptions ? "booking-field-requestOptions-error" : undefined} value={option.value} defaultChecked={initialRequests.includes(option.value)}/><span>{option.label}</span></label>)}</div>
    </div></details>
    <details className="booking-optional" open={Boolean(initialTransport)}><summary>Transportation (optional)</summary><div className="booking-form-options">
      <span className="booking-form-option-heading"><span className="transport-title"><CarTaxiFront size={14}/> Need a ride?</span><small>Optional — request hotel transportation. Our Front Desk reviews and schedules it once your stay is confirmed; the fare is settled with the hotel directly.</small></span>
      <div className="request-options-list">
        <label className="request-option"><input type="checkbox" checked={needRide} onChange={(e) => setNeedRide(e.target.checked)}/><span><strong>Request transportation</strong></span></label>
        {needRide && (<div className="booking-form-grid transport-ride-fields">
          <label className="wide">Service type<select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>{SERVICE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
          {(serviceType === "PICKUP" || serviceType === "ROUND_TRIP") && <label className="wide">{serviceType === "ROUND_TRIP" ? "Arrival pickup location" : "Pickup location"}<input name="pickupLocation" required minLength={5} maxLength={200} placeholder="e.g. NAIA Terminal 3, Pasay City" defaultValue={initialTransport?.pickupLocation ?? ""} {...fieldProps("pickupLocation")} />{fieldError("pickupLocation")}</label>}
          {serviceType === "DROPOFF" && <label className="wide">Destination<input name="dropoffLocation" required minLength={5} maxLength={200} placeholder="e.g. NAIA Terminal 3, Pasay City" defaultValue={initialTransport?.dropoffLocation ?? ""} {...fieldProps("dropoffLocation")} />{fieldError("dropoffLocation")}</label>}
          {serviceType === "ROUND_TRIP" && (<>
            <label className="wide">Departure destination<input name="returnLocation" required minLength={5} maxLength={200} placeholder="e.g. NAIA Terminal 1, Pasay City" defaultValue={initialTransport?.returnLocation ?? ""} {...fieldProps("returnLocation")} />{fieldError("returnLocation")}</label>
            <label>Return date<input name="returnDate" type="date" required min={checkIn} max={checkOut} defaultValue={initialTransport?.returnDate ?? ""} {...fieldProps("returnDate")} />{fieldError("returnDate")}</label>
            <label>Return time<input name="returnTime" type="time" required defaultValue={initialTransport?.returnTime ?? ""} {...fieldProps("returnTime")} />{fieldError("returnTime")}</label>
          </>)}
          <label>Pickup date<input name="pickupDate" type="date" required min={checkIn} max={checkOut} defaultValue={initialTransport?.pickupDate ?? ""} {...fieldProps("pickupDate")} />{fieldError("pickupDate")}</label>
          <label>Pickup time<input name="pickupTime" type="time" required defaultValue={initialTransport?.pickupTime ?? ""} {...fieldProps("pickupTime")} />{fieldError("pickupTime")}</label>
          <label>Passengers<input name="passengerCount" type="number" min={1} max={20} defaultValue={initialTransport?.passengerCount ?? (guests > 20 ? 20 : guests)} required {...fieldProps("passengerCount")} />{fieldError("passengerCount")}</label>
          <label className="wide">Pickup time or instructions (optional)<input name="rideNote" maxLength={500} placeholder="e.g. flight lands 6:00 PM, 2 large suitcases" defaultValue={initialTransport?.specialInstructions ?? ""}/></label>
        </div>)}
      </div>
    </div></details>
    <label className="booking-form-other"><span>Anything else?</span><small>Optional — tell us more and we will pass it to the front desk.</small><textarea name="specialRequests" defaultValue={defaults.specialRequests} maxLength={1000} rows={3} {...fieldProps("specialRequests")} />{fieldError("specialRequests")}</label>
    {error && <HavenErrorAlert title="Booking needs attention" body={error} variant="customer" />}<button className="btn btn-accent" disabled={loading}>{loading ? "Securing your room…" : "Review booking"}<ArrowRight size={17}/></button>
  </form>;
}
