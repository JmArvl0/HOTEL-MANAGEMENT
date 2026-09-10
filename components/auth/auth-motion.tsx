"use client";

import { useEffect } from "react";

/**
 * AuthMotion — the auth pages' single authored motion moment.
 *
 * POLICY (docs/ui-motion-guidelines.md): auth-motion.tsx and landing-motion.tsx
 * are the only files that may import GSAP, both dynamically inside useEffect so
 * the library is code-split into their route chunks and never enters operational
 * bundles.
 *
 * Contract (mirrors landing-motion.tsx):
 * - No static CSS hides anything: SSR/no-JS HTML is fully visible. gsap.set()
 *   applies initial states only when it can also run the reveal.
 * - prefers-reduced-motion: the whole sequence is skipped — content is simply there.
 * - One gsap.context; ctx.revert() in cleanup restores every style GSAP touched.
 *
 * Sequence (~1s total, staggered — never simultaneous):
 * scene statement → glass card → tabs/head → fields/chips.
 */
export function AuthMotion() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let ctx: { revert: () => void } | undefined;
    let cancelled = false;

    void (async () => {
      const { gsap } = await import("gsap");
      if (cancelled) return;

      ctx = gsap.context(() => {
        gsap.set(".haven-vault__statement", { autoAlpha: 0, y: 24 });
        gsap.set(".haven-vault__card", { autoAlpha: 0, y: 28, scale: 0.98 });
        gsap.set([".haven-vault__tabs", ".haven-vault__head"], { autoAlpha: 0, y: 14 });
        gsap.set(
          ".haven-vault__field, .haven-vault__submit, .haven-vault__foot, .haven-vault__trust, .haven-vault__security",
          { autoAlpha: 0, y: 12 },
        );

        const tl = gsap.timeline({ defaults: { ease: "power3.out", duration: 0.7 } });
        tl.to(".haven-vault__statement", { autoAlpha: 1, y: 0, duration: 0.6 }, 0.1)
          .to(".haven-vault__card", { autoAlpha: 1, y: 0, scale: 1, duration: 0.85 }, 0.2)
          .to(".haven-vault__tabs", { autoAlpha: 1, y: 0, duration: 0.5 }, 0.55)
          .to(".haven-vault__head", { autoAlpha: 1, y: 0, duration: 0.5 }, 0.6)
          .to(
            ".haven-vault__field, .haven-vault__submit, .haven-vault__foot, .haven-vault__trust, .haven-vault__security",
            { autoAlpha: 1, y: 0, stagger: 0.05, duration: 0.5 },
            0.68,
          );
      });
    })();

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  return null;
}
