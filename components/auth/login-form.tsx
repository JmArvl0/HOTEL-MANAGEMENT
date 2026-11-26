"use client";
import { fetchPublic, readResponse } from "@/lib/client-errors";

import { FormEvent, useEffect, useRef, useState } from "react";
import { getSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { authDestination } from "@/lib/auth-destination";

export default function LoginForm({
  callbackUrl = "/manager_dashboard",
  booking = false,
  expired = false,
}: {
  callbackUrl?: string;
  booking?: boolean;
  expired?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [rememberOffered, setRememberOffered] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    fetchPublic("/api/security-policy/public", { cache: "no-store" })
      .then((response) => (response.ok ? readResponse(response) : null))
      .then((body) => {
        if (live) setRememberOffered(body?.data?.cookieEnabled !== false);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
    const result = await signIn("credentials", { email, password, remember: rememberOffered && remember ? "1" : "0", callbackUrl, redirect: false });
    if (result?.error) {
      setError("That email or password doesn’t match our records.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } else {
      // Password accepted but OTP pending: the session is still unauthenticated.
      const fresh = await getSession();
      if (fresh?.user.otpPending) {
        router.push(`/verify?callbackUrl=${encodeURIComponent(callbackUrl)}`);
        router.refresh();
        return;
      }
      router.push(authDestination(callbackUrl));
      router.refresh();
    }
    } catch {
      setError("Could not connect to Haven. Try signing in again.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally { setLoading(false); }
  }

  return (
    <>
      <div className="haven-vault__head">
        <h1>{booking ? "Continue your booking" : "Sign in to Haven"}</h1>
        <p>{booking ? "Sign in to your Haven account to complete your reservation, manage your bookings, and enjoy a faster checkout." : "Access your dashboard, reservations, and stay details securely."}</p>
      </div>

      {expired && !error && (
        <p role="status" className="haven-vault__notice">
          Your session has expired. Please sign in again.
        </p>
      )}

      {error && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="haven-vault__error">
          <strong>We couldn’t sign you in</strong>
          <span>{error}</span>
          <a href="#haven-email">Go to email</a>
        </div>
      )}

      <form onSubmit={submit} noValidate={!booking}>
        <label className="haven-vault__field" htmlFor="haven-email">
          <span>
            <Mail size={12} aria-hidden="true" /> Email address
          </span>
          <input
            id="haven-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete={booking ? "email" : "username"}
            inputMode="email"
            placeholder="you@haven.com"
            required
          />
        </label>

        <div className="haven-vault__field" style={{ position: "relative" }}>
          <label htmlFor="haven-password">
            <span>
              <LockKeyhole size={12} aria-hidden="true" /> Password
            </span>
            <input
              id="haven-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </label>
          <button
            type="button"
            className="haven-vault__eye"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        <div className="haven-vault__options">
          {rememberOffered && (
            <label className="haven-vault__remember" htmlFor="haven-remember">
              <input
                id="haven-remember"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span>Keep me signed in on this device</span>
            </label>
          )}
          <p className="haven-vault__foot haven-vault__foot--end">
            <Link href={`/login?view=forgot-password&callbackUrl=${encodeURIComponent(callbackUrl)}${booking ? "&booking=1" : ""}`} scroll={false}>Forgot password?</Link>
          </p>
        </div>

        <button className="haven-vault__submit" disabled={loading} aria-busy={loading}>
          {loading ? "Signing in…" : booking ? "Sign in & continue" : "Sign in"} <ArrowRight size={15} aria-hidden="true" />
        </button>
      </form>
    </>
  );
}
