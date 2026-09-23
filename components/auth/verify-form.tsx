"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, MailCheck, RefreshCw } from "lucide-react";

type ChallengeMeta = { email: string; expiresAt: string; resendAvailableAt: string };

const pad = (value: number) => String(Math.max(0, value)).padStart(2, "0");
const countdown = (target: string, now: number) => {
  const seconds = Math.max(0, Math.ceil((new Date(target).getTime() - now) / 1000));
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
};

export default function VerifyForm({ callbackUrl = "/manager_dashboard" }: { callbackUrl?: string }) {
  const router = useRouter();
  const [meta, setMeta] = useState<ChallengeMeta | null>(null);
  const [dead, setDead] = useState<"expired" | "invalid" | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const errorRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/auth/otp/challenge", { cache: "no-store" });
    const body = await response.json().catch(() => null);
    if (response.ok && body?.data) {
      setMeta(body.data);
      setDead(null);
    } else {
      setDead(body?.status === "expired" ? "expired" : "invalid");
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [load]);

  function fail(message: string) {
    setError(message);
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code.trim())) {
      fail("Enter the 6-digit code.");
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    const body = await response.json().catch(() => null);
    setBusy(false);
    if (response.ok) {
      router.push(callbackUrl);
      router.refresh();
      return;
    }
    if (body?.expired) {
      setDead("expired");
      return;
    }
    if (response.status === 403) {
      setDead("invalid");
      return;
    }
    fail(body?.error ?? "That code didn’t work. Try again.");
  }

  async function resend() {
    setResending(true);
    setError("");
    const response = await fetch("/api/auth/otp/resend", { method: "POST" });
    const body = await response.json().catch(() => null);
    setResending(false);
    if (response.ok && body?.expiresAt) {
      setMeta((prev) => (prev ? { ...prev, expiresAt: body.expiresAt, resendAvailableAt: body.resendAvailableAt } : prev));
      setCode("");
      return;
    }
    fail(body?.error ?? "A new code could not be sent right now.");
  }

  if (dead) {
    return (
      <>
        <div className="haven-vault__head">
          <p className="eyebrow" style={{ color: "var(--color-forest-light)", margin: 0 }}>
            Haven portal
          </p>
          <h1>Verify your identity</h1>
          <p>{dead === "expired" ? "This verification code has expired." : "This code is no longer valid."}</p>
        </div>
        <p role="status" className="haven-vault__notice">
          {dead === "expired" ? "Request a new code, or sign in again for a fresh one." : "Sign in again to receive a fresh code."}
        </p>
        <Link className="haven-vault__submit" href="/login">
          Back to sign in <ArrowRight size={15} aria-hidden="true" />
        </Link>
      </>
    );
  }

  const resendReady = meta ? new Date(meta.resendAvailableAt).getTime() <= now : false;

  return (
    <>
      <div className="haven-vault__head">
        <p className="eyebrow" style={{ color: "var(--color-forest-light)", margin: 0 }}>
          Haven portal
        </p>
        <h1>Verify your identity</h1>
        <p>
          We sent a verification code to
          <br />
          <strong>{meta ? meta.email : "your email address"}</strong>
        </p>
      </div>

      {error && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="haven-vault__error">
          <strong>That code didn’t work</strong>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={submit} noValidate>
        <label className="haven-vault__field" htmlFor="haven-otp">
          <span>
            <MailCheck size={12} aria-hidden="true" /> 6-digit verification code
          </span>
          <input
            id="haven-otp"
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoComplete="one-time-code"
            inputMode="numeric"
            placeholder="••••••"
            required
            className="haven-vault__otp"
            autoFocus
            aria-invalid={error ? true : undefined}
          />
        </label>

        <button className="haven-vault__submit" disabled={busy} aria-busy={busy}>
          {busy ? "Verifying…" : "Verify and continue"} <ArrowRight size={15} aria-hidden="true" />
        </button>
      </form>

      <div className="haven-vault__otp-meta">
        {meta && <span>Code expires in {countdown(meta.expiresAt, now)}</span>}
        {resendReady ? (
          <button type="button" className="haven-vault__link" onClick={resend} disabled={resending}>
            <RefreshCw size={12} aria-hidden="true" /> {resending ? "Sending…" : "Resend code"}
          </button>
        ) : (
          meta && <span>Resend code in {countdown(meta.resendAvailableAt, now)}</span>
        )}
      </div>

      <p className="haven-vault__foot">
        Didn’t request this? <Link href="/login">Back to sign in</Link>
      </p>
    </>
  );
}
