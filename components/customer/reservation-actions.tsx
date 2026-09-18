"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Clock3, MessageSquareText, XCircle } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { HavenSelect } from "@/components/ui/haven-select";
import { useCustomerToast } from "@/components/customer/customer-toast";
import { formatPeso } from "@/lib/format";
import type { CancellationPreview } from "@/lib/cancellation-preview";

export interface OpenChangeRequest {
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  requestedRoomType: string | null;
  reason: string;
}

const formatStayDate = (value: string) =>
  new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`)
  );

export function ReservationActions({
  id,
  status,
  checkIn,
  checkOut,
  roomType,
  openRequest,
}: {
  id: string;
  status: string;
  checkIn: string;
  checkOut: string;
  roomType: string;
  openRequest: OpenChangeRequest | null;
}) {
  const router = useRouter();
  const notify = useCustomerToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Cancel — ONE modal: server-authoritative consequence preview plus the
  // required free-text reason. No dropdown, no second step.
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState("");
  const [preview, setPreview] = useState<
    { status: "loading" } | { status: "ready"; data: CancellationPreview } | { status: "failed"; error: string }
  >({ status: "loading" });
  const cancelling = useRef(false);

  // Change modal — one complete form: dates, room type, required reason.
  const [changeOpen, setChangeOpen] = useState(false);
  const [newCheckIn, setNewCheckIn] = useState(checkIn);
  const [newCheckOut, setNewCheckOut] = useState(checkOut);
  const [newRoomType, setNewRoomType] = useState(roomType);
  const [reason, setReason] = useState("");
  const [roomOptions, setRoomOptions] = useState<{ name: string; availableUnits: number }[] | null>(null);
  const [optionsNote, setOptionsNote] = useState("");
  const submitting = useRef(false);
  const idempotencyKey = useRef("");

  function openChange() {
    setNewCheckIn(checkIn);
    setNewCheckOut(checkOut);
    setNewRoomType(roomType);
    setReason("");
    setError("");
    setRoomOptions(null);
    setOptionsNote("");
    idempotencyKey.current = crypto.randomUUID();
    setChangeOpen(true);
  }

  // Room-type options come from the authoritative inventory for the chosen
  // dates — never a hardcoded list, never fabricated counts.
  useEffect(() => {
    if (!changeOpen) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newCheckIn) || !/^\d{4}-\d{2}-\d{2}$/.test(newCheckOut)) return;
    const timer = window.setTimeout(() => {
      setOptionsNote("");
      fetch(`/api/account/reservations/${id}/room-options?checkIn=${newCheckIn}&checkOut=${newCheckOut}`, { cache: "no-store" })
        .then((res) => res.json())
        .then((body) => {
          if (Array.isArray(body?.data)) {
            const options = (body.data as { name: string; availableUnits: number }[]).filter(
              (option) => typeof option?.name === "string" && Number(option?.availableUnits) > 0
            );
            // The current type stays selectable so a date-only change is
            // always possible, even when it has no spare units to advertise.
            if (!options.some((option) => option.name === roomType)) {
              options.unshift({ name: roomType, availableUnits: 0 });
            }
            setRoomOptions(options);
            if (!options.some((option) => option.name === newRoomType && option.availableUnits > 0) && newRoomType !== roomType) {
              setNewRoomType(roomType);
            }
          } else {
            setOptionsNote("Room availability could not be loaded — your current room type is kept.");
            setRoomOptions([{ name: roomType, availableUnits: 0 }]);
          }
        })
        .catch(() => {
          setOptionsNote("Room availability could not be loaded — your current room type is kept.");
          setRoomOptions([{ name: roomType, availableUnits: 0 }]);
        });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [changeOpen, id, newCheckIn, newCheckOut, roomType, newRoomType]);

  if (!["pending", "confirmed"].includes(status)) return null;

  const cancelReasonValid = cancelReason.trim().length >= 3;

  function openCancel() {
    setCancelReason("");
    setCancelError("");
    setPreview({ status: "loading" });
    setCancelOpen(true);
    fetch(`/api/account/reservations/${id}/cancel/preview`, { cache: "no-store" })
      .then((response) => response.json().then((body) => ({ response, body })))
      .then(({ response, body }) => {
        if (!response.ok || !body?.data) {
          setPreview({ status: "failed", error: body?.error ?? "Refund eligibility could not be loaded." });
          return;
        }
        setPreview({ status: "ready", data: body.data as CancellationPreview });
      })
      .catch(() => {
        setPreview({ status: "failed", error: "Refund eligibility could not be loaded. Check your connection." });
      });
  }

  async function handleCancelSubmit() {
    // Synchronous ref guard: React state hasn't flushed on a fast
    // double-click, so `busy` alone cannot stop the second POST.
    // The RPC itself is idempotent, so a retry still cannot duplicate
    // the cancellation or its refund.
    if (cancelling.current) return;
    const trimmedReason = cancelReason.trim();
    if (trimmedReason.length < 3) {
      setCancelError("Tell us why you're cancelling (at least 3 characters).");
      return;
    }
    cancelling.current = true;
    setBusy(true);
    setCancelError("");
    try {
      const response = await fetch(`/api/account/reservations/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: trimmedReason }),
      });
      const body = await response.json();
      if (!response.ok) {
        setCancelError(body.error ?? "Unable to cancel.");
        return;
      }
      const refund = Number(body.data?.eligible_refund ?? 0);
      notify({
        title: "Reservation cancelled",
        detail:
          refund > 0
            ? "Your reservation has been cancelled. Your eligible refund has been sent to Accounting for processing."
            : "Your reservation has been cancelled. No refund is due under the applicable cancellation policy.",
        tone: "success",
      });
      setCancelOpen(false);
      setCancelReason("");
      router.refresh();
    } finally {
      cancelling.current = false;
      setBusy(false);
    }
  }

  async function handleChangeSubmit() {
    // Synchronous ref guard: React state hasn't flushed on a fast
    // double-click, so `busy` alone cannot stop the second POST.
    if (submitting.current) return;
    const trimmedReason = reason.trim();
    if (newCheckOut <= newCheckIn) {
      setError("Check-out must be after check-in.");
      return;
    }
    if (trimmedReason.length < 3) {
      setError("Tell us why you'd like to make this change (at least 3 characters) — staff need the context to review it.");
      return;
    }
    if (newCheckIn === checkIn && newCheckOut === checkOut && newRoomType === roomType) {
      setError("Nothing to change yet — adjust the dates or room type first.");
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/account/reservations/${id}/change-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkIn: newCheckIn,
          checkOut: newCheckOut,
          roomType: newRoomType,
          reason: trimmedReason,
          idempotencyKey: idempotencyKey.current,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Unable to request changes.");
        return;
      }
      setChangeOpen(false);
      setReason("");
      if (body.data?.status === "executed") {
        notify({
          title: "Reservation updated",
          detail: `New total: PHP ${Number(body.data.calculatedTotal).toLocaleString("en-PH")}.`,
          tone: "success",
        });
      } else {
        notify({
          title: "Change request submitted",
          detail: "Your reservation change is now under review. We'll notify you when there is an update.",
          tone: "success",
        });
      }
      router.refresh();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const roomTypeOptions = (roomOptions ?? [{ name: roomType, availableUnits: 0 }]).map((option) => ({
    value: option.name,
    label:
      option.name === roomType
        ? "Keep current room type"
        : option.availableUnits === 1
          ? `${option.name} — 1 available`
          : `${option.name} — ${option.availableUnits} available`,
  }));
  const hasAlternatives = roomOptions !== null && roomOptions.some((option) => option.name !== roomType);

  return (
    <div className="customer-reservation-actions">
      <div className="customer-reservation-action-buttons">
        {openRequest ? (
          <button className="btn btn-soft" type="button" disabled aria-disabled="true" title="Your change request is under review">
            <Clock3 size={16} aria-hidden="true" /> Change request under review
          </button>
        ) : (
          <button className="btn btn-accent" disabled={busy} onClick={openChange}>
            <CalendarClock size={16} aria-hidden="true" /> Request a change
          </button>
        )}
        <button className="btn btn-soft danger-action" disabled={busy} onClick={openCancel}>
          <XCircle size={16} aria-hidden="true" /> Cancel reservation
        </button>
      </div>
      {openRequest && (
        <p role="status">We received your requested changes. You&apos;ll be notified when there&apos;s an update.</p>
      )}

      {/* Cancel reservation — one modal: consequences first, then the required free-text reason. */}
      <Modal
        isOpen={cancelOpen}
        onClose={() => { if (!busy) setCancelOpen(false); }}
        title="Cancel Reservation"
        description="Before you cancel — review what will happen to this reservation."
        size="lg"
        headerVariant="branded"
        footer={
          <div className="prompt-actions">
            <button type="button" className="btn btn-soft" disabled={busy} onClick={() => setCancelOpen(false)}>
              Keep reservation
            </button>
            <button
              type="button"
              className="btn btn-accent danger-action"
              disabled={busy || !cancelReasonValid || preview.status === "loading"}
              onClick={handleCancelSubmit}
            >
              {busy ? "Cancelling…" : "Cancel reservation"}
            </button>
          </div>
        }
      >
        <div className="cancel-consequence">
          {preview.status === "loading" && <p role="status">Calculating your refund eligibility…</p>}
          {preview.status === "failed" && (
            <p className="booking-error" role="alert">
              {preview.error} You can still cancel — the server always recalculates eligibility before committing.
            </p>
          )}
          {preview.status === "ready" && (
            <section className="cancel-consequence-panel" aria-label="Cancellation and refund">
              <h3>Cancellation &amp; refund</h3>
              <dl>
                <div>
                  <dt>Reservation status</dt>
                  <dd>This reservation will be cancelled.</dd>
                </div>
                <div>
                  <dt>Refund eligibility</dt>
                  <dd>
                    {preview.data.eligibility === "full" && "Full refund under your booking policy."}
                    {preview.data.eligibility === "partial" && "Partial refund under your booking policy."}
                    {preview.data.eligibility === "none" && "Not refundable under your booking policy."}
                  </dd>
                </div>
                <div>
                  <dt>Estimated eligible refund</dt>
                  <dd>{formatPeso(preview.data.eligibleAmount)}</dd>
                </div>
                <div>
                  <dt>Refund processing</dt>
                  <dd>Eligible refunds are processed by Accounting and can be tracked in Payments &amp; Folio.</dd>
                </div>
              </dl>
              <p className="summary-note">{preview.data.policySummary}</p>
            </section>
          )}
          <div className="prompt-field">
            <label htmlFor="cancel-reason" className="prompt-label">
              Reason for cancellation <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="cancel-reason"
              className="prompt-input"
              value={cancelReason}
              maxLength={500}
              rows={4}
              required
              aria-required="true"
              placeholder="Tell us why you're cancelling this reservation."
              onChange={(event) => setCancelReason(event.target.value)}
            />
          </div>
          {cancelError && <p className="booking-error" role="alert">{cancelError}</p>}
        </div>
      </Modal>

      {/* Change Request — one complete modal */}
      <Modal
        isOpen={changeOpen}
        onClose={() => setChangeOpen(false)}
        title="Request a reservation change"
        description="Choose the changes you'd like us to review."
        size="md"
        headerVariant="branded"
        footer={
          <div className="prompt-actions">
            <button type="button" className="btn btn-soft" disabled={busy} onClick={() => setChangeOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-accent" disabled={busy} onClick={handleChangeSubmit}>
              {busy ? "Submitting…" : "Submit change request"}
            </button>
          </div>
        }
      >
        <div className="change-form-fields">
          <p className="change-stay-summary">
            Current stay: {formatStayDate(checkIn)} – {formatStayDate(checkOut)} · {roomType}
          </p>
          <div className="prompt-field">
            <label htmlFor="change-checkin" className="prompt-label">Requested check-in <span aria-hidden="true">*</span></label>
            <input
              id="change-checkin"
              type="date"
              className="prompt-input change-date-input"
              value={newCheckIn}
              onChange={(e) => setNewCheckIn(e.target.value)}
            />
          </div>
          <div className="prompt-field">
            <label htmlFor="change-checkout" className="prompt-label">Requested check-out <span aria-hidden="true">*</span></label>
            <input
              id="change-checkout"
              type="date"
              className="prompt-input change-date-input"
              value={newCheckOut}
              min={newCheckIn}
              onChange={(e) => setNewCheckOut(e.target.value)}
            />
          </div>
          <div className="prompt-field">
            <label htmlFor="change-roomtype" className="prompt-label">Requested room type</label>
            <HavenSelect
              id="change-roomtype"
              ariaLabel="Requested room type"
              value={newRoomType}
              onChange={setNewRoomType}
              options={roomTypeOptions}
              disabled={roomOptions === null && optionsNote === ""}
            />
            {optionsNote ? (
              <small className="change-field-note">{optionsNote}</small>
            ) : roomOptions === null ? (
              <small className="change-field-note" role="status">Checking availability for your dates…</small>
            ) : hasAlternatives ? (
              <small className="change-field-note">Only room types with availability for your dates are listed.</small>
            ) : (
              <small className="change-field-note" role="status">No alternative room types are available for these dates. You can still change your dates and keep your current room type.</small>
            )}
          </div>
          <div className="prompt-field">
            <label htmlFor="change-reason" className="prompt-label">
              <MessageSquareText size={13} aria-hidden="true" /> Reason for change <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="change-reason"
              className="prompt-input change-reason-input"
              value={reason}
              maxLength={500}
              rows={4}
              required
              aria-required="true"
              placeholder="Tell us why you'd like to make this change."
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && <p className="booking-error" role="alert">{error}</p>}
        </div>
      </Modal>
    </div>
  );
}
