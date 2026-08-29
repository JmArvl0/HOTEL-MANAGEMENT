# 04 — Performance

All references verified 2026-08-26.

## 4.1 No pagination or limits anywhere

- **Where:** `lib/data.ts:12` — `select("*")` per resource; `getDashboard()`
  (`lib/data.ts:41`) pulls all reservations, rooms, housekeeping tasks, and invoices on every
  dashboard load. API contract has no page/limit params (`SYSTEM.md §7`).
- **What is lacking:** Every read is unbounded. At the documented scale (~48 rooms) this is fine;
  with a year of reservations and invoices it degrades linearly and forever.

## 4.2 Aggregation happens in JS, not SQL

- **Where:** `lib/data.ts:43-50` — occupancy, revenue, and status counts are `filter`/`reduce` over
  full table dumps.
- **What is lacking:** Metrics that are one SQL query each (`count(*) … group by`) instead transfer
  entire tables over the wire to Node on every dashboard view.

## 4.3 Search loads everything then filters client-side

- **Where:** `components/manager/manager-dashboard-client.tsx:41` —
  `JSON.stringify(item).includes(query)` over already-loaded rows.
- **What is lacking:** No server-side search; also matches column *names*, not just values ("id"
  matches every row).

## 4.4 Nothing is server-rendered or cached

- **Where:** The entire dashboard is one client component that refetches on every section switch
  (`components/manager/manager-dashboard-client.tsx:34`); the landing page is `force-dynamic`
  (`app/(landing-page)/page.tsx:7`) and re-queries rooms per visit.
- **What is lacking:** No caching layer, no ISR/stale-while-revalidate for public room data, no
  request deduplication. Every landing-page hit runs a live Supabase query.

## 4.5 `target: "es5"` in tsconfig

- **Where:** `tsconfig.json`.
- **What is lacking:** Compiles modern code down to ES5 — larger bundles and slower runtime output
  for no supported-browser reason on a Next 16 / React 18 project.
