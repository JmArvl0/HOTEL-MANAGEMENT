# 2026-09-29 — Booking Form Type Scale

## Work completed

The guest booking forms set their own type far below the rest of the app. Inside
`.booking-form-card` the field labels sat at **10px**, the "Anything else?" heading at 10px,
the request subhead at **9px**, and the GCash detail labels at **9px**. The forms are the
two components that carry the class: `components/booking/guest-details-form.tsx:58` and
`components/booking/confirm-booking-form.tsx:91`.

**The field text was the real problem, and one grid showed three different sizes.**
`app/globals.css:1` sets `button,input,select{font:inherit}` and
`.booking-form-grid{font-size:10px}` is the nearest ancestor — so the 10px wrapper *was* the
input size. But:

- **inputs** inherited the wrapper → **10px**
- **selects** were **14px**, from `components/ui/haven-select.css:127`
  (`.booking-form-grid select{…font-size:14px}`), which out-specifies the wrapper
- **textarea** is not in the `font:inherit` list → the **~13.3px UA default**

The plan predicted two sizes; the actual was three. Corrected in both the CSS comment and
the test comment rather than shipped as written.

**16px was the right target, not 14px.** Nothing anywhere in the app overrides form inputs,
so every other form (login, account, customer requests) already renders at the 16px body
default — booking was the lone outlier. 16px also stops iOS Safari zooming the page when a
guest focuses a field, which matters on a phone-first booking flow. Confirmed with the user.

- `app/guest-booking.css` — one appended block, 30 one-selector rules, scoped
  `.booking-form-card`. 16px fields · 14px body rows (request options, GCash steps, GCash
  detail values, deposit due line, "How to pay", proof file name) · 12px meta (labels,
  subheads, notes, GCash detail labels, proof labels) · 18px for the deposit amount ·
  16px for the card title.
- **Appended rather than edited in place, deliberately.** `.request-option` /
  `.request-options-list` are shared with the customer requests page — that sharing is
  exactly why the earlier standard needed its own page-scoped override in
  `app/customer-portal.css`. Raising the base rules would have leaked the change off the
  booking flow. One selector per rule so the new test can assert single-line substrings and
  check every rule for the card scope.
- `components/booking/booking-form-type-scale.test.ts` — **new**, 7 cases.

**Three sizes were already `!important`** and raising them needed both `!important` and an
extra class to win: `.request-option` (12px), `.deposit-verification-note` (10px), and
`.byp-note` (11px). The last one is inside `DepositPolicyPanel`, which renders *inside* the
deposit form (line 118) — its own scale is already 14/12, so only the 11px note was off it.

**No mirror file to keep in sync here.** `app/layout.tsx:5` imports `guest-booking.css` from
the **root layout**, so it loads on every route and one block covers the public booking flow
and the `.customer-shell` portal alike. That is *not* true of the room-price block, whose
public rules live in `search.css` — see [[2026-09-29 - Room Price Typography Fix]].

## Decisions

None. Presentational only — no business rule, architecture, security/RBAC, or DB change, and
no documented system behaviour altered, so `SYSTEM.md` needs no update. Same call as the
room-price session. The 14px/12px standard itself is not new: it is already carried by
`components/customer/guest-request-type-scale.test.ts` and the `cgr` block in
`app/customer-portal.css`.

## Affected files

- `app/guest-booking.css` — appended the `.booking-form-card` type-scale block (comment + 30
  rules). No existing rule altered, so the appended block is the whole diff and reverts
  cleanly.
- `components/booking/booking-form-type-scale.test.ts` — new.

No component, logic, API, schema, migration, or markup change. Both form components are
untouched — the class hooks they already carried were sufficient, the same outcome the
room-price session reached with `room-results.tsx`.

## Verification

- `npx vitest run` on the new test plus the two existing CSS guards it must not break
  (`booking-form-type-scale`, `guest-details-form`, `booking-review`) — **43/43**.
  `guest-details-form.test.tsx:156` asserts `.booking-form-grid .arrival-note` is still
  present; `booking-review.test.tsx:215` pins `.review-stay-total dt,dd{font-size:21px`, so
  every new rule is scoped with `.booking-form-card` and `.review-card` (which shares the
  base rule at `guest-booking.css:3`) is untouched.
- `npm run typecheck` — clean. `npx eslint` on the new test — silent.
- `npm test` — **168 files / 1893 tests passing** (previously 167/1886; the delta is exactly
  this session's 7 new cases). KI-008's red notification-history tests are gone — the
  parallel stream fixed them, not this session.
- `npm run build` — clean.
- **Compiled CSS confirmed, not assumed.** In `.next/static/chunks/044viaqdxooh1.css`. The
  minifier **merges adjacent rules that share a declaration** into one selector list, so the
  exact-string grep for `.booking-form-card .booking-form-grid input{font-size:16px}` returns
  **nothing** even though the rule is present — it was absorbed into a merged rule whose
  window shows `…textarea,.booking-form-card .booking-form-other textarea,…{font-size:16px}`.
  Grepping the declaration (`font-size:16px}`) with a wide window finds it. This is the
  prod-bundle mirror of the pretty-printed dev-chunk trap; recorded in the
  `dev-css-chunk-is-pretty-printed` auto-memory.

## Unresolved

- **No visual check — no browser tooling in the session** ([[KI-005]]; the authenticated
  surfaces also need a guest login). Static, test, build, and compiled-CSS evidence all
  confirm the cascade, but the pixels need an eyeball: `/booking/search` → hold a room →
  the details form, then the deposit step. Confirm field text is legible, that inputs and the
  textarea now match, and that the deposit step inside `/account` (the dark `.customer-shell`
  context) reads the same.
- **Other booking surfaces are still below the standard and were left alone as out of
  scope**: `.gateway-selector` (9px badge, 11px steps) and `.payment-status-poller` (10px) —
  both confirmed to render *outside* `.booking-form-card`; the booking search filters
  (`search.css` `.btn{font-size:10px}`); and `manager-dashboard-theme.css`, which still
  carries 9px buttons in places.
- **The standard is enforced per-page, with no global guard.** Surfaces below 12px are
  corrected one at a time by hand (the `cgr` block, the room-price block, now this one), and
  nothing catches a new 9px rule at review time.
- `docs/HAVEN_UI_STANDARDS.md` has **no typography section** — it was searched and only
  mentions readability incidentally. A parallel stream holds that file, so it was not touched.

## Next recommended action

Run the visual checklist above against the dev server on `:3000`. If the 14px/12px/16px
scale is meant to be standing policy, the durable fix is a typography section in
`docs/HAVEN_UI_STANDARDS.md` plus a repo-wide check for sub-12px `font-size` rules — that,
not another per-page override, is what would stop the next surface from drifting low.
