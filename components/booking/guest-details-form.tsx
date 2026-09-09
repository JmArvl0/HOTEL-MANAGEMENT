"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CarTaxiFront } from "lucide-react";
import { preArrivalOptions } from "@/lib/request-options";
import { ExpectedArrivalPicker } from "@/components/booking/expected-arrival-picker";

type Props = { roomType: string; checkIn: string; checkOut: string; guests: number; checkInFrom: string; defaults: Record<string, string> };

const SERVICE_OPTIONS = [
  { value: "PICKUP", label: "Pickup to Hotel (e.g. airport pickup)" },
  { value: "DROPOFF", label: "Drop-off from Hotel (e.g. hotel to airport)" },
  { value: "ROUND_TRIP", label: "Round Trip (pickup + return drop-off)" },
] as const;

export function GuestDetailsForm({ roomType, checkIn, checkOut, guests, checkInFrom, defaults }: Props) {
  const router = useRouter(); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  // Optional transportation request: pure client state, no pricing, no fetch. Filed as a
  // REQUESTED row for the Front Desk workflow once the reservation is confirmed.
  const [needRide, setNeedRide] = useState(false);
  const [serviceType, setServiceType] = useState<string>("PICKUP");
  // Canonical "HH:MM" from the arrival picker; the hidden input keeps the FormData pipeline untouched.
  const [arrival, setArrival] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    if (!arrival) { setError("Select your expected arrival time."); setLoading(false); return; }
    const form = new FormData(event.currentTarget);
    const field = (key: string) => String(form.get(key) ?? "");
    const payload: Record<string, unknown> = {
      roomType: field("roomType"), checkIn: field("checkIn"), checkOut: field("checkOut"),
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
    const response = await fetch("/api/booking/holds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json(); setLoading(false);
    if (!response.ok) { setError(body.error ?? "We could not hold this room. Please try again."); return; }
    router.push(`/booking/review/${body.token}`);
  }
  return <form className="booking-form-card" onSubmit={submit}>
    <input type="hidden" name="roomType" value={roomType}/><input type="hidden" name="checkIn" value={checkIn}/><input type="hidden" name="checkOut" value={checkOut}/><input type="hidden" name="guests" value={guests}/>
    <div className="booking-form-grid"><label>First name<input name="firstName" defaultValue={defaults.firstName} required maxLength={80}/></label><label>Last name<input name="lastName" defaultValue={defaults.lastName} required maxLength={80}/></label><label>Email<input name="email" type="email" defaultValue={defaults.email} required maxLength={200}/></label><label>Mobile number<input name="mobile" type="tel" defaultValue={defaults.mobile} required maxLength={30}/></label><label className="wide">Address<input name="address" defaultValue={defaults.address} required maxLength={300}/></label><label>Nationality (optional)<input name="nationality" defaultValue={defaults.nationality} maxLength={80}/></label><div className="arrival-field"><span>Expected arrival</span><ExpectedArrivalPicker value={arrival} onChange={setArrival}/><input type="hidden" name="expectedArrival" value={arrival}/><small className="arrival-note">Helps Front Desk prepare — your room follows check-in from {checkInFrom}, not this time. Early check-in is a separate request.</small></div></div>
    <div className="booking-form-options">
      <span className="booking-form-option-heading">What can we prepare before you arrive? <small>Optional — choose as many as you like. Each will be filed with the right team once your stay is confirmed.</small></span>
      <div className="request-options-list">{preArrivalOptions().map((option) => <label className="request-option" key={option.value}><input type="checkbox" name="requestOption" value={option.value}/><span>{option.label}</span></label>)}</div>
    </div>
    <div className="booking-form-options">
      <span className="booking-form-option-heading"><span className="transport-title"><CarTaxiFront size={14}/> Need a ride?</span><small>Optional — request hotel transportation. Our Front Desk reviews and schedules it once your stay is confirmed; the fare is settled with the hotel directly.</small></span>
      <div className="request-options-list">
        <label className="request-option"><input type="checkbox" checked={needRide} onChange={(e) => setNeedRide(e.target.checked)}/><span><strong>Request transportation</strong></span></label>
        {needRide && (<div className="booking-form-grid transport-ride-fields">
          <label className="wide">Service type<select value={serviceType} onChange={(e) => setServiceType(e.target.value)}>{SERVICE_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
          {(serviceType === "PICKUP" || serviceType === "ROUND_TRIP") && <label className="wide">{serviceType === "ROUND_TRIP" ? "Arrival pickup location" : "Pickup location"}<input name="pickupLocation" required minLength={5} maxLength={200} placeholder="e.g. NAIA Terminal 3, Pasay City"/></label>}
          {serviceType === "DROPOFF" && <label className="wide">Destination<input name="dropoffLocation" required minLength={5} maxLength={200} placeholder="e.g. NAIA Terminal 3, Pasay City"/></label>}
          {serviceType === "ROUND_TRIP" && (<>
            <label className="wide">Departure destination<input name="returnLocation" required minLength={5} maxLength={200} placeholder="e.g. NAIA Terminal 1, Pasay City"/></label>
            <label>Return date<input name="returnDate" type="date" required min={checkIn} max={checkOut}/></label>
            <label>Return time<input name="returnTime" type="time" required/></label>
          </>)}
          <label>Pickup date<input name="pickupDate" type="date" required min={checkIn} max={checkOut}/></label>
          <label>Pickup time<input name="pickupTime" type="time" required/></label>
          <label>Passengers<input name="passengerCount" type="number" min={1} max={20} defaultValue={guests > 20 ? 20 : guests} required/></label>
          <label className="wide">Pickup time or instructions (optional)<input name="rideNote" maxLength={500} placeholder="e.g. flight lands 6:00 PM, 2 large suitcases"/></label>
        </div>)}
      </div>
    </div>
    <label className="booking-form-other"><span>Anything else?</span><small>Optional — tell us more and we will pass it to the front desk.</small><textarea name="specialRequests" defaultValue={defaults.specialRequests} maxLength={1000} rows={3}/></label>
    {error && <p className="booking-error" role="alert">{error}</p>}<button className="btn btn-accent" disabled={loading}>{loading ? "Securing your room…" : "Review booking"}<ArrowRight size={17}/></button>
  </form>;
}
