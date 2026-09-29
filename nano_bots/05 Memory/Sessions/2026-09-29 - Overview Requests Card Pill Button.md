# 2026-09-29 — Overview Requests Card Pill Button

## Work completed

Finished and verified a change a previous session had implemented but stopped short of
verifying end to end. All three artifacts were **already on disk and correct** — nothing
was half-applied or broken. That session's green gate run was its own claim, so this
session re-ran every gate instead of inheriting it.

The goal: the Guest Requests card on the customer overview (`/account`) ended in a bare
text link ("View requests →") drawn by the generic `.customer-shell .customer-card>a`
rule. **Only that one link** was promoted to a full-width soft pill. The
Remaining-balance and Notifications card links keep their text-link treatment
deliberately, not by omission.

- `app/(booking)/(customer)/account/page.tsx:38` — `<Link className="btn btn-soft">`,
  href unchanged at `/account/requests`. The diff is that single line.
- `app/customer-portal.css:74` — `.customer-shell .customer-card>a.btn{display:flex;
  width:100%;min-height:44px;margin-top:12px;border-radius:999px;font-size:12px}`,
  placed immediately after the base card-link rule at `:71`.

**Two cascade surprises, found by tracing specificity rather than by looking at the
page.** Both are invisible in the source diff and both are load-bearing if anyone
"tidies" this later:

1. **The label renders green (`--cp-green`), not ink.** `.customer-shell .customer-card>a`
   is (0,2,1) and outranks `.customer-shell .btn-soft` at (0,2,0) — both in the portal
   layer — so `.btn-soft`'s `color:var(--cp-text)` never applies. Green reads as a
   link-button and matches the two sibling text links, so it looks chosen; it is
   inherited. Forcing ink is one added declaration at `:74`.
2. **The pill is an outline, not a filled button.** `.btn-soft`'s background is
   `var(--cp-panel)` — the same token `.customer-card` uses — so only the 1px `--cp-line`
   border separates them. That is how `.btn-soft` is already themed across the portal, so
   it is consistent rather than a defect, but it means the pill is far quieter than "soft
   button" implies, and in the dark theme especially it can read as barely there.

Smaller: `gap` resolves to **6px** from the card-link rule, not `.btn`'s 9px, so the CSS
comment crediting `.btn` with "gap/centering" is half right — only the centering is
`.btn`'s, and it survives because nothing out-specifies its `justify-content`.

`HavenButton` cannot be caught by the new rule: it renders `<button class="btn …">` and
the rule is scoped `>a.btn`. The page's other CTA is legacy `btn btn-cream`, so
`btn btn-soft` matches the page's own pattern, and `docs/HAVEN_UI_STANDARDS.md` keeps
legacy `.btn-soft` compatible during migration.

## Decisions

None. Presentational only — no business rule, architecture, security/RBAC, or DB change,
and no documented system behaviour altered, so `SYSTEM.md` needs no update. The one-line
asymmetry note added to `docs/HAVEN_UI_STANDARDS.md` records an existing UI convention
rather than establishing a system decision, so it is not a `D-` entry.

## Affected files

- `app/(booking)/(customer)/account/page.tsx` — one `className` addition (line 38).
- `app/customer-portal.css` — one rule plus a two-line comment (lines 72–74).
- `components/customer/overview-card-link.test.ts` — **new**, untracked, 3
  source-assertion tests.
- `docs/HAVEN_UI_STANDARDS.md` — one line under `## Actions and state`.
- `nano_bots/05 Memory/Current Status.md` — Current Work bullet + Recent Sessions link.

No logic, API, schema, migration, or markup-structure changes.

## Verification

Re-run this session, on the existing tree:

- `npm run typecheck` — clean.
- `npx eslint` on the page, the new test — no output (clean).
- `npx vitest run components/customer/overview-card-link.test.ts` — **3/3**.
- `npm test` — **166 files / 1873 tests passing**, identical to the previous session's
  count. The known `next.config.mjs` mid-run flake did not recur.
- `npm run build` — clean; full route table emitted.

The new test is a source-assertion test in the repo's established CSS-guard style
(`booking-search-compact-style.test.ts`, KI-005's stylesheet-parsing substitute). It pins
class names and rule shape; it proves nothing about pixels or about the cascade above.

## Unresolved

- **Manual visual QA not done.** No browser tooling in the session — confirmed absent
  from both `package.json` and `node_modules` (no playwright / puppeteer /
  chrome-devtools) — and `/account` is behind authentication per KI-005.
- **The green label is inherited, not chosen** (see above). One declaration decides it.
- **No behavioural coverage.** The new test would not fail if a later stylesheet re-drew
  the pill; only if the class string itself moved.
- The working tree remains uncommitted across many parallel streams; the new test file
  stays untracked with the rest.

## Next recommended action

`npm run dev`, then check `/account` as a guest at desktop width and ~380px, in both
themes: the Requests card should end in a full-width oval pill with the label and arrow
centred on one line; the other two cards should still end in plain green text links;
confirm the 12px gap above the pill reads as intentional. Then decide the green label —
if ink is wanted, add `color:var(--cp-text)` to the rule at `customer-portal.css:74`.
