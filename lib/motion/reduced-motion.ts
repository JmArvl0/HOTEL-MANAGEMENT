"use client";

import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * React hook — true when the user prefers reduced motion. SSR-safe: returns
 * false on the server and during the first client render, then corrects after
 * mount (React 18 hydration-safe: never animates on the server paint).
 *
 * Under reduced motion the HAVEN contract is: no parallax, no scroll-linked
 * effects, no GSAP timelines — content is simply visible. The global CSS
 * kill-switch in app/design-tokens.css remains the safety net for CSS.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // jsdom and very old browsers have no matchMedia — treat as motion-allowed.
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(QUERY);
    setReduced(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/** Plain check for non-React call sites; false when unavailable. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}
