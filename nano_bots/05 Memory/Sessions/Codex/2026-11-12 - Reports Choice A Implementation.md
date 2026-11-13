# 2026-11-12 - Reports Choice A Implementation

## Approved direction

The user selected Choice A, Executive brief, from the Reports prototype and
approved implementation in the system.

## Changes

- Manager and Accounting Reports now lead with the report heading, decision
  metrics, booked-occupancy trend, and room status before Night Audit.
- Front Desk report-status metrics now follow the heading and precede report
  previews and history. Status counts say when they refer to the current page;
  total records use the server-provided total.
- Admin Reports now shows four headline account metrics, role-distribution bars,
  an expandable exact-count table, and the existing configuration summary.
- Owner Reports keeps its executive metrics and two reports, with booked
  occupancy visually leading. The responsive report charts stack at tablet size.
- No API, report permissions, submission/review workflow, export workflow, or
  database changes.
- `DESIGN.md` §12 records the resulting presentation hierarchy.

## Verification

- `npm run typecheck` passed.
- ESLint on the four touched report components found no errors and four existing
  hook warnings: one in Front Desk's report load effect and three in Owner's
  existing effects/callbacks.
- Impeccable layout/type scan exited successfully without findings.
- `git diff --check` exited successfully; Git printed existing line-ending
  notices for unrelated dirty files.
- No tests, production build, or browser screenshot QA were run. Browser QA is
  pending.
- Changes are local and uncommitted in a worktree with unrelated existing edits.
