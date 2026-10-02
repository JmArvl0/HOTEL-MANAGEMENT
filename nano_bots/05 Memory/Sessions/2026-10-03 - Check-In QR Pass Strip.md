# 2026-10-03 — Digital Express Pass moved into its own strip under the hero

## Context

Reported: *"can you check the .customer-checkin-qr because the placement of the qr are messy can
replace it somewhere good"*.

The guest reservation page's hero (`components/customer/reservation-detail-view.tsx`) is a
three-column grid:

```css
.customer-reservation-heading{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:start;gap:28px}
```

The Digital Express Pass (`.customer-checkin-qr-pass-column`) was the **middle `auto` column** — a
~208px wide card holding a title block, a 176px QR board, a scan hint, the Ready pill, a full-width
button and a two-line footnote, roughly **400px tall**. So the pass set the hero's height, wedged
itself between the confirmation number and the action panel, and pushed `ReservationActions` to the
far right edge, off-axis from the room type. It read as a third competing column rather than a stay
artefact.

## Chosen shape (user-selected)

**"Pass strip below the hero."** The pass gets its own **full-width strip in the slot the *QR
expired* notice already occupies** — directly below the hero, above the folio strip. Desktop: QR
left, description middle, Ready badge + Download right. Because the expired band uses that same
slot, a live pass and an expired pass always appear in the same place on the page.

`CheckInQrExpired` / the `customer-checkin-qr-band` modifier is **untouched** — it was already a
full-width band and was not part of the complaint.

## Component — `components/customer/check-in-qr.tsx`

Children regrouped into three direct grid children; **no existing class changed**, only the
modifier, the grouping and the figure's DOM position (it now precedes the text):

- `.customer-checkin-qr-figure` — the QR board (176px board / 160px image, `width`/`height`
  attributes kept as intrinsic hints; CSS sets the rendered size)
- `.customer-checkin-qr-copy` — `.customer-checkin-qr-head` (h3 + hotel line), `-scan`, `-note`
- `.customer-checkin-qr-action` — `-status` pill + the Download button

Root is `customer-checkin-qr customer-checkin-qr-strip`. The skeleton branch took the same
three-part shape (figure tile + copy pulse lines) so the loading state does not jump when the QR
arrives. `CheckInQr`'s JSDoc was rewritten — it still said "anchored in the hero's right column".

## Placement — `reservation-detail-view.tsx`

The pass block was deleted from inside `.customer-reservation-heading` and now renders as the first
element after the hero `</section>`, ahead of `CheckInQrExpired`. The two conditional blocks in that
slot never overlap: the live pass needs `confirmed|checked_in`, `CheckInQrExpired` needs
`checked_out|terminal`. (When this was planned, `PreArrivalIdUpload` also rendered in that slot for
`confirmed && identityStatus !== "verified"`; a parallel session removed that component and its
`id-document` route mid-session, which only simplifies the slot.)

## CSS

`app/guest-booking.css`:

- `.customer-reservation-heading` → `grid-template-columns:minmax(0,1fr) auto`. The third `auto`
  track only ever held the pass; left in place it would still contribute its 28px gap and leave the
  summary short of the right edge.
- The strip itself: `grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:14px
  26px;margin:0 0 16px;text-align:left;justify-items:start`, plus left-aligned copy, a
  `max-width:78ch` note, `justify-items:end` action, and `width:auto` for the button (overriding
  the base `.customer-checkin-qr .btn{width:100%}`). `margin-bottom:16px` mirrors the band;
  `.customer-reservation-detail` is a plain block so the margins collapse to one 16px gap with the
  folio strip.
- **Deleted** both now-dead `.customer-checkin-qr-pass-column` rules (base + the `≤900px` one) and
  updated the section comment.
- `@media(max-width:900px)`: the strip collapses to today's centred pass card (1 column,
  `max-width:320px`, centred head/copy/action, full-width button).

**A cascade trap caught before it shipped:** the strip's mobile rules were first written into the
existing `@media(max-width:900px)` block at line ~377, which sits *above* the base `.customer-checkin-qr*`
block at line ~629. Equal specificity → **source order decides**, so the desktop rule would have won
on narrow screens and the mobile layout would have been dead. They now live in their own `≤900px`
media query immediately after the strip's base rule, the same shape `.customer-checkin-qr-band`
already uses. Verified in the compiled chunk, not just in source.

`app/customer-portal.css`: `.customer-shell .customer-checkin-qr-strip{padding:22px 26px}` beside the
existing `.customer-shell .customer-checkin-qr{padding:22px 18px}` — the latter is (0,2,0) and would
otherwise beat the strip. The strip keeps the `customer-checkin-qr` class, so it still inherits the
customer card radius and the portal's type floors.

