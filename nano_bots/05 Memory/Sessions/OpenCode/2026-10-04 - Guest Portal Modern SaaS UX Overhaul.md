# 2026-10-04 - Guest Portal Modern SaaS UX Overhaul

## Intent
Deliver a comprehensive, taste-driven modern SaaS enhancement (benchmarked against Finwise) across the entire Haven customer portal and all of its modules (Overview/Home, My Reservations, Reservation Details, Payments & Folio, Receipts, Guest Requests, Transportation, Loyalty & Rewards, Notifications, Profile, and Settings).

## What Changed
1. **Customer Portal Tokens & Surfaces (`app/customer-portal.css`):**
   - Elevated root tokens in both dark and light modes with refined Finwise elevation shadows (`--cp-shadow`, `--cp-shadow-hover`) and FleetOps neutral color scales (`#111827`, `#d1d5db`, `#f3f3f3`, `#ffffff`).
   - Redesigned `.theme-light .customer-shell .customer-page-title` to eliminate the dark-box-in-light-mode glitch, introducing a crisp white card surface, hairline slate border, amber pill eyebrow, balanced title typography, and purpose-driven buttons.
   - Overhauled `.customer-stay-hero` with a 240px wide aspect-ratio room thumbnail, subtle scale on hover, glass status badge cluster, 26px–32px tabular typography, and dual Midnight Ink CTA & QR access buttons.
   - Redesigned `.customer-attention` warning/action cards with soft amber backgrounds, subtle borders, and smooth arrow hover micro-slides.
   - Overhauled `.customer-overview-grid` metric cards with 40px icon containers, uppercase tracked eyebrows, 24px tabular figures, and clean key-value rows.
   - Modernized `.customer-quick-actions` to a 4-column Finwise card grid with hover lift and micro-interactions.
   - Modernized `.folio-kpi-grid` and `.folio-kpi-card` with clean icon boxes, large tabular totals, and status indicators.
   - Refined `.crd-stepper`, `.crd-tabs`, `.crd-folio-strip`, `.customer-reservation-card`, `.customer-profile-card`, and shared table grammar.
2. **Module Consistency:**
   - Standardized `transportation/page.tsx` with shared `customer-page-title` hierarchy.
   - Enhanced `components/account/account-security-dialog.test.tsx` with a `stubStorage` helper to resolve Node 22 jsdom `localStorage` environment warning/failure.

## Verification
- `npm run typecheck` (`tsc --noEmit`): 0 errors.
- `npm run build`: Compiled all 88 dynamic and static routes cleanly.
- `npm test`: **182/182 test files passed, 2,034/2,034 tests passed** (100% green).
