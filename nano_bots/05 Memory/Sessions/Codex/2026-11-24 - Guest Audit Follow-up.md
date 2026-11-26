# Guest audit follow-up — November 24, 2026

The 1,240-stay fixture crossed a 1,000-row PostgREST cap. The final app reached
the oldest records and kept guest records scoped to their owner. My Stay reads
the primary stay and bounded update candidates. Payments & Folio and Requests
render paged histories. The report records the before and after measurements.

The local guest journey passed 22 browser and HTTP checks, including unsaved
in-app navigation, room-photo failure, synthetic payout retries and an approved
fee-waiver record. The Webpack build, standalone TypeScript, 60 targeted tests
and 2,749 full Vitest tests passed. Scoped lint had zero errors and one existing
hook warning. Verification used loopback services and synthetic payments.

The register records 16 verified fixes, two partial resolutions and blocked
live checkout. Property approvals and hosted acceptance are listed in the
follow-up report.

[Regression report](../../../../docs/audits/GUEST-REGRESSION-TEST-REPORT.md#guest-audit-follow-up) · [Resolution register](../../../../docs/audits/GUEST-AUDIT-RESOLUTION-REGISTER.md)
