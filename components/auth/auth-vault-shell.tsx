"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck, Sparkles, Star } from "lucide-react";
import { AuthMotion } from "./auth-motion";
import "./auth-vault.css";

export function AuthVaultShell({
  mode,
  callbackUrl,
  booking = false,
  children,
}: {
  mode: "login" | "register";
  callbackUrl: string;
  booking?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();

  const switchHref =
    mode === "login"
      ? `/register?callbackUrl=${encodeURIComponent(callbackUrl)}${booking ? "&booking=1" : ""}`
      : `/login?callbackUrl=${encodeURIComponent(callbackUrl)}${booking ? "&booking=1" : ""}`;

  return (
    <div className="haven-vault">
      <div className="haven-vault__bg" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/hotel-hero.png" alt="" />
      </div>
      <span className="haven-vault__tide" aria-hidden="true" />

      <header className="haven-vault__header">
        <Link href="/" className="brand brand-light" aria-label="Haven home">
          <span className="brand-mark" aria-hidden="true">
            <Sparkles size={16} />
          </span>
          <span>
            HAVEN<small>HOTEL & RESIDENCES</small>
          </span>
        </Link>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/" className="haven-vault__help" style={{ textDecoration: "none" }} aria-label="Back to landing page">
            <ArrowLeft size={12} aria-hidden="true" /> Back to Haven
          </Link>
          <span className="haven-vault__help" aria-hidden="true">
            <ShieldCheck size={14} aria-hidden="true" /> Secure
          </span>
        </div>
      </header>

      <main className="haven-vault__stage">
        <p className="haven-vault__statement" aria-hidden="true">
          Good people.
          <br />
          <em>Brighter places.</em>
        </p>

        <div className="haven-vault__card">
          <div className="haven-vault__tabs" role="tablist" aria-label="Authentication">
            <button
              role="tab"
              aria-selected={mode === "login"}
              className={`haven-vault__tab ${mode === "login" ? "is-active" : ""}`}
              onClick={() => mode !== "login" && router.push(switchHref)}
            >
              Sign in
            </button>
            <button
              role="tab"
              aria-selected={mode === "register"}
              className={`haven-vault__tab ${mode === "register" ? "is-active" : ""}`}
              onClick={() => mode !== "register" && router.push(switchHref)}
            >
              Create account
            </button>
          </div>

          {children}
        </div>

        <div className="haven-vault__chips" aria-hidden="true">
          <span className="haven-vault__chip">
            <strong>4.9 · 1.2k+ stays</strong>
            <span className="haven-vault__stars">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={10} fill="currentColor" />
              ))}
            </span>
          </span>
          <span className="haven-vault__chip">
            <strong>24h Front Desk</strong>
          </span>
        </div>
      </main>

      <AuthMotion />
    </div>
  );
}
