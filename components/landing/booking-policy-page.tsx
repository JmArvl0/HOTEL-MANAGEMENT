"use client";

import { useEffect, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { BedDouble, BookOpen, Headphones, Percent } from "lucide-react";
import { publicCancellationSummary, publicDepositLabel, publicHotelTime, type PublicBookingInformation } from "@/lib/public-booking-information";
import type { WebsiteContent } from "@/lib/website-content";
import { BookingPolicySnapshot, policySnapshotItems } from "./policy-snapshot";
import "./booking-policy-page.css";

const sections = [
  { id: "before-you-reserve", title: "Before you reserve" },
  { id: "cancellation-refunds", title: "Cancellation & refunds" },
  { id: "arrival-departure", title: "Arrival & departure" },
];

function subscribeCompactView(onChange: () => void) {
  const media = window.matchMedia?.("(max-width: 1100px)");
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}
const compactView = () => window.matchMedia?.("(max-width: 1100px)").matches ?? false;
const serverView = () => false;
function sectionFromHash() {
  return typeof window !== "undefined" && sections.some(section => `#${section.id}` === window.location.hash)
    ? window.location.hash.slice(1) : sections[0].id;
}

export function BookingPolicyPage({ information, content }: {
  information: PublicBookingInformation;
  content: WebsiteContent;
}) {
  const compact = useSyncExternalStore(subscribeCompactView, compactView, serverView);
  const [activeSection, setActiveSection] = useState(sectionFromHash);
  useEffect(() => {
    const update = () => setActiveSection(sectionFromHash());
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  function panelProps(id: string) {
    return {
      role: compact ? "tabpanel" : undefined,
      "aria-labelledby": compact ? `${id}-tab` : `${id}-title`,
      hidden: compact && activeSection !== id,
      tabIndex: compact ? 0 : undefined,
    };
  }
  function switchByKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "ArrowRight" ? (index + 1) % sections.length
      : event.key === "ArrowLeft" ? (index + sections.length - 1) % sections.length
        : event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    setActiveSection(sections[next].id);
    document.getElementById(`${sections[next].id}-tab`)?.focus({ preventScroll: true });
  }
  const { deposit, operations: policy } = information;
  const amount = publicDepositLabel(deposit);
  const checkIn = publicHotelTime(policy.checkInTime);
  const checkOut = publicHotelTime(policy.checkOutTime);
  const glance = [
    ...policySnapshotItems(information).slice(0, 2),
    { icon: Percent, label: "VAT & service charge", detail: `Rates include ${policy.vatRateBp / 100}% VAT and ${policy.serviceChargeBp / 100}% service charge.` },
    { icon: BedDouble, label: "Check-in / Check-out", detail: `Check-in from ${checkIn} · Check-out by ${checkOut} (${policy.hotelTimezone}).` },
  ];
  const cancellationLines = publicCancellationSummary(policy).split(/(?<=\.)\s+/);

  return <article className="booking-policy" aria-labelledby="booking-policy-title">
    <div className="booking-policy-decoration" aria-hidden="true">
      <Image className="booking-policy-leaves" src="/decor/amenities-leaves.png" alt="" width={360} height={240} sizes="(max-width: 680px) 140px, 300px" />
      <span className="booking-policy-arch" />
    </div>
    <header className="booking-policy-header">
      <h1 id="booking-policy-title">Booking policy</h1>
      <p>Everything you need to know before you reserve.</p>
    </header>
    <BookingPolicySnapshot information={information} />
    <p className="booking-policy-mobile-note">Your room hold begins after you submit guest details. Times use {policy.hotelTimezone}.</p>
    {compact && <div className="booking-policy-tabs" role="tablist" aria-label="Policy sections">
      {sections.map((section, index) => <button key={section.id} id={`${section.id}-tab`} role="tab" type="button"
        aria-selected={activeSection === section.id} aria-controls={section.id} tabIndex={activeSection === section.id ? 0 : -1}
        onClick={() => setActiveSection(section.id)} onKeyDown={event => switchByKeyboard(event, index)}>{section.title}</button>)}
    </div>}
    <div className="booking-policy-layout">
      <aside className="booking-policy-sidebar" aria-label="Booking policy overview">
        <h2>Booking policy</h2>
        <p>Our booking policy is designed to be clear, fair, and hassle-free, so you can reserve your stay at {content.identity.name} with confidence.</p>
        <section className="booking-policy-glance" aria-labelledby="policy-glance-title">
          <h3 id="policy-glance-title">At a glance</h3>
          <ul role="list">{glance.map(({ icon: Icon, label, detail }) => <li key={label}>
            <Icon size={27} strokeWidth={1.5} aria-hidden="true" />
            <div><h4>{label}</h4><p>{detail}</p></div>
          </li>)}</ul>
        </section>
      </aside>
      <div className="booking-policy-content">
        <section className="booking-policy-section" id="before-you-reserve" {...panelProps("before-you-reserve")}>
          <h2 id="before-you-reserve-title">Before you reserve</h2>
          <p>{deposit.enabled ? `A ${amount} deposit is required to confirm your reservation. Your reservation is confirmed after deposit verification.` : "Online deposit reservations are currently unavailable. Contact Front Desk for assistance."}</p>
          <p>Remaining balance: {deposit.remainingBalanceDue}. Rates include {policy.vatRateBp / 100}% VAT and {policy.serviceChargeBp / 100}% service charge.</p>
        </section>
        <section className="booking-policy-section" id="cancellation-refunds" {...panelProps("cancellation-refunds")}>
          <h2 id="cancellation-refunds-title">Cancellation & refunds</h2>
          <ul className="booking-policy-refund-rules" role="list">{cancellationLines.slice(0, -1).map(line => <li key={line}>{line}</li>)}</ul>
          <p className="booking-policy-note">{cancellationLines.at(-1)}</p>
          <p>Approved refunds follow hotel verification and processing. No-show and early-departure requests require review under the policy attached to your reservation.</p>
        </section>
        <section className="booking-policy-section" id="arrival-departure" {...panelProps("arrival-departure")}>
          <h2 id="arrival-departure-title">Arrival & departure</h2>
          <p>Check-in from {checkIn}. Check-out by {checkOut} ({policy.hotelTimezone}). Early check-in and late checkout require confirmation and may carry a charge.</p>
          <p>Lead guest minimum age: {policy.minimumBookingAge}. {policy.validIdRequired ? "Bring a valid government-issued ID and reservation details." : "Bring your reservation details."}</p>
          <p>The policy shown at checkout is saved with your reservation. Changes made later do not rewrite that policy snapshot.</p>
        </section>
        <aside className="booking-policy-support" aria-labelledby="policy-support-title">
          <Image src="/decor/booking-policy-support.png" alt="" fill sizes="(max-width: 900px) 100vw, 65vw" className="booking-policy-support-art" />
          <div className="booking-policy-support-copy">
            <h2 id="policy-support-title">Questions before you book?</h2>
            <p>Our team is happy to help with reservations, policies, and special requests.</p>
            <div className="booking-policy-actions">
              <a className="booking-policy-contact" href={`mailto:${content.contact.email}`}><Headphones size={21} aria-hidden="true" />Contact our team</a>
              <Link href="/#faq"><BookOpen size={21} aria-hidden="true" />View FAQ</Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  </article>;
}
