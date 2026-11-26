"use client";
import { fetchPublic, readResponse } from "@/lib/client-errors";
import { STAY_EXTENSION_HOLD_MESSAGE } from "@/lib/error-messages";
import { userMessage } from "@/lib/errors";
// Extend stay (extra nights, checkout DATE changes — deliberately not "late
// checkout", which is a same-day time exception). Every figure shown here comes
// from the server preview RPC (front_desk_extend_stay_preview) — the client never
// derives nights, rate, or totals. When the normal extension is refused because
// the room conflicts with a future stay, the dialog hands off to the Manager
// exception (stay_extension) with the chosen dates and reason — no re-entry.
import { useEffect, useRef, useState } from "react";
import { CalendarPlus, RefreshCw, ShieldQuestion } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import type { RecordItem } from "@/lib/types";

const money = (v: unknown) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 }).format(Number(v || 0));
const human = (v: unknown) => String(v ?? "").replaceAll("_", " ");
const day = (v: unknown) => String(v ?? "").slice(0, 10);
const retryMessage = "Could not confirm the extension. Retry with the same details.";

type Preview = { currentCheckOut: string; requestedCheckOut: string; nights: number; rate: number | null; nightlyRates?: { date: string; rate: number }[]; additionalAmount: number; projectedTotal: number; balance: number; roomConflict: boolean; roomHeld: boolean; roomNumber: string; roomType: string };

