# Manager HAVEN AI Workspace — 2026-09-14

## Scope

Redesigned only the Manager-facing HAVEN AI presentation. Daily Operations Brief and
Ask HAVEN remain the complete product surface; no model, prompt/tool-loop, predictive
formula, role permission, audit, or operational mutation path changed.

## Implementation

- Added a five-item KPI projection from the existing `BriefInput`: occupied rooms now,
  tomorrow arrivals, open guest requests, high-risk inventory items, and unresolved
  maintenance orders. `/api/ai/brief` returns the projection beside the cached or fresh
  narrative; Gemini does not generate or recompute these values.
- Rebuilt the page reading order as advisory hero → factual indicators → 65/35 brief and
  conversation workspace → read-only architecture explanation.
- Added compact loading skeletons, explicit `Unavailable` KPI states, conditional warning
  treatment, predictive-analytics provenance, safe manager-first-name greeting from the
  existing NextAuth session, and responsive/light/dark/reduced-motion styles.
- Preserved the existing Ask POST contract, history slice, safe Markdown rendering,
  provider-error handling, refresh rate limit, audit behavior, and tool registry.

## Verification

- Targeted HAVEN AI tests: 10/10 passed.
- Full suite: 1,040/1,040 passed across 94 files.
- Typecheck: passed.
- Lint: passed with 0 errors and 69 pre-existing repository warnings.
- Production build: passed (62 static/dynamic route entries generated).
- Final Impeccable layout detector: no findings.
- Manual authenticated desktop/mobile browser review remains pending: the local server is
  reachable, but the repository has no installed browser runner or reusable Manager role
  session. Source-level responsive, overflow, focus, light/dark, reduced-motion, loading,
  empty/error, and long-content behavior was inspected and covered where automatable.
