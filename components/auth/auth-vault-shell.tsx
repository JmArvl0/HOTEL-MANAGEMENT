"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, ShieldCheck, Sparkles, Star, Wind } from "lucide-react";
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
      <span className="haven-vault__damask" aria-hidden="true" />

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

      <div className="haven-vault__stage">
        <div className="haven-vault__card">
          <div className="haven-vault__art" aria-label="Haven ritual">
            <div className="haven-vault__art-top">
              <span className="haven-vault__art-badge">
                <KeyRound size={12} aria-hidden="true" /> {mode === "login" ? "Unlock your stay" : "Your key awaits"}
              </span>
              <div>
                <h2>
                  {mode === "login" ? (
                    <>
                      Open the door
                      <br />
                      <em>to your Haven.</em>
                    </>
                  ) : (
                    <>
                      A beautiful stay
                      <br />
                      <em>starts here.</em>
                    </>
                  )}
                </h2>
                <p>
                  {mode === "login"
                    ? "One calm portal for guests and team — reservations, rooms, and service, instantly in sync."
                    : "Create your guest key to keep reservations secure, portable, and effortless to manage."}
                </p>
              </div>
            </div>

            <div className="haven-vault__scene" aria-hidden="true">
              <span className="haven-vault__linen" />
              <span className="haven-vault__linen haven-vault__linen--2" />
              <span className="haven-vault__sunbeam" />
              <span className="haven-vault__mote haven-vault__mote--1" />
              <span className="haven-vault__mote haven-vault__mote--2" />
              <span className="haven-vault__mote haven-vault__mote--3" />
              <span className="haven-vault__mote haven-vault__mote--4" />
              <span className="haven-vault__mote haven-vault__mote--5" />
              <span className="haven-vault__scene-label">
                <Wind size={10} aria-hidden="true" /> Morning linen · Mactan light
              </span>
            </div>

            <div className="haven-vault__art-foot">
              <div className="haven-vault__mini">
                <strong>4.9 · 1.2k+ stays</strong>
                <span>Quiet luxury, thoughtful service — verified by guests.</span>
                <span style={{ display: "flex", gap: 3, color: "#f5c86a", marginTop: 8 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} size={10} fill="currentColor" />
                  ))}
                </span>
              </div>
              <div className="haven-vault__mini">
                <strong>24h Front Desk</strong>
                <span>Human help the moment you need it — by phone or desk.</span>
              </div>
            </div>
          </div>

          <div className="haven-vault__form">
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
        </div>
      </div>
    </div>
  );
}
