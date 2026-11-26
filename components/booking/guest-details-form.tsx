"use client";
import { fetchPublic, readResponse } from "@/lib/client-errors";

import { userMessage } from "@/lib/errors";
import { FormFieldError, focusFirstFormError, formFieldProps, type FormFieldErrors } from "@/components/ui/form-field-errors";
import { MobileNumberField, type MobileNumberDraft } from "@/components/ui/mobile-number-field";
import { useEffect, useRef, useState, type ComponentProps, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CarTaxiFront } from "lucide-react";
import { preArrivalServices, type PreArrivalOptions } from "@/lib/inventory-request-options";
import { HavenErrorAlert } from "@/components/ui/haven-data-controls";
import type { BreakfastChoice } from "@/lib/breakfast";
import { formatPeso } from "@/lib/format";
import type { TransportationPreferences } from "@/lib/transportation-display";
import { FleetRideOptions } from "@/components/customer/fleet-ride-options";
import { RideLocationField } from "@/components/customer/ride-location-field";
import { RideScheduleField } from "@/components/customer/ride-schedule-field";
import { editableFleetRideNotes, readFleetOptions, vehicleSeatOptions } from "@/lib/fleet-pickup-input";
import { BookingStaySummary } from "@/components/booking/booking-stay-summary";
import { BOOKING_LEAVE_EVENT, canLeaveBooking } from "@/lib/booking-leave";
import { discardGuestDetailsDraft, guestDetailsEntry, readGuestDetailsDraft, saveGuestDetailsDraft, type GuestDetailsDraft } from "@/lib/guest-details-draft";

type Props = { draftScope?: string; draftExpiresAt?: string | null; roomId?: string; holdToken?: string; roomType: string; checkIn: string; checkOut: string; guests: number; checkInFrom: string; defaults: Record<string, string>; initialRequests?: string[]; initialArrival?: string; initialTransport?: TransportationPreferences | null; preArrival?: PreArrivalOptions; breakfast?: BreakfastChoice | null; initialBreakfast?: boolean; intro?: ReactNode; summary?: ComponentProps<typeof BookingStaySummary> };

const SERVICE_OPTIONS = [
  { value: "PICKUP", label: "Pickup to the hotel" },
  { value: "DROPOFF", label: "Hotel drop-off" },
  { value: "ROUND_TRIP", label: "Round trip" },
] as const;

export function GuestDetailsForm(props: Props) {
  const [draft, setDraft] = useState<GuestDetailsDraft>();
  const edited = useRef(false);
  const { draftScope, draftExpiresAt } = props;
  useEffect(() => {
    if (!draftScope) return;
    if (draftExpiresAt && Date.parse(draftExpiresAt) <= Date.now()) {
      discardGuestDetailsDraft(guestDetailsEntry());
      return;
    }
    const saved = readGuestDetailsDraft(draftScope);
    if (!saved) return;
    const frame = requestAnimationFrame(() => {
      if (!edited.current) setDraft(saved);
    });
    return () => cancelAnimationFrame(frame);
  }, [draftScope, draftExpiresAt]);
  return <GuestDetailsFields key={draft ? "restored" : "initial"} {...props} draft={draft} onEdit={() => { edited.current = true; }} />;
}

