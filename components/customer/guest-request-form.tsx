"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { portalOptions } from "@/lib/request-options";

export function GuestRequestForm({ reservations }: { reservations: { id: string; confirmation_number: string | null; room_type: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function toggle(value: string) {
    setSelected((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError("");
    const form = new FormData(event.currentTarget);
    const requestedCheckOut = String(form.get("requestedCheckOut") ?? "");
    const payload = {
      reservationId: String(form.get("reservationId")),
      requestTypes: form.getAll("requestType").map(String),
      description: String(form.get("description") ?? "").trim() || undefined,
      ...(selected.includes("stay_extension") ? { requestedCheckOut } : {}),
      idempotencyKey: crypto.randomUUID(),
    };
    const response = await fetch("/api/account/requests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const body = await response.json(); setLoading(false);
    if (!response.ok) { setError(body.error ?? "Unable to submit your request."); return; }
    setOpen(false); setSelected([]); router.refresh();
  }

  if (!reservations.length) return <p className="customer-empty-note">A confirmed or current reservation is required before submitting a guest request.</p>;
  return <>
    {!open ? <button className="btn btn-accent" onClick={() => { setOpen(true); setSelected([]); }}>New request</button>
      : <form className="customer-request-form" onSubmit={submit}>
        <label>Reservation<select name="reservationId" required>{reservations.map((reservation) => <option value={reservation.id} key={reservation.id}>{reservation.confirmation_number ?? reservation.id} · {reservation.room_type}</option>)}</select></label>
        <fieldset className="customer-request-options"><legend>What can we help with? <small className="customer-data-note">Choose as many as you need.</small></legend>
          <div className="request-options-list">{portalOptions().map((option) => (
            <label className="request-option" key={option.value}><input type="checkbox" name="requestType" value={option.value} checked={selected.includes(option.value)} onChange={() => toggle(option.value)} /><span>{option.label}</span></label>
          ))}</div>
        </fieldset>
        {selected.includes("stay_extension") && <label>Requested new check-out<input name="requestedCheckOut" type="date" required /></label>}
        <label>Details <small className="customer-data-note">Optional — one note applies to everything you chose above.</small><textarea name="description" rows={4} maxLength={500} placeholder="Any useful details, e.g. room floor, preferred time, how many." /></label>
        {error && <p className="booking-error" role="alert">{error}</p>}
        <div><button type="button" className="btn btn-soft" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-accent" disabled={loading || selected.length === 0}><Send size={15}/>{loading ? "Submitting…" : "Submit request"}</button></div>
      </form>}
  </>;
}
