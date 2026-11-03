# Hotel Operations Implementation Plan — 2026-11-03

User requested an implementation plan covering all findings and Housekeeping.
Used Writing Plans, current source paths, SYSTEM.md, REA/Housekeeping reports and
the earlier remediation rollout notes. Single-agent planning only.

Deliverable: `docs/plans/2026-11-03-hotel-operations-and-housekeeping.md`.

- 13 phases / 24 task groups with existing/proposed files, regression scenarios,
  API/DB/UI contracts, dependencies, acceptance gates and release procedure.
- Covers I-01–I-10 and HK-01–HK-03, plus failed-lookup versus sold-out display,
  prior 23-finding release dependency and conditional reference features.
- First batch: source/ledger compatibility → HK acceptance → nightly capacity
  correction across TypeScript and locked SQL, including gateway capacity paths.
  B-005 webhook envelope parsing remains excluded.
- Housekeeping's three fixes remain locally done; browser/extended SQL acceptance
  is planned without pretending that all live operational writes were tested.
- Business-date policy, close roles, cutover, correction and recognition rules
  remain proposals to settle before schema work. D-033 booked/live basis retained.
- New SQL stays unnumbered until live-ledger verification. No historic data rewrite,
  auth-clock change, inspection bypass or automatic identity merge is planned.
- Validated all local Markdown links, ten REA and three HK coverage IDs, 13 phase
  sections / 24 tasks, and whitespace/diff. Full tests/build not rerun for a
  documentation-only planning turn; earlier results explicitly historical.
- Existing dirty source/docs preserved. No new app/test/SQL implementation,
  database push, production mutation, deployment or commit performed.

No Decisions entry added: planning does not make proposed property policy approved.
