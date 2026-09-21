# 2026-09-20 — Staff Content Fitting & Layout Refinement

Screenshot-driven follow-up to the org staff theme (D-025): content now
fits the Executive Dashboard system instead of clipping out of it.

## Root cause (screenshot)

Admin brand `HAVEN<small>SYSTEM ADMINISTRATION</small>` inherited
`white-space:nowrap` from `.brand-copy`; the 22-char role label needs
~190px but only ~130px exists at 232px sidebar width; parent
`overflow:hidden` clipped it. My own 10px `brand small` bump made it worse.

## Fix (all in `app/staff-ops-theme.css` §§20–23, `.app-shell`-scoped)

- Brand role label wraps to two lines (`SYSTEM`/`ADMINISTRATION`); HAVEN
  stays one line; letter-spacing eased to 1.2px. Covers all three role brands.
- Nav labels flex with badge space reserve (`:has(.nav-badge)`); profile /
  property copies ellipsis; headers wrap actions as a unit beside shrinking
  titles; KPI values `overflow-wrap:anywhere`; panel headings wrap;
  `.table-scroll` contained scroll; modal footers wrap; select menus/values
  and popovers viewport-capped; pills compress (never hidden) at ≤720px.
- No type-size reductions; no color/token changes; no logic/RBAC changes.

## Verification

- New `components/ui/staff-fitting.test.ts` (12 CSS-contract tests — prove
  rules ship, NOT visual rendering).
- Gates: typecheck clean, eslint 0 errors, **1543/1543 (133 files)**,
  build 72/72, diff-check clean.
- Browser QA NOT performed (no runner, KI-005). Manual checklist pending:
  admin two-line label, per-role fitting at 1920/1440/1280/1024/768/390 ×
  light/dark; landing pixel-comparison.
- Scope proof: only `.app-shell`-scoped CSS + test + docs touched;
  landing/customer/auth verified unchanged by diff + class-usage grep.
