# 2026-10-18 — Full Role QA and Lifecycle Trace (`haven-qa-testing`)

Skill-driven structured QA per `.opencode/skills/haven-qa-testing/SKILL.md`. No
app code changed by QA except the one authorized config fix below. No
migrations, no git operations, no real payments (manual-gcash paths only),
vault memory written only at session end (user-authorized Stage 4).

## Baseline gates

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS (exit 0) |
| `npm run lint` | PASS — 0 errors / 97 warnings (React-hooks advisory + a11y + no-img) |
| `npm test` | PASS — **186 files / 2069 tests** (green after fix) |
| `npm run build` | PASS (exit 0) |

## Defects

- **HQA-001 (P3) — FIXED + VERIFIED**: `vitest.config.mts` excluded
  `node_modules/**` but not `.opencode/**`, so the newly untracked
  `.opencode/node_modules/zod` vendored test tree (~142 suites, 3 failing on
  missing peers) was swept into `npm test`. One-line exclude added;
  authorized. `npm test` re-verified 186/2069 green, exit 0.
- **HQA-002 — CLOSED as test-credential correction (not an app defect)**:
  `owner@haven.test` returns `CredentialsSignin` on the shared test password
  while 7 sibling accounts pass the identical flow; the account exists in
  admin governance data. Root cause: wrong test email — the live owner login
  is `arevalojohnmichael24@gmail.com` (verified role=owner). P3 observation:
  review the inactive `owner@haven.test` governance row in admin.
- Doc-level observation (NOT a defect): two guarded payment-verification
  surfaces exist — `/api/accounting/payments/[id]/verify`
  (`verify_customer_stay_payment`) for stay payments, and
  `/api/front-desk/deposits/[id]/verify` (`verify_reservation_deposit`) for
  reservation deposits. Using the wrong family fails clean (409
  PAYMENT_NOT_FOUND). Worth a doc note in SYSTEM.md.

## Role-by-role matrix (live HTTP, one account at a time)

All 8 roles PASS — login/session, own APIs → 200, cross-role → 403/401,
empty-body write probes → 400/409 validation (nothing created):

| Role | Own reads | Cross-role denials | Write probes |
|---|---|---|---|
| guest | profile/notifications/loyalty 200 | 6/6 → 403 | 4/4 → 400 |
| front_desk | dashboard/rack/transport/ledger(role-scoped)/cash 200 | admin 403, hk 403, guest APIs 403 | 8/8 → 400/409 |
| housekeeping | dashboard 200 | 6/6 → 403 | hk RPCs 400/409; front-desk 403 |
| maintenance | dashboard + `resources/maintenance_orders` 200 | 5/5 → 403 | approvals filing 400 (by design) |
| accounting | ledger/cash 200 | rack/front-desk/hk 403 | 400s |
| manager | rack/transport/insights/pricing/approvals/AI brief 200 | ledger 403, admin 403 | coordination 400s |
| admin | security-policy 200, gov endpoints 200/400 | `manager_dashboard` 403 **by design** (`app/api/manager_dashboard/route.ts:9`; admin uses `/api/admin/*`) | user-create 400 |
| owner (`arevalojohnmichael24@gmail.com`) | security-policy/insights/pricing/ledger/rack/transport 200 | `manager_dashboard` 403 (by design), hk transition 403 | users/action 400 |

Verified-by-design (not defects): ledger readable by cash-handling
front_desk (role-scoped); insights gives front_desk the operational subset
only; `/api/account/profile` GET returns own data with PATCH guest-only;
`catalog/room-types` 403 for guests (staff `guardCatalog`; guests get the
catalog via SSR booking pages).

## Unauthenticated sweep (no credential needed)

32 probes: every protected API 401/405; page shells (`/manager_dashboard`,
`/my-reservations`, `/account`, `/qr-placard/[id]`) render data-free 200
shells (no data markers in HTML) — auth enforced at the API layer.

Courseware note: OTP default-off (SMTP unconfigured → password-only path);
10-fails/15-min lockout DB-backed; session idle/abs enforcement lives in the
session callback; stage-1 OTP tokens carry no role/id (fail-closed).

## Deep lifecycle trace (real data path, guest account only)

1. Availability (front_desk): Garden Twin, 1 unit, PHP 5800 (1 night).
2. Guest hold `POST /api/booking/holds` → **201** token; includes
   `create_booking_hold` RPC + deposit policy snapshot.
3. Deposit gate (no proof): confirm `{}` → 400; confirm with fabricated
   staged-proof path → 400 — server re-derives proof from storage; no
   reservation without a real uploaded image. No bypass found.
4. Placeholder 2×2 PNG (temp; 118 bytes) → multipart proof upload → 201
   staged path.
5. Confirm (manual_gcash, test reference) → **200**: reservation minted,
   transaction `pending_verification`, invoice auto-issued.
6. Deposit math **policy-derived live**: required 1740 = 5800 × 3000 bp ✓.
7. Accounting verify-approve → reservation **confirmed**, payment
   `partial`, remaining 4060 ✓.
8. Front desk: eligible-rooms → 1 match (RM-102, correct type) → assign 200
   → identity attestation 200 → balance payment 200 → folio **paid 5800 /
   balance 0** (exact math).
9. Gates each refused correctly while outside their precondition:
   check-in 409 (stay window: opens 15:00 PH / stated arrival 18:30);
   charge 409 ("in-house reservations only"); checkout 409. Policy engines
   verified as data-path behavior, not just rendered UI.
10. Resolution: guest cancel → `cancelled` terminal, refund 0 per the
    <7-days policy tier; **RM-102 released** (inventory restored).

## Residue ledger (all inert + marked)

- RSV-27898D85 / HVN-261018-7C66CF — cancelled, folio settled,
  `special_requests` carries `QA-TEST-DELETE disposable` marker.
- 2 transaction rows (verified deposit 1740 + balance payment 4060) +
  INV-55CF50C2 (cancelled) — closed ledger trail.
- Immutable audit rows (by design; hard delete structurally impossible).
- One 118-byte proof file remains in the proofs bucket
  (`pending/<hold-token>/<uuid>.png`) — unreferenced; the delete endpoint is
  hold-active-only by design, so post-confirm cleanup cannot remove it.
- First exploratory hold self-expired (15-min TTL). Zero open holds.

## Untested (honest limits)

- Browser/responsive UI at 390/768/1366 px — no browser tooling; nothing
  fabricated. Manual checklist available.
- Gemini/QR visual round-trips, OTP real-email delivery (SMTP unconfigured).
- CRUD happy-path beyond this lifecycle (e.g. full housekeeping worker
  cycle against the auto task, express/ETA check-in, reports drill-downs).
