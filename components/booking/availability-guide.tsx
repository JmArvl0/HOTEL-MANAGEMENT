"use client";

import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/lib/motion/reduced-motion";

/** Fired by ChooseDatesButton; AvailabilityGuide performs the scroll + glow + focus. */
export const CHOOSE_DATES_EVENT = "haven:choose-dates";

/** One gentle pulse, then back to normal — guidance, not an error. */
const GUIDE_MS = 1800;

/**
 * Wrapper around a Check Availability form. Listens for Choose-dates clicks,
 * then smooth-scrolls itself into view (below the sticky header via
 * scroll-margin-top), glows once, shows a short helper line, and focuses the
 * next required control. Idle output is identical to the plain container it
 * replaces, so View Details, the photo viewer, and normal date edits never
 * trigger it.
 */
export function AvailabilityGuide({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const reduced = usePrefersReducedMotion();
  const [guided, setGuided] = useState(false);

  useEffect(() => {
    const onChooseDates = () => {
      const el = root.current;
      if (!el) return;
      el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
      setGuided(true);
      const checkIn = el.querySelector<HTMLInputElement>('input[name="checkIn"]');
      const checkOut = el.querySelector<HTMLInputElement>('input[name="checkOut"]');
      const guests = el.querySelector<HTMLSelectElement>('select[name="guests"]');
      const submit = el.querySelector<HTMLButtonElement>('button[type="submit"]');
      const guestsValid = guests && Number(guests.value) >= 1 && Number(guests.value) <= 8;
      const target = !checkIn?.value ? checkIn : !checkOut?.value ? checkOut : !guestsValid ? guests : submit;
      target?.focus({ preventScroll: true });
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setGuided(false);
        timer.current = null;
      }, GUIDE_MS);
    };
    window.addEventListener(CHOOSE_DATES_EVENT, onChooseDates);
    return () => {
      window.removeEventListener(CHOOSE_DATES_EVENT, onChooseDates);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [reduced]);

  const cls = `${className ?? ""}${guided ? (reduced ? " is-guided-static" : " is-guided") : ""}`.trim();
  return (
    <div ref={root} id={id} className={cls || undefined}>
      {guided && (
        <p className="availability-hint" role="status">
          Choose your stay dates and guests, then check availability.
        </p>
      )}
      {children}
    </div>
  );
}
