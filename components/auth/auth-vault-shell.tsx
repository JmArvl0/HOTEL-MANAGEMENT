"use client";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Building2, Headphones, ShieldCheck, Sun, UsersRound } from "lucide-react";
import { AuthMotion } from "./auth-motion";
import { HavenLogo } from "@/components/ui/haven-logo";
import "./auth-vault.css";

export function AuthVaultShell({
  mode,
  callbackUrl,
  booking = false,
  bookingContext,
  children,
}: {
  mode: "login" | "register" | "forgot-password";
  callbackUrl: string;
  booking?: boolean;
  bookingContext?: React.ReactNode;
  children: React.ReactNode;
}) {
  const bookingParam = booking ? "&booking=1" : "";
  const loginHref = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}${bookingParam}`;
  const registerHref = `/register?callbackUrl=${encodeURIComponent(callbackUrl)}${bookingParam}`;

  return (
    <div className={`haven-vault haven-vault--${mode}${bookingContext?" haven-vault--booking":""}`}>
      <aside className="haven-vault__visual" aria-label="Welcome to Haven">
        {bookingContext || <>
        <Image src="/hotel-hero.png" alt="A peaceful Haven hotel terrace overlooking the water" fill preload sizes="(max-width: 900px) 0px, 50vw" />
        <span className="haven-vault__visual-wash" aria-hidden="true" />
        <Link href="/" className="brand brand-light haven-vault__brand" aria-label="Haven home">
          <span className="brand-mark" aria-hidden="true"><HavenLogo size={34} /></span>
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
        </>}
      </aside>

      <section className="haven-vault__panel">
        <header className="haven-vault__header">
          <Link href="/" className="haven-vault__back"><span className="haven-vault__mobile-logo"><HavenLogo size={30} /></span><ArrowLeft size={15} aria-hidden="true" /> Back to Haven</Link>
          <Link className="haven-vault__help" href="/#contact" aria-label="Contact Front Desk">
            <Headphones size={18} aria-hidden="true" />
            <span>Need help?<strong>Contact Front Desk</strong></span>
          </Link>
        </header>
        <main className="haven-vault__stage">
          <div className="haven-vault__card">
          {bookingContext && <div className="haven-vault__mobile-stay">{bookingContext}</div>}
          {mode === "forgot-password" ? <Link href={loginHref} scroll={false} className="haven-vault__recovery-back"><ArrowLeft size={15} aria-hidden="true" /> Back to sign in</Link> : <nav className="haven-vault__tabs" aria-label="Account access">
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
          </nav>}

          {children}
            <footer className="haven-vault__footer"><Link href="/booking-policy">Booking policy</Link><p className="haven-vault__security"><ShieldCheck size={15} aria-hidden="true" /> Your account information is protected.</p></footer>
          </div>
        </main>
      </section>

      <AuthMotion />
    </div>
  );
}
