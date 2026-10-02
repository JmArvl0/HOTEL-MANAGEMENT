# 2026-10-03 — Loyalty redemption block redesigned (guest My Reservations → Rate & folio)

## Context

Reported: the loyalty block on the guest reservation detail page looks "messy".
`LoyaltyRedemptionSelector` is rendered from `components/customer/reservation-detail-view.tsx:345`
inside the **Rate & folio** panel of `/my-reservations/[id]`.

## Root cause — the block had no stylesheet at all

The widget's root class is `.loyalty-redeem`, and a repo-wide grep across every `*.css`
returned **zero** hits. Inside an otherwise tightly-typeset card it therefore rendered as raw
browser defaults: an unstyled native range slider, a number input with spinner arrows, an
inline `<label>`, and a default-size `<p>`. Nothing was broken in logic — it had never been
designed.

## Chosen shape (user-selected)

Keep **both** existing input methods (drag the slider **or** type a number) and add a
**"Use max"** shortcut plus a live credit preview. Nothing the guest could do before was removed.

## Component — `components/booking/loyalty-redemption-selector.tsx`

- `<div aria-label>` → `<section aria-labelledby>` with an icon chip (`Coins`), an `<h3>`, and the
  rate line. The rate now comes from `POINTS_TO_PESO` (`@/lib/loyalty`) rendered through
  `formatPeso` (`@/lib/format`) instead of a hardcoded prose literal, so a rate change reaches
  the copy and the preview together.
- Two figures — **Available** and **Max for this folio** — over a 2-up grid in the
  `.crd-folio-figures` idiom. Deliberately **not** a `<dl>`: `guest-booking.css` styles
  `.customer-reservation-detail .customer-detail-card dl>div` (flex row, 42px min-height,
  9px dt/dd) and would have restyled the figures.
- The range keeps `id="loyalty-redeem-amount"` and its real `<label htmlFor>`, so the existing
  label binding survives. A "Use max" pill sits on the label row (disabled once
  `applied >= max`).
- The number input moved out of its wrapping `<label>` into a bordered field with its own
  `.sr-only` `<label htmlFor>` — the wrapping label's accessible name had concatenated the
  `pts` suffix ("…exact amountpts"). The duplicate `aria-label="Points to apply"` on the number
  input is gone; each control now has a distinct name.
- A live `aria-live="polite"` line reads *"Removes ₱N from your balance."* (or a prompt at 0).
- Errors keep `role="alert"` and still render the server's text verbatim.

**Preserved exactly** — the `max = Math.min(points, Math.floor(folioBalance))` cap, the
`crypto.randomUUID()` idempotency key, the POST to `/api/account/loyalty/redeem`,
`window.location.reload()` on success, and the early `null` return.

## Why the cap must not be relaxed

`redeem_loyalty_points` (`supabase/migrations/20261015010000_guest_loyalty_submodule.sql`) sets
`v_amount := least(p_points::numeric, round(i.amount,2))` but **debits the full `p_points`
regardless**. Sending more points than the folio owes silently burns the difference — the only
guard is the widget's `max`. The duplicate guard is idempotency-key-only (not
once-per-reservation), and the reservation must be `pending|confirmed|checked_in`.

## CSS — `app/customer-portal.css`

A new `.loyalty-redeem*` block inside the existing Guest Rewards section (after the
`loyaltyShimmer` keyframes), plus stacking rules in the `@media(max-width:680px)` block and a
`transition:none` line in the `prefers-reduced-motion` block.

- Tokens only — `--cp-panel`, `--cp-panel-2`, `--cp-line`, `--cp-text`, `--cp-muted`,
  `--cp-green`, `--cp-accent`, `--cp-card-radius`, and `--st-neg-*` for the error. Those flip in
  the `:root` / `.theme-light` blocks at the top of the same file, so both themes are covered
  with no new colour and no hardcoded hex. `--cp-panel-2` for the panel with `--cp-panel` chips
  inside it matches `.crd-activity-group`.
