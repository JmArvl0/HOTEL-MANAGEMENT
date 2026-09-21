# Session Countdown and Expiration — 2026-09-21

## Outcome

Implemented the approved authenticated-session countdown across Customer,
Front Desk, Accounting, Housekeeping, Maintenance, Manager, Owner, and System
Administrator through the four shared application headers.

## Behavior

- Server computes the earliest idle or absolute policy deadline and exposes it
  as `sessionExpiresAt`.
- Header renders only `HH:MM:SS` or `MM:SS`, with a non-live accessible label.
- Non-mutating status reads and dashboard polling do not extend inactivity.
- Throttled pointer/keyboard activity updates `last_seen_at`.
- At expiration the server session is rejected and the client presents a
  blocking dialog with **Sign in again** as the only action.

## Verification

- Focused session/security/component suites: 43/43 passed.
- TypeScript: passed.
- ESLint on touched TypeScript/TSX: passed.
- Impeccable UI detector: no findings.
- Full test suite: 1568/1568 passed.
- Production build: passed (73 generated static pages).
