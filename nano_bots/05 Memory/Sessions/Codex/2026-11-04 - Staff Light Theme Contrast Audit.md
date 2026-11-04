# Staff Light Theme Contrast Audit

## Request

Audit and fix staff UI contrast defects like the supplied pagination, handover,
quick-filter, and active Guest Requests navigation screenshots.

## Changes

- Corrected light staff `--ds2` and `--dl` mappings so surfaces use paper and
  borders remain visible; this also fixes shared controls that consume those
  tokens, including handover fields and pagination buttons.
- Added light-specific data-toolbar tokens for quick-filter chips and light
  system-health surface/icon/skeleton styles.
- Changed active navigation and metric icon dark rules to test the root `html`
  theme class, keeping dark blue active states out of light mode. Added explicit
  light active-nav and pagination states.
- In Cash & Shifts, kept the count panel beside the heading while moving summary
  cards, filters, and the dense ledger to full width; the ledger table retains a
  minimum width so narrow screens can scroll horizontally instead of crushing
  its columns.

## Verification

- Live Chrome review covered all Manager navigation modules. Guest Requests and
  Reservations quick filters, active navigation, Operational Handover fields,
  populated Finance tables, and pagination are legible. Guest Management shows
  a populated `Page 1 of 3` pager; Cash & Shifts shows `Page 1 of 2` and its
  ledger is readable at full width.
- Source audit found no remaining `.app-shell:not(.theme-light)` selectors.
- `git diff --check` passed.
- `npm run typecheck` passes. No tests, database changes, or deployment changes.
