# Manager Approvals

The exception engine over the operational workflow. `SYSTEM.md` §7.8 is authoritative; this
note is the vault summary.

## Request

Anything policy would refuse — room upgrade, reservation modification, early check-in, late
checkout, guest compensation, refund exception, checkout exception, room-type exception, guest
escalation — can be filed as a **manager approval request** (`request_manager_approval`;
front desk / housekeeping / maintenance / accounting may request; manager cannot request for
themselves). Each request records severity, the proposed `requested_action`, and the normal
policy result it overrules. Optimistic `version` + partial-unique "one pending per entity"
(new requests are allowed after a previous one is approved/rejected).

## Review

`review_manager_approval` (owner/admin/manager; self-approval forbidden) re-runs the
feasibility check **at review time** — e.g. an upgrade needs a free target room, a
modification re-counts inventory, compensation ≤ folio, refund ≤ settled deposit. For
room-type exceptions it additionally revalidates the exact requested room via trigger
(migration `20260919010000`).

## Execution is separated from approval

Approved operational exceptions are executed by the owning department
(`front_desk_execute_manager_approval`; the check-in path consumes room-type exceptions
directly — see [[Check-in & Room Assignment]]); financial ones by Accounting
(`accounting_execute_manager_financial_approval`). High/critical exceptions can be escalated
to Owner (`escalate_manager_approval_to_owner` → `review_owner_exception`) — see
[[Owner Governance]].

## Room-type exceptions are guided

The room-type exception request can only be created from the Front Desk arrival dialog's
live-inventory dropdowns, never free-typed, and carries structured IDs validated at three
gates — [[D-003 — Structured-ID room-type exceptions]].

Related: [[Check-in & Room Assignment]] · [[Owner Governance]] · [[Auth & Permissions]]
