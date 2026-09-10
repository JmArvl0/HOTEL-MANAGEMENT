# Current Status

Last Updated: 2026-09-11
Current Development Area: Staff dashboard UX
Current Feature: Landing hero/wash sync + Featured Stays alignment (2026-09-11 Session 04)
Current Branch: `main`
Latest Relevant Commit: `e91ee55` (TomTom-priced hotel transfers)

> ⚠ Large **uncommitted working tree** on top of that commit: the features below plus
> parallel-session work (room catalog with photos, transport booking at checkout,
> event-sourced customer notifications, QR scanner redesign). Nothing is committed yet.

## Current Objective

Coastal brand refresh and extended-family conformance are complete. The palette now spans public,
auth, booking, customer, staff, modal, QR, loader, chart, and guest-email presentation layers while
semantic status colors remain distinct. **Delivered and verified:** retired-color sweep clean,
Impeccable detector clean, typecheck and lint clean, 713/713 tests passing, build 57/57, and public
desktop/mobile browser smoke checks passing without runtime errors or horizontal overflow.

## Recently Completed

- **Landing hero/wash sync + Featured Stays alignment (Session 04, 2026-09-11)** — the
  reported regressions matched committed HEAD, but the uncommitted working tree already
  held a parallel session's complete fix (`.coast-hero-media` shared wrapper owns the GSAP
  scale, hero `overflow:hidden` clips; cards flex-column stretch with `margin-top:auto`
  price rows, single-unit grid reveal). This session verified it (curl confirmed :3000
  serves the wrapper — the report was a cached page), added `pointer-events:none` to the
  wash, pinned the architecture with `landing-hero-structure.test.tsx`, and documented the
  scale-ownership rule in `docs/ui-motion-guidelines.md` §6. All gates green (743/743);
  user-side browser TEST 1–8 pending after a hard reload. See [[2026-09-11 - Session 04]].

- **Request Types row-action arrangement (Session 03, 2026-09-11)** — the Request Types
  module's row buttons (Hide/Offer, Edit, Delete) were bare inline children of a plain
  `<td>` with no spacing or alignment. Wrapped in the standard `reservation-actions` flex
  container, right-aligned via `.rt-actions` (mirrors transportation panel), Hide/Offer
  gained Eye/EyeOff icons so all chips are equal height, Delete now uses `danger-action`,
  and the actions column header is labeled "Actions". Presentation only. All gates green
  (738/738); manual visual check pending on user side. See [[2026-09-11 - Session 03]].

- **Approved room-type exception CTA (Session 02, 2026-09-11)** — the check-in Room step's
  approved-exception notice became a prominent sage/green `role="status"` callout with the
  room type as its own element and a real `btn-accent` "Load X rooms" CTA; the active
  exception shows an "Approved exception active" summary; the alternative-request form now
  excludes the already-approved type (client-side filter) and gains a "Need a different
  room type" hint, preventing duplicate approval requests. Presentation only — approval
  rules, filtering, repricing, assignment RPC untouched. All gates green (738/738 tests,
  4 new dialog tests); manual visual check pending on user side. See
  [[2026-09-11 - Session 02]].

- **Staff sidebar dropdown responsiveness (Session 01, 2026-09-11)** — the left-navbar category
  dropdowns on `/manager_dashboard` re-rendered the whole dashboard on every click because
  `openGroups` lived at the component root. State moved into extracted `ManagerSidebarNav` /
  `AdminSidebarNav` components so a toggle re-renders only the sidebar. RBAC, localStorage keys,
  aria, CSS unchanged. All gates green (734/734 tests, 2 new jsdom interaction tests); manual
  visual check pending on user side. See [[2026-09-11 - Session 01]].

