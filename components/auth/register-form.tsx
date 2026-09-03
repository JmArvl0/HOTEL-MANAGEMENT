"use client";
import { FormEvent, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff } from "lucide-react";

export function RegisterForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget)) as Record<string, string>;
    const response = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setLoading(false);
      setError(body.error ?? "Registration failed.");
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    const result = await signIn("credentials", { email: values.email, password: values.password, callbackUrl, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError("Account created, but sign-in failed. Please sign in.");
      return;
    }
    router.push(result?.url ?? callbackUrl);
    router.refresh();
  }

  return (
    <>
      <div className="haven-vault__head">
        <p className="eyebrow" style={{ color: "#c9783c", margin: 0 }}>
          Guest registration
        </p>
        <h1>Join Haven.</h1>
        <p>Your booking context is preserved — create a key in seconds.</p>
      </div>

      {error && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="haven-vault__error">
          <strong>We couldn’t create your account</strong>
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={submit} noValidate>
        <div className="haven-vault__row">
          <label className="haven-vault__field">
            First name
            <input name="firstName" required maxLength={80} autoComplete="given-name" placeholder="Ava" />
          </label>
          <label className="haven-vault__field">
            Last name
            <input name="lastName" required maxLength={80} autoComplete="family-name" placeholder="Reyes" />
          </label>
        </div>
        <label className="haven-vault__field">
          Mobile number
          <input name="phone" type="tel" minLength={7} maxLength={30} required autoComplete="tel" placeholder="+63 9xx xxx xxxx" />
        </label>
        <label className="haven-vault__field">
          Email
          <input name="email" type="email" required maxLength={200} autoComplete="email" placeholder="you@haven.com" />
        </label>
        <label className="haven-vault__field" style={{ position: "relative" }}>
          Password
          <input name="password" type={show ? "text" : "password"} minLength={8} maxLength={128} required autoComplete="new-password" placeholder="At least 8 characters" />
          <button
            type="button"
            className="haven-vault__eye"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </label>
        <label className="haven-vault__field">
          Confirm password
          <input name="confirmPassword" type={show ? "text" : "password"} minLength={8} maxLength={128} required autoComplete="new-password" placeholder="Repeat password" />
        </label>

        <button className="haven-vault__submit" disabled={loading} aria-busy={loading}>
          <span className="haven-vault__submit-glow" aria-hidden="true" />
          {loading ? "Creating account…" : "Create guest account"} <ArrowRight size={15} aria-hidden="true" />
        </button>
      </form>

      <p className="haven-vault__foot">
        Already registered? <Link href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Sign in</Link>
      </p>
    </>
  );
}