## Mobile behavioural note

The card's mobile reading order is now **QR → title/hotel → scan hint → note → Ready pill →
Download**; it was title → QR → … Grouping the parts means the interleave cannot be preserved
exactly, and leading with the code is the better order for a pass. This is the one guest-visible
change on narrow screens.

## Tests — `components/customer/check-in-qr.test.tsx`

The file pinned the old placement, header comment included ("anchored inside the hero grid — never
as its own full-width section"), so both flipped:

- test 1 now asserts the heading grid contains **no** pass and that the hero's immediate sibling
  carries `customer-checkin-qr-strip` inside `.customer-reservation-detail`;
- a new case pins the three-part strip structure (figure / copy / action);
- the folio-strip case now follows the **pass strip** rather than the hero;
- the labels case (including `img` width/height `160`) and the expired-band case are unchanged.

Grep confirmed nothing else pins this layout: `lib/change-request-redesign.test.ts`,
`lib/encoding-guard.test.ts` and `lib/cancel-reservation.test.tsx` read or render the detail view but
assert only change-status copy, encoding, and refund wording.

## Verification

- `npm run typecheck` — clean.
- Targeted `npx vitest run components/customer/check-in-qr.test.tsx lib/cancel-reservation.test.tsx
  lib/change-request-redesign.test.ts lib/encoding-guard.test.ts` — 4 files / 54 tests passed.
- Full `npx vitest run` — 177 files / 1982 tests, **1 failing**: `lib/password-reset-audit.test.ts`
  (pre-existing CRLF assertion, [[KI-012]], unrelated and unmodified). +1 test over the previous 1981.
- `npm run lint` — 0 errors, 70 pre-existing warnings, none in the changed files.
- `npm run build` — clean. Compiled chunks checked: `.customer-checkin-qr-strip` ships in
  `077c05lftbmj7.css` (with the mobile rule correctly inside its `@media (max-width:900px)`) and the
  portal padding in `30i4bazo9qvf3.css`; `customer-checkin-qr-pass-column` is **gone** from both.
- No SYSTEM.md change: SYSTEM.md documents QR token semantics, never this card's layout.

## Deploy (2026-10-03)

- The working tree held several parallel workstreams, so the whole tree was committed in six
  logical commits rather than one: `9710e86` (this strip), `6a1a880` (retire the pre-arrival ID
  upload — the component + `id-document` route deleted by a parallel session), `de7eb4f`
  (terminal reservations are never an actionable folio payment state), `3a9e9eb` (pending
  reservation past its check-in date raises a Front Desk attention warning), `abc45c7` (duplicate
  guest rows no longer break a profile save), `8473496` (hoisted housekeeping queue grouping +
  batch workload counts). Pushed `c6e95e0..8473496` to `origin/main`.
- **Deployment proven live, not assumed** — the public chunk technique again (app-router CSS
  chunks are content-hashed and the portal stylesheets are imported globally in
  `app/layout.tsx`, so they are fetchable from the production alias with no credentials).
  - Before: the portal chunk was `2odo9rj1od4bl.css` (sha256 `47fb7070…`) with **0** strip rules.
  - After: `40qbpq0o-pj0p.css` (sha256 `b705cc2578c98307…`) carries **12** `customer-checkin-qr-strip`
    occurrences, the `@media (max-width:900px)` override with the strip rule **inside** it,
    `.customer-reservation-heading{grid-template-columns:minmax(0,1fr) auto;…}` (third track gone)
    and its `≤900px` single-column override — and **0** `checkin-qr-pass-column`, so the dead rules
    are gone from production too.
  - The portal-side padding shipped in a second chunk, `332v78ya5fdha.css`:
    `.customer-shell .customer-checkin-qr-strip{padding:22px 26px}`.

## Unresolved / next

- Guest browser QA pending ([[KI-005]]): confirmed + paid reservation at 1440px — hero is two
  columns, the pass sits between hero and folio strip, Download still saves the PNG; then
  checked-in, confirmed + unverified ID (strip above the ID upload), cancelled / checked-out (the
  expired band in that slot, no live pass), dark + light, at 1440 / 1024 / 900 / 390px.
- Not committed at the time of writing — see the Deploy section above.
- A parallel session removed `PreArrivalIdUpload` (`components/customer/pre-arrival-id-upload.tsx`)
  and its `app/api/account/reservations/[id]/id-document` route while this work was in flight;
  their deletions left stale `.next/types` route validators that made `tsc` fail on a missing
  module until the next `next build` regenerated them — not caused by this change.
- `.customer-id-upload` (`PreArrivalIdUpload`) had no CSS anywhere; that component is now deleted,
  so the gap is moot.
