# Supplied Fleet local contract

Haven's separately proposed Workforce contract is
[`workforce-haven-v1.schema.json`](workforce-haven-v1.schema.json), with ownership,
security, time/version semantics and setup in
[`WORKFORCE_MANAGEMENT.md`](../WORKFORCE_MANAGEMENT.md). It is prepared on the
Hotel side and has not been supplied or accepted by a Workforce provider.

Received from the user on 13 November 2026 as `schema.txt`, accompanied by the
acceptance example saved under `examples/acceptance.json`.

The schema is an exact byte copy. SHA-256:
`534f41165150e79d1cfa94aeb987da2a0862e0a2a2e1f703420ce514c1d0a16a`.
Identifier: `urn:fleet:haven:local-contract:2026-11-06`.

Its `x-source` explicitly includes uncommitted Fleet implementation. It does not
establish a deployed revision, approved hosting origin, sign-off or frozen
production contract. No credentials or genuine passenger data are included.

Haven uses the flat create shape and complete wrapped success/plain callback
snapshots. The adapter rejects conflicting aliases and unsafe tracking bindings
in addition to JSON Schema checks. See [the adapter and manual QA guide](../HAVEN_FLEET_PREPARATION.md).
