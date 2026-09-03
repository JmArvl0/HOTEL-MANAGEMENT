"use client";
import { FormEvent, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import "./login.css";

export default function LoginForm({
  callbackUrl = "/manager_dashboard",
  booking = false,
}: {
  callbackUrl?: string;
  booking?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const result = await signIn("credentials", { email, password, callbackUrl, redirect: false });
    setLoading(false);
    if (result?.error) {
      setError("That email or password doesn’t match our records.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } else {
      router.push(result?.url ?? callbackUrl);
      router.refresh();
    }
  }

  return (
    <>
      <div className="haven-vault__head">
        <p className="eyebrow" style={{ color: "#c9783c", margin: 0 }}>
          Haven portal
        </p>
        <h1>{booking ? "Sign in to continue your reservation" : "Welcome back."}</h1>
        <p>{booking ? "Your selected room and stay details are waiting." : "Unlock your dashboard — one secure key for every role."}</p>
      </div>

      {error && (
        <div ref={errorRef} tabIndex={-1} role="alert" className="haven-vault__error">
          <strong>We couldn’t sign you in</strong>
          <span>{error}</span>
          <a href="#haven-email">Go to email</a>
        </div>
      )}

      <form onSubmit={submit} noValidate>
        <label className="haven-vault__field" htmlFor="haven-email">
          <span>
            <Mail size={12} aria-hidden="true" /> Work or guest email
          </span>
          <input
            id="haven-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
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

        <button className="haven-vault__submit" disabled={loading} aria-busy={loading}>
          <span className="haven-vault__submit-glow" aria-hidden="true" />
          {loading ? "Signing in…" : "Sign in"} <ArrowRight size={15} aria-hidden="true" />
        </button>
      </form>

      <p className="haven-vault__foot">
        New guest? <Link href={`/register?callbackUrl=${encodeURIComponent(callbackUrl)}${booking ? "&booking=1" : ""}`}>Create an account</Link>
      </p>

      <div className="haven-vault__trust">
        <span>Encrypted</span>
        <span>•</span>
        <span>Pay at hotel</span>
        <span>•</span>
        <span>24h Desk</span>
      </div>
    </>
  );
}
