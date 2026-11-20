"use client";

import { fetchPublic, readResponse } from "@/lib/client-errors";

import { userMessage } from "@/lib/errors";
import { useState, type FormEvent } from "react";
import { Camera, UserRound } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { RIDE_PREFERENCES } from "@/lib/fleet-safety";
import { formatPeso } from "@/lib/format";
import "./transport-pickup-profile.css";

type Profile = { travelerName: string; phone: string; email: string; sharingEnabled: boolean; hasPhoto: boolean; photoUrl: string | null; version: number; ridePreferences: string[]; luggageCount: number; luggageNotes: string; rideNotes: string };
type Delivery = { id: string; state: string; attempts: number; next_attempt_at: string; last_error: string | null };
type Renewal = { id: string; state: string; expected_version: number; assignment_reference: string };
type Revocation = { state: string; attempts: number; expected_version: number | null; conflict_version: number | null; next_attempt_at: string };
type Link = { id: string; leg: string; fleet_reference: string | null; partner_status: string | null; partner_version: number; assignment_active: boolean; assignmentReference: string | null; driverName: string | null; vehicleDescription: string | null; vehiclePlate: string | null; needs_review: boolean; reconciliation_note: string | null; fleet_transport_outbox: Delivery | Delivery[] | null; fleet_tracking_renewals: Renewal[]; fleet_tracking_revocations: Revocation | Revocation[] | null };
type Fleet = {
  enabled: boolean; mode: "off" | "staging" | "production"; renewalEnabled: boolean; links: Link[];
  fare: { postedAmount: number | null; quote: { amountMinor: number; revision: string } | null; canPost: boolean } | null;
};
const empty: Profile = { travelerName: "", phone: "", email: "", sharingEnabled: false, hasPhoto: false, photoUrl: null, version: 0, ridePreferences: [], luggageCount: 0, luggageNotes: "", rideNotes: "" };
const stateLabel: Record<string, string> = { PREPARED: "Prepared locally", SENDING: "Sending", SENT: "Accepted by Fleet", SUCCEEDED: "Tracking link renewed. Previously shared links have been replaced.", FAILED: "We could not confirm the partner response. Check the request status before retrying the saved action.", NEEDS_REVIEW: "Needs coordination", NOT_DUE: "This request is already being sent or is waiting before another attempt. Check its current status.", DISABLED: "The Fleet connection is turned off. Contact Front Desk for help." };

