# Landing-page editor and role preview

November 11, 2026. User requested the configuration UI and the roles that may
configure the landing page. This extends the proposed review only; it does not
implement an editor, change permissions or publish the actual website.

The thread-owned interactive preview is `haven-landing-content-editor.html`, in
`C:/Users/Mark Rowell/.codex/visualizations/2026/11/11/01a1c88c-d100-7c02-ad38-ed6e7cd84e71/`.
The preceding 34-finding comparison versions are retained.

## Access and entry points

Proposed unified editor:

- **System Admin → Configuration → Landing page**: edit, save draft, review and
  publish website content.
- **Owner → Catalog → Landing page**: the same content editor and publishing powers.
- **Manager**: no unified website editor or location publishing. Continues to
  maintain room descriptions, photos, amenities, beds, capacity, size and permitted
  visibility through the room catalog. Rate changes remain propose → approve.
- **Front Desk, Housekeeping, Maintenance, Accounting, Guest**: no landing-page
  editing or publishing. Operational permissions are outside this proposal.

The preview role selector simulates these views; it is not an authorization
mechanism or an actual account-role switch.

Current-source evidence:

- `SYSTEM.md` §7.1: Admin Configuration and Owner Catalog share Location & Places;
  Manager and operational roles are excluded from its administrative API.
- `lib/admin.ts` `canAdministerSystem` and `lib/admin-route.ts` `guardAdmin`:
  Owner/Admin only, with current account-role/status recheck.
- `app/api/admin/location/route.ts`: guarded reads/writes through existing location
  RPCs; publication and location verification already exist within that module.
- `components/admin/admin-dashboard-client.tsx` and
  `components/owner/owner-dashboard-client.tsx`: current module entry points.
- `SYSTEM.md` role/capability and room-type governance sections: Manager catalog
  content access and rate proposals; Owner/Admin base-rate approval.
- `app/api/admin/policy/route.ts`: operational policy updates use `guardAdmin`.

The full landing editor and the unified draft-review flow are **new proposals**.
Existing location, room-catalog and policy configuration must not be described as
an already complete landing CMS.

## Content and workflow

Eight editor areas: hotel/hero, contact/arrival, photos/gallery, amenities/dining,
nearby places, guest information/FAQ, privacy/booking terms and optional sections.
Each shows the selected section's guest-facing result beside the controls.
Native mobile navigation exposes the same destinations. The role-access view
separately identifies existing modules and the proposed unified editor.

Editing updates the draft preview. **Save draft** creates a local saved draft,
leaving the published demo unchanged. **Review changes** compares saved values
with the published demo; publishing requires a short reason. **Publish in preview**
changes only this local demo snapshot. It does not perform a database write,
persist an audit entry, or publish the website. Saved changes can be remembered
by the preview host; images are excluded from saved state.

Reuse authoritative ownership during a later implementation:

- Room content/images/prices remain in the catalog, not duplicate landing fields.
- Hotel location, nearby records, routes, verification and private uploads remain
  under Location & Places. This mock uses its fictional/demo content pattern.
- Arrival/cancellation/tax information derives from hotel policy settings.
  Deposit/hold copy follows the booking-policy source; there is no separate
  financial-policy editor here. Owner-only payment settings stay separate.
- New editorial content, legal notices and section visibility require an agreed
  versioned server model. Real mutations need server/RPC role checks, validation,
  optimistic concurrency and audit entries; the simulated role controls do not
  provide those protections.
- Hotel imagery/facilities/contact details remain fictional or illustrative.
  Place images retain source/author/license/change credits from
  `haven-location-photo-sources.json`. Genuine reviews remain conditional on real
  completed-stay reviews; no manufactured testimonials or review editor.

## Additional room-catalog requirement — plan only

The user added dynamic room-type creation/editing/activation/deactivation/archive,
physical-room assignment/reassignment, inherited standard amenities and optional
per-room additions/exclusions. These belong to the shared room catalog and room
configuration modules, with their results consumed by the landing and exact-room
booking views. See the
[room-type lifecycle and amenity-inheritance plan](../plans/2026-11-11-room-type-lifecycle-and-amenity-inheritance.md)
for rules, permissions and acceptance checks. No new or modified prototype was
requested for this addition; the existing editor preview does not demonstrate it.

## Design and validation

Framed sheet, seed889410301, preserving Haven Inter/Playfair and staff palettes.
The screen answers: “What can I change on the public landing page, and what will
the guest see?” The product-specific element is a real section preview using the
same fictional profile and embedded Manila photos as the proposed comparison.
The staff shell follows the host theme; the public preview keeps Haven's light
identity. Prototype source/helpers are in ignored `.tmp/landing-ux-comparison/`.

JSDOM validates all8 sections/8 simulated roles, live edits, photo selection,
draft/published isolation, review/reason validation, publication/restoration,
visibility toggles, escaping, email validation and protected policy fields.
Source design lint:0 failures/0 warnings. Browser1024/768/390/320: all8 editor
sections and access table fit without horizontal overflow; mobile menu, Owner
path, simulated role restrictions, publishing, persistence and defaults verified.
Active host dark theme inspected; both bundled fonts loaded, no browser errors.
Final fragment556,330bytes. QA server stopped and viewport reset.

These are prototype checks, not authenticated app/API/DB authorization tests.
Full application typecheck/build/test suites were not rerun for this preview.
