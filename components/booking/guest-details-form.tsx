"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

type Props = { roomType: string; checkIn: string; checkOut: string; guests: number; defaults: Record<string,string> };
export function GuestDetailsForm({ roomType, checkIn, checkOut, guests, defaults }: Props) {
  const router = useRouter(); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); setError(""); const form = new FormData(event.currentTarget); const response = await fetch("/api/booking/holds", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(Object.fromEntries(form)) }); const body = await response.json(); setLoading(false); if (!response.ok) { setError(body.error ?? "We could not hold this room. Please try again."); return; } router.push(`/booking/review/${body.token}`); }
  return <form className="booking-form-card" onSubmit={submit}>
    <input type="hidden" name="roomType" value={roomType}/><input type="hidden" name="checkIn" value={checkIn}/><input type="hidden" name="checkOut" value={checkOut}/><input type="hidden" name="guests" value={guests}/>
    <div className="booking-form-grid"><label>First name<input name="firstName" defaultValue={defaults.firstName} required maxLength={80}/></label><label>Last name<input name="lastName" defaultValue={defaults.lastName} required maxLength={80}/></label><label>Email<input name="email" type="email" defaultValue={defaults.email} required maxLength={200}/></label><label>Mobile number<input name="mobile" type="tel" defaultValue={defaults.mobile} required maxLength={30}/></label><label className="wide">Address (optional)<input name="address" defaultValue={defaults.address} maxLength={300}/></label><label>Nationality (optional)<input name="nationality" defaultValue={defaults.nationality} maxLength={80}/></label><label>Expected arrival (optional)<input name="expectedArrival" placeholder="e.g. 3:00 PM" maxLength={40}/></label><label className="wide">Special requests (optional)<textarea name="specialRequests" defaultValue={defaults.specialRequests} maxLength={1000} rows={4}/></label></div>
    {error && <p className="booking-error" role="alert">{error}</p>}<button className="btn btn-accent" disabled={loading}>{loading ? "Securing your room…" : "Review booking"}<ArrowRight size={17}/></button>
  </form>;
}