/** A ride-specific passenger profile, independent of booking-owner/identity files. */
export function TransportPickupProfile({ requestId, requestVersion, staff = false, canEdit = true, canPrepare = false }: {
  requestId: string; requestVersion: number; staff?: boolean; canEdit?: boolean; canPrepare?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<Profile>(empty);
  const [fleet, setFleet] = useState<Fleet | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [removePhoto, setRemovePhoto] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const profileUrl = `/api/account/transportation/${requestId}/pickup-profile`;
  const fleetUrl = `/api/transportation/${requestId}/fleet`;

  async function load() {
    const response = await fetchPublic(profileUrl, { cache: "no-store" });
    const body = await readResponse(response);
    if (!response.ok) throw new Error(body.error ?? "Unable to load the pickup profile.");
    setProfile(body.profile ? { ...empty, ...body.profile } : { ...empty, ...body.defaults });
    if (staff) {
      const result = await fetchPublic(fleetUrl, { cache: "no-store" });
      const data = await result.json();
      if (!result.ok) throw new Error(data.error ?? "Unable to load Fleet preparation.");
      setFleet(data);
      setNote(data.links[0]?.reconciliation_note ?? "");
    }
  }
  async function show() {
    setOpen(true); setLoading(true); setError(""); setMessage(""); setRemovePhoto(false); setFile(null); setFleet(null);
    try { await load(); } catch (e) { setError(userMessage(e, "Unable to load the pickup profile.")); }
    finally { setLoading(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const form = new FormData();
    form.set("profile", JSON.stringify({ travelerName: profile.travelerName, phone: profile.phone, email: profile.email, sharingEnabled: profile.sharingEnabled, expectedVersion: profile.version, removePhoto, ridePreferences: profile.ridePreferences, luggageCount: profile.luggageCount, luggageNotes: profile.luggageNotes, rideNotes: profile.rideNotes }));
    if (file) form.set("photo", file);
    try {
      const response = await fetchPublic(profileUrl, { method: "POST", body: form });
      const body = await readResponse(response);
      if (!response.ok) throw new Error(body.error ?? "Unable to save the pickup profile.");
      setFile(null); setRemovePhoto(false); await load(); setMessage(body.revocationPending ? "Pickup profile saved. Tracking withdrawal is pending with Fleet. Contact Front Desk for follow-up." : "Pickup profile saved.");
      window.dispatchEvent(new CustomEvent("haven-ride-details-updated", { detail: requestId }));
    } catch (e) { setError(userMessage(e, "Unable to save the pickup profile. Your entries are preserved.")); }
    finally { setBusy(false); }
  }
  async function act(payload: Record<string, unknown>) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetchPublic(fleetUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const body = await readResponse(response);
      if (!response.ok) throw new Error(body.error ?? "Unable to update Fleet preparation.");
      await load();
      setConfirmRevoke(null);
      if (payload.action === "confirmFare") {
        setMessage(body.fareAmount === 0 ? "No transportation charge is due." : "Confirmed fare is on the guest folio.");
        return;
      }
      setMessage(payload.action === "revoke" && body.state === "SUCCEEDED" ? "Shared link revoked. Previously shared URLs are now unavailable." : body.state === "CONFLICT" ? "Fleet has a newer version. Review the current ride before confirming revocation again." : payload.action === "prepare" ? "Prepared locally. Fleet has not received this request." : payload.action === "reconcile" ? "Coordination note saved. Pending partner confirmation stays visible." : stateLabel[body.state] ?? "Delivery checked.");
    } catch (e) { setError(userMessage(e, "Unable to update Fleet preparation.")); }
    finally { setBusy(false); }
  }

  return <><button type="button" className={staff ? "table-action" : "btn btn-soft"} onClick={show}><UserRound size={14} aria-hidden="true" />{staff ? "Pickup & Fleet" : "Passenger details"}</button>
    <Modal isOpen={open} onClose={() => { if (!busy) setOpen(false); }} title="Passenger pickup details" description="Help Front Desk recognize and contact the person taking this ride." size="lg" headerVariant="branded" className="pickup-profile-dialog">
      <div className="pickup-profile">
        {loading ? <p role="status">Loading pickup details…</p> : <>
          {error && <p className="pickup-profile-error" role="alert">{error}</p>}
          {message && <p role="status" className="pickup-profile-message">{message}</p>}
          <form onSubmit={save} className="pickup-profile-form">
            <fieldset disabled={!canEdit || busy || Boolean(error && profile.version === 0 && !profile.travelerName)}>
              <div className="pickup-profile-photo">
                {profile.photoUrl && !removePhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element -- Private 60-second URL, no optimizer/cache.
                  <img src={profile.photoUrl} alt="Passenger pickup photo" referrerPolicy="no-referrer" />
                ) : <span><Camera size={24} aria-hidden="true" /><small>No pickup photo</small></span>}
                <div><label>Pickup photo <small>Optional · JPEG, PNG or WebP · up to 5 MB</small><input key={`${profile.version}-${removePhoto}`} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose pickup photo" onChange={event => { setFile(event.target.files?.[0] ?? null); setRemovePhoto(false); }} /></label>
                  {profile.hasPhoto && <button type="button" className="btn btn-soft" onClick={() => { setRemovePhoto(value => !value); setFile(null); }}>{removePhoto ? "Keep photo" : "Remove photo"}</button>}
                  {file && <small>{file.name} selected. Save to upload.</small>}
                  {profile.hasPhoto && !profile.photoUrl && !removePhoto && <small>Saved photo preview is unavailable. Reopen these details to retry.</small>}
                </div>
              </div>
              <label>Passenger name<input required minLength={2} maxLength={120} autoComplete="name" value={profile.travelerName} onChange={event => setProfile({ ...profile, travelerName: event.target.value })} /></label>
              <label>Contact number<input required type="tel" maxLength={30} autoComplete="tel" placeholder="+63 917 123 4567" value={profile.phone} onChange={event => setProfile({ ...profile, phone: event.target.value })} /><small>Use the number of the passenger or lead traveler.</small></label>
              <label>Email <small>Optional</small><input type="email" maxLength={254} autoComplete="email" value={profile.email} onChange={event => setProfile({ ...profile, email: event.target.value })} /></label>
              <div className="pickup-ride-preferences" role="group" aria-label="Ride preferences">
                <h3>Make the ride yours</h3><p className="pickup-profile-help">Optional preferences. Front Desk will confirm what can be arranged.</p>
                {RIDE_PREFERENCES.map(option => <label className="pickup-preference-option" key={option.value}><input type="checkbox" checked={profile.ridePreferences.includes(option.value)} onChange={event => setProfile({ ...profile, ridePreferences: event.target.checked ? [...profile.ridePreferences, option.value] : profile.ridePreferences.filter(value => value !== option.value) })} /><span><b>{option.label}</b><small>{option.hint}</small></span></label>)}
              </div>
              <label>Luggage count<input type="number" min={0} max={20} required value={profile.luggageCount} onChange={event => setProfile({ ...profile, luggageCount: Number(event.target.value) })} /><small>Enter 0 if you are travelling without bags.</small></label>
              <label>Luggage details <small>Optional</small><textarea rows={2} maxLength={300} value={profile.luggageNotes} onChange={event => setProfile({ ...profile, luggageNotes: event.target.value })} placeholder="e.g. 2 large suitcases and a stroller" /></label>
              <label>Ride notes <small>Optional</small><textarea rows={3} maxLength={500} value={profile.rideNotes} onChange={event => setProfile({ ...profile, rideNotes: event.target.value })} placeholder="Share a flight number, meeting point or other instructions." /></label>
              <label className="pickup-profile-consent"><input type="checkbox" checked={profile.sharingEnabled} onChange={event => setProfile({ ...profile, sharingEnabled: event.target.checked })} /><span>{staff ? "The passenger agreed to share these pickup details and photo with the assigned transport provider." : "I agree to share these pickup details and photo with the assigned transport provider for this ride."}</span></label>
              <p className="pickup-profile-help">A photo is optional. If you add one, use a photo of the passenger. Turning sharing off also requests withdrawal of existing Fleet tracking links. A revoked link cannot be renewed.</p>
              {canEdit && <button className="btn btn-accent" disabled={busy}>{busy ? "Saving…" : "Save pickup details"}</button>}
            </fieldset>
          </form>
          {staff && fleet && <section className="pickup-profile-fleet" aria-label="Fleet preparation">
            <h3>Fleet preparation</h3>
            <p>{fleet.mode === "production" ? "Production dispatch is enabled." : fleet.enabled ? "Staging dispatch is enabled." : "The Fleet connection is unavailable. Prepared requests are saved here."}</p>
            {fleet.fare && fleet.links.some(link => link.fleet_reference) && <div className="pickup-profile-fare">
              <h4>Guest folio</h4>
              {fleet.fare.postedAmount != null ? <>
                <p>{fleet.fare.postedAmount === 0 ? "No charge due" : `Fare posted · ${formatPeso(fleet.fare.postedAmount)}`}</p>
                {fleet.fare.quote && fleet.fare.quote.amountMinor !== Math.round(fleet.fare.postedAmount * 100) &&
                  <p>Fleet now reports {formatPeso(fleet.fare.quote.amountMinor / 100)}. Ask Accounting to review the difference.</p>}
              </> : fleet.fare.quote ? <>
                <p>Fleet fare · {formatPeso(fleet.fare.quote.amountMinor / 100)}</p>
                {fleet.fare.canPost ? <p>Confirm after agreeing the final fare with the guest.</p> : <p>Contact Accounting to review this fare.</p>}
                {canPrepare && fleet.fare.canPost && <button type="button" className="btn btn-soft" disabled={busy}
                  onClick={() => act({ action: "confirmFare", revision: fleet.fare?.quote?.revision })}>
                  {fleet.fare.quote.amountMinor === 0 ? "Confirm no charge" : `Confirm ${formatPeso(fleet.fare.quote.amountMinor / 100)} on folio`}
                </button>}
              </> : <p>Waiting for the fare for each ride leg.</p>}
            </div>}
            {canPrepare && <button type="button" className="btn btn-soft" disabled={busy} onClick={() => act({ action: "prepare", expectedVersion: requestVersion })}>Prepare for Fleet</button>}
            {fleet.links.map(link => {
              const delivery = Array.isArray(link.fleet_transport_outbox) ? link.fleet_transport_outbox[0] : link.fleet_transport_outbox;
              const renewal = link.fleet_tracking_renewals?.find(row => ["PENDING", "SENDING", "FAILED"].includes(row.state));
              const revocation = Array.isArray(link.fleet_tracking_revocations) ? link.fleet_tracking_revocations[0] : link.fleet_tracking_revocations;
              const assignment = [link.driverName, link.vehicleDescription, link.vehiclePlate].filter(Boolean).join(" · ");
              return <div className="pickup-profile-leg" key={link.id}><b>{link.leg === "RETURN" ? "Return ride" : "Outbound ride"}</b><span>{link.needs_review ? "Needs coordination" : stateLabel[delivery?.state ?? ""] ?? "Not prepared"}</span>
                {link.fleet_reference && <small>Fleet reference {link.fleet_reference} · {link.partner_status ?? "Awaiting status"}</small>}
                {assignment && <small>{assignment}</small>}
                {delivery && delivery.attempts > 0 && <small>{delivery.attempts} delivery attempt{delivery.attempts === 1 ? "" : "s"}{delivery.state === "FAILED" ? ` · next retry ${new Date(delivery.next_attempt_at).toLocaleString()}` : ""}</small>}
                {canPrepare && delivery && ["PREPARED", "FAILED", "SENDING"].includes(delivery.state) && <button type="button" className="btn btn-soft" disabled={busy || !fleet.enabled} onClick={() => act({ action: "deliver", outboxId: delivery.id })}>{delivery.attempts ? "Retry delivery" : "Send to Fleet"}</button>}
                {canPrepare && !revocation && link.assignment_active && !link.needs_review && link.assignmentReference && <div>
                  <button type="button" className="btn btn-soft" disabled={busy || !fleet.renewalEnabled} onClick={() => act({ action: "renew", linkId: link.id, eventId: renewal?.id ?? crypto.randomUUID(), expectedVersion: renewal?.expected_version ?? link.partner_version, assignmentReference: renewal?.assignment_reference ?? link.assignmentReference })}>{renewal ? "Retry tracking renewal" : "Renew tracking link"}</button>
                  <p className="pickup-profile-help">Renewing replaces the previously shared link. Send the new link to anyone who needs it.{!fleet.renewalEnabled ? " Renewal is unavailable while the partner connection or approved tracking address is unset." : ""}</p>
                </div>}
                {revocation && <p className="pickup-profile-help">{revocation.state === "SUCCEEDED" ? "Fleet confirmed tracking is revoked for this leg." : revocation.state === "CONFLICT" ? `Fleet reports version ${revocation.conflict_version}. Review the current ride with Fleet before confirming withdrawal.` : revocation.state === "NEEDS_REVIEW" ? "Tracking withdrawal needs coordination with Fleet." : `Tracking withdrawal ${revocation.state.toLowerCase()}.${revocation.state === "FAILED" ? ` Next retry ${new Date(revocation.next_attempt_at).toLocaleString()}.` : ""}`}</p>}
                {canPrepare && delivery && delivery.attempts > 0 && !["SUCCEEDED", "NEEDS_REVIEW"].includes(revocation?.state ?? "") && (confirmRevoke === link.id ? <div>
                  <p className="pickup-profile-help">This permanently disables public tracking for this ride leg, including previously shared links. Reassignment will not restore it.</p>
                  <div className="btn-row"><button type="button" className="btn btn-soft" disabled={busy} onClick={() => setConfirmRevoke(null)}>Keep current setting</button><button type="button" className="btn btn-accent" disabled={busy} onClick={() => act({ action: "revoke", linkId: link.id, expectedVersion: revocation?.state === "CONFLICT" ? revocation.conflict_version : revocation?.expected_version ?? (link.partner_version > 0 ? link.partner_version : null), confirmConflict: revocation?.state === "CONFLICT" })}>Confirm revocation</button></div>
                </div> : <button type="button" className="btn btn-soft" disabled={busy} onClick={() => setConfirmRevoke(link.id)}>{revocation?.state === "CONFLICT" ? "Review and revoke link" : revocation ? "Retry tracking withdrawal" : "Revoke shared link"}</button>)}
                {link.reconciliation_note && <p>{link.reconciliation_note}</p>}
              </div>;
            })}
            {canPrepare && fleet.links.length > 0 && <div className="pickup-profile-coordination"><label>Coordination note<textarea maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="Record the Fleet contact, result and next action." /></label><button type="button" className="btn btn-soft" disabled={busy || note.trim().length < 5} onClick={() => act({ action: "reconcile", note })}>Save coordination note</button></div>}
          </section>}
        </>}
      </div>
    </Modal>
  </>;
}
