"use client";

import { useState, type FormEvent } from "react";
import { formatPeso } from "@/lib/format";
import type { Role } from "@/lib/types";

type Offer = { id: string; room_type_id: string; mode: string; price_minor: number; first_day: string; last_day: string; service_start: string; service_end: string; venue: string; status: string };

export function BreakfastOffers({ role, rooms }: { role: Role; rooms: { id: string; name: string }[] }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("optional");

  async function load() {
    const response = await fetch("/api/catalog/breakfast", { cache: "no-store" });
    if (!response.ok) throw new Error("Unable to load breakfast offers.");
    const data = await response.json();
    setOffers(data.offers);
    setEnabled(data.enabled);
  }

  async function submit(body: object, success: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/catalog/breakfast", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) { setMessage(data.error ?? "Unable to save."); return; }
      await load();
      setMessage(success);
    } catch { setMessage("Unable to refresh breakfast offers. Reopen to check the current status."); }
    finally { setBusy(false); }
  }

  function propose(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void submit({ action: "propose", roomTypeId: fields.get("room"), offer: {
      mode, priceMinor: mode === "optional" ? Math.round(Number(fields.get("price")) * 100) : 0,
      firstDay: fields.get("first"), lastDay: fields.get("last"), start: fields.get("start"), end: fields.get("end"), venue: fields.get("venue"),
    } }, "Proposal submitted for review.");
  }

  return <details className="panel breakfast-admin" onToggle={event => {
    if (!event.currentTarget.open) return;
    setMessage("");
    void load().catch(() => setMessage("Unable to load breakfast offers. Close and reopen to retry."));
  }}>
    <summary>Breakfast offers</summary>
    {enabled === false && <p>Breakfast booking is disabled for this environment.</p>}
    {enabled === null && !message && <p role="status">Loading breakfast offers…</p>}
    {enabled && <>
      <p>Publish one breakfast offer per room type. Bookings keep the offer saved with their stay.</p>
      {offers.map(offer => <div className="breakfast-admin-offer" key={offer.id}>
        <strong>{rooms.find(room => room.id === offer.room_type_id)?.name ?? "Room type"} · {offer.status}</strong>
        <p>{offer.mode === "off" ? "Turn off breakfast" : `${offer.mode === "included" ? "Included" : `${formatPeso(offer.price_minor / 100)} per guest per morning`} · ${offer.venue} · ${offer.service_start.slice(0, 5)}–${offer.service_end.slice(0, 5)}`} · {offer.first_day} to {offer.last_day}</p>
        {offer.status === "pending" && role !== "manager" && <div className="form-actions">
          <button type="button" className="btn btn-soft" disabled={busy} onClick={() => void submit({ action: "decide", offerId: offer.id, publish: false }, "Proposal declined.")}>Decline</button>
          <button type="button" className="btn btn-accent" disabled={busy} onClick={() => void submit({ action: "decide", offerId: offer.id, publish: true }, "Offer published.")}>Publish offer</button>
        </div>}
      </div>)}
      {rooms.length > 0 && <form className="breakfast-admin-form" onSubmit={propose}>
        <label>Room type<select name="room" required>{rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
        <label>Offer<select value={mode} onChange={event => setMode(event.target.value)}><option value="optional">Optional paid breakfast</option><option value="included">Breakfast included</option><option value="off">Turn off breakfast</option></select></label>
        {mode === "optional" && <label>PHP per guest per morning<input name="price" type="number" min="0.01" max="100000" step="0.01" required /></label>}
        <label>Venue<input name="venue" maxLength={100} required /></label>
        <label>First service date<input name="first" type="date" required /></label>
        <label>Last service date<input name="last" type="date" required /></label>
        <label>Opens (hotel time)<input name="start" type="time" required /></label>
        <label>Closes (hotel time)<input name="end" type="time" required /></label>
        <button className="btn btn-accent" disabled={busy}>Propose offer</button>
      </form>}
    </>}
    {message && <p role="status">{message}</p>}
  </details>;
}
