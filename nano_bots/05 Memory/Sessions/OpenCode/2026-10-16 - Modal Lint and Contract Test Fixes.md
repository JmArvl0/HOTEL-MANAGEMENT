# 2026-10-16 - Modal Lint Fix and Contract Test Batch

Committed as `5f105c2` (7 files, +27/−38). No push.

## What was done (verified, not planned)
1. `components/ui/Modal.tsx` — deleted the render-phase `detectedShell` IIFE
   (`hostRef.current` + `document` read during render, `react-hooks/refs`
   error); portal wrapper now uses the existing effect-computed `shellClass`
   state (effect extended with the IIFE's document fallback). No behavior
   change: portal, backdrop, focus trap, Escape/backdrop dismiss, scroll lock,
   shell cascade all preserved.
2. Six contract test files — minified exact-byte pins switched to
   whitespace-tolerant matches (all guarded behaviors verified present in
   source first): `lib/refund-workflow.test.ts` (`manager:\s*\[`),
   `lib/security-policy.test.ts` (OTP/session labels + option sets; OTP
   labels accept `-`/`—`, needs product confirm which dash is canonical),
   `lib/guest-staff-conversion*.test.ts`, `lib/admin-governance.test.ts`,
   `lib/client-fetch-resilience.test.ts`.

## Gates (fresh, this session)
- `npm run lint`: 0 errors / 97 warnings (was 1 error / 97 warnings).
- `npm run typecheck`: exit 0.
- Targeted 6 files: 91/91 pass. Full `npm test`: **2069/2069 pass, exit 0**
  (baseline was 2062 passed / 7 failed).
- `npm run build`: 88/88 routes (verified pre-commit in earlier phase).

## Commit incident (recovered, no data loss)
First commit attempt (`6904f46`) swept in pre-staged staff-CSS-rewrite
deletions (4 theme files) that were already in the index before this work —
the commit would have deleted theme files the committed `layout.tsx` still
imports. Caught via `git show --stat`, undone with `git reset --mixed HEAD~1`
(unpushed, worktree untouched, verified all files present), re-committed
pathspec-scoped as `5f105c2`. Lesson: always check `git diff --cached --stat`
before committing in a tree with pre-staged unrelated changes.

## Still open (separate authorizations)
- Staff CSS rewrite half-applied in worktree (4 deletions unstaged +
  `?? app/staff-theme.css`); no browser QA (KI-005); migration ledger vs
  live unverified; em-dash vs hyphen OTP label copy needs product confirm.
