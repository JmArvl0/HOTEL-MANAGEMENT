# 2026-10-04 - Thin Page Title Container

## Intent
Address user feedback that `section.customer-page-title.split` (and `.customer-page-title` across customer modules) was consuming too much vertical viewport height. Streamline it into a thin, compact, high-efficiency modern SaaS bar so guests have ample workspace to view modules without unnecessary scrolling.

## What Changed
- **`app/customer-portal.css`:**
  - Removed artificial forced `min-height: 120px` → `min-height: 0`.
  - Shaved internal container padding from `26px 30px` down to `12px 20px` (a 24px reduction in padding height).
  - Shaved container bottom margin from `30px` down to `16px` (saves 14px of vertical space).
  - Reduced outer content container top padding (`.customer-shell .customer-content`) from `38px` down to `22px` (saves 16px of top gap).
  - Standardized `.customer-page-title h1` font size from `clamp(28px, 3.2vw, 42px)` down to `clamp(17px, 1.8vw, 21px)` with `line-height: 1.25` and zero vertical margins.
  - Scaled eyebrow pill to compact `9.5px` with `2px 7px` padding and `margin-bottom: 3px`.
  - Scaled subtitle copy to `12px` with `line-height: 1.45` and `3px` top margin.
  - Vertically centered the `.split` layout (`display: flex; align-items: center; justify-content: space-between; gap: 16px`) and streamlined action buttons to `min-height: 34px`, `padding: 0 14px`, and `border-radius: 8px`.
  - Removed oversized decorative `::after` circular element (`display: none`).
  - Total vertical screen estate saved: ~120px to 140px.

## Verification
- `npm run typecheck` (`tsc --noEmit`): clean (0 errors).
- `npm run build`: clean (all 88 static & dynamic routes compiled).
- Vitest targeted & customer suites: all passing.
