"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound, Mail } from "lucide-react";

type Step = "email" | "code" | "sent";

/**
 * Self-service reset, step 1–2: email request, then the emailed 6-digit
 * code. A verified code triggers the one-time reset link by email; the link
 * itself still requires the identity selfie before a password is accepted.
 */
export function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [masked, setMasked] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/password-reset/request", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(body?.error ?? "Unable to start the reset. Please try again.");
      return;
    }
    setMasked(typeof body?.masked === "string" ? body.masked : "");
    if (body?.challengeId) {
      setChallengeId(body.challengeId);
      setStep("code");
    } else {
      // No challenge was issued (unknown address or limit): the generic
      // response still confirms without revealing anything.
      setStep("sent");
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/password-reset/verify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId, code }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (!response.ok) {
      setError(body?.error ?? "Verification failed. Please try again.");
      return;
    }
    setStep("sent");
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <p className="eyebrow">Password reset</p>
        <h1>{step === "code" ? "Enter your verification code" : "Reset your password"}</h1>
        {step === "email" && (
          <>
            <p>Enter your account email. If it matches our records, a verification code follows.</p>
            <form onSubmit={requestCode}>
              <label>Account email<input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></label>
              {error && <p className="form-error">{error}</p>}
              <button className="btn btn-accent" disabled={busy}>{busy ? "Sending code…" : "Send verification code"}</button>
            </form>
          </>
        )}
        {step === "code" && (
          <>
            <p>A 6-digit code was sent to {masked || "your email"}. It expires in minutes and can be used once.</p>
            <form onSubmit={verifyCode}>
              <label>Verification code<input name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required /></label>
              {error && <p className="form-error">{error}</p>}
              <button className="btn btn-accent" disabled={busy || code.length !== 6}>{busy ? "Verifying…" : "Verify code"} <ArrowRight size={15} aria-hidden="true" /></button>
            </form>
            <p><Mail size={13} aria-hidden="true" /> Didn&apos;t get a code? <button type="button" className="table-action" onClick={() => setStep("email")} disabled={busy}>Try a different email</button></p>
          </>
        )}
        {step === "sent" && (
          <>
            <p><KeyRound size={15} aria-hidden="true" /> If {masked || "that email"} holds a HAVEN account, a one-time reset link is on its way. The link expires after one hour, and a live identity selfie is required before a new password is accepted.</p>
          </>
        )}
        <Link href="/login">Back to sign in</Link>
      </section>
    </main>
  );
}
