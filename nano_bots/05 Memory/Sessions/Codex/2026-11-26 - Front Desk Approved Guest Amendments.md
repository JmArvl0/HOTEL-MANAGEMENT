# Front Desk Approved Guest Amendments

FD-API-008 and FD-API-009 are verified locally. Front Desk’s default queue
includes approved guest amendments awaiting execution. Migration `20261126050000`
distinguishes a held replacement from general unavailability, including when
that hold takes the last available room. The approval displays the recovery
message next to the execution action.

In Edge the same replacement succeeded after expiry. PostgreSQL confirmed
one active replacement assignment and the same ₱245 folio, including its
original charge and recorded deposit, after execution and retry. Typecheck,
the local build and all 2,761 Vitest tests passed. Local synthetic fixtures made no payment
or refund requests. Hosted verification remains pending.

[Audit evidence](../../../../docs/audits/front-desk/FRONT-DESK-SHARED-INVENTORY-TEST-REPORT.md#fd-api-008-and-fd-api-009-local-fix)