- Range restyled with `appearance:none` + `::-webkit-slider-runnable-track/-thumb` and
  `::-moz-range-track/-thumb` (the Moz thumb is 14px so its 2px border lands at 18px); explicit
  `:focus-visible` rings on the range, the pill, and the field via `:focus-within`.
- Number spinners hidden (`appearance:textfield` + the webkit spin-button pseudo-elements) —
  still typeable and arrow-key adjustable; the slider is the primary control.
- `customer-portal.css` is imported **after** `guest-booking.css` in `app/layout.tsx`, so these
  rules win any equal-specificity tie with the detail-card base styles.
- Every selector is prefixed `.loyalty-redeem` ([[D-029]] — these stylesheets are global).
  `.sr-only` is re-declared namespaced rather than relying on `haven-loader.css`, which is only
  imported by the loader component.

## Tests

- **New** `components/booking/loyalty-redemption-selector.test.tsx` (5 jsdom cases): the cap is
  the folio balance, not the points balance (both inputs' `max` included); **Use max** fills both
  inputs, previews ₱1,800, and disables itself; applying POSTs
  `{reservationId, points: 1800, idempotencyKey}` and reloads; hidden at 0 points or a settled
  folio; a refusal surfaces through `role="alert"` with no reload. `fetch`, `crypto.randomUUID`
  and `window.location.reload` are stubbed.
- `lib/loyalty.test.ts` — the widget contract no longer pins the prose literal `1 point = ₱1`;
  it now pins `POINTS_TO_PESO` and the `Redeem rewards points` heading, so the rate lives in one
  place.

## Deploy (2026-10-03)

- **Committed** as `febfc54` with a **pathspec commit** (`git commit -- <paths>`) — exactly the
  6 files below. The parallel session's staged work (`app/api/account/profile/route.ts`,
  `lib/customer.ts`, `lib/manager-attention.*`, `lib/cancelled-folio-consistency.test.ts`) was
  left staged and untouched, and its untracked files (`lib/request-batches.ts`,
  `lib/housekeeping-queue.ts`) were not added.
- **Pushed** `ecc0633..febfc54` to `origin/main` (`git ls-remote` confirms `febfc54`).
- **Deployment proven live, not assumed.** The production alias is
  `haven-hotel-management-ten.vercel.app` (found in the OpenCode session note
  [[2026-10-02 - Guest Registration 500 Loyalty Default]]). Method: the app-router CSS chunks
  are content-hashed and `app/layout.tsx` imports `customer-portal.css` globally, so the root
  CSS chunk is publicly fetchable.
  - Before push: portal chunk `3ck2-y394gzxr.css`, sha256 `7f1b210ce548112b…`, **zero**
    `loyalty-redeem` matches.
  - ~60 s after the push: the chunk became `1k_zs0e1djhi-.css` and **contains `.loyalty-redeem`**.
  - This also proves the GitHub → Vercel integration auto-deploys pushes to `main`, which is the
    same mechanism that carried the earlier payment-settings fix.

## Unresolved / next

- Authenticated browser QA pending ([[KI-005]], needs a guest login with an unpaid folio):
  My Reservations → reservation → **Rate & folio**, in dark and light theme and at 390px;
  keyboard-only pass (Tab to the slider, arrow keys adjust, **Use max**, Apply) — the balance
  should drop by exactly the peso amount and the reloaded page show the new balance. Confirm the
  Guest Rewards page is unchanged.
- No API, RPC, or database change.

## Verification

- `npm run typecheck` — clean.
- Targeted: `npx vitest run components/booking/loyalty-redemption-selector.test.tsx lib/loyalty.test.ts`
  — 2 files / 21 tests passed.
- Full `npx vitest run` — 176 files / 1973 tests, **1 failing**: `lib/password-reset-audit.test.ts`
  (pre-existing CRLF assertion, [[KI-012]], unrelated and unmodified).
- `npm run build` — clean, all routes generated.
- Deployed to production and confirmed by the chunk-hash change above.
