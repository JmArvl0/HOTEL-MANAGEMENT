# 2026-11-20 — Staff production release

The hosted dry-run named only `20261120010000_portal_request_inventory_link`
and `20261120020000_deduplicate_financial_documents`. The apply command
rechecked the dry-run and applied those two files. Read-only verification
matched all 153 hosted entries to the candidate and confirmed the stock link,
fingerprint, receipt lock, tax and settlement fields, RLS on the replay-key
table, and Lost & Found tables.

GitHub `main` advanced from `2a10620` to `69d16de` via fast-forward. The
Vercel Production deployment completed at 07:24 Manila time. The separate
Supabase Preview check reported failure. It did not block the production
build, migration apply, or hosted ledger readback.

The production login page responded, and Edge confirmed the signed-out staff
route redirects to login. The Lost & Found API returned 401 without a session,
and the live staff page served the Lost & Found CSS. The interactive login
window timed out without an eligible staff session, so the signed-in UI smoke
remains pending. The full three-role workflow was verified locally in the
port session. No production custody records were written.

See [[2026-11-20 - Staff Migration Conflict Reconciliation]] and
[[2026-11-20 - Lost and Found Main Port]].
