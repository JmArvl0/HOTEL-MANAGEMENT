"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ArrowRight, CreditCard, FlaskConical, LockKeyhole, Wallet } from "lucide-react";
import { HavenErrorAlert } from "@/components/ui/haven-data-controls";
import { formatPeso } from "@/lib/format";
import "./xendit-checkout.css";

type PaymentChoice = "deposit" | "full";
const PaymentChoiceContext = createContext<{
  choice: PaymentChoice;
  setChoice: (choice: PaymentChoice) => void;
  deposit: number;
  total: number;
  balanceDue: string;
} | null>(null);

export function XenditPaymentChoice({ deposit, total, balanceDue, children }: {
  deposit: number; total: number; balanceDue: string; children: ReactNode;
}) {
  const [choice, setChoice] = useState<PaymentChoice>(deposit < total ? "deposit" : "full");
  return <PaymentChoiceContext.Provider value={{ choice, setChoice, deposit, total, balanceDue }}>
    {children}
  </PaymentChoiceContext.Provider>;
}

export function XenditPaymentBreakdown() {
  const payment = useContext(PaymentChoiceContext);
  if (!payment) return null;
  const due = payment.choice === "full" ? payment.total : payment.deposit;
  const remaining = Math.max(0, payment.total - due);
  return <>
    <div className="review-stay-deposit">
      <dt><CreditCard size={14} aria-hidden="true" /> Pay today</dt>
      <dd>{formatPeso(due)}</dd>
    </div>
    <div>
      <dt><Wallet size={14} aria-hidden="true" /> Remaining balance</dt>
      <dd>{formatPeso(remaining)}</dd>
    </div>
  </>;
}

export function XenditCheckout({ holdToken, amount, retry = false }: { holdToken: string; amount: number; retry?: boolean }) {
  const router = useRouter();
  const payment = useContext(PaymentChoiceContext);
  const [channel, setChannel] = useState<"GCASH" | "PAYMAYA">("GCASH");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  async function checkout() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/booking/payments/xendit", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ holdToken, channel, paymentChoice: payment?.choice }) });
      const body = await response.json();
      if (!response.ok) { setError(body.error ?? "Unable to open sandbox checkout. Please retry."); return; }
      if (body.data?.checkoutUrl) { window.location.assign(body.data.checkoutUrl); return; }
      setNotice(body.message ?? "Waiting for the payment provider. Your booking is still unpaid.");
      if (!retry && body.data?.confirmationUrl) router.push(body.data.confirmationUrl);
      router.refresh();
    } catch { setError("Checkout could not be reached. Retry to check your existing attempt safely."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const wallet = channel === "GCASH" ? "GCash" : "Maya";
  const due = payment?.choice === "full" ? payment.total : amount;
  return <section className="xendit-checkout" aria-label="Reservation payment">
      <header className="xendit-checkout-heading">
        <h2>Payment details</h2>
        <span className="xendit-test-label">Test mode</span>
      </header>
      {payment && payment.deposit < payment.total ? (
        <fieldset className="xendit-method-group xendit-amount-group" disabled={busy}>
          <legend>How much would you like to pay?</legend>
          <div className="xendit-methods">
            <label className="xendit-method xendit-amount-option">
              <input type="radio" name="xendit-amount" value="deposit" aria-labelledby="xendit-deposit-label" aria-describedby="xendit-deposit-amount xendit-deposit-details" checked={payment.choice === "deposit"} onChange={() => payment.setChoice("deposit")} />
              <span><span className="xendit-method-caption" id="xendit-deposit-label">Pay deposit</span><small id="xendit-deposit-details">Pay the balance {payment.balanceDue.toLowerCase()}</small></span>
              <strong id="xendit-deposit-amount">{formatPeso(payment.deposit)}</strong>
            </label>
            <label className="xendit-method xendit-amount-option">
              <input type="radio" name="xendit-amount" value="full" aria-labelledby="xendit-full-label" aria-describedby="xendit-full-amount xendit-full-details" checked={payment.choice === "full"} onChange={() => payment.setChoice("full")} />
              <span><span className="xendit-method-caption" id="xendit-full-label">Pay in full</span><small id="xendit-full-details">Settle the entire stay now</small></span>
              <strong id="xendit-full-amount">{formatPeso(payment.total)}</strong>
            </label>
          </div>
        </fieldset>
      ) : <div className="xendit-deposit-due">
        <span>Amount to pay</span>
        <strong>{formatPeso(due)}</strong>
      </div>}
      <fieldset className="xendit-method-group" disabled={busy}>
        <legend>Choose a payment method</legend>
        <div className="xendit-methods">
          <label className="xendit-method">
            <input type="radio" name="xendit-channel" value="GCASH" aria-label="GCash" checked={channel === "GCASH"} onChange={() => setChannel("GCASH")} />
            <span className="xendit-method-caption">GCash</span>
            <span className="xendit-method-logo"><Image src="/payments/gcash.avif" alt="" width={112} height={27} unoptimized /></span>
          </label>
          <label className="xendit-method">
            <input type="radio" name="xendit-channel" value="PAYMAYA" aria-label="Maya" checked={channel === "PAYMAYA"} onChange={() => setChannel("PAYMAYA")} />
            <span className="xendit-method-caption">Maya</span>
            <span className="xendit-method-logo"><Image src="/payments/maya.svg" alt="" width={87} height={26} unoptimized /></span>
          </label>
        </div>
      </fieldset>
      <p className="xendit-method-explanation">Continue to Xendit to authorize your {wallet} test payment.{retry && " An existing checkout keeps its original wallet."}</p>
      <p className="xendit-sandbox-note"><FlaskConical size={16} aria-hidden="true" /><span>Test mode — no real money will be charged.</span></p>
      <button className="btn btn-accent xendit-proceed" type="button" disabled={busy} aria-busy={busy} onClick={() => void checkout()}>
        {busy ? "Opening checkout…" : retry ? "Retry payment" : payment ? `Pay ${formatPeso(due)} with ${wallet}` : `Continue with ${wallet}`}<ArrowRight size={17} aria-hidden="true" />
      </button>
      <p className="xendit-secure-note"><LockKeyhole size={13} aria-hidden="true" />Secure checkout by Xendit</p>
    {notice && <p className="xendit-checkout-notice" role="status">{notice}</p>}
    {error && <HavenErrorAlert title="Sandbox checkout unavailable" body={error} variant="customer" />}
  </section>;
}