- **Booking Review — Go Back + Guest Details refinement (Session 05, 2026-09-10)** — the shared
  booking-flow Go Back pill is now a compact "Back to <previous step>" text link (label derived
  from the breadcrumb; deterministic `router.push`, never `router.back()`), and the review page's
  Guest Details switched from boxed icon tiles to a clean label/value grid. Review's back/breadcrumb/
  Edit links now carry `hold=<token>` and `/booking/details` prefills the form from that hold
  (validated: owned, active, unexpired, matching room/dates/guests), so entered guest info,
  expected arrival, preparations, and the transportation request survive the round-trip.
  Resubmission still creates a new hold. All gates green (730/730 tests); manual UI verification
  pending. See [[2026-09-10 - Session 05]].

- **Extended coastal theme conformance (Session 02, 2026-09-10)** — removed the surviving
  forest/terracotta family from booking search, shared modals, room details, QR placards, staff
  brand accents, dashboard chart colors, guest emails, and loader presentation. Preserved semantic
  success/warning/danger/payment colors. Public landing, booking, and login were browser-verified
  at desktop and mobile widths. See [[2026-09-10 - Session 02]].

- **Intent-aware room discovery (Session 01, 2026-09-10)** — landing CTAs now carry
  distinct intents into `/booking/search`: hero form → availability (dates/guests
  preserved), "View all rooms" → browse (catalog cards, no fabricated availability),
  featured card → focused mode (sort-first, scroll, "Selected from homepage" chip, never
  auto-selected; carries dates only once the guest picked them via a client intent
  context). Mode derives from the URL via `parseSearchIntent`; invalid params fall back
  to browse with a notice. Aggregate chip now counts real physical rooms. Booking
  business logic untouched. All gates green + TEST A–D browser-verified. See
  [[2026-09-10 - Session 01]] and SYSTEM.md §7.2.

- **Manager/Accounting workflow revision, D-007 (Session 05, 2026-09-09)** — audit verified the
  RPC/route/RBAC layers already enforce "Accounting owns routine financial operations; Manager
  owns exceptions"; closed the display gap: refund queue Basis badges (Within policy / Manager
  approval required / Approved exception), approvals "awaiting Accounting" chip, `lib/refund-
  workflow.test.ts` (15 scenarios), docs updated. No migration, no new flags. 701/703 suite green
  (2 pre-existing reservations-panel failures). See [[2026-09-09 - Session 05]].

- **Coastal landing + system-wide palette completion (Session 04, 2026-09-09)** —
  finished Codex's work: neutral location copy (no fictional address, per user
  ruling), retired every old forest/terracotta hex from brand layers, coastal
  dark-mode block, favicon + auth + loader + chart colors, DESIGN.md/DESIGN-STATUS
  updated, new landing component tests. See [[2026-09-09 - Session 04]].

- **Booking data-placement fixes (Session 03, 2026-09-09)** — address/nationality/
  request_options/expected_arrival now reach staff + guest surfaces; search-page copy
  made deposit-accurate ("Makati" not "Mactan Bay"). Display-layer only. See
  [[2026-09-09 - Session 03]].
- **Payment-proof upload for reservation deposits (Session 02, 2026-09-09)** — required
  proof screenshot + reference, private `payment-proofs` bucket, 60s signed URLs (guest +
  Accounting only), staged-upload→confirm with cleanup, RPC `PROOF_REQUIRED` guard, migration
  `20260921` applied and live-verified. Manual verification model untouched. See
  [[2026-09-09 - Session 02]].
- **Booking Review page layout polish (Session 05, 2026-09-09)** — cohesive review card, chips,
  finance tiles, CTA inside the card, amber hold callout with a11y-fixed announcements;
  presentation-only, booking logic untouched. See [[2026-09-09 - Session 01]].
- **Manager Reservation Oversight workspace (Session 04)** — pure attention-rule derivation
  (`lib/manager-attention.ts`), batched server decoration in `listForRole`, dedicated manager
  panel with Attention Required filter + Operational Issue badges, lifecycle timeline in the
  detail modal, Review Exception routed through the existing approval workflow. See
  [[2026-09-08 - Session 04]].
