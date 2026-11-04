# Enterprise Module Architecture Audit — 2026-11-04

User requested a complete critical audit of the proposed seven-system Hotel and
Restaurant enterprise architecture, with deeper assessment of Haven's seven Hotel
modules, feature classification, ownership, integration contracts and roadmap.

Delivered `docs/audits/ENTERPRISE-MODULE-AUDIT-2026-11-04.md`. All 11 requested parts
and 13 exact final-summary headings are present. Mechanical comparison to the
attached brief confirms 69 original module/group rows, all 146 named feature
occurrences, seven modules with eight required analysis fields and 54 ownership
matrix rows with one owner each. Markdown table widths/fences are checked.

## Evidence and conclusions

Baseline: clean `main` at `a3f2438`. Reviewed relevant SYSTEM.md sections, current
handoff/status/decisions/issues, boundary and scope reports, latest scoped QA,
restaurant contract proposal, current financial/auth/stock/occupant/gateway source
and migration names. Consulted official OPERA, Cloudbeds, Mews, Hotelogix,
ERPNext/Frappe HR, Odoo, PayMongo, BIR and PCI SSC documentation; links appear by
the supported claims in the report.

Recommend seven business domains with a thin shared platform. PMS owns stays,
room readiness and guest folios; HR employee/payroll, SCM authoritative enterprise
stock/procurement, Finance books/credit/settlement, Fleet dispatch, Facilities
building maintenance and Restaurant orders/POS remain distinct. Existing local
stock/PO/transport/maintenance workflows remain until reconciled cutover. Several
features missing from the original headings already exist in Haven, notably
operating-day/night-audit, atomic stock, cash controls and handover. New local
features and historical hosted releases retain their separate evidence status.

Scores are advisory: proposed architecture 6/10, current local PMS completeness
7.5/10 and next merged release readiness 5/10. They are not hosted availability,
legal compliance or security certifications. Architecture changes remain proposals;
no approved decision was added to Decisions.md or SYSTEM.md.

Current gateway source reads paid-event type from top-level `event.type`, whereas
official provider examples put it in `data.attributes.type`; raw route handling can
acknowledge those standard paid events as ignored. Flagged before automatic gateway
reliance, without applying the repair excluded from earlier implementation scope.
No provider sandbox action performed.

## Fresh verification

Used available Node22.22.2 runtime through process-local PATH.

- `npm run typecheck`: pass.
- `npm run lint`: exit0, 0 errors/88 warnings.
- Initial `npm test`: sandbox TEMP rename denied; 212 file-load failures, no tests
  executed. Retried safely with workspace-local TEMP/TMP; no source workaround.
- Full `npm test`: 209 files pass/3 fail; 2,281 tests pass/3 fail out of2,284.
- Isolated three-file rerun, one worker: 50 pass/2 fail out of52. Reproduced
  `lib/purchase-orders.test.ts` expected UI-copy/source-contract assertion and
  `components/front-desk/fused-room-rack-panel.test.tsx` All Reservations table
  assertion. Booking clipboard timeout passed in isolation. Full suite remains red;
  no test or implementation edits made.
- `npm run build`: pass.
- Logs retained locally in ignored `.tmp/enterprise-audit/`.

No browser journey, live ledger/database check, SQL replay, backup/restore,
external sandbox, tax certification, production write, migration or deployment
performed. Report/coverage verification is distinct from those unperformed checks.
No subagents used. Only report, session and current handoff documentation changed.
