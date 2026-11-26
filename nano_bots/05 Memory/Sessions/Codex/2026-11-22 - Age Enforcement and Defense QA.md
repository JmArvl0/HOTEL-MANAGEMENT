# Age Enforcement and Defense QA

- `20261122010000` ties primary guest age evidence to the current reservation guest and local scheduled arrival date. The migration leaves activation dates under the existing audited Owner/Admin policy.
- Front Desk can verify again after an arrival date change. The form submits the arrival date, roster version, and official-ID attestation. Rosters and Owner audit projections omit DOB and exact age.
- Manual and Express QR arrivals share the database check. QR resolution respects explicit expiry and revocation while lifecycle tokens remain valid through active stays.
- Added GitHub Actions for install, type generation, typecheck, lint, tests, and build. The e2e auth setup command now resolves to the tracked Playwright spec.
- Local migration replay, 21 occupant/workflow SQL checks, production build, and all 2,690 tests passed. Edge verified the scanner and age form, room QR guest service, folio, checkout-to-housekeeping, Gemini fallback, and invalidation and audits for role and status changes. See [local verification](../../../../docs/qa/defense-phase-three-2026-11-22.md).
- Supabase CLI reported this checkout has no linked project. Migration, age-policy activation, and CI execution remain pending on the defense release.
