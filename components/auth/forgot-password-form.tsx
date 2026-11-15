"use client";
import { fetchPublic, readResponse } from "@/lib/client-errors";

import { userMessage } from "@/lib/errors";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound, Mail } from "lucide-react";

type Step = "email" | "code" | "sent";

/**
 * Self-service reset, step 1–2: email request, then the emailed 6-digit
 * code. A verified code triggers the one-time reset link by email; the link
 * itself still requires the identity selfie before a password is accepted.
 */
export function ForgotPasswordForm({ loginHref }: { loginHref: string }) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [masked, setMasked] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function requestCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
    const response = await fetchPublic("/api/password-reset/request", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }),
    });
    const body = await readResponse(response).catch(() => null);
    if (!response.ok) {
      setError(userMessage(body?.error, "Unable to start the reset. Please try again."));
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
    } catch { setError("Could not confirm the request. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
    const response = await fetchPublic("/api/password-reset/verify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ challengeId, code }),
    });
    const body = await readResponse(response).catch(() => null);
    if (!response.ok) {
      setError(userMessage(body?.error, "Verification failed. Please try again."));
      return;
    }
    setStep("sent");
    } catch { setError("Could not confirm verification. Check your email for a reset link before retrying."); }
    finally { setBusy(false); }
  }

  return (
    <>
        <div className="haven-vault__head">
          <h1>{step === "code" ? "Enter your verification code" : step === "sent" ? "Check your email" : "Forgot password?"}</h1>
        </div>
        {step === "email" && (
          <>
            <p className="haven-vault__recovery-copy">Enter your account email. If it matches our records, a verification code follows.</p>
            <form onSubmit={requestCode}>
              <label className="haven-vault__field"><span><Mail size={12} aria-hidden="true" /> Account email</span><input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@haven.com" /></label>
              {error && <p className="haven-vault__error" role="alert">{error}</p>}
              <button className="haven-vault__submit" disabled={busy} aria-busy={busy}>{busy ? "Sending code…" : "Send verification code"} <ArrowRight size={15} aria-hidden="true" /></button>
            </form>
          </>
        )}
        {step === "code" && (
          <>
            <p className="haven-vault__recovery-copy">If your account matches, a 6-digit code is on its way to {masked || "your email"}.</p>
            <form onSubmit={verifyCode}>
              <label className="haven-vault__field">Verification code<input className="haven-vault__otp" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required /></label>
              {error && <p className="haven-vault__error" role="alert">{error}</p>}
              <button className="haven-vault__submit" disabled={busy || code.length !== 6} aria-busy={busy}>{busy ? "Verifying…" : "Verify code"} <ArrowRight size={15} aria-hidden="true" /></button>
            </form>
            <p className="haven-vault__recovery-copy">Didn&apos;t get a code? <button type="button" className="haven-vault__link" onClick={() => { setStep("email"); setCode(""); setError(""); }} disabled={busy}>Try a different email</button></p>
          </>
        )}
        {step === "sent" && (
          <>
            <p className="haven-vault__recovery-copy" role="status"><KeyRound size={15} aria-hidden="true" /> If {masked || "that email"} holds a HAVEN account, a one-time reset link is on its way. The link expires after one hour, and a live identity selfie is required before a new password is accepted.</p>
            <Link href={loginHref} scroll={false} className="haven-vault__submit">Back to sign in <ArrowRight size={15} aria-hidden="true" /></Link>
          </>
        )}
    </>
  );
}
