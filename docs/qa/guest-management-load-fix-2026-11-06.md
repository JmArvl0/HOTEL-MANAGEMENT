# Guest Management loading fix

6 November 2026, Asia/Singapore. User reported “Unable to load this module” in
Guest Management on localhost. Fixed the shared server read path in
`lib/staff-data.ts`; no schema migration or business-record write was needed.

## Confirmed cause

Read-only service-role checks against the application's configured database:

| Read | Result |
| --- | --- |
| Base guest count | 200; 27 records |
| `guests.merged_into_guest_id` | 400, PostgreSQL `42703`, column absent |
| `guest_aliases` | 404, PostgREST `PGRST205`, table absent |
| `reservation_guests.removed_at` | 400, PostgreSQL `42703`, column absent |

The local source queried the not-yet-deployed merge/removal schema unconditionally.
That broke the list, individual dossier and the shared guest picker read.

## Change

The list queries merge aliases only when its guest rows include the migration's
marker column. The dossier uses the existing guest ID when that exact merge
column is missing. Companion history uses its legacy projection only when the
exact `removed_at` column is absent. Other database errors still propagate.

On upgraded databases, canonical merged profiles, alias search/history and
soft-removal filtering retain their existing behavior. Companion folios remain
excluded from the guest's financial summary. No roles or write permissions changed.

## Verification and limits

- Before the fix, two regression tests failed with the same missing-table/column
  errors as the configured database; three protection/current-schema cases passed.
- After the fix, all **5 new regressions** pass. The selected guest/profile,
  reservation and ownership tests total **59 passing tests across 4 files**.
- Latest full suite: **2,348 pass / 2 fail**, 221 files. The recorded purchase-order
  surface contract and room-rack history-refresh failures remain. No new clean
  baseline run was performed for this fix.
- Final combined typecheck/build pass; lint on all changed JS/TS/TSX files has
  **0 errors / 6 existing warnings**. Publication details are in the memory vault's
  `2026-11-06 - Guest Loading Fix and Publication` session.

Tests use the real Supabase HTTP client with a controlled PostgREST transport;
they validate both deployed/upgraded schemas and propagation of unrelated errors.
Hosted business rows were only read for schema diagnosis, with counts/errors
reported rather than guest details. Browser verification was stopped by Computer
Use because it could not establish the current URL confidently. Visual confirmation
and authenticated browser-to-configured-database verification remain unverified.
