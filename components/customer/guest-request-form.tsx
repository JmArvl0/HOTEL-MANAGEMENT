"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheckBig, ConciergeBell, Send } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { RequestOption } from "@/lib/request-options";

// The request form lives in a modal (transportation pattern): the invitation strip
// stays on the page, and after a successful submission the modal keeps the guest in
// the flow so they can file another batch without reopening anything. Options come
// from the manager-configured catalog (fetched server-side by the page).
export function GuestRequestForm({ reservations, options }: { reservations: { id: string; confirmation_number: string | null; room_type: string }[]; options: RequestOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(0);
  const [formKey, setFormKey] = useState(0);
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
    setSubmitted((count) => count + 1);
    setSelected([]); setFormKey((key) => key + 1);
    router.refresh();
  }

  function close() { setOpen(false); setSubmitted(0); }

  if (!reservations.length) return <p className="customer-empty-note">A confirmed or current reservation is required before submitting a guest request.</p>;
  return <>
    <section className="cgr-request-invitation">
      <span className="cgr-invitation-icon"><ConciergeBell size={22} aria-hidden="true" /></span>
      <div>
        <h2>Need something for your stay?</h2>
        <p>Choose as many items as you need — they&rsquo;re sent together, and Front Desk reviews each submission before it&rsquo;s granted.</p>
      </div>
      <button type="button" className="btn btn-accent" onClick={() => { setSelected([]); setSubmitted(0); setOpen(true); }}><ConciergeBell size={15} aria-hidden="true" />Make a request</button>
    </section>
    <Modal isOpen={open} onClose={close} title={submitted ? "Request submitted" : "Make a request"} description={submitted ? "Front Desk has been notified." : "Everything you pick is submitted together as one request."} size="xl" headerVariant="branded" className="customer-guest-request-dialog">
      {submitted ? <div className="cgr-submit-success">
        <CircleCheckBig size={34} aria-hidden="true" />
        <h3>Submitted — Front Desk will review</h3>
        <p>{submitted > 1 ? `${submitted} submissions sent. ` : ""}Watch the badge on each request below turn from <b>Pending review</b> to <b>Approved</b> or <b>Declined</b>.</p>
        <div>
          <button type="button" className="btn btn-soft" onClick={() => setSubmitted(0)}>Submit another request</button>
          <button type="button" className="btn btn-accent" onClick={close}>Done</button>
        </div>
      </div> : <form className="customer-request-form wide cgr-form" key={formKey} onSubmit={submit}>
        <label>Reservation<select name="reservationId" required>{reservations.map((reservation) => <option value={reservation.id} key={reservation.id}>{reservation.confirmation_number ?? reservation.id} · {reservation.room_type}</option>)}</select></label>
        <fieldset className="customer-request-options"><legend>What can we help with? <small className="customer-data-note">Choose as many as you need.</small></legend>
          <div className="request-options-list">{options.map((option) => (
            <label className="request-option" key={option.value}><input type="checkbox" name="requestType" value={option.value} checked={selected.includes(option.value)} onChange={() => toggle(option.value)} /><span>{option.label}</span></label>
          ))}</div>
        </fieldset>
        {selected.includes("stay_extension") && <label>Requested new check-out<input name="requestedCheckOut" type="date" required /></label>}
        <label>Details <small className="customer-data-note">Optional — one note applies to everything you chose above.</small><textarea name="description" rows={4} maxLength={500} placeholder="Any useful details, e.g. room floor, preferred time, how many." /></label>
        {error && <p className="booking-error" role="alert">{error}</p>}
        <div><button type="button" className="btn btn-soft" onClick={close}>Cancel</button><button className="btn btn-accent" disabled={loading || selected.length === 0}><Send size={15} />{loading ? "Submitting…" : "Submit request"}</button></div>
      </form>}
    </Modal>
  </>;
}