export default function ExtendStayDialog({ reservation, transportation, onClose, onDone }: {
  reservation: RecordItem;
  /** Departure trips on record — flagged only, never rescheduled by an extension. */
  transportation?: RecordItem[];
  onClose: () => void;
  /** Called with a success message after an extension or exception request. */
  onDone: (message: string) => void | Promise<void>;
}) {
  const currentOut = day(reservation.check_out);
  const [checkOut, setCheckOut] = useState("");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewVersion, setPreviewVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false); // normal path refused → exception handoff
  const [requested, setRequested] = useState<string | null>(null);
  // Debounced preview: one in-flight fetch per date, stale responses dropped.
  const retry = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    if (!checkOut || checkOut <= currentOut) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetchPublic(`/api/front-desk/reservations/${reservation.id}/extend-preview?checkOut=${checkOut}`, { cache: "no-store", signal: controller.signal });
        const body = await readResponse(res).catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!res.ok) { setPreviewError(userMessage(body.error, "Unable to preview this extension.")); return; }
        setPreview(body.data as Preview);
      } catch {
        if (!controller.signal.aborted) setPreviewError("Unable to preview this extension.");
      } finally {
        if (!controller.signal.aborted) setRefreshing(false);
      }
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [checkOut, currentOut, reservation.id, previewVersion]);

  // Departure transportation booked for the old checkout date — flag only.
  const departureTrip = (transportation ?? []).find((trip) => day(trip.pickup_date) === currentOut);

  const valid = Boolean(checkOut > currentOut && reason.trim().length >= 3 && preview?.requestedCheckOut === checkOut);
  const roomHeld = preview?.roomHeld ?? false;
  const feedback = previewError || error || (roomHeld ? STAY_EXTENSION_HOLD_MESSAGE : "");

  const refreshAvailability = () => {
    setPreviewError("");
    setRefreshing(true);
    setPreviewVersion((version) => version + 1);
  };

  const submit = async () => {
    if (busy || roomHeld || !valid) return;
    const payload = { checkOut, reason: reason.trim() };
    const signature = JSON.stringify([reservation.id, payload]);
    if (retry.current?.signature !== signature) retry.current = { signature, key: crypto.randomUUID() };
    setBusy(true); setError(""); setConflict(false);
    try {
      const res = await fetchPublic(`/api/front-desk/reservations/${reservation.id}/extend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, idempotencyKey: retry.current.key }) });
      const body = await readResponse(res).catch(() => ({}));
      if (!res.ok) {
        if (body.code === "ROOM_HELD_FOR_GUEST") {
          setPreview((current) => current && { ...current, roomHeld: true });
          return;
        }
        setConflict(body.code === "EXTENSION_REQUIRES_ROOM_CHANGE");
        setError(body.outcome === "unknown" ? retryMessage : userMessage(body.error, retryMessage));
        return;
      }
      if (body.data?.additional_amount == null) {
        setError(retryMessage);
        return;
      }
      onClose();
      await onDone(`Stay extended. Additional lodging: ${money(body.data.additional_amount)}.`);
    } catch {
      setError(retryMessage);
    } finally { setBusy(false); }
  };

  const requestException = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetchPublic("/api/manager/approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "stay_extension", relatedEntityType: "reservation", relatedEntityId: String(reservation.id), reservationId: String(reservation.id), department: "front_desk", severity: "normal", reason: reason.trim(), requestedAction: { requestedCheckOut: checkOut } }) });
      const body = await readResponse(res).catch(() => ({}));
      if (!res.ok) { setError(userMessage(body.error, "Unable to request Manager approval.")); return; }
      setRequested(String(body.data?.id ?? ""));
      await onDone("Manager exception requested — it now awaits Manager review.");
    } finally { setBusy(false); }
  };

  return <Modal isOpen onClose={busy ? () => {} : onClose} title="Extend stay" description={`Extra nights for ${human(reservation.guest_name)} — the checkout date moves. For a same-day later checkout time, use the late-checkout exception instead.`} size="lg" headerVariant="branded" className="stay-extension-dialog" footer={
    <div className="arrival-footer">
      {requested
        ? <button className="btn btn-accent" onClick={onClose}>Done</button>
        : roomHeld
          ? <button className="btn btn-accent" onClick={refreshAvailability} disabled={refreshing}><RefreshCw size={15} /> {refreshing ? "Checking availability…" : "Refresh availability"}</button>
          : conflict
            ? <button className="btn btn-accent" onClick={requestException} disabled={busy || !valid}><ShieldQuestion size={15} /> {busy ? "Requesting…" : "Request Manager exception"}</button>
            : <button className="btn btn-accent" onClick={submit} disabled={busy || !valid}><CalendarPlus size={15} /> {busy ? "Extending…" : "Extend stay"}</button>}
    </div>
  }>
    <div className="walk-in-fields">
      <label className="arrival-field">Current checkout<input type="text" value={currentOut} readOnly aria-readonly="true" /></label>
      <label className="arrival-field">Requested new checkout<input type="date" value={checkOut} min={addDay(currentOut, 1)} onChange={(e) => { setCheckOut(e.target.value); setPreview(null); setPreviewError(""); setError(""); setConflict(false); }} disabled={busy || refreshing} required /></label>
    </div>
    <label className="arrival-field">Reason for the extension<textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is the guest extending?" disabled={busy} required minLength={3} maxLength={500} /></label>

    {feedback && <p className="arrival-error" role="alert">{feedback}</p>}
    {requested && <p className="arrival-notice approved" role="status">Manager exception requested ({requested}). The Manager reviews the extension plan; Front Desk executes after approval — a room move is chosen at execution, never an overlap.</p>}

    {preview && !previewError && <>
      <div className="arrival-summary" role="status">
        <span>Room <b>{human(preview.roomNumber)}</b> · {human(preview.roomType)}</span>
        <span className={`arrival-chip${roomHeld || preview.roomConflict ? " warn" : ""}`}>
          {roomHeld ? <b>Guest hold</b> : preview.roomConflict ? <><b>Room conflict</b> for the added nights</> : <><b>Room available</b> through {day(preview.requestedCheckOut)}</>}
        </span>
      </div>
      <dl className="arrival-facts">
        <div><dt>Added nights</dt><dd>{preview.nights}</dd></div>
        <div><dt>Nightly rate</dt><dd>{preview.rate != null ? money(preview.rate) : (preview.nightlyRates ?? []).map((night) => money(night.rate)).join(" · ")}</dd></div>
        <div><dt>Additional lodging</dt><dd>{money(preview.additionalAmount)}</dd></div>
        <div><dt>Projected folio total</dt><dd>{money(preview.projectedTotal)}</dd></div>
        <div><dt>Current balance</dt><dd>{money(preview.balance)}</dd></div>
      </dl>
      <p className="arrival-notice">The additional lodging is charged to the guest folio at the per-night rates above — a weekend or seasonal rate plan can price added nights differently from the base rate. Nothing is collected now — payment settles through the normal folio and checkout balance.</p>
    </>}

    {conflict && !previewError && <p className="arrival-notice warn" role="status">The current room is taken during the added nights, so Front Desk cannot extend directly. Request the Manager exception — if approved, execution moves the guest to a same-type room (you choose it then) or extends in place if the conflict cleared. A different room type must go through the room-change exception first.</p>}

    {departureTrip && <p className="arrival-notice warn">Departure transportation is booked for {currentOut} ({human(departureTrip.service_type)} · {human(departureTrip.pickup_location)} → {human(departureTrip.dropoff_location)}). It is not rescheduled automatically — coordinate the change with Transportation.</p>}
  </Modal>;
}

function addDay(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
