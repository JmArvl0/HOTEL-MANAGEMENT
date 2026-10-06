# 2026-10-06 - Theme Toggle View-Transition InvalidStateError Fix

Runtime error: `InvalidStateError: Transition was aborted because of
invalid state. Snapshot capture failed` (Next.js 16.3.2 Turbopack overlay).

## Root cause

Chromium confirms the string is the View Transition API abort reason
`kCaptureFailed`. The repo's only `startViewTransition` caller is the theme
toggle (`lib/theme.ts:60`). It handled `transition.finished` and sync throw
but left `transition.ready` and `transition.updateCallbackDone` unhandled —
on abort (backgrounded tab, capture failure, superseded transition) those
reject and escape as unhandled rejections, which Next surfaces as a runtime
error. The theme itself always applied (update callback runs regardless),
so this was noise, not broken behavior. Same failure mode as TanStack
Router #7906 (July 2026).

## Fix (2 lines + type widening, `lib/theme.ts`)

`transition.ready.catch(() => {})` and
`transition.updateCallbackDone.catch(() => {})` alongside the existing
`finished` handler. Expected aborts stay silent by API design; real update
errors still run through the existing path.

## Test (TDD: watched fail, then pass)

`lib/theme.test.ts` → "never leaks an unhandled rejection when the browser
aborts the transition": mocked rejecting ready/update/finished, collects
`process.on("unhandledRejection")`, asserts theme applied + zero leaks.
Pre-fix run showed exactly the two escaping InvalidStateErrors.

## Gates

`npm run typecheck` clean; eslint 0 errors on touched files; theme suite
5/5; `npm run build` clean (88 routes). Full `npm test`: 2070/2071 — the
single failure is `landing-hero-structure.test.tsx` (markup order in the
landing hero), caused by another stream's uncommitted `app/(landing-page)`
redesign in the shared dirty tree; untouched by and unrelated to this fix
(no import path between them). Not committed.
