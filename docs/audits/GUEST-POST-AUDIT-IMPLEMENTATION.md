# Haven guest post-audit implementation

November 24, 2026 · Philippine time · Local working-tree release candidate

## Executive summary

The implementation preserves the public hotel identity, exact-room workflow and verified booking records. It improves search recovery, checkout pricing, guest privacy information, confirmation and mobile arrival. The API boundary now distinguishes an empty write from an unsupported payload. The established origin rules and each handler’s authentication and authorization still apply.

**Release recommendation.** Keep the candidate for controlled demonstration and supervised local acceptance. Live Xendit, approved property privacy content, Finance and Fleet acceptance, and on-property QR use remain release gates. The public booking channel continues to enforce Xendit test mode.

**Resolution.** 13 verified fixes, 4 partial resolutions, 1 deferred performance concern and 1 external payment blocker. All 18 browser/HTTP scenarios, 54 rerun SQL checks and 2,749 Vitest tests passed locally.

## Reports

The [guest audit follow-up](GUEST-REGRESSION-TEST-REPORT.md#guest-audit-follow-up)
documents the later history benchmark, remaining local checks and open
property and external acceptance. The resolution register reflects the
latest result for each finding.

| Deliverable | Contents |
| --- | --- |
| [Resolution register](GUEST-AUDIT-RESOLUTION-REGISTER.md) | All 19 source findings, scope, acceptance criteria and final status |
| [Regression report](GUEST-REGRESSION-TEST-REPORT.md) | Recorded browser, database, repository and deployment coverage |
| [Before and after](GUEST-UI-UX-BEFORE-AFTER.md) | Captures from the audit and the implementation build |
| [Original audit](GUEST-EXPERIENCE-AUDIT.md) | Baseline findings and scorecard |

## Module and technical changes

| Module | Changes and effects |
| --- | --- |
| Landing, policy and room media | Public footer links the dedicated privacy page. Room photography preserves the configured order and labels illustrative photos. Checkout and exact-room views show a recovery state for failed media. |
| Catalogue and availability | Public and signed-in search distinguish request errors, zero supply and closed checkout. The editor keeps dates and points to the field that needs correction. Available numbered rooms carry an assisted booking link when online checkout is closed. A mixed nightly quote is identified as a starting rate. |
| Authentication | Booking account forms lead on phones, with the selected stay still visible below. Registration links privacy before submission. Existing selected-room, dates, party and breakfast callbacks remain in place. |
| Guest details and holds | Selecting breakfast updates the main summary and deposit. A native unload warning protects edited values when the browser permits it. Successful hold submission remains the persistence boundary. Browser session activity and Release hold reach their existing handlers. |
| Confirmation and finance | Guest cancellation, provider expiry, check-in, completion and no-show have separate copy. Terminal finance shows original verified collections separately from recorded fees, the current folio and refund state. Refunding and inventory release remain under the existing staff/SQL policies. |
| Account, accessibility and phone layout | Breakfast change restrictions appear before guests enter an ineligible request. Long cancellation reasons wrap outside the status badge. Mobile search moved to the navigation drawer. The confirmation’s Express Pass responds to its container and has a recovery message if loading fails. |

No database migration was required. Money and room inventory continue to use existing transactions, records and owned queries. The checkout provider and partner dispatch modes were unchanged. The scopes of staff pages and API roles were preserved.

## Industry and property decisions

- OPERA Cloud treats cancellation/no-show fees, payment collections and refunds as distinct folio operations. Haven’s display follows the same distinction using the existing financial records. Eligibility, timing and amounts still follow the hotel’s saved policies. [Oracle OPERA Cloud cancellation accounting](https://docs.oracle.com/en/industries/hospitality/opera-cloud/21.4/ocsuh/t_managing_reservations_managing_no_show_and_cancellation_deposits_and_charges.htm).
- Cloudbeds gives the guest access to the availability calendar when a specific room and rate combination is unavailable. Haven now makes date editing the first recovery action when its own inventory yields zero. [Cloudbeds Booking Engine guidance](https://myfrontdesk.cloudbeds.com/hc/en-us/articles/115004684433-How-to-redirect-your-guests-to-a-particular-room-type-and-or-rate-plan-in-Cloudbeds-PMS).
- The Philippine Data Privacy Act describes information guests must receive about processing, recipients, controller identity and retention. The new route provides application-specific guest information. Property management must approve the complete notice, identify the controller and set a privacy contact and retention periods. [National Privacy Commission, Section 16](https://privacy.gov.ph/Data-Privacy-Act/).

## Guest experience scorecard

Ratings are local observations. Areas outside the regression coverage keep their original score or are marked N/A.

| Area | Audit | Post-audit | Evidence |
| --- | --- | --- | --- |
| First impression and public visual design | 8 and 7 | 8 and 7 | The landing’s original photography, typography and planner remain. |
| Navigation | 8 | 8 | New public and in-account help links and one signup path. Mobile portal search stays accessible in the drawer. |
| Room browsing | 7 | 8 | Inventory, booking-channel status and photo provenance now have distinct language. |
| Availability search | 7 | 8 | Retained dates, field-specific validation and useful zero-supply recovery. |
| Registration and booking | 8 and 8 | 8 and 8 | Earlier mobile account controls and verified callback context. Draft recovery remains partial and OTP was outside this run. |
| Pricing transparency | 6 | 8 | Starting rate label, coherent breakfast selection and explicit cancellation charges. |
| Payment | 6 | 6 | Payment replay and expiry pass in the simulation. Production payment acceptance remains N/A. |
| Dashboard | 8 | 8 | Populated My Stay remains useful, with successful release and accurate confirmation states. |
| Booking management | 6 | 8 | Verified paid cancellation and context-specific breakfast amendment help. |
| Mobile | 6 | 8 | 390 px guest journey and seven tested widths. Pass and header reflow in the tested phone theme variants. |
| Accessibility and errors | 6 and 6 | 7 and 8 | Inline associated errors, clearer recovery and readable mobile arrival action. Systematic assistive-technology acceptance remains due. |
| Backend reliability and business logic | 8 and 7 | 8 and 8 | Real records, concurrent room checks, replay, actual hold release and role-scoped lifecycle transitions. |
| Security | 7 | 7 | Existing ownership denials and request policy protections passed. This was a scoped regression. |
| Performance | N/A | N/A | Guest-scale performance remains to be measured. |
| Local guest satisfaction | 7 | 8 | A paid test booking, cancellation and arrival details were easier to follow on a phone. |

## Remaining dependencies

- Hotel and Finance must approve live payment and payout handling, or adopt an assisted-only launch with verified support contacts. Confirm actual provider callbacks, reconciliation and refund acceptance in an approved environment.
- Property management must approve the privacy notice, actual photos, contacts, accessibility arrangements and operating terms. Staff should test the Express Pass with the real kiosk and scanner.
- Performance work still needs representative long booking histories, range/pagination requirements and a release timing baseline. The current history behavior remains available.
- External delivery, real payment, physical device and full assistive technology tests require their respective acceptance environments. No hosted changes or real guest data were used for this implementation.