- **Check-in room-assignment exception flow** — controlled dropdowns from live inventory,
  3-gate DB validation, migration `20260919`. See [[2026-09-08 - Session 01]] and
  [[Check-in & Room Assignment]].
- **Cash-shift status color coding**, **QR scanner modal redesign (Session 03)** — both green.

## Current Work

- Extended coastal conformance delivered; public landing, booking, and authentication surfaces are
  browser-verified at desktop and mobile widths. Authenticated customer/staff light-and-dark smoke
  checks remain pending because they require live role sessions.
- Session 03 delivered and all four gates green. Manual UI verification pending (needs
  logged-in guest + staff accounts) — checklist in [[2026-09-09 - Session 03]].
- Payment-proof upload delivered (migration applied + live-verified, all gates green); manual UI
  verification pending (needs a logged-in guest + a live hold — checklist in
  [[2026-09-09 - Session 02]]).
- Booking Review polish delivered; manual UI verification pending (same constraint).
- Session 04 delivered; manual UI verification pending (needs a logged-in Manager account).

## Current Problems / Blockers

- The working tree is uncommitted — commit it before starting new work to keep history clean.
- Parallel sessions edit the same untracked tree — coordinate before committing.
- `components/manager/manager-reservations-panel.test.tsx` (untracked, pre-existing) fails 2/8
  tests deterministically in isolation — unrelated to the review-page work; needs its own fix.

## Important Active Decisions

- [[D-002 — Server-authority room eligibility]]
- [[D-003 — Structured-ID room-type exceptions]]
- [[D-004 — Exception repricing policy]]
- [[D-005 — Manager attention rules are derived, never mutating]]
- [[D-007 — Accounting handles routine financial operations]]

## Next Recommended Task

1. Manual UI verification: Accounting → Refunds (Basis badges, pending-approval hints) and
   Manager → Approvals & Escalations ("awaiting Accounting" chip) — needs logged-in accounts.
2. Fix the pre-existing `manager-reservations-panel.test.tsx` failures (2/8).
3. Commit the working tree (Session 01–05 features + parallel work).

## Relevant Documentation

- [[2026-09-08 - Session 04]]
- [[Check-in & Room Assignment]]
- [[Manager Approvals]]
- `SYSTEM.md` §6, §7.4, §7.8, §7.9, §8 (authoritative)

## Recent Sessions

- [[2026-09-11 - Session 04]] — Landing hero/wash sync + Featured Stays alignment
- [[2026-09-11 - Session 03]] — Request Types row-action arrangement
- [[2026-09-11 - Session 02]] — Approved room-type exception CTA (check-in Room step)
- [[2026-09-11 - Session 01]] — Staff sidebar dropdown responsiveness fix
- [[2026-09-10 - Session 05]] — Booking Review Go Back + Guest Details refinement
- [[2026-09-10 - Session 02]] — Extended coastal theme conformance and verification
- [[2026-09-10 - Session 01]] — Intent-aware room discovery (landing → /booking/search)
- [[2026-09-09 - Session 05]] — Manager/Accounting workflow revision (D-007)
- [[2026-09-09 - Session 04]] — Coastal landing + system-wide palette completion (Codex handoff)
- [[2026-09-09 - Session 03]] — Booking process audit + data-placement fixes
- [[2026-09-09 - Session 02]] — Payment-proof upload for reservation deposits (customer flow)
- [[2026-09-09 - Session 01]] — Booking Review page layout polish (customer flow)
- [[2026-09-08 - Session 04]] — Manager reservations oversight workspace
- [[2026-09-08 - Session 03]] — QR scanner modal UI/UX redesign
- [[2026-09-08 - Session 02]] — Obsidian memory layer created
- [[2026-09-08 - Session 01]] — room-assignment exception flow + cash-shift colors
