"use client";

import { useId, useRef, type MouseEvent } from "react";
import { Accessibility, BedDouble, CalendarCheck, Clock3, Coffee, FileText, Headphones, IdCard, Luggage, Mail, PawPrint, Phone, Plus, Sprout, Users } from "lucide-react";
import "./hotel-faq.css";

const questionIcons = [Clock3, Coffee, BedDouble, Accessibility, CalendarCheck, FileText, IdCard, PawPrint];
const shortcuts = [
  { label: "Check-in", index: 0, icon: Luggage },
  { label: "Breakfast", index: 1, icon: Coffee },
  { label: "Family stays", index: 2, icon: Users },
  { label: "Access needs", index: 3, icon: Accessibility },
  { label: "Policies", index: 5, icon: FileText },
];

export function HotelFaqAccordion({ entries, contact }: {
  entries: string[][];
  contact: { phone: string; email: string };
}) {
  const id = useId();
  const rows = useRef<Array<HTMLDetailsElement | null>>([]);

  function openQuestion(event: MouseEvent<HTMLAnchorElement>, index: number) {
    // Modified clicks retain the link's ordinary browser behavior.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const row = rows.current[index];
    if (!row) return;
    event.preventDefault();
    row.open = true;
    row.querySelector("summary")?.focus({ preventScroll: true });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "instant" : "smooth" });
    if (!reducedMotion) row.animate?.([
      { backgroundColor: "rgba(185, 150, 90, .18)" },
      { backgroundColor: "transparent" },
    ], { duration: 1200, easing: "ease-out" });
  }

  return <div className="hotel-arrival-content">
    <nav className="hotel-faq-shortcuts" aria-label="Arrival information shortcuts">
      {shortcuts.map(({ label, index, icon: Icon }) => <a key={label} href={`#${id}-question-${index}`} onClick={event => openQuestion(event, index)}><Icon size={21} aria-hidden="true" />{label}</a>)}
    </nav>
    <div className="hotel-faq-list">
      {entries.map(([question, answer], index) => {
        const Icon = questionIcons[index] ?? Headphones;
        return <details key={`${question}-${index}`} id={`${id}-question-${index}`} ref={element => { rows.current[index] = element; }}>
          <summary id={`${id}-label-${index}`}>
            <span className="hotel-faq-icon"><Icon size={25} strokeWidth={1.5} aria-hidden="true" /></span>
            <span>{question}</span>
            <Plus className="hotel-faq-toggle" size={22} strokeWidth={1.6} aria-hidden="true" />
          </summary>
          <div className="hotel-faq-answer" role="region" aria-labelledby={`${id}-label-${index}`}><p>{answer}</p></div>
        </details>;
      })}
    </div>
    <aside className="hotel-faq-support" aria-labelledby={`${id}-support-title`}>
      <Headphones className="hotel-faq-support-icon" size={36} strokeWidth={1.5} aria-hidden="true" />
      <div className="hotel-faq-support-copy"><h3 id={`${id}-support-title`}>Need something else?</h3><p>Our Front Desk can help with arrival, booking or accessibility requests.</p></div>
      <div className="hotel-faq-support-actions">
        <a className="hotel-faq-primary" href={`tel:${contact.phone.replace(/[^+0-9]/g, "")}`}><Phone size={17} aria-hidden="true" />Contact Front Desk</a>
        <a href={`mailto:${contact.email}`}><Mail size={18} aria-hidden="true" />Email us</a>
      </div>
    </aside>
  </div>;
}

export function HotelArrivalDecoration() {
  return <>
    <span className="hotel-arrival-botanical" aria-hidden="true" />
    <span className="hotel-arrival-arch" aria-hidden="true" />
    <svg className="hotel-arrival-waves" viewBox="0 0 1600 100" preserveAspectRatio="none" aria-hidden="true"><path d="M-40 40C190-60 270 115 600 77S930-5 1110 65S1410-10 1640 65" /><path d="M-40 65C190-45 285 95 600 89S920 8 1120 66S1420 90 1640 18" /></svg>
  </>;
}

export function HotelArrivalDivider() {
  return <span className="hotel-arrival-divider" aria-hidden="true"><Sprout size={28} strokeWidth={1.5} /></span>;
}
