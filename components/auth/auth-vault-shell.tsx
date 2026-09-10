"use client";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Building2, Headphones, ShieldCheck, Sparkles, Sun, UsersRound } from "lucide-react";
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
  const bookingParam = booking ? "&booking=1" : "";
  const loginHref = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}${bookingParam}`;
  const registerHref = `/register?callbackUrl=${encodeURIComponent(callbackUrl)}${bookingParam}`;

  return (
    <div className={`haven-vault haven-vault--${mode}`}>
      <aside className="haven-vault__visual" aria-label="Welcome to Haven">
        <Image src="/hotel-hero.png" alt="A peaceful Haven hotel terrace overlooking the water" fill priority sizes="(max-width: 900px) 100vw, 56vw" />
        <span className="haven-vault__visual-wash" aria-hidden="true" />
        <Link href="/" className="brand brand-light haven-vault__brand" aria-label="Haven home">
          <span className="brand-mark" aria-hidden="true"><Sparkles size={16} /></span>
          <span>HAVEN<small>HOTEL &amp; RESIDENCES</small></span>
        </Link>
        <div className="haven-vault__story">
          <p>More than a stay</p>
          <h2 className="haven-vault__statement">Good people.<br /><em>Brighter places.</em></h2>
          <span className="haven-vault__keyline" aria-hidden="true" />
          <p>Beautiful spaces. Thoughtful hospitality.<br />Welcome to a brighter way to stay.</p>
        </div>
        <ul className="haven-vault__qualities" aria-label="Haven hospitality values">
          <li><Building2 aria-hidden="true" /><span>Beautiful<br />spaces</span></li>
          <li><UsersRound aria-hidden="true" /><span>Thoughtful<br />service</span></li>
          <li><Sun aria-hidden="true" /><span>Brighter<br />stays</span></li>
        </ul>
      </aside>

      <section className="haven-vault__panel">
        <header className="haven-vault__header">
          <Link href="/" className="haven-vault__back"><ArrowLeft size={15} aria-hidden="true" /> Back to Haven</Link>
          <a className="haven-vault__help" href="mailto:hello@haven-hotel.ph">
            <Headphones size={18} aria-hidden="true" />
            <span>Need help?<strong>Contact Front Desk</strong></span>
          </a>
        </header>
        <main className="haven-vault__stage">
          <div className="haven-vault__card">
          <nav className="haven-vault__tabs" aria-label="Account access">
            <Link
              href={loginHref}
              aria-current={mode === "login" ? "page" : undefined}
              className={`haven-vault__tab ${mode === "login" ? "is-active" : ""}`}
            >
              Sign in
            </Link>
            <Link
              href={registerHref}
              aria-current={mode === "register" ? "page" : undefined}
              className={`haven-vault__tab ${mode === "register" ? "is-active" : ""}`}
            >
              Create account
            </Link>
          </nav>

          {children}
            <p className="haven-vault__security"><ShieldCheck size={15} aria-hidden="true" /> Your account information is protected.</p>
          </div>
        </main>
      </section>

      <AuthMotion />
    </div>
  );
}
