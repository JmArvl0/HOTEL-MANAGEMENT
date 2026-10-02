"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Way out of an abandoned gateway checkout. Cancelling voids the unsettled
 * reservation and frees the room, then returns the guest to room search with
 * the same dates so they can start over (manual or online).
 */
export function GatewayPendingActions({
  reservationId,
  checkIn,
  checkOut,
  guests,
}: {
  reservationId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function cancel() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/account/reservations/${reservationId}/cancel-attempt`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Unable to cancel this payment attempt.");
        return;
      }
      const retry = `/account/find-room?${new URLSearchParams({ checkIn, checkOut, guests: String(guests) })}`;
      router.push(retry);
      router.refresh();
    } catch {
      setError("Unable to cancel this payment attempt. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gateway-pending-actions">
      <button type="button" className="btn btn-soft" disabled={busy} onClick={() => void cancel()}>
        {busy ? "Cancelling…" : "Cancel this attempt and try again"}
      </button>
      {error && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
    </div>
  );
}
