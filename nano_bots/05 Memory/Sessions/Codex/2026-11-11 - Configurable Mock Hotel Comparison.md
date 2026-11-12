# Configurable mock hotel comparison — November 11, 2026

User has no client yet and requested mock hotel information, best-practice content
coverage and easy replacement through configuration. User answered the scope
question: **proposed comparison only**. No actual website implementation authorized
by this follow-up.

Created:

- `docs/design/haven-demo-hotel-profile.json`: structured fictional identity,
  contact/address, amenities/dining, family/access, images, nearby examples and
  provisional policies. Real room catalog/inventory is not duplicated.
- `docs/design/haven-demo-hotel-profile.md`: basis, limitations and future mapping
  to existing policy/catalog/location ownership.
- Inline `haven-current-proposed-demo.html` in the thread visualization directory,
  preserving the preceding comparison file. All 34 findings plus full-page view
  remain; new Demo hotel settings edits the proposed profile locally.

The fictional city hotel has complete sample content instead of owner-placeholder
brackets. Contact actions remain disabled; map pin is explicitly the Rizal Park
orientation demo. No hotel distances, guest reviews, awards or ratings invented.
Images and physical facilities are labeled illustrative/sample. Hotel-information
structure was checked against Hilton's official property-information page and
Marriott's property-specific policy guidance. Sample prices/inclusions are authored
demo choices, not universal hotel standards.

Arrival 15:00/12:00, age18/ID, 30% deposit, 15-minute hold and 14/7-day refund rules
match existing source defaults. VAT/service charge remain included. Later actual
implementation must derive this copy from authoritative policy APIs/snapshots;
the preview JSON is not a new live financial-policy owner.

Verified:

- JSDOM renders 34 unique views; configuration propagates name/city/arrival times,
  deposit/hold/breakfast to proposal. Current snapshot hash remains identical.
  Invalid percentages rejected, user markup escaped, defaults reset, source-policy
  alignment checked, no JS errors, final inline source under1MB.
- Real in-app Chromium: 102 finding/width checks (34 each at1024/390/320) found no
  missing content, owner-placeholder remnants or horizontal proposed overflow.
  Full page and settings checked at tablet/phone widths.
- Browser changed hotel/city, deposit25%, breakfast included; proposal updated,
  survived reload, and current snapshot retained its original content. Restored
  default Haven/Manila/30% profile afterward. Deposit101% shows validation error.
- Native submit-only Apply did not execute in the sandboxed preview; changed to
  local click/keyboard handlers, then verified Apply and availability output.
  Revision guard prevents stale host-state echoes overwriting local edits.
- Default search displays illustrative ₱12,800 / two nights; no inventory mutation.
- Viewport reset, owned tab closed, local QA server stopped. Running the QA server
  required the permitted unsandboxed local process; no security setting changed.

No app source, migration, DB, environment, deployment, commit or push changed.
No app-wide typecheck/build/test rerun for comparison/docs-only work. Existing
working-tree changes preserved. Current Status/Decisions/Project Memory unchanged.
