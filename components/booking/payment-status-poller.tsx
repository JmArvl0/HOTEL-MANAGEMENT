"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Live payment-status watcher for the gateway checkout flow. While the
 * reservation is still pending, it polls the guest-scoped status endpoint and
 * refreshes the server-rendered confirmation page the moment the webhook
 * settles the deposit, so "Awaiting Payment" becomes "Payment Confirmed!"
 * without a manual reload. Polling stops once confirmed or on unmount.
 */

const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 72; // ~6 minutes — the hold is 15, the redirect is quick.

export function PaymentStatusPoller({
  reservationId,
  status,
}: {
  reservationId: string;
  status: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"watching" | "settling" | "done">(status === "pending" ? "watching" : "done");
  const inFlight = useRef(false);

  useEffect(() => {
    if (state === "done") return;
    let attempts = 0;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      if (cancelled || inFlight.current) return;
      inFlight.current = true;
      attempts += 1;
      try {
        const response = await fetch(`/api/account/reservations/${reservationId}/payments`, {
          cache: "no-store",
        });
        if (response.ok) {
          const body = (await response.json()) as { data?: { status?: string; payment_status?: string } };
          const reservationStatus = body.data?.status;
          if (reservationStatus && reservationStatus !== "pending") {
            setState("settling");
            window.clearInterval(timer);
            router.refresh();
            return;
          }
        }
        if (attempts >= MAX_ATTEMPTS) {
          setState("done");
          window.clearInterval(timer);
        }
      } catch {
        // Transient network errors: keep waiting for the next tick.
      } finally {
        inFlight.current = false;
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [reservationId, router, state]);

  if (state === "done") return null;
  return (
    <p className="payment-status-poller" role="status" aria-live="polite">
      {state === "settling"
        ? "Payment confirmed! Updating your reservation…"
        : "Awaiting payment confirmation — this page updates automatically once GCash settles."}
    </p>
  );
}
