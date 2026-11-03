# REA Hotel PMS Analysis — 2026-11-03

User requested REA installation and an evidence-backed hotel-operations comparison
of Open Hotel PMS against Haven. Their pasted request superseded the earlier
investigation. Excluded domains were not traced in this analysis. No application
implementation, database mutation, migration push, deployment or commit performed.

## Deliverable

- `docs/rea-open-hotel-pms-analysis.md`: 24 sections plus ranked top ten; actual
  states, schema/ERD, 38 business rules, three state and six sequence diagrams,
  A–E classifications, adaptation cards and rollout proposal.
- Reference isolated in ignored `.tmp/reference/open-hotel-pms`, clean at
  `3f6956a54aa9faef44311f9e943ce7d44b6934e3`; not installed or started.
- Haven comparison uses local source at `d2ea413`; pending remediation migration
  is explicitly distinguished from deployed behavior. Hosted Supabase stays in use.

## REA

- Acquired `rea-agents` 6.8.0 via npx. Default Node 26.6.0 unsupported; reused
  existing bundled Node 24.22.1, no system upgrade.
- Shown dry-run plan, configured Codex with supported runtime, installed skill v49.
  Existing MCP retained; setup backup hash matches original configuration.
- Real stdio MCP server verified: 229 tools and successful session call. Chat tools
  subsequently loaded; direct session and scoped JS analysis calls succeeded.
  No further restart needed. Unneeded native analysis engines were not installed.
- Three hotel-only helper files statically analyzed; 737 AST nodes, zero parse
  failures. Partial app coverage, no UI/API/database execution. Export in ignored
  `.tmp/rea-investigation/rea-hotel-evidence-bundle.json`; IDs recorded in report.
- REA skill explicitly directed scoped parallel investigation; its narrow AGENTS
  exception was used for three read-only reviews, then root verified findings.

## Verified findings

- **Confirmed Haven availability defect:** unmodified AST-extracted production
  `countAvailableUnits` returns 0 for two rooms and consecutive stays in room 1
  although room 2 is continuously free (expected 1). Whole-window SQL counting
  also observed. Fix requires read/locked-commit agreement, not a display patch.
- Seven assertions on actual reference room-night-selection/checkout-release
  exports pass. These do not establish complete workflow or race safety.
- Useful concepts: nightly capacity, operational business date, atomic gated night
  audit, party identities, shared handovers and accurate assignment segments.
- Preserve Haven's stronger explicit state, transactional arrival/departure,
  mandatory room/identity/payment gates, inspections and separate money entities.
- Reference multi-write close/check-in/out and loose identity matching are not
  recommended. Reference KPI label filters are not copied without checking basis.
- No explicit business-date/night-audit mechanism found in bounded local searches;
  current Front Desk daily reports are separate and correctly use UTC+8 midnight.

## Verification and limits

- Evidence path/range validator and Markdown source-reference checks pass; 24
  numbered sections, ERD + 3 state + 6 sequence diagrams detected.
- Re-ran both isolated probes; results above freshly confirmed. No full application
  typecheck/lint/test/build run for this documentation/configuration work.
- Source paths checked, reference checkout clean; no app/migration/package changes.
  No browser integration, reference SQL replay, concurrency or live DB equivalence
  claimed. Prior browser QA constraints remain recorded in its separate session.
- Proposals remain unapproved. No Decisions entry or source fix added.
