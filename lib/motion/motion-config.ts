/**
 * HAVEN motion tokens — the single source for durations and easings.
 * See docs/ui-motion-guidelines.md for the area intensity matrix.
 *
 * Categories:
 *   FAST      120–180ms  operational feedback (toasts, badges, rows)
 *   STANDARD  180–260ms  shared UI (modals, accordions, page fades)
 *   RELAXED   300–450ms  guest-facing reveals, drawer content
 *   CINEMATIC 600–1200ms LANDING PAGE ONLY (hero sequence, section storytelling)
 */

export type MotionCategory = "fast" | "standard" | "relaxed" | "cinematic";

export const MOTION_DURATION: Record<MotionCategory, number> = {
  fast: 160,
  standard: 220,
  relaxed: 360,
  cinematic: 900,
} as const;

/** CSS variable names usable in stylesheets (values set here as custom props). */
export const MOTION_CSS_VARS = {
  "--motion-fast": `${MOTION_DURATION.fast}ms`,
  "--motion-standard": `${MOTION_DURATION.standard}ms`,
  "--motion-relaxed": `${MOTION_DURATION.relaxed}ms`,
  "--motion-cinematic": `${MOTION_DURATION.cinematic}ms`,
} as const;

/**
 * Easing set — GSAP named easings, mirrored as CSS cubic-bezier equivalents
 * where a rule needs a non-GSAP transition. Do not invent per-component easings.
 */
export const MOTION_EASING = {
  /** Operational standard: plain deceleration. */
  standard: "ease-out" as const,
  standardCss: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  /** Premium reveal (landing sections, card stagger). */
  premium: "power3.out" as const,
  premiumCss: "cubic-bezier(0.22, 1, 0.36, 1)",
  /** Cinematic hero / masked line reveals — landing only. */
  cinematic: "power4.out" as const,
  cinematicCss: "cubic-bezier(0.16, 1, 0.3, 1)",
} as const;

/** Reveal travel distances — small, never theatrical outside the landing hero. */
export const MOTION_TRAVEL = {
  micro: 6, // px — operational pop (toast, popover)
  standard: 12, // px — reveals, card lifts
  relaxed: 24, // px — portal/booking sections
} as const;
