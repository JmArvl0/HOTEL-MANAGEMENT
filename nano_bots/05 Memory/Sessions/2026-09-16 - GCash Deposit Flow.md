# 2026-09-16 - GCash Deposit Flow

New online reservation deposits are GCash-only against an Owner-configured
destination; the Owner edits it, System Administration monitors it read-only,
Accounting verifies proofs as before.

## What

- Migration `20261006010000` (pushed + live-verified): `gcash_account_name` /
  `gcash_mobile_number` / `gcash_qr_storage_path` / `gcash_enabled` (default
  off) on `hotel_operational_policies`, private `payment-qr` bucket, new
  `owner_update_payment_destination` RPC (owner-only, version-checked,
  masked audit, QR-path + `09XXXXXXXXX` validation). Existing policy RPC
  untouched — live body read first per KI-003.
- `lib/payment-destination.ts` (pure): normalize/mask/complete/zod, shared by
  panel, form, and routes.
- Owner → Governance → Payment Settings (`components/owner/payment-settings-panel.tsx`):
  method/status, destination form, staged QR upload, customer-facing preview,
  explicit money-redirection confirmation on Save, masked history.
  Routes: `PATCH /api/owner/payment-destination`, `POST/DELETE /api/owner/payment-qr`,
  `GET /api/owner/data?section=payments` (uses existing `guardOwner`).
- Admin → System Health → Payment configuration: masked read-only business
  values + technical health folded into the existing `systemHealth()` payload
  (no duplicate endpoint); `lib/system-health.ts` extended, presence-only.
- Customer deposit page: destination block (QR 240px object-contain, name,
  number + Copy/Copied, exact amount), 8-step guide, reference + receipt
  unchanged, GCash-only submit; disabled/incomplete safe states. Confirm route
  rejects non-GCash methods and closed/incomplete destinations server-side.
- `depositSubmissionSchema` is now `z.literal("manual_gcash")`; portal
  stay-payment form and historical bank records untouched by design.

## Decisions (user-confirmed)

- Destination columns on the policy table (one write path, audited).
- Portal balance form keeps both methods (GCash-only = new booking deposits).
- Private QR bucket + inline bytes (no permanent public URL; replaced QR retires).
- See [[D-016]].

## Verification

- Targeted 146/146 (incl. new 25 + 5); full 1270/1270 (112 files — `.kilo/**`
  added to the vitest exclude so a parallel session's worktree copies no
  longer execute from this root). Typecheck clean. Lint 0 errors (0 in
  touched files). Build 66/66. Detector clean.
- Live: migration applied (ledger 20261006010000 in sync); columns/RPC/bucket/
  grants verified; RPC guards probed rollback-wrapped (admin refused,
  stale version refused, 0 audit residue). Live row: disabled, unconfigured.
- Manual browser QA pending (Owner/Admin/Customer/Accounting flows need live
  role sessions + an uploaded QR).

## Follow-ups

- Owner configures name + number + QR and enables GCash (currently off — new
  deposits show the unavailable notice until then).
- Manual QA per role; commit the tree with the parallel session coordinated.
