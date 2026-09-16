"use client";

import { ArrowRight } from "lucide-react";
import { CHOOSE_DATES_EVENT } from "./availability-guide";

/**
 * Browse-card CTA for rooms with no availability search yet. Looks and
 * degrades exactly like the anchor it replaces (no-JS still jumps to
 * #book-form); with JS it asks AvailabilityGuide for the smooth scroll, glow,
 * helper, and smart focus instead. Never books, never checks in.
 */
export function ChooseDatesButton() {
  return (
    <a
      className="btn btn-accent"
      href="#book-form"
      onClick={(event) => {
        event.preventDefault();
        window.dispatchEvent(new CustomEvent(CHOOSE_DATES_EVENT));
      }}
    >
      Choose dates <ArrowRight size={16} aria-hidden="true" />
    </a>
  );
}
