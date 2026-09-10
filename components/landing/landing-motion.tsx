"use client";

import { useEffect } from "react";

/**
 * LandingMotion — orchestrates the landing page's cinematic sequence.
 *
 * POLICY (docs/ui-motion-guidelines.md): this is the ONLY file in the repo
 * that may import GSAP, and it does so dynamically inside useEffect so the
 * library is code-split into the landing chunk and never enters operational
 * bundles.
 *
 * Contract:
 * - No static CSS hides anything: SSR/no-JS HTML is fully visible. GSAP
 *   gsap.set() applies initial states only when it can also run the reveal.
 * - prefers-reduced-motion: the whole timeline is skipped — content is
 *   simply there. (The CSS kill-switch in design-tokens.css is the net.)
 * - No scroll hijacking: ScrollTrigger is used with `scrub` for the hero
 *   reframe only; normal scrolling, keyboard and anchors are untouched.
 *
 * Sequencing (hero, ~1.2s total, staggered — never simultaneous):
 * image scale 1.05→1 → eyebrow → headline → lead → copy → text link →
 * booking widget → scroll cue last.
 */

export function LandingMotion() {
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    let ctx: { revert: () => void } | undefined;
    let cancelled = false;

    void (async () => {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelled) return;

      gsap.registerPlugin(ScrollTrigger);

      // ponytail: one gsap.context instead of per-element bookkeeping —
      // ctx.revert() in cleanup restores every style GSAP touched.
      ctx = gsap.context(() => {
        // ---- Hero load sequence -------------------------------------------------
        // The media wrapper (not the bare image) is the scale owner, so the
        // image and wash zoom as one composited layer.
        const heroMedia = ".coast-hero-media";
        const heroParts = [
          ".coast-hero .coast-eyebrow",
          ".coast-hero h1",
          ".coast-hero .coast-hero-lead",
          ".coast-hero .coast-hero-copy > p:not(.coast-hero-lead, .coast-eyebrow)",
          ".coast-hero .coast-text-link",
        ];

        gsap.set(heroMedia, { scale: 1.05 });
        gsap.set(heroParts, { autoAlpha: 0, y: 22 });
        gsap.set(".coast-hero-note", { autoAlpha: 0 });
        gsap.set(".coast-book", { autoAlpha: 0, y: 30 });
        gsap.set(".coast-scroll-cue", { autoAlpha: 0 });

        const tl = gsap.timeline({
          defaults: { ease: "power4.out", duration: 0.9 },
        });
        tl.to(heroMedia, { scale: 1, duration: 1.2, ease: "power3.out" }, 0)
          .to(".coast-hero .coast-eyebrow", { autoAlpha: 1, y: 0, duration: 0.6 }, 0.15)
          .to(".coast-hero h1", { autoAlpha: 1, y: 0, duration: 0.75 }, 0.3)
          .to(".coast-hero .coast-hero-lead", { autoAlpha: 1, y: 0, duration: 0.7 }, 0.45)
          .to(
            ".coast-hero .coast-hero-copy > p:not(.coast-hero-lead, .coast-eyebrow)",
            { autoAlpha: 1, y: 0, duration: 0.7 },
            0.58,
          )
          .to(".coast-hero .coast-text-link", { autoAlpha: 1, y: 0, duration: 0.6 }, 0.72)
          .to(".coast-book", { autoAlpha: 1, y: 0, duration: 0.8 }, 0.85)
          .to(".coast-hero-note", { autoAlpha: 1, duration: 0.9 }, 1.0)
          .to(".coast-scroll-cue", { autoAlpha: 1, duration: 0.5 }, 1.15);

        // ---- Scroll: hero reframe (scrub, no pinning, no hijack) ---------------
        // fromTo + immediateRender:false: the scrub must not capture its start
        // value while the load timeline is still at scale 1.05, or the hero
        // keeps a stale zoom once you scroll back to the top.
        gsap.fromTo(
          heroMedia,
          { scale: 1 },
          {
            scale: 1.12,
            ease: "none",
            immediateRender: false,
            scrollTrigger: {
              trigger: ".coast-hero",
              start: "top top",
              end: "bottom top",
              scrub: true,
            },
          },
        );
        gsap.to(".coast-hero-copy", {
          y: -40,
          autoAlpha: 0.15,
          ease: "none",
          scrollTrigger: {
            trigger: ".coast-hero",
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        });

        // ---- Section reveals (room cards, sections, gallery) -------------------
        const sectionHeads = [
          ".coast-section .coast-section-heading",
          ".coast-portal > div",
          ".coast-arrival",
          ".coast-care",
          ".coast-contact > div",
          ".coast-faq > div",
        ];
        sectionHeads.forEach((sel) => {
          gsap.from(sel, {
            autoAlpha: 0,
            y: 28,
            duration: 0.8,
            ease: "power3.out",
            scrollTrigger: { trigger: sel, start: "top 88%", once: true },
          });
        });

        // Reveal the grid as one unit so cards remain aligned while scrolling.
        gsap.from(".coast-room-grid", {
          autoAlpha: 0,
          y: 24,
          duration: 0.8,
          ease: "power3.out",
          scrollTrigger: { trigger: ".coast-room-grid", start: "top 88%", once: true },
        });

        // Amenity list items: subtle stagger
        gsap.from(".coast-amenities li", {
          autoAlpha: 0,
          y: 18,
          duration: 0.6,
          ease: "power3.out",
          stagger: 0.06,
          scrollTrigger: { trigger: ".coast-amenities ul", start: "top 88%", once: true },
        });

        // Gallery story image: slight parallax inside its frame
        gsap.fromTo(
          ".coast-story img",
          { yPercent: -6 },
          {
            yPercent: 6,
            ease: "none",
            scrollTrigger: {
              trigger: ".coast-story",
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          },
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
