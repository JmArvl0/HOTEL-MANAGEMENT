# Haven and enterprise system boundaries

Status: proposed team agreement, 4 November 2026. This describes intended ownership,
not a confirmed allocation image, active external connection or approved removal of
existing functionality. SYSTEM.md remains the authoritative Haven behavior reference.

Haven covers the seven hotel areas: Guest & Customer; Reservation & Booking; Front
Office; Rooms & Housekeeping; Billing & Payments; Inventory & Staff; Administration
& Analytics. Coverage, implementation, testing, deployment and policy activation are
separate milestones. Role-specific navigation remains appropriate for daily work.

| Process/data | Proposed authority | Hotel responsibility |
|---|---|---|
| Guest/stay/room/rate/folio | Hotel | Operate and audit the hotel lifecycle |
| Hotel collections/refunds | Hotel transaction record; Finance accounting record | Preserve settlement evidence and reconcile Finance acknowledgments |
| GL, enterprise AR/AP, statements | Finance | Supply source transactions, corrections and reconciliation totals |
| Employee legal record, payroll, leave | HRMS | Retain local hotel role/access and work assignments; do not treat workload as attendance |
| Suppliers, sourcing, enterprise PO | Supply Chain | Request supplies, acknowledge hotel delivery and track local consumption |
| Restaurant menus/orders/POS | Restaurant | Validate permitted stay charges and record them on the correct folio |
| Guest transport request | Hotel | Capture guest need, display acknowledged status and billing linkage |
| Vehicles/drivers/dispatch/trip | Fleet | Reference partner assignments without creating a second fleet authority |
| Room sellability/housekeeping | Hotel | Apply room safety, cleanliness and inspection checks |
| Enterprise repair work/assets | Facilities, if assigned | Raise room incidents, observe repair result and release rooms only through hotel rules |

## Current behavior and transition

Night Audit, operating-day controls and handover records exist. Unreleased local
occupant/guest-control/housekeeping additions must retain their acceptance and
deployment status; this document does not activate them.

Local procurement already has draft editing, submission, threshold approval,
Owner/Admin exception review, receiving and cancellation. Receiving updates hotel
stock; it does not establish supplier communication or enterprise goods receipt.
Transportation also has a local operational workflow. Keep both until a reviewed
handoff maps their states, open records, financial consequences and fallback rules.
Do not achieve separation by renaming tables or deleting working records.

Before cutover, each pair of teams must agree on stable external identifiers, which
fields each team may change, cancellation/correction handling, delayed messages,
reconciliation, support ownership and behavior during an outage. One record can
have references in multiple systems; add mappings for concrete integrations rather
than synchronization columns on every table. No cross-team direct table writes or
shared service-role credentials.

## First integration candidate

Restaurant charge-to-room is the first candidate if its team can supply a sandbox
and agree on the contract in `integrations/RESTAURANT_CHARGE_TO_ROOM.md`. Until then,
Front Desk can use existing authorized manual folio charge posting. Proposed APIs
are not implemented or live merely because they are documented.

Use the existing financial calculations and server-owned posting dates. A restaurant
charge increases the folio obligation; it is not a second payment. Finance must agree
how POS revenue and Hotel settlement references are reconciled to avoid double
counting. Night Audit must not add room charges over an existing contracted obligation.

Reliable outgoing messages are built alongside an actual receiving system: save the
business change and event atomically, retry deliveries and deduplicate the receiving
effect. Track outcomes per destination when there is more than one recipient. An
event table without a sender, receiver and reconciliation is not an integration.

## Deferred until required

Group/corporate room blocks and OTA synchronization remain legitimate Hotel future
work, not prerequisites to representing seven modules. Stock issue and physical-count
operations already exist through `hms_stock_movement`. Additional transfers/returns,
lost property and pricing need confirmed property workflows.
Payroll, fleet dispatch, restaurant POS and a general ledger do not belong in this
hotel implementation batch.
