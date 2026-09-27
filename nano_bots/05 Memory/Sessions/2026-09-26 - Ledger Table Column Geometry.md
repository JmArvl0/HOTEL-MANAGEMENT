# 2026-09-26 — Ledger Table Column Geometry

Follows [[2026-09-26 - System Health Ledger Conflict Fix]] (the ledger's chrome was
fixed there: heading inset, tab-strip inset, focus ring, mobile step). This session
fixed what was **inside** the two ledger tables.

## The report

> "i think the th and td contents margins and paddings are hard coded through css i
> think because the contents placement are too much wide apart"

The user chose **"Columns are stretched apart"** over "rows are too tall".

## The hypothesis was right in substance, wrong in location

`components/admin/system-health.css` sets **zero** padding or height on `th`/`td`.
The whole box is inherited, and it is shared by every admin table:

| | `th` | `td` |
|---|---|---|
| `padding` | `13px 15px` — `app/globals.css:4` | `15px` — `app/globals.css:4` |
| `padding-inline` | `14px` — `manager-dashboard-theme.css:1751` → `13px 14px` | `14px` — `:1752` → `15px 14px` |
| `min-height` | `38px` — `:1751` | `48px` — `:1752` |

So there were two candidate diagnoses, and only one was in scope:

- **Vertical is house style.** `th{height:38px}`/`td{height:48px}` are blanket rules
  on `.admin-workspace`. Densifying this one module would have re-created the
  "bolted-on module" problem the previous two sessions spent undoing. **Untouched.**
- **Horizontal was ledger-specific.** `table-layout:fixed` + `width:100%` + three
  columns: Version pinned 190px, Status 120px, and Name — the only column with no
  declared width — swallowed ~700px at a 1030px card, pushing the `Applied` badge to
  the far edge. Audit was worse (Time 190px, then Action *and* Entity both auto, so
  two ~420px voids per row for `probe_run` / `system`).

## What was tried, measured, and rejected

The first plan was the textbook fix: drop `table-layout:fixed`, add a trailing
`.col-fill` spacer column with `width:100%`, and let it absorb the remainder. It was
**implemented in full** — then measured in headless Chrome against the real compiled
chunk, and it failed:

```
auto + .col-fill{width:100%}:  87/67/77/800   ← data columns crushed to min-content
fixed + .col-fill{width:100%}: 140/0/88/802   ← Name collapsed to 0
old (as shipped):              140/802/88     ← the defect being fixed
```

Measured mechanics, which are the reusable part:

1. **`width:100%` on a column is never a spacer.** A percentage column demands the
   whole table width; Chrome resolves the over-constraint by crushing every *other*
   column to min-content. It fails in both layout modes.
2. **Unspecified columns absorb all the slack.** With Version specified and Name
   unspecified, Name took all 718px. With Version *and* Name specified and Status
   unspecified, Status took all 570px and the badge landed flush against the Name
   text.
3. **Specified widths in auto layout do not grow to content** — a long value wraps
   inside its column instead (a 237px name wrapped in a 140px column).
4. Chrome *does* honour `min-width` on `<col>`, but it is a floor, so it has the same
   residual-gap problem as a fixed width.

Every layout that spans the card must park the leftover somewhere, and a table
column's width is uniform across rows — so a column with a declared width always
leaves a residual on its shortest row. That residual is unavoidable; the only choice
is *which* column shows it. Parking it in a **trailing empty spacer** was the plan's
answer and needed markup; parking it in the **last data column** gets the same result
with no markup at all, because that column's own text sits at its left edge, hugging
the column before it.

## The shipped change

CSS only — no markup, no theme, no API, no migration:

- `table-layout:fixed` removed (auto is the default).
- Widths declared for **every column except the last of each table**:
  `--sys-col-version:140px`, `--sys-col-name:280px` (migrations);
  `--sys-col-time:160px`, `--sys-col-action:200px` (audit). Status and Entity
  deliberately have **no rule** — they are the absorbers.
- `--sys-col-status` deleted (was 120px) — it is the absorber now.
- The `--sys-col-*` values are real text widths + 28px inline padding, taken from a
  browser measurement, not estimates: longest migration name 237px, version 98px,
  audit time 127px, action 59px.
- The `@media(max-width:680px)` step now releases `.col-version`, `.col-name`,
  `.col-time`, `.col-action` (it was releasing the old set).
- `.system-health-table--migrations td/th:last-child{text-align:right}` had already
  been deleted in the previous session's work; left deleted, so the badge hugs Name.
- Markup comments in `system-health-ledger.tsx` now state the invariant at both
  tables, because a `col` with no `width` looks like an oversight.

**Measured result** (shipped CSS, headless Chrome, 1030px card):

| | columns | scroll |
|---|---|---|
| Migrations | `140 / 280 / 610` | `1030 = width` (no overflow) |
| Audit | `160 / 200 / 670` | `1030 = width` |
| 358px card | `109 / 167 / 82` | `358 = width` (no overflow) |

Before: `140 / 802 / 88` — a ~600px dead zone between the name and its badge.

## Verification

- 35/35 focused (`components/admin/system-health-view.test.tsx`).
- Full suite **160 files / 1797 tests**, typecheck clean, eslint 0 errors.
- Compiled CSS chunk (`.next/dev/static/chunks/components_admin_system-health_css_*`)
  confirmed: `table-layout` gone, `--sys-col-*` carries the new values.
- Geometry measured in **headless Chrome** rather than asserted — the temporary probe
  was `public/__colcheck.html` and has been deleted. Method: build a page that links
  the real compiled chunk plus the inherited `th`/`td` box, render the real markup,
  report `getBoundingClientRect()` widths via `document.title`, and read them with
  `chrome --headless=new --dump-dom`.
- **Still pending:** authenticated browser QA (KI-005) in a real Admin session. The
  measurement above reproduces the column algorithm and the module's own CSS exactly,
  but not the full app cascade — the numbers should be re-confirmed on the live page.

## Test-safety notes

- `migrationRows()` counts `tr`, not `td`, so cell-level changes are invisible to it.
- No `text-align` assertion exists anywhere in the suite, which is why dropping the
  right-align rule was safe.
- `.col-name` / `.col-action` selectors are `system-health`-namespaced, so the D-029
  leak guard is satisfied.

## Files

- `components/admin/system-health.css` — column model, comment rewrite, media step.
- `components/admin/system-health-ledger.tsx` — two comment blocks only.
- `SYSTEM.md` — the ledger bullet now records the "every column except the last"
  invariant, since the unconstrained column reads as a bug.
