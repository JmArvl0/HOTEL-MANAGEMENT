# 05 — UX & Accessibility

All references verified 2026-08-26.

## 5.1 Silent failures

- **Where:** `components/manager/manager-dashboard-client.tsx:34` — `load()` checks `res.ok` with no
  else branch; a 401/403/500 leaves stale data on screen with no message.
- **What is lacking:** No error toast, retry, or empty-vs-error distinction anywhere. No
  `error.tsx`, no `not-found.tsx`, no error boundary in the entire app.

## 5.2 Modal is not accessible

- **Where:** `components/manager/manager-dashboard-client.tsx:58`.
- **What is lacking:** No `role="dialog"`, no `aria-modal`, no focus trap, no Escape-to-close. The
  toast has no `aria-live`. Sidebar nav items are `<button>`s without `aria-current`. No skip link.
- **Impact:** The primary create/edit surface of the staff product is unusable with a keyboard
  reader alone.

## 5.3 Enum fields are free-text inputs

- **Where:** Create-modal fields are plain text/number/date/email inputs built from `config`
  (`components/manager/manager-dashboard-client.tsx:15-24`).
- **What is lacking:** Status/type fields should be `<select>`s bounded by the enum the config
  already declares. Users can currently type invalid statuses that then break badge cycling.

## 5.4 Login copy bug

- **Where:** `app/(auth)/login/page.tsx:16` — submit button reads "Sign up" / "Signing up…" on a
  sign-in form.

## 5.5 Mojibake in shipped UI strings

- **Where:** `components/manager/manager-dashboard-client.tsx` — UTF-8 read as Latin-1 renders
  literally: `todayâ€™s`, `Hereâ€™s whatâ€™s happening`, `48 rooms Â·`, `â†— 8.2%`, `â€”`.
  `manager-dashboard-theme.css` also carries a BOM.
- **What is lacking:** File encoding was corrupted at some point and never fixed; users see garbage
  characters in production UI.

## 5.6 No pagination / sorting UI, no detail view, no edit, no delete

- **Where:** Dashboard table rendering, `SYSTEM.md §7` (API has none either).
- **What is lacking:** Records cannot be edited (only status-advanced), viewed in detail, or
  deleted. Large tables render in full. This makes several backend gaps worse: correcting a mistyped
  rate requires recreating the record.

## 5.7 Currency hardcoded PHP

- **Where:** Formatter in `components/manager/manager-dashboard-client.tsx:26` hardcodes PHP while
  `invoices.currency` is per-row (`schema.sql:44`).
- **What is lacking:** Per-row currency is stored but always displayed as ₱.

## 5.8 Fake values displayed to staff as real

- **Where:** See `SYSTEM.md §8` table — occupancy trend literals (`lib/data.ts:48`), "↗ 8.2%",
  "Operational readiness 92%", urgent-work-order banner, housekeeping count "3", "48 rooms" (seed
  has 8). Fallback landing-page card prices at `app/(landing-page)/page.tsx:42-44`.
- **What is lacking:** No distinction between live metrics and placeholder copy. Staff make
  operational decisions off numbers that never change.
