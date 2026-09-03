"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CarTaxiFront } from "lucide-react";
import { preArrivalOptions } from "@/lib/request-options";

type TransportService = { id: string; name: string; description: string | null; price: number; unit: string };
type Props = { roomType: string; checkIn: string; checkOut: string; guests: number; defaults: Record<string, string>; transportServices?: TransportService[] };

const peso = (value: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(value);

export function GuestDetailsForm({ roomType, checkIn, checkOut, guests, defaults, transportServices = [] }: Props) {
  const router = useRouter(); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  // selected maps a transport service id to its per-line note (pickup place/time).
  const [selected, setSelected] = useState<Record<string, string>>({});
  const toggle = (id: string) => setSelected((prev) => { const next = { ...prev }; if (id in next) delete next[id]; else next[id] = ""; return next; });
  const setNote = (id: string, note: string) => setSelected((prev) => (prev[id] === undefined ? prev : { ...prev, [id]: note }));
  const picked = transportServices.filter((service) => service.id in selected);
  const transportTotal = peso(picked.reduce((sum, s) => sum + Number(s.price), 0));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
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
      transportLines: picked.map((service) => ({ name: service.name, price: service.price, note: selected[service.id]?.trim() ?? "" })),
    };
    const response = await fetch("/api/booking/holds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json(); setLoading(false);
    if (!response.ok) { setError(body.error ?? "We could not hold this room. Please try again."); return; }
    router.push(`/booking/review/${body.token}`);
  }
  return <form className="booking-form-card" onSubmit={submit}>
    <input type="hidden" name="roomType" value={roomType}/><input type="hidden" name="checkIn" value={checkIn}/><input type="hidden" name="checkOut" value={checkOut}/><input type="hidden" name="guests" value={guests}/>
    <div className="booking-form-grid"><label>First name<input name="firstName" defaultValue={defaults.firstName} required maxLength={80}/></label><label>Last name<input name="lastName" defaultValue={defaults.lastName} required maxLength={80}/></label><label>Email<input name="email" type="email" defaultValue={defaults.email} required maxLength={200}/></label><label>Mobile number<input name="mobile" type="tel" defaultValue={defaults.mobile} required maxLength={30}/></label><label className="wide">Address (optional)<input name="address" defaultValue={defaults.address} maxLength={300}/></label><label>Nationality (optional)<input name="nationality" defaultValue={defaults.nationality} maxLength={80}/></label><label>Expected arrival (optional)<input name="expectedArrival" placeholder="e.g. 3:00 PM" maxLength={40}/></label></div>
    <div className="booking-form-options">
      <span className="booking-form-option-heading">What can we prepare before you arrive? <small>Optional — choose as many as you like. Each will be filed with the right team once your stay is confirmed.</small></span>
      <div className="request-options-list">{preArrivalOptions().map((option) => <label className="request-option" key={option.value}><input type="checkbox" name="requestOption" value={option.value}/><span>{option.label}</span></label>)}</div>
    </div>
    {transportServices.length > 0 && (
      <div className="booking-form-options">
        <span className="booking-form-option-heading"><span className="transport-title"><CarTaxiFront size={14}/> Hotel transport</span><small>Optional — book the hotel fleet now. {picked.length > 0 ? `Selected: ${transportTotal}, paid separately from your room.` : "Selected rides are booked now and paid separately from your room."}</small></span>
        <div className="request-options-list transport-options-list">{transportServices.map((service) => {
          const isPicked = service.id in selected;
          return (
            <div className={`transport-option${isPicked ? " picked" : ""}`} key={service.id}>
              <label className="request-option"><input type="checkbox" checked={isPicked} onChange={() => toggle(service.id)}/><span>{service.name}</span><small className="transport-price">{peso(service.price)} {service.unit}</small></label>
              {isPicked && <input className="transport-note" value={selected[service.id] ?? ""} onChange={(e) => setNote(service.id, e.target.value)} placeholder="Pickup place or time (optional)" maxLength={120}/>}
            </div>
          );
        })}</div>
      </div>
    )}
    <label className="booking-form-other"><span>Anything else?</span><small>Optional — tell us more and we will pass it to the front desk.</small><textarea name="specialRequests" defaultValue={defaults.specialRequests} maxLength={1000} rows={3}/></label>
    {error && <p className="booking-error" role="alert">{error}</p>}<button className="btn btn-accent" disabled={loading}>{loading ? "Securing your room…" : "Review booking"}<ArrowRight size={17}/></button>
  </form>;
}
