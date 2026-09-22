"use client";

import { useState } from "react";

/**
 * Deposit method selector: "GCash Instant Auto-Pay" (provider-hosted checkout,
 * automatically confirmed by the signed webhook) beside the manual GCash
 * transfer form. Nothing is marked paid until the verified webhook confirms it.
 */

interface PaymentMethodSelectorProps {
  holdToken: string;
  gatewayAvailable: boolean;
  /** Deposit amount in pesos, shown on the auto-pay card. */
  depositAmount: number;
}

export function PaymentMethodSelector({
  holdToken,
  gatewayAvailable,
  depositAmount,
}: PaymentMethodSelectorProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function startGateway() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/booking/payments/gateway", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ holdToken }),
      });
      const payload = (await response.json()) as {
        data?: { checkoutUrl?: string; resume?: boolean };
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        setError(payload.error ?? "Unable to start online payment.");
        return;
      }
      if (payload.data?.checkoutUrl) {
        window.location.href = payload.data.checkoutUrl;
        return;
      }
      setError(payload.message ?? "A gateway payment is already pending for this booking.");
    } catch {
      setError("Unable to start online payment. Please use manual GCash transfer.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gateway-selector" role="group" aria-label="Deposit payment method">
      {gatewayAvailable ? (
        <>
          <div className="gateway-option gateway-option--auto">
            <div className="gateway-option-head">
              <span className="gateway-brand" aria-hidden="true">
                GCash
              </span>
              <span className="gateway-badge">Instant auto-pay</span>
            </div>
            <p className="gateway-option-copy">
              Pay <strong>&#8369;{depositAmount.toFixed(2)}</strong> in the GCash app and Haven
              confirms your reservation automatically — no waiting for manual verification.
            </p>
            <ol className="gateway-steps">
              <li>Tap the button below to open the secure GCash checkout.</li>
              <li>Approve the payment in the GCash app.</li>
              <li>Your reservation confirms on its own the moment payment lands.</li>
            </ol>
            <button
              type="button"
              disabled={busy}
              onClick={() => void startGateway()}
              className="btn btn-accent gateway-pay-button"
            >
              {busy ? "Opening secure GCash checkout…" : "Proceed to GCash Payment"}
            </button>
          </div>
          <div className="gateway-option gateway-option--manual" aria-label="Alternative method">
            <div className="gateway-option-head">
              <span className="gateway-brand gateway-brand--plain" aria-hidden="true">
                GCash
              </span>
              <span className="gateway-badge gateway-badge--soft">Manual verification</span>
            </div>
            <p className="gateway-option-copy">
              Prefer to transfer yourself? Send the deposit to the account below, then submit your
              reference number and receipt screenshot. Staff verify it before your booking is
              confirmed.
            </p>
          </div>
        </>
      ) : (
        <p className="gateway-option-copy">
          Haven verifies every GCash deposit manually — submitting your reference and receipt creates
          a pending payment for staff verification.
        </p>
      )}
      {error && (
        <p role="alert" className="booking-error">
          {error}
        </p>
      )}
    </div>
  );
}
