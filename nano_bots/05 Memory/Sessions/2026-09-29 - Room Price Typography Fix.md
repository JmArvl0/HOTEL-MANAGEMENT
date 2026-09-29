# 2026-09-29 — Room Price Typography Fix

## Work completed

Finished and verified a two-surface plan that was left half-verified by a previous
session. The plan's own two edits (`app/guest-booking.css`, `app/(booking)/booking/search/search.css`)
were **already on disk and correct** — that session died at `npm run typecheck` on a
provider rate limit, which is not a code failure. Nothing was broken or half-applied.

The goal: the room-card price block rendered its figures in the decorative display serif
(Playfair, `--font-display`) and its context labels (`3 nights`, `estimated total`) at
9–10px in muted grey. Figures now use the plain UI font stack (`--font-sans`, supplied as
Inter by `app/layout.tsx`) at semibold; labels are 12px at full text colour.

- **The plan's deferred item was real, and cheaper to fix than the plan assumed.**
  `components/booking/room-results.tsx:55,57` renders the block as one span:

  ```
  <span class="room-price"><small class="room-price-nights">…</small>
    <strong class="room-price-nightly">…</strong> / night<br />
    <em class="room-price-total">…</em></span>
  ```

  `" / night"` is a **bare text node** inside `.room-price`. `.room-price` had **no rule in
  any stylesheet**, and none of `.customer-shell`, `.customer-content`, `.booking-page`, or
  `body` sets a `font-size` — so it inherited the **16px root default**, larger than the
  12px labels beside it and reading as a stray fragment next to the 26px figure.

  The plan deferred this, believing it needed JSX edits to the shared component. It does
  not: one `font-size` on `.room-price` reaches the text node. The existing
  `small`/`em` rules are specificity (0,2,1) and out-specify it, and the `strong` rules
  either come later in source at equal (0,2,0) — portal — or out-specify at (0,2,1) —
  public. `room-results.tsx` is untouched.

- **Two smaller inconsistencies closed on the public surface.** `.room-price-total` was
  computing at weight **400** there while the portal's was 600, so the two surfaces
  disagreed on the same element; weight 600 was added. The redundant
  `.booking-page .room-price-nightly{font-variant-numeric:tabular-nums}` was deleted —
  line 116 already sets tabular numerals on `.room-rate strong`, which is the element
  carrying that class in both render branches.

- **The two surfaces mirror each other by hand.** `app/guest-booking.css` is a
  self-described "portal mirror of the public search rules" (its own header comment,
  scoped `.customer-shell` + `.customer-content`); its counterpart is
  `app/(booking)/booking/search/search.css` (scoped `.booking-page`). **Any price-block
  change has to be made in both files** — nothing enforces the mirror, and no test covers
  either one's price rules.

## Decisions

None. Presentational only — no business rule, architecture, security/RBAC, or DB change,
and no documented system behaviour altered, so `SYSTEM.md` needs no update.

## Affected files

- `app/guest-booking.css` — added `.customer-shell .room-price{font-size:12px}` before
  `.room-price-nightly` (equal specificity, so source order is what keeps the figure at 26px)
- `app/(booking)/booking/search/search.css` — added `.booking-page .room-price{font-size:12px}`;
  added `font-weight:600` to `.room-price-total`; deleted the redundant
  `.room-price-nightly` tabular rule. Net line count unchanged.

No logic, API, schema, migration, or markup changes. `components/booking/room-results.tsx`
deliberately untouched — the class hooks it already carries were sufficient.

## Verification

- `npm run typecheck` — clean. (The step that failed the previous session.)
- `npx vitest run` — **162 files, 1850/1850 passing**. No existing test asserted on these
  values: `lib/room-catalog.test.ts` was the only test file matching `room-rate`/`room-price`
  and it contains no CSS assertions.
- `npm run build` — clean.
- **Compiled CSS checked by byte offset**, not just source, since the portal's two rules tie
  on specificity and only source order decides the winner:
  - `.next/static/chunks/3jjj6czwx2jsb.css` — `.room-rate small` @93293, `.room-price{font-size:12px}`
    @93426, `.room-price-nightly` @93469 (later → figure keeps 26px), `.room-price-total` @93662.
  - `.next/static/chunks/1vtchdj_jt16g.css` — `.room-rate small` @12219, `.room-rate strong` @12365,
    `.room-price{font-size:12px}` @12554, `.room-price-total` @18354.
  - Both chunks still carry the `≤600px` column-stack rule.
- Contrast, computed rather than assumed: `--search-ink` `#103e48` on white ≈ 10:1;
  portal light `--cp-text` `#173e47` on `--cp-panel` `#fff` ≈ 11:1. The plan predicted ~7:1.

## Unresolved

- **Manual browser verification not done — no browser tooling available in the session.**
  Static, test, build, and compiled-CSS evidence all confirm the cascade, but the pixels
  still need an eyeball: public `/booking/search` and the portal Find a Room list, at
  desktop width and at ≤600px (where the room-rate row stacks to a column), plus 200% zoom.
  Confirm `" / night"` now matches `3 nights` / `estimated total` in size, and that price
  digits read unambiguously on both card backgrounds. The public page needs no session;
  the portal view does.
- **No regression test for these rules** — a deliberate call this session. The repo has
  the pattern (`components/booking/booking-search-compact-style.test.ts` reads the CSS and
  regex-asserts), so re-adding the display serif to a price figure could go unnoticed until
  someone looks at the page.
- The price typography rule is not written down in `docs/HAVEN_UI_STANDARDS.md`, which has
  no typography section covering price display. Another stream has that file open.

## Next recommended action

Run the visual checks listed above against the dev server on `:3000`. If the price
typography is meant to be a standing rule across both surfaces, add it to
`docs/HAVEN_UI_STANDARDS.md` and consider the small CSS-contract test — that is what would
stop the mirror from drifting again.
