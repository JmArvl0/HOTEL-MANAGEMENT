# Guest My Stay release — 2026-11-14

The guest account leads with its real stay or active room hold, the next action,
verified payment summary, saved preferences, stay shortcuts and updates. Room
search and forms are compact; a published-content stay guide and Front Desk
contacts remain accessible before confirmation. Sign-in keeps the current
origin and booking callback. Expected arrival has required inline validation.
Unavailable checkout provides retry, support and hold-expiry guidance.

Confirmation access failures preserve the booking destination when switching
accounts and advise checking a successful payment before paying again. Missing
and unowned reservations retain the same 404 boundary and expose no stay or
financial details. A callback URL never confirms payment.

Two user-completed Xendit sandbox simulations were independently verified via
the provider and webhook-settled records: GCash deposit paid3840/balance8960;
Maya full paid12800/balance0; both confirmed. Real authenticated confirmation,
detail, receipt and read-only cancellation-preview checks passed. No real money.

Validation: production webpack build/typecheck passed; focused135/14 plus the
new recovery rendering test passed; production authenticated page and confirmed
booking/ownership HTTP checks passed. Full suite2517pass/4fail across246files.
The same four failures independently reproduce on clean deployed main6424807:
Owner/Admin sidebar expectations, purchase-order workspace surface contract,
and landing verified-review surface contract. These unrelated modules are
unchanged by this release. Full browser mobile/dark visual QA remains pending
because the browser-control service is unavailable; HTTP/jsdom are not visual QA.

No schema, secrets, payment policy, breakfast, Fleet, Workforce or unrelated
finance rollout is bundled. Existing auth layout/recovery prerequisites and
the mobile-number control's licensed local flag assets are included.
