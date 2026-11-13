# Financial Documents Implementation

The staff Financial Documents section uses a register beside a selected issued
snapshot. Staff can search by number, guest or booking reference, filter by
document type and Manila issue date, and page through results. On phones, the
document opens separately; Back to documents restores focus and the register
page.

Receipts show the payment received. Folio statements show the balance at issue,
with saved folio totals and the optional frozen VAT breakdown, payments,
charges and adjustments available inline. Existing server issuance routes,
role permissions and immutable document snapshots remain authoritative.
The user approved implementation of the sample design at
[[2026-11-12 - Financial Documents Design Prototype]].

TypeScript passed. Targeted ESLint reported zero errors and three existing
hook warnings in the dashboard client; the new component added none. The
production build could not create its sharp junction under .next (Windows
access denied, OS error 5). Tests and authenticated browser QA were not run.
No database, migration or deployment changes.
