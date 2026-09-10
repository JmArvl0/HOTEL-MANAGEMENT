"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Reveal — the one shared entrance component for booking/portal/staff sections.
 * IntersectionObserver + CSS only (no GSAP; GSAP is landing-only by policy).
 *
 * Contract:
 * - Content is fully visible when JS never runs or IO is unsupported —
 *   the hidden state is applied by JS (inline styles), never by static CSS.
 * - Respects prefers-reduced-motion: no transform, opacity-only, immediate.
 * - Reveals once; unobserves after.
 */

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** Stagger children of this element instead of the element itself. */
  stagger?: boolean;
  /** Direction of travel; default "up". */
  direction?: "up" | "none";
  delayMs?: number;
  as?: "div" | "section" | "ul" | "header" | "article";
};

const TRAVEL_PX = 24;
const DURATION_MS = 360; // relaxed — see lib/motion/motion-config.ts
const EASING = "cubic-bezier(0.22, 1, 0.36, 1)"; // premiumCss

export function Reveal({
  children,
  className,
  stagger,
  direction = "up",
  delayMs = 0,
  as: Tag = "div",
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const targets: HTMLElement[] = stagger
      ? Array.from(el.children) as HTMLElement[]
      : [el];

    // Everything visible unless JS can orchestrate — the no-JS guarantee.
    if (!("IntersectionObserver" in window)) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    targets.forEach((t, i) => {
      t.style.transition = "none";
      t.style.opacity = "0";
      t.style.transform = !reduced && direction === "up" ? `translateY(${TRAVEL_PX}px)` : "";
      // force a style flush so the entry transition actually runs
      void t.offsetHeight;
      t.style.transition = `opacity ${DURATION_MS}ms ease-out, transform ${DURATION_MS}ms ${EASING}`;
      t.style.transitionDelay = `${delayMs + (stagger ? Math.min(i, 8) * 60 : 0)}ms`;
    });

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          targets.forEach((t) => {
            t.style.opacity = "1";
            t.style.transform = "";
          });
          io.disconnect();
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.05 },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      targets.forEach((t) => {
        t.style.transition = "";
        t.style.opacity = "";
        t.style.transform = "";
      });
    };
  }, [stagger, direction, delayMs]);

  return (
    <Tag
      ref={ref as never}
      className={className}
      data-reveal={stagger ? "stagger" : "single"}
      data-reveal-direction={direction}
    >
      {children}
    </Tag>
  );
}
