# 2026-09-29 — Find a Room Compact Search Control Corners

## Work completed

Unified the Find-a-Room compact search controls with the system's standard
rounded control language, on both surfaces, with zero JSX or logic changes.

**Diagnosis (from the user's screenshot, `reference/find room cs page.png`).**
On the customer portal (`/account/find-room`) the Check in / Check out fields
rendered as sharp boxes and the Guests dropdown had no rounded wrapper or
chevron. Three CSS causes, all in `app/guest-booking.css`:

1. A stale override from the earlier themed-cell pass:
   `.customer-content .booking-search.compact input,…select{…border-radius:6px}`
   — the sharp 6px box.
2. The newer "borderless cells" refinement flattened everything:
   `input,…select{border:0;border-radius:0;background:transparent}`.
3. A `.customer-shell .booking-search.compact input,…select` background/border
   shorthand whose `background` reset erased the chevron `background-image`
   that `haven-select.css` paints on the styled native `<select>` (the chevron
   is a background image, so any later background shorthand wins the cascade).

**Fix — reshape to the standard, don't stack another override.**

- Portal (`app/guest-booking.css`): dates now carry the portal's rounded
  date-picker wrapper — `border:1px solid var(--cp-line);border-radius:8px;
  background:var(--cp-panel-2);min-height:44px` — the same corners as
  `.prompt-input` (Request-a-Change modal dates), plus the shared select
  hover/focus tokens (`--select-border-hover/-focus`, `--select-ring`).
  All local rules that touched the Guests `<select>`'s skin were deleted;
  it now declares `margin:0` only and inherits haven-select.css's standard
  11px wrapper + custom chevron. The `.customer-shell` background shorthand
  no longer lists compact-search controls. The ≤900px and ≤600px strips that
  stripped borders/radius were simplified (label padding + button placement
  only); native date inputs keep their own indicator on mobile.
- Public (`app/(booking)/booking/search/search.css`): same split — shared
  metrics rule, then per-control skin: dates get `border:1px solid
  var(--search-line);border-radius:8px;padding:0 12px;background:#fff`;
  the select declares margin/vertical-padding only so the Haven wrapper +
  chevron show. ≤600px keeps the flush tinted-cell mobile composition
  (border/radius/background stripped there per-control, select keeps
  `padding-right` room for the chevron).
- Shared (`components/ui/haven-select.css`): `.booking-search.compact select`
  was in the styled-native base rule but missing from the hover and focus
  lists — added it to both so the compact dropdown gets the standard teal
  hover border and 3px focus ring.

## Tests

`components/booking/booking-search-compact-style.test.ts` rewritten as the
contract for the new shape: scoping (no `.booking-page` under
`.customer-content`), dates rounded 8px / `--cp-line` / `--cp-panel-2`,
**no local rule may re-declare the select's skin** (no border-radius,
`border:0`, transparent background, or `appearance` on any compact-select
rule), button bottom-aligned 44px nowrap, divided labels + ≤900px stack.

## Decisions

None. Presentational only — no business rule, architecture, security/RBAC,
or DB change, so `SYSTEM.md` needs no update. One judgment call recorded
here rather than in Decisions.md: the desktop divider-cell composition
(borderless flush cells inside the white bar) is **kept**; only the control
corners inside the cells were rounded. If the user later wants full
rounded-cell pills on desktop too, that is a further step on top of this.

## Affected files

- `app/guest-booking.css` — compact refinement reworked; stale 6px override,
  borderless flatten, and `.customer-shell` compact-select background removed
- `app/(booking)/booking/search/search.css` — same rework for the public surface
- `components/ui/haven-select.css` — compact select added to hover/focus lists
- `components/booking/booking-search-compact-style.test.ts` — contract rewritten

## Verification

- Focused: `booking-search-compact-style`, `availability-guide`,
  `booking-search-form`, `guest-details-form` — 36/36.
- `npx vitest run components/booking` — 13 files / 138 tests passing.
- Full suite: **162 files / 1851 tests passing** (baseline was 1850; the
  rewritten contract has one more test).
- `npm run typecheck` — clean. `npx eslint` on the touched test file — clean
  (the two CSS files are outside eslint's config, as expected).
- `npm run build` — clean.

## Unresolved

- Manual browser QA pending (KI-005, no browser runner): portal
  `/account/find-room` and public `/booking/search` at desktop and ≤600px —
  confirm dates render 8px-rounded, Guests shows the rounded wrapper with
  chevron, and focus rings appear. Portal view needs a guest login.
