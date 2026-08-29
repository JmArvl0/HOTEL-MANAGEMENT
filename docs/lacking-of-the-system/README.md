# Lacking of the System — Documentation Index

This folder documents every known gap, deficiency, and missing capability in the Haven Hotel
Management System. Each document groups related gaps by kind, cites exact file:line references,
and describes the impact and (where useful) the shape of a fix.

Source of truth: verified against the working tree on branch `main`, 2026-08-26.
Companion reference: [`SYSTEM.md`](../../SYSTEM.md).

## Documents

| # | Document | Covers |
|---|---|---|
| 1 | [Security gaps](./01-security.md) | Demo credentials in production, no validation, no row scoping, shared read/write grants, no rate limiting, dead audit log, operational data exposure, no env validation |
| 2 | [Missing domain logic](./02-missing-domain-logic.md) | No availability check / double booking, no public booking flow, manual room status, dead payments table, no pricing logic, unused tables, UTC date bug |
| 3 | [Data integrity & correctness](./03-data-integrity.md) | Status cycling without a state machine, last-write-wins concurrency, denormalised names, text timestamps, ID prefix mismatch, mutable demo store |
| 4 | [Performance](./04-performance.md) | No pagination, JS-side aggregation, client-side search, no caching/SSR, es5 target |
| 5 | [UX & accessibility](./05-ux-and-accessibility.md) | Silent failures, inaccessible modal, login copy bug, mojibake strings, missing pagination/detail views, hardcoded currency |
| 6 | [Engineering hygiene](./06-engineering-hygiene.md) | No tests/CI/lint pipeline, monolithic dashboard component, duplicated permission logic, no middleware, no logging, uncommitted work |

## How to read these

- Each item states **what is missing**, **where it lives** (`file:line`), and **why it matters** for
  a single-property hotel deployment.
- Items are ordered most-consequential-first within each document.
- Fixes are deliberately *not* prescribed in depth here; see `SYSTEM.md §12` for the constraints any
  proposal must respect (keep demo mode, stay on Next.js + Supabase, prefer Postgres-native guarantees).