function GuestDetailsFields({ draftScope, draft, onEdit, roomId, holdToken, roomType, checkIn, checkOut, guests, checkInFrom, defaults, initialRequests = [], initialArrival = "", initialTransport = null, preArrival, breakfast, initialBreakfast, intro, summary }: Props & { draft?: GuestDetailsDraft; onEdit: () => void }) {
  const router = useRouter(); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const [fields, setFields] = useState<FormFieldErrors>({});
  const values = draft?.values;
  const [noArrival, setNoArrival] = useState(values?.noArrival === "yes");
  const [dirty, setDirty] = useState(Boolean(draft));
  const formRef = useRef<HTMLFormElement>(null);
  const mobileDraft = useRef(draft?.mobile);
  const pending = useRef(false);
  const attempt = useRef<{ body: string; id: string }>();
  const prefix = "booking-field";
  const fieldProps = (field: string) => formFieldProps(fields, field, prefix);
  const fieldError = (field: string) => <FormFieldError errors={fields} field={field} prefix={prefix} />;
  const [withBreakfast, setWithBreakfast] = useState(breakfast?.mode === "included" || (values?.breakfast ? values.breakfast === "with" : Boolean(initialBreakfast)));
  const selectedBreakfast = withBreakfast ? breakfast : null;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = true; };
    const confirmLeave = (event: Event) => {
      if (window.confirm("Leave guest details? Changes since your last room hold will be lost.")) {
        discardGuestDetailsDraft(guestDetailsEntry());
      } else {
        event.preventDefault();
      }
    };
    const beforeLink = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== "_self") ||
          link.hasAttribute("download") || link.hasAttribute("data-booking-keep-form")) return;
      const destination = new URL(link.href);
      if (destination.origin !== window.location.origin ||
          destination.pathname + destination.search === window.location.pathname + window.location.search) return;
      if (!canLeaveBooking()) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener(BOOKING_LEAVE_EVENT, confirmLeave);
    document.addEventListener("click", beforeLink, true);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener(BOOKING_LEAVE_EVENT, confirmLeave);
      document.removeEventListener("click", beforeLink, true);
    };
  }, [dirty]);
  // Amenities come from live Manager-linked inventory (server-supplied); services stay
  // structured constants. No hardcoded amenity fallback ever renders here.
  const amenities = preArrival?.amenities ?? [];
  const services = preArrival?.services ?? preArrivalServices();
  // The booking stores the ride and sharing permission until payment confirms the stay.
  const [needRide, setNeedRide] = useState(values?.needRide ? values.needRide === "yes" : Boolean(initialTransport));
  const [serviceType, setServiceType] = useState(values?.serviceType ?? initialTransport?.serviceType ?? "PICKUP");
  const requestOptions = draft?.requestOptions ?? initialRequests;
  const fleetOptions = draft ? {
    ridePreferences: draft.ridePreferences,
    sharingEnabled: Boolean(values?.sharingEnabled),
    vehicleSeats: vehicleSeatOptions.find(seats => String(seats) === values?.vehicleSeats),
    luggageCount: values?.luggageCount ? Number(values.luggageCount) : undefined,
  } : initialTransport?.fleetOptions;

  function recordEdit() {
    onEdit();
    setDirty(true);
    if (!draftScope || !formRef.current) return;
    const entry = guestDetailsEntry(true);
    const formElement = formRef.current;
    if (!entry) return;
    // Capture conditional controls after their change handlers update the form.
    queueMicrotask(() => {
      if (formElement.isConnected && entry === guestDetailsEntry()) {
        saveGuestDetailsDraft(entry, draftScope, formElement, mobileDraft.current);
      }
    });
  }
  function updateMobile(value: MobileNumberDraft) {
    mobileDraft.current = value;
    recordEdit();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const formElement = event.currentTarget;
    const entry = guestDetailsEntry();
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
        fleetOptions: readFleetOptions(form),
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
      discardGuestDetailsDraft(entry);
      setDirty(false);
      if (formElement.isConnected) router.push(`/booking/review/${body.token}`);
    } catch { setError("We couldn't confirm your room hold. Try again with the same details to check this booking attempt."); }
    finally { pending.current = false; setLoading(false); }
  }
  const form = <form ref={formRef} className="booking-form-card" onSubmit={submit} onChange={event => {
    const input = event.target as HTMLInputElement;
    if (input.name) recordEdit();
    const name = input.dataset.errorField ?? input.name;
    if (fields[name]) {
      setFields(current => Object.fromEntries(Object.entries(current).filter(([key]) => key !== name)));
      if (Object.keys(fields).length === 1 && error === "Please check the highlighted details.") setError("");
    }
  }}>
    {draft && <p role="status">Draft restored. Review your details before continuing.</p>}
    {breakfast && <fieldset className="booking-form-options breakfast-choice">
      <legend>Breakfast</legend>
      {breakfast.mode === "optional" && <div className="request-options-list">
        <label className="request-option"><input type="radio" name="breakfast" value="without" checked={!withBreakfast} onChange={() => setWithBreakfast(false)} />Room only</label>
        <label className="request-option"><input type="radio" name="breakfast" value="with" checked={withBreakfast} onChange={() => setWithBreakfast(true)} />Room with breakfast · +{formatPeso(breakfast.price)}</label>
      </div>}
      <div aria-live="polite">
        {withBreakfast && <p>{breakfast.mode === "included" ? "Included in this offer. " : ""}{breakfast.guests} guests × {breakfast.mornings} {breakfast.mornings === 1 ? "morning" : "mornings"} at {breakfast.venue} · {breakfast.start}–{breakfast.end} hotel time.</p>}
        <p><strong>Estimated total {formatPeso(withBreakfast ? breakfast.total : breakfast.roomTotal)}</strong> · Deposit {formatPeso(withBreakfast ? breakfast.deposit : breakfast.roomDeposit)} · Balance {formatPeso(withBreakfast ? breakfast.balance : breakfast.roomBalance)}</p>
      </div>
    </fieldset>}
    <input type="hidden" name="roomType" value={roomType}/><input type="hidden" name="checkIn" value={checkIn}/><input type="hidden" name="checkOut" value={checkOut}/><input type="hidden" name="guests" value={guests}/>
    <div className="booking-form-grid">
      <label>First name<input name="firstName" defaultValue={values?.firstName ?? defaults.firstName} autoComplete="given-name" required maxLength={80} {...fieldProps("firstName")} />{fieldError("firstName")}</label>
      <label>Last name<input name="lastName" defaultValue={values?.lastName ?? defaults.lastName} autoComplete="family-name" required maxLength={80} {...fieldProps("lastName")} />{fieldError("lastName")}</label>
      <label>Email<input name="email" type="email" defaultValue={values?.email ?? defaults.email} autoComplete="email" required maxLength={200} {...fieldProps("email")} />{fieldError("email")}</label>
      <MobileNumberField name="mobile" defaultValue={defaults.mobile} draft={draft?.mobile} onDraftChange={updateMobile} error={fields.mobile} errorId="booking-field-mobile-error" />
      <label className="wide">Address<input name="address" defaultValue={values?.address ?? defaults.address} autoComplete="street-address" required maxLength={300} {...fieldProps("address")} />{fieldError("address")}</label>
      <label>Nationality (optional)<input name="nationality" defaultValue={values?.nationality ?? defaults.nationality} maxLength={80} {...fieldProps("nationality")} />{fieldError("nationality")}</label>
      <div className="arrival-field">
        <label htmlFor="expected-arrival">Expected arrival</label>
        <input id="expected-arrival" name="expectedArrival" type="time" required={!noArrival} disabled={noArrival}
          defaultValue={values?.expectedArrival ?? initialArrival} aria-invalid={Boolean(fields.expectedArrival) || undefined}
          aria-describedby={fields.expectedArrival ? "booking-field-expectedArrival-error arrival-note" : "arrival-note"} />
        {fieldError("expectedArrival")}
        <label className="request-option"><input type="checkbox" name="noArrival" value="yes" checked={noArrival} onChange={event => setNoArrival(event.target.checked)} />I don’t know my arrival time yet</label>
        <small id="arrival-note" className="arrival-note">Standard check-in starts at {checkInFrom}. Front Desk can confirm an earlier arrival when the room is ready.</small>
      </div>
    </div>
    <details className="booking-optional" open={requestOptions.length > 0}><summary>Room preferences & requests (optional)</summary><div className="booking-form-options">
      <span className="booking-form-option-heading">What can we prepare before you arrive? <small>Optional — choose up to 12 items and requests. Each will be filed with the right team once your stay is confirmed.</small></span>
      {fieldError("requestOptions")}
      <p className="request-options-subhead">Amenities &amp; items</p>
      {amenities.length ? (
        <div className="request-options-list">{amenities.map((option) => <label className="request-option" key={option.value}><input type="checkbox" name="requestOption" data-error-field="requestOptions" aria-invalid={Boolean(fields.requestOptions) || undefined} aria-describedby={fields.requestOptions ? "booking-field-requestOptions-error" : undefined} value={option.value} defaultChecked={requestOptions.includes(option.value)}/><span>{option.label}</span></label>)}</div>
      ) : (
        <p className="request-options-unavailable">Request items are temporarily unavailable.</p>
      )}
      <p className="request-options-subhead">Special requests</p>
      <div className="request-options-list">{services.map((option) => <label className="request-option" key={option.value}><input type="checkbox" name="requestOption" data-error-field="requestOptions" aria-invalid={Boolean(fields.requestOptions) || undefined} aria-describedby={fields.requestOptions ? "booking-field-requestOptions-error" : undefined} value={option.value} defaultChecked={requestOptions.includes(option.value)}/><span>{option.label}</span></label>)}</div>
    </div></details>
    <fieldset className="booking-ride-choice" id="booking-transportation">
      <legend><CarTaxiFront size={16} aria-hidden="true" /> Transportation <small>Optional</small></legend>
      <p>Need a ride to or from the hotel?</p>
      <div className="request-options-list">
        <label className="request-option"><input name="needRide" type="radio" value="no" checked={!needRide} onChange={() => setNeedRide(false)} />No thanks</label>
        <label className="request-option"><input name="needRide" type="radio" value="yes" checked={needRide} onChange={() => setNeedRide(true)} />Arrange transportation</label>
      </div>
      <div hidden={!needRide}>
        <p>We’ll send your ride to Fleet once your stay is confirmed, using the name and mobile number on this booking. The confirmed fare will appear on your folio.</p>
        <fieldset disabled={!needRide} className="booking-form-grid transport-ride-fields" aria-label="Ride details">
          <label className="wide">Service type<select name="serviceType" value={serviceType} onChange={(e) => setServiceType(e.target.value)}>{SERVICE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
          {(serviceType === "PICKUP" || serviceType === "ROUND_TRIP") && <RideLocationField wide name="pickupLocation"
            label={serviceType === "ROUND_TRIP" ? "Arrival pickup location" : "Pickup location"} placeholder="e.g. NAIA Terminal 3, Pasay City"
            defaultValue={values?.pickupLocation ?? initialTransport?.pickupLocation} fields={fields} prefix={prefix} />}
          {serviceType === "DROPOFF" && <RideLocationField wide name="dropoffLocation" label="Destination"
            placeholder="e.g. NAIA Terminal 3, Pasay City" defaultValue={values?.dropoffLocation ?? initialTransport?.dropoffLocation} fields={fields} prefix={prefix} />}
          <RideScheduleField key={serviceType === "DROPOFF" ? "departure" : "arrival"} label="Pickup date" name="pickupDate" type="date"
            min={checkIn} max={checkOut} defaultValue={(values?.serviceType === serviceType ? values.pickupDate : undefined) ?? (initialTransport?.serviceType === serviceType ? initialTransport.pickupDate : serviceType === "DROPOFF" ? checkOut : checkIn)}
            fields={fields} prefix={prefix} />
          <RideScheduleField label="Pickup time" name="pickupTime" type="time" defaultValue={values?.pickupTime ?? initialTransport?.pickupTime ?? ""}
            fields={fields} prefix={prefix} hint="Manila time" />
          {serviceType === "ROUND_TRIP" && (<>
            <RideLocationField wide name="returnLocation" label="Departure destination" placeholder="e.g. NAIA Terminal 1, Pasay City"
              defaultValue={values?.returnLocation ?? initialTransport?.returnLocation} fields={fields} prefix={prefix} />
            <RideScheduleField label="Return date" name="returnDate" type="date" min={checkIn} max={checkOut}
              defaultValue={values?.returnDate ?? initialTransport?.returnDate ?? checkOut} fields={fields} prefix={prefix} />
            <RideScheduleField label="Return time" name="returnTime" type="time" defaultValue={values?.returnTime ?? initialTransport?.returnTime ?? ""}
              fields={fields} prefix={prefix} hint="Manila time" />
          </>)}
          <label>Passengers<input name="passengerCount" type="number" min={1} max={20} defaultValue={values?.passengerCount ?? initialTransport?.passengerCount ?? (guests > 20 ? 20 : guests)} required {...fieldProps("passengerCount")} />{fieldError("passengerCount")}</label>
          <label className="wide">Ride notes (optional)<textarea name="rideNote" rows={2} maxLength={500} placeholder="Flight, terminal or bags"
            defaultValue={values?.rideNote ?? editableFleetRideNotes(initialTransport?.specialInstructions, initialTransport?.fleetOptions?.vehicleSeats) ?? ""}
            {...fieldProps("specialInstructions")} />{fieldError("specialInstructions")}</label>
          <FleetRideOptions fields={fields} prefix={prefix} saved={fleetOptions} />
        </fieldset>
      </div>
    </fieldset>
    <label className="booking-form-other"><span>Anything else?</span><small>Optional — tell us more and we will pass it to the front desk.</small><textarea name="specialRequests" defaultValue={values?.specialRequests ?? defaults.specialRequests} maxLength={1000} rows={3} {...fieldProps("specialRequests")} />{fieldError("specialRequests")}</label>
    {error && <HavenErrorAlert title="Booking needs attention" body={error} variant="customer" />}<button className="btn btn-accent" disabled={loading}>{loading ? "Securing your room…" : "Review booking"}<ArrowRight size={17}/></button>
  </form>;
  if (!summary) return form;
  return <>
    <div>{intro}{form}</div>
    <BookingStaySummary {...summary}
      total={selectedBreakfast?.total ?? summary.total}
      lines={selectedBreakfast ? [{ label: "Breakfast", amount: selectedBreakfast.price }] : summary.lines}
      depositDue={breakfast ? { label: "Estimated deposit", amount: selectedBreakfast?.deposit ?? breakfast.roomDeposit } : summary.depositDue}
      remainingBalance={breakfast ? selectedBreakfast?.balance ?? breakfast.roomBalance : summary.remainingBalance}
    />
  </>;
}
