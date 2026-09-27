# 2026-09-26 — System Health Module Redesign

## Work completed

Rebuilt the Admin → System Health module's information hierarchy and type scale.
This is the follow-on to [[2026-09-26 - Admin Module CSS Scoping Fix]]: that
session stopped the CSS *leaking out* of the module; this one fixes what was
inside it.

- **Root cause named, not guessed.** `components/admin/system-health.css` was the
  only admin stylesheet whose styling lives **outside** the D-025 theme layer.
  `app/staff-ops-theme.css` raises the light theme to a 12–15px scale for `table`,
  `.badge`, `.table-action` and `.panel-heading h3`, and contains **zero rules for
  `.sys-*` / `.system-health-*`**. So the module kept a legacy 9–11px scale while
  everything around it grew. No markup edit and no theme edit could reach those
  pinned values — which is why repeated prompts to "fix the design" changed nothing.
  A comment at the top of the file now states the sizing rule so it does not recur.

- **Hierarchy rewritten** (`SystemHealthView` in `admin-dashboard-client.tsx`):
  verdict → 8 service cards → needs-attention → ledger | automations rail. The
  attention list moved **out of the 320px rail into the main column** (that rail
  floor was crushing its body copy), and the ledger now takes the full width.
  The rail carries automations only.

- **Attention de-duplicated against the cards.** Drill-down/storage/gateway/email
  alerts were removed: each restated a fact its own card already showed, with the
  same action. What remains is different in kind — an unreachable database
  (`role="alert"`), the public domain (no card exists), and free-form server
  notices. A new test locks this.

- **Tone moved off the card onto the value line**, and swapped `--ops-*-ink` →
  `--color-success/warning/danger-fg`. Two problems fixed at once: every label and
  paragraph had been inheriting the tone (colored 12px body text), and
  `--ops-*-ink` has no dark variant — the dark-mode contrast was 2.77–3.58:1.
  The `-fg` tokens flip per theme and measure 7.1–8.3:1 light / 9.5–12.9:1 dark,
  i.e. AA at **any** size. (An earlier draft reasoned that a 17px bold value could
  rely on the 3:1 large-text threshold; 17px is below the 18.66px "14pt bold" bar
  and would have failed. The `-fg` tokens remove the size dependency entirely.)

- **The permanent Unknowns became real.** No migration was needed — both cron jobs
  already persist their own runs:
  - **Automations** now carry `lastRun` / `lastRunLabel` / `lastStatus`, read from
    `guest_reminder_deliveries.sent_at` and `analytics_model_runs.generated_at`.
    The per-job label carries an honesty constraint: `guest_reminder_deliveries` is
    unique per `(reservation_id, kind)` and **only inserts on an actual send**, so
    its newest row is the last SEND, not the last attempt — labelled "Last send".
    No row reads "No sends recorded" / "No runs recorded", never a fabricated success.
  - **Deployment** now has two tiers. Tier 1 needs no configuration: Vercel injects
    the serving deployment's own identifiers, so the card reports the real
    environment/branch/short commit instead of a bare `Unknown`. Tier 2 adds the
    newest `readyState` from the Vercel API when `VERCEL_TOKEN` is set — the only
    real "did the last build succeed" signal. A missing token is not an error; any
    failure degrades to `unknown`. Deleting the local `jobResult` state also removed
    the last second-source-of-truth for "did it run" — the server-written timestamp
    is now the only record.

- **Payment tab**: dropped the 5 hardcoded boilerplate rows. Three of them
  ("Webhook integration", "Provider integration", "Automatic verification:
  Disabled") restated the PayMongo gateway card and would have gone *false* the
  moment a gateway secret was configured — `app/api/webhooks/payments/route.ts`
  does confirm payments. The other two restated the row above them.

- **CSS**: pinned sizes removed (inherits the theme); cards step 4 → 2 → 1 at
  1200/760px; `.sys-lower-split` is now `minmax(0,1fr) minmax(280px,340px)` and
  collapses at 1100px; `td:last-child{text-align:right}` scoped to
  `--migrations` (it was right-aligning the audit table's Entity column); the
  34px `.sys-ico` got a surface so it reads as deliberate.

## Decisions

[[D-030 — Admin module stylesheets inherit the theme scale and never restate a fact a card already shows]]

## Affected files

- `lib/system-health.ts` — `automations[]` and `deployment` types; new
  `AutomationRunStatus`, `DeploymentBuildStatus`, `automationRunStatus()`,
  `deploymentBuildStatus()`
- `app/api/admin/data/route.ts` — 2 new run-timestamp queries inside the existing
  `Promise.all`; new `deploymentFacts()`
- `components/admin/admin-dashboard-client.tsx` — `SystemHealthView` hierarchy,
  tone placement, de-duplicated alerts
- `components/admin/system-health.css` — scale, tones, breakpoints, scoping
- `components/admin/system-health-ledger.tsx` — payment rows
- `components/admin/system-health-view.test.tsx` — fixture + 4 rewritten
  assertions, 2 new tests (35 total)
- `SYSTEM.md` — the Admin System Health section

No migration. No schema change. `lib/system-health.test.ts`'s pure derivations are
untouched.

## Verification

- `npx vitest run components/admin/system-health-view.test.tsx` — **35/35**.
- `npm run test` — **160 files, 1793/1793**.
- `npx tsc --noEmit` — clean.
- `npx eslint` on the five touched files — 0 errors, 3 pre-existing warnings
  (lines 40 / 328 / 395 of `admin-dashboard-client.tsx`, untouched here).
- **Compiled CSS verified in the running dev server's chunk** — the bytes the
  browser actually receives, not just source:
  `.next/dev/static/chunks/components_admin_system-health_css_1igg3k2._.single.css`
  contains `repeat(4, …)` + `repeat(2, …)` grid steps, `@media (max-width: 1200px /
  1100px / 760px)`, `.system-health-table--migrations td:last-child`, and the four
  `.sys-tone-*` rules on `--color-*-fg` — and **zero** `font-size: 9|10|11px`, zero
  `--ops-*-ink`, zero bare `.page-title` / `.panel-heading` selectors.
- Column names checked against the migrations before wiring the queries:
  `guest_reminder_deliveries.sent_at/status` (`20260930010000`, unique index on
  `(reservation_id, kind)` — confirms the "last send" label) and
  `analytics_model_runs.generated_at/status` (`20260917010000`). Both granted to
  `service_role`, which `guardAdmin()` provides.

## Unresolved

- **Browser verification not done** (KI-005). Static, test, and compiled-CSS
  evidence all confirm the change, but these need an eyeball on `:3000` with an
  Admin session: light **and** dark tone contrast; 4 → 2 → 1 card steps at
  ~1100/~900/~700px; the ledger table never crushing; no card text tinted; the
  audit Entity column left-aligned.
- **`VERCEL_TOKEN` is not set.** Tier 1 renders real env/branch/commit today; tier
  2 (the actual build outcome) stays dormant until the token is added. Setting it
  is the only way to see "Ready" / "Build failed" instead of "Serving".

## Next recommended action

Add `VERCEL_TOKEN` as a Vercel project env var, then run the browser checks above.
