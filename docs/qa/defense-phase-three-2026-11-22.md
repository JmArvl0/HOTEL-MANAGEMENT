# Defense Phase 3 local verification

Verified on November 22, 2026 with synthetic records in disposable PostgreSQL databases. The production build used the local Phase 1–3 working tree. This report is local evidence and has no frozen release SHA.

| Check | Local result |
| --- | --- |
| Route types, TypeScript, and production build | Passed. |
| ESLint | Passed with zero errors and 80 warnings. |
| Full Vitest suite | All 2,690 tests passed across 271 files. |
| PostgreSQL migration replay | All 157 migrations replayed. The backend SQL regression run logged 24 passing checks. The occupant and workflow regression run logged 21 passing checks. |
| Arrival age | Missing evidence and a guest one day under the minimum were rejected without changing the reservation, room, or folio. A guest on the exact minimum-age birthday passed. A minor companion remained eligible. |
| Front Desk and Express QR | Edge verified the Front Desk code-entry fallback and ID form at 390px and 1440px. PostgreSQL verified a valid Express arrival, expired and revoked tokens, wrong-owner denial, stale evidence after a date change, and changed primary guest denial. |
| Walk-in and legacy arrivals | A paid walk-in needed primary age verification before it could occupy a room. A legacy arrival scheduled before the effective date followed the existing rules. |
| Guest service and folio | With the same Edge test stay, the guest resolved the room QR and submitted a request. Front Desk posted and collected a ₱125 charge. Checkout was blocked while a balance remained, then marked the room dirty and created a checkout cleaning task. Housekeeping could resolve the room QR after departure. |
| Account and role management | Front Desk was denied privileged account changes. Owner deactivation and role change each invalidated the prior session and wrote an audit event. |
| Gemini fallback | The Manager saw the unavailable response with Gemini disabled and could still load deterministic Predictive Insights. |
| CI definition | Push and pull request trigger the code checks in `.github/workflows/ci.yml`. Playwright announced all nine Chromium auth-setup tests through the corrected command. |

## Release items still pending

- Freeze a clean commit and run its GitHub Actions workflow. Verify the actual Vercel source commit and the linked Supabase migration ledger.
- Apply the matching migration and application release to the intended environment. Schedule the age policy through the existing audited effective-date control.
- Rehearse with the intended staff accounts, a physical QR camera, and the online booking payment sandbox on the deployed candidate.
