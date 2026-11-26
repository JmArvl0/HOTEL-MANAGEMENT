# Guest improvement roadmap

[Audit index and master findings](GUEST-EXPERIENCE-AUDIT.md) · [Test results](GUEST-QA-TEST-RESULTS.md)

Order the work by release risk. Use the existing Haven visual identity, server-side policies, movement of money and partner boundaries as design constraints. The audit repository changes contain documentation and evidence only.

| Phase | Work | Exit evidence |
| --- | --- | --- |
| 1 · Critical bugs, security and data integrity | Decide whether direct payments are part of the release and agree the Hotel/Finance contract or assisted path (GUEST-001–002). Publish the approved privacy notice (GUEST-003). Repair session activity and hold release (GUEST-007). | Approved environment and provider scope, real idle/absolute session and hold-release checks, verified payment and assisted-only configurations, and privacy before signup. |
| 2 · Backend and business logic | Correct confirmation state and monetary semantics after cancellation (GUEST-013, GUEST-016). Expose whether nightly rates vary without changing authoritative pricing (GUEST-004). Check property-size history loads and bound scoped reads if needed (GUEST-012). | Persisted state matrix for pending, confirmed, cancelled with fee/refund, expired and refunded. Server and guest view totals reconcile. Long-history benchmark and completeness results are recorded. |
| 3 · Guest workflow and usability | Supply one live quote (GUEST-005), recover interrupted forms (GUEST-008), keep search validation and zero-supply recovery actionable (GUEST-010, GUEST-018), and make the restricted amendment help path visible up front (GUEST-017). | Desktop and mobile resume with choices intact, deliberate abandon and retry, useful zero-supply results, and verified restricted and supported change paths. |
| 4 · Targeted interface modernization | Reflow the Express Pass (GUEST-014). Protect shared header and checkout content space from competing controls (GUEST-015). Make sign-in form intent visible sooner (GUEST-011). | Checks at 360, 390, 430, 768 and 1440 px include physical QR use, keyboard focus, touch targets and both portal themes. The public identity is preserved. |
| 5 · Useful feature enhancements | Clarify photo provenance and fallback states (GUEST-009). Accept partner transportation and Finance workflows before exposing their final claims. Confirm notification, receipt and policy capabilities explicitly with the property. | Configured and fallback photos, disabled and accepted partner flows, receipt and Fleet acceptance evidence, and links to approved operational handoffs. |
| 6 · Visual polish and performance | Apply the shared hotel-date formatter (GUEST-006), separate long cancellation reasons from fixed-size badges (GUEST-019), and measure image requests and guest loads after the structural work. | Date-only formatting fixtures across boundaries, stable long content, cold/warm and throttled metrics tied to the same build and seed. |
| 7 · Regression and release acceptance | Run the test coverage backlog against an isolated copy and an approved representative release. Freeze app and schema as one candidate. | Full Vitest/build/lint checkpoint, browser cases across roles/device sizes, dual-session last-room and payment retries, partner and policy sign-off, and rollback/reconciliation walkthrough. |

## Quick wins

- Render the nightly label as “From” when the estimate includes different rates, with a short breakdown link. The total already comes from the correct server calculation. GUEST-004.
- Correct the request contract for session activity and hold release. Verify both in Edge and verify the inventory update after release. GUEST-007.
- Move the known breakfast restriction next to the primary stay action and link to assisted changes. GUEST-017.
- Correct the cancelled/expired heading and retry action as soon as the status classification is agreed. GUEST-013.
- Remove duplicated punctuation and make search errors persist beside the relevant field. GUEST-010.
- Use readable date-only formatting and consolidate duplicate mobile account-creation links. GUEST-006, GUEST-011.

## Release sign-off owners

Hotel Product and Front Desk own guest-facing booking, arrival and cancellation policy. Engineering owns environment separation, software correctness, release evidence and rollback. Finance owns monetary reconciliation, refund acceptance and live mode approval. Fleet owns its ride acceptance and operational execution. Property management approves guest privacy content and live contact information before opening the booking channel.
