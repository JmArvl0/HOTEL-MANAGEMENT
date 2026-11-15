"use client";

import { fetchPublic, readResponse } from "@/lib/client-errors";

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
const MAX_ATTEMPTS = 216; // 18 minutes includes the sandbox session expiry.

export function PaymentStatusPoller({
  reservationId,
  status,
}: {
  reservationId: string;
  status: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"watching" | "settling" | "stopped" | "done">(status === "pending" ? "watching" : "done");
  const [connectionFailed, setConnectionFailed] = useState(false);
  const [underReview, setUnderReview] = useState(false);
  const inFlight = useRef(false);

  useEffect(() => {
    if (state === "done" || state === "stopped") return;
    let attempts = 0;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      if (cancelled || inFlight.current) return;
      inFlight.current = true;
      attempts += 1;
      let settled = false;
      try {
        const response = await fetchPublic(`/api/account/reservations/${reservationId}/payments`, {
          cache: "no-store",
        });
        if (cancelled) return;
        if (response.ok) {
          setConnectionFailed(false);
          const body = (await readResponse(response)) as { data?: { status?: string; payment_status?: string; payment_under_review?: boolean } };
          setUnderReview(body.data?.payment_under_review === true);
          const reservationStatus = body.data?.status;
          if (reservationStatus && reservationStatus !== "pending") {
            settled = true;
            setState("settling");
            window.clearInterval(timer);
            router.refresh();
            return;
          }
        } else setConnectionFailed(true);
      } catch {
        if (!cancelled) setConnectionFailed(true);
      } finally {
        inFlight.current = false;
        if (!cancelled && !settled && attempts >= MAX_ATTEMPTS) {
          setState("stopped");
          window.clearInterval(timer);
        }
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
        ? "Updating your reservation status…"
        : state === "stopped" ? "Payment confirmation is taking longer than expected. Check your reservation or contact Front Desk before paying again."
        : connectionFailed ? "We couldn't refresh your payment status. Please check your connection, then check this reservation before paying again."
        : underReview ? "Accounting is reviewing this payment. Please don't pay again. Contact Front Desk for an update." : "Awaiting payment verification — this page updates automatically when the provider responds."}
      {state === "stopped" && <button className="btn btn-soft" type="button" onClick={() => { setConnectionFailed(false); setState("watching"); }}>Check status again</button>}
    </p>
  );
}
