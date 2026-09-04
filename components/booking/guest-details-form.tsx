"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CarTaxiFront, Loader2 } from "lucide-react";
import { preArrivalOptions } from "@/lib/request-options";

type Props = { roomType: string; checkIn: string; checkOut: string; guests: number; defaults: Record<string, string>; transferEnabled?: boolean };
type QuoteVehicle = {
  id: string; name: string; description: string | null; seats: number;
  baseFare: number; perKm: number; perMinute: number; bookingFee: number;
  fare: { base: number; distanceCharge: number; timeCharge: number; bookingFee: number; total: number };
};
type Quote = { pickupAddress: string; dropoffLabel: string; distanceKm: number; durationMin: number; vehicles: QuoteVehicle[] };

const money = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 }).format(value);
const kmLabel = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function GuestDetailsForm({ roomType, checkIn, checkOut, guests, defaults, transferEnabled = false }: Props) {
  const router = useRouter(); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  // Hotel transfer: optional single pickup->hotel ride, priced by a live TomTom route.
  const [transferBooked, setTransferBooked] = useState(false);
  const [pickup, setPickup] = useState("");
  const [transferNote, setTransferNote] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [vehicleTypeId, setVehicleTypeId] = useState("");
  const [estimateError, setEstimateError] = useState("");

  const changePickup = (value: string) => { setPickup(value); setQuote(null); setEstimateError(""); setVehicleTypeId(""); };

  async function estimate() {
    if (pickup.trim().length < 5) { setEstimateError("Enter a pickup address first."); return; }
    setQuoting(true); setEstimateError(""); setQuote(null);
    try {
      const response = await fetch("/api/booking/transfer/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pickupAddress: pickup }) });
      const body = await response.json();
      if (!response.ok) { setEstimateError(body.error ?? "We could not estimate this transfer."); return; }
      setQuote(body);
      if (!body.vehicles?.length) setVehicleTypeId("");
      else setVehicleTypeId((current) => (body.vehicles.some((v: QuoteVehicle) => v.id === current) ? current : body.vehicles[0].id));
    } catch { setEstimateError("We could not estimate this transfer. Please try again."); }
    finally { setQuoting(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    const field = (key: string) => String(form.get(key) ?? "");
    if (transferBooked && !quote) { setLoading(false); setError("Estimate your transfer fare to book it — or turn off the transfer."); return; }
    if (transferBooked && !vehicleTypeId) { setLoading(false); setError("Choose a vehicle type for your transfer."); return; }
    const payload: Record<string, unknown> = {
      roomType: field("roomType"), checkIn: field("checkIn"), checkOut: field("checkOut"),
      guests: Number(field("guests")), firstName: field("firstName"), lastName: field("lastName"),
      email: field("email"), mobile: field("mobile"), address: field("address"), nationality: field("nationality"),
      expectedArrival: field("expectedArrival"),
      // Checkboxes repeat names; collect them explicitly instead of FormData's last-value-wins.
      requestOptions: form.getAll("requestOption").map(String),
      specialRequests: field("specialRequests"),
      transportLines: transferBooked && vehicleTypeId ? [{ pickupAddress: pickup.trim(), vehicleTypeId, note: transferNote.trim() }] : [],
    };
    const response = await fetch("/api/booking/holds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json(); setLoading(false);
    if (!response.ok) { setError(body.error ?? "We could not hold this room. Please try again."); return; }
    router.push(`/booking/review/${body.token}`);
  }
  return <form className="booking-form-card" onSubmit={submit}>
    <input type="hidden" name="roomType" value={roomType}/><input type="hidden" name="checkIn" value={checkIn}/><input type="hidden" name="checkOut" value={checkOut}/><input type="hidden" name="guests" value={guests}/>
    <div className="booking-form-grid"><label>First name<input name="firstName" defaultValue={defaults.firstName} required maxLength={80}/></label><label>Last name<input name="lastName" defaultValue={defaults.lastName} required maxLength={80}/></label><label>Email<input name="email" type="email" defaultValue={defaults.email} required maxLength={200}/></label><label>Mobile number<input name="mobile" type="tel" defaultValue={defaults.mobile} required maxLength={30}/></label><label className="wide">Address<input name="address" defaultValue={defaults.address} required maxLength={300}/></label><label>Nationality (optional)<input name="nationality" defaultValue={defaults.nationality} maxLength={80}/></label><label>Expected arrival<input name="expectedArrival" placeholder="e.g. 3:00 PM" required maxLength={40}/></label></div>
    <div className="booking-form-options">
      <span className="booking-form-option-heading">What can we prepare before you arrive? <small>Optional — choose as many as you like. Each will be filed with the right team once your stay is confirmed.</small></span>
      <div className="request-options-list">{preArrivalOptions().map((option) => <label className="request-option" key={option.value}><input type="checkbox" name="requestOption" value={option.value}/><span>{option.label}</span></label>)}</div>
    </div>
    {transferEnabled && (
      <div className="booking-form-options">
        <span className="booking-form-option-heading"><span className="transport-title"><CarTaxiFront size={14}/> Hotel transfer</span><small>Optional — book a ride to the hotel. You pick the pickup point and the vehicle; the drop-off is the hotel. Your transfer fare is included in your stay total and the reservation deposit.</small></span>
        <div className="request-options-list transport-options-list">
          <label className="request-option"><input type="checkbox" checked={transferBooked} onChange={(e) => setTransferBooked(e.target.checked)}/><span><strong>Book a pickup to hotel transfer</strong></span></label>
          {transferBooked && (
            <>
              <label className="transport-note"><span>Pickup address</span>
                <input value={pickup} onChange={(e) => changePickup(e.target.value)} placeholder="e.g. NAIA Terminal 3 arrivals, Pasay City" maxLength={200}/>
              </label>
              <div className="transfer-estimate-row">
                <button type="button" className="btn btn-soft" disabled={quoting || pickup.trim().length < 5} onClick={() => void estimate()}>{quoting ? <Loader2 className="spin" size={16}/> : null}{quoting ? "Estimating…" : "Estimate fare"}</button>
              </div>
              {estimateError && <p className="booking-error" role="alert">{estimateError}</p>}
              {quote && (
                <div className="transfer-quote">
                  <p className="transfer-route"><strong>Pickup:</strong> {quote.pickupAddress}<br/><strong>Drop-off:</strong> {quote.dropoffLabel}<br/><strong>Route:</strong> {kmLabel(quote.distanceKm)} km · about {Math.round(quote.durationMin)} min</p>
                  {quote.vehicles.length === 0 ? (
                    <p className="booking-error" role="alert">No transfer vehicles are currently offered. Please turn off the transfer or try again later.</p>
                  ) : (
                    <>
                      <p className="transfer-formula">Every fare = {money(quote.vehicles[0].fare.base)} base + distance (₱/km) + travel time (₱/min) + {money(quote.vehicles[0].fare.bookingFee)} booking fee.</p>
                      <div className="transfer-vehicles">
                        {quote.vehicles.map((vehicle) => (
                          <label className={`transport-option transfer-vehicle${vehicle.id === vehicleTypeId ? " picked" : ""}`} key={vehicle.id}>
                            <input type="radio" name="transferVehicle" checked={vehicle.id === vehicleTypeId} onChange={() => setVehicleTypeId(vehicle.id)}/>
                            <span className="transfer-vehicle-copy">
                              <strong>{vehicle.name}</strong>
                              <small>{vehicle.seats}-seat{vehicle.description ? ` · ${vehicle.description}` : ""}</small>
                              <small className="transfer-fare-lines">
                                <span>{money(vehicle.fare.base)} base</span><span>{money(vehicle.fare.distanceCharge)} distance · {kmLabel(quote.distanceKm)} km @ {money(vehicle.perKm)}/km</span><span>{money(vehicle.fare.timeCharge)} travel · {Math.round(quote.durationMin)} min @ {money(vehicle.perMinute)}/min</span><span>{money(vehicle.fare.bookingFee)} booking fee</span>
                              </small>
                            </span>
                            <b className="transfer-total">{money(vehicle.fare.total)}</b>
                          </label>
                        ))}
                      </div>
                      <small className="transfer-disclaimer">Estimate only — the confirmed fare is recalculated when you submit, from the live route and vehicle rates.</small>
                    </>
                  )}
                </div>
              )}
              <label className="transport-note"><span>Pickup time or instructions (optional)</span>
                <input value={transferNote} onChange={(e) => setTransferNote(e.target.value)} placeholder="e.g. flight lands 6:00 PM" maxLength={120}/>
              </label>
            </>
          )}
        </div>
      </div>
    )}
    <label className="booking-form-other"><span>Anything else?</span><small>Optional — tell us more and we will pass it to the front desk.</small><textarea name="specialRequests" defaultValue={defaults.specialRequests} maxLength={1000} rows={3}/></label>
    {error && <p className="booking-error" role="alert">{error}</p>}<button className="btn btn-accent" disabled={loading}>{loading ? "Securing your room…" : "Review booking"}<ArrowRight size={17}/></button>
  </form>;
}
