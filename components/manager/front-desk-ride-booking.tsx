"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { TransportationRequestForm, type EligibleRideReservation } from "@/components/customer/transportation-request-form";
import { fetchPublic, readResponse } from "@/lib/client-errors";
import "./front-desk-ride-booking.css";

type SearchResult = { data: EligibleRideReservation[]; hotelLabel: string; today: string };

export function FrontDeskRideBooking({ onSubmitted }: { onSubmitted: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [stay, setStay] = useState<EligibleRideReservation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function findGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setSearch(null);
    try {
      const response = await fetchPublic(`/api/transportation/guests?${new URLSearchParams({ name: name.trim() })}`);
      const result = await readResponse(response);
      if (response.ok && Array.isArray(result.data)) {
        setSearch({ data: result.data, hotelLabel: result.hotelLabel, today: result.today });
      } else {
        setError(result.error ?? "Unable to find guest accounts.");
      }
    } catch {
      setError("Unable to find guest accounts.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <button type="button" className="btn btn-accent" onClick={() => { setName(""); setSearch(null); setError(""); setOpen(true); }}>Book for a guest</button>
    <Modal isOpen={open} onClose={() => setOpen(false)} title="Find a guest" description="Search by account name and select a confirmed stay.">
      <form className="customer-request-form" onSubmit={findGuest}>
        <label>Guest name<input type="search" value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={100} /></label>
        <div><button className="btn btn-accent" disabled={busy}>{busy ? "Searching…" : "Search guests"}</button></div>
        {error && <p role="alert">{error}</p>}
      </form>
      {search && (search.data.length ? <ul className="front-desk-ride-stays" aria-label="Confirmed stays">
        {search.data.map(result => <li key={result.id}>
          <button type="button" className="btn btn-soft" onClick={() => { setOpen(false); setStay(result); }}>
            <strong>{result.passenger?.name}</strong>
            <small>{result.confirmation_number ?? result.id} · {result.check_in} to {result.check_out}</small>
          </button>
        </li>)}
      </ul> : <p role="status">No confirmed or current stays match this guest name.</p>)}
    </Modal>
    {stay && search && <TransportationRequestForm reservations={[stay]} hotelLabel={search.hotelLabel}
      today={search.today} reservationSelected openInitially staff onClose={submitted => {
        setStay(null);
        if (submitted) onSubmitted();
      }} />}
  </>;
}
