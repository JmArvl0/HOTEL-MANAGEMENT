# HAVEN UI Motion Guidelines

Area-based motion policy. Two personalities, one system: the **public/marketing side is
cinematic**, the **operational side is fast and predictable**. Intensity is budgeted per
area — adding motion means spending that budget, not raising it.

Governance: this document is the authority for motion decisions. `SYSTEM.md` §16 links it.
`lib/motion/motion-config.ts` is the code-side token source.

## 1. Area intensity matrix

| Area | Intensity | Rule |
|---|---|---|
| Landing (public) | **8/10** | Expressive. GSAP hero sequence, scroll scrub, staggered reveals, hover polish. |
| Auth (login / register) | **5/10** | One GSAP entrance on load: statement → glass card → tabs/head → fields, single play, skipped entirely under reduced-motion. No scroll motion. |
| Booking flow | **4/10** | Very limited. CSS-only step fade (~200ms), instant controls. No GSAP. |
| Customer portal | **3/10** | Minimal. Section reveals via `Reveal` (IntersectionObserver), existing `havenPopIn` micro-interactions. |
| Front Desk | **2/10** | Avoid. Existing CSS micro-interactions only; nothing new by default. |
| Manager | **2–3/10** | Mostly avoid. Charts animate via Recharts defaults; no new decoration. |
| Accounting | **2/10** | Avoid. Same as Front Desk — data density over polish. |
| Predictive Insights | **3/10** | Recharts primary. Chart draw-in respects reduced-motion; no flying charts. |
| HAVEN AI panel | **3/10** | Light polish. Turn fade-in (`havenPopIn` .18s), chip hover transition. No typing animation, no AI-glow. |
| Housekeeping / Maintenance | **1–2/10** | Effectively none. Instant state changes; CSS color/badge transitions only. |

Audit outcome (2026-09-09): Front Desk, Accounting, Housekeeping and Maintenance were
already compliant at their target intensities — no code changes were made there.

## 2. Tool ownership

| Tool | Where it may run | Notes |
|---|---|---|
| **GSAP** (timeline; ScrollTrigger landing-only) | Landing page + auth pages | Imported dynamically inside `useEffect` by `components/landing/landing-motion.tsx` and `components/auth/auth-motion.tsx` — the only two importers in the repo. Never appears in operational bundles. |
| **Aceternity patterns** | Public/marketing surfaces only | No Aceternity package installed. Patterns are hand-adapted into the coastal design system when a specific effect is needed. Do not install the package. |
| **Recharts** | Wherever data viz exists | Single chart system (with the `AccessibleChart` a11y wrapper). No Tremor (user decision 2026-09-09 — Recharts covers Manager/Accounting/Predictive). |
| **HAVEN CSS** | Everywhere | Identity layer. `havenPopIn` keyframes (`app/responsive.css:148`), coastal tokens, hover micro-interactions. The default answer. |

Hard bans: no Tailwind, no shadcn/ui, no smooth-scroll frameworks, no scroll hijacking,
no typing animations that delay content, no decorative glow.

## 3. Motion tokens

Single source: `lib/motion/motion-config.ts` (also exported as CSS vars).

| Token | Duration | Use |
|---|---|---|
| `FAST` | 120–180ms | Operational feedback: toasts, badges, rows, AI turn fade-in. |
| `STANDARD` | 180–260ms | Shared UI: modals, accordions, booking step fades. |
| `RELAXED` | 300–450ms | Guest-facing reveals, drawer content. |
| `CINEMATIC` | 600–1200ms | **Landing hero + auth entrance only** — load sequences, storytelling sections. |

Easing set (three, no per-component inventions):

- `standard` — `ease-out` (CSS) — operational default.
- `premium` — `power3.out` / `cubic-bezier(.22,1,.36,1)` — reveals, card staggers.
- `cinematic` — `power4.out` / `cubic-bezier(.16,1,.3,1)` — landing hero only.

Travel restraint: 6px (micro) / 12px (standard) / 24px (relaxed). Nothing outside the
landing hero travels further.

## 4. Reduced-motion contract

1. **Content never depends on animation.** Initial hidden states are applied by JS
   (`gsap.set` / inline styles) at the moment the reveal is also scheduled — never by
   static CSS. SSR and no-JS HTML is fully visible.
2. **`prefers-reduced-motion: reduce` skips entire timelines**, not just slows them:
   `LandingMotion` returns early; Recharts draw-in is off (`isAnimationActive: false`
   via `usePrefersReducedMotion()`); parallax and scrub do not run.
3. **CSS safety net:** the global kill-switch in `app/design-tokens.css` (~line 688)
   forces all CSS animations/transitions to `0.01ms !important`; landing has its own
   block in `app/(landing-page)/landing.css`.

Use `usePrefersReducedMotion()` from `lib/motion/reduced-motion.ts` in any client
component that animates.

## 5. Bundle rules

- GSAP is a landing/auth-chunk-only dependency. The two import sites are
  `components/landing/landing-motion.tsx` and `components/auth/auth-motion.tsx`, both using
  `await import("gsap")` inside `useEffect` — code-split, never server-rendered, never in
  operational routes.
- No motion library may be added to `components/ui`, `components/manager`,
  `components/front-desk`, or staff areas. Shared motion code is CSS or the tiny
  `Reveal` component (`components/motion/Reveal.tsx`, IntersectionObserver, no library).
- Adding a new animation library requires a user decision first (see the Tremor and
  GSAP decisions of 2026-09-09 for the pattern).

## 6. Standard patterns

- **Modal:** backdrop 150–200ms, panel 180–240ms, no bounce — `components/ui/Modal.tsx`
  already conforms; do not fork it.
- **Entrance fade:** reuse `havenPopIn` keyframes (`.18s ease-out`) — used by booking
  popovers and the HAVEN AI turn fade-in.
- **Scroll reveal (non-landing):** `<Reveal>` component — observes, fades once,
  restores styles on unmount.
- **Hero sequence (landing):** staggered load order image → eyebrow → headline → copy →
  CTAs → booking widget → scroll cue; scroll reframe via scrub only, no pinning. The
  `.coast-hero-media` wrapper is the single scale owner (image + wash zoom as one
  composited layer, clipped by `.coast-hero`'s `overflow:hidden`) — never animate the
  bare image or wash independently.
- **Hover:** micro-interactions from DESIGN.md §7 (150–300ms); landing room cards get a
  restrained lift + image scale + arrow nudge.

## 7. Data honesty

No fake analytics. Numbers shown are either real (computed by HAVEN's own models) or
clearly labeled as illustrative — the landing "Smarter hospitality" teaser uses static
illustrative tiles with an explicit caption, and no public API call (the insights
endpoint is staff-only).
