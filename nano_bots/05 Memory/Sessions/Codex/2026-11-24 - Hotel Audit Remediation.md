# Hotel Audit Remediation

The user authorized implementation of the local hotel product audit. See `docs/audits/2026-11-24-haven-audit-remediation.md` for A01–A10 outcomes and acceptance gates.

- The patched production graph has zero reported advisories. Nodemailer 10.6.1 is scoped through the optional NextAuth peer override. Zod 4.6.7 preserves public validation copy and historical hold token parsing. A clean npm 10 install and local SMTP delivery over TLS passed.
- `20261124010000` adds audited Owner assignment of a primary and backup active Manager for the operating day. PostgreSQL rechecks authorization, blockers, exact replay and concurrent close. Existing Accounting covers unresolved financial work.
- `20261124020000` adds scoped Front Office queue search, counts and pagination. Selected day and full history retain their meaning. Dashboard reads use role/scope projections and Accounting screens fetch separate sections. The fixed global loading delay was removed. Room Rack uses governed badge colors and readable mobile action labels.
- Added offline validation of draft Finance review acknowledgments, CI database replay and signed-in browser checks. Local work keeps partner activation pending. The read-only hosted ledger still has 155 applied versions and six outstanding local migrations. Evidence is in `.tmp/audit-remediation/`.
