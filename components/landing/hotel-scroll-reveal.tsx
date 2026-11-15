"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { MOTION_DURATION, MOTION_EASING, MOTION_TRAVEL } from "@/lib/motion/motion-config";
import { usePrefersReducedMotion } from "@/lib/motion/reduced-motion";

// Keep the hero immediately readable and let Gallery own its existing entrance.
// Observe content within sections so fixed-height layouts and dialogs stay put.
const TARGETS = [
  "#stay > header",
  "#stay .coast-room",
  "#stay .coast-catalog-empty",
  "#amenities > header",
  "#amenities .hotel-amenities-layout",
  "#reviews > header",
  "#reviews .coast-review-card",
  ".location-heading",
  ".location-main-grid",
  ".location-nearby-grid",
  ".location-guide-actions",
  "#contact > header",
  "#contact .hotel-contact-layout",
  "#faq > header",
  "#faq .hotel-arrival-content",
  ".hotel-closing > h2",
  ".hotel-closing > .hotel-actions",
].join(", ");

export function HotelScrollReveal({ children }: { children: ReactNode }) {
  const root = useRef<HTMLElement>(null);
  const seen = useRef(new WeakSet<HTMLElement>());
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const container = root.current;
    if (!container || reducedMotion || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window) || !HTMLElement.prototype.animate) return;

    const animations = new Map<HTMLElement, Animation>();
    const observed = new WeakSet<HTMLElement>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const element = entry.target as HTMLElement;
        observer.unobserve(element);
        seen.current.add(element);
        if (element.contains(document.activeElement)) continue;

        // Only hide content when its entrance can actually play. SSR, no-JS,
        // unsupported browsers and everything waiting offscreen stay visible.
        const animation = element.animate([
          { opacity: 0, translate: `0 ${MOTION_TRAVEL.micro}px` },
          { opacity: 1, translate: "0 0" },
        ], { duration: MOTION_DURATION.cinematic, easing: MOTION_EASING.premiumCss });
        animations.set(element, animation);
        animation.onfinish = animation.oncancel = () => animations.delete(element);
      }
    }, { rootMargin: "0px 0px 4% 0px", threshold: 0 });

    function observeContent() {
      container!.querySelectorAll<HTMLElement>(TARGETS).forEach(element => {
        if (seen.current.has(element) || observed.has(element)) return;
        observed.add(element);
        const bounds = element.getBoundingClientRect();
        // Preserve the current view on hydration, restored scroll and anchor loads.
        if (bounds.top < window.innerHeight) {
          seen.current.add(element);
          return;
        }
        observer.observe(element);
      });
    }

    function revealFocusedContent(event: FocusEvent) {
      if (!(event.target instanceof Node)) return;
      for (const [element, animation] of animations) {
        if (element.contains(event.target)) animation.cancel();
      }
    }

    observeContent();
    // Location may arrive through Suspense after this component has hydrated.
    const mutations = new MutationObserver(observeContent);
    mutations.observe(container, { childList: true, subtree: true });
    container.addEventListener("focusin", revealFocusedContent);

    return () => {
      observer.disconnect();
      mutations.disconnect();
      container.removeEventListener("focusin", revealFocusedContent);
      animations.forEach(animation => animation.cancel());
    };
  }, [reducedMotion]);

  return <main ref={root} className="landing coastal-landing hotel-public hotel-home">{children}</main>;
}
