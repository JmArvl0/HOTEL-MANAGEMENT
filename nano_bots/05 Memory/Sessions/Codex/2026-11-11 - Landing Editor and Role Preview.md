# Landing editor and role preview — November 11, 2026

User wanted to see where landing configuration lives and which roles can edit it.
Created a proposed interactive staff editor, not an app implementation:
`haven-landing-content-editor.html` in this thread's visualization directory.
Detailed scope/access/source evidence: `docs/design/haven-landing-editor-proposal.md`.

Owner → Catalog → Landing page and System Admin → Configuration → Landing page
share proposed edit/draft/review/publish access. Manager retains existing room
content/photos and rate-proposal powers, without unified landing or location
editing. Other five roles have no website edit/publish access. Simulated role
switches expose these states and a source-backed ownership matrix. Existing
Location & Places/catalog/policy modules are identified separately from the new
unified editor. No server-side authorization implementation is implied.

Eight content areas show a real guest-result preview, with embedded images and
credits retained. Edits/save draft are isolated from the published demo. Review
shows differences; a reason is required before local demo publication. Real
catalog, financial policies and owner-only payment settings keep their existing
ownership. Protected source fields cannot be restored through editable state.

Verified: JSDOM8 sections/8 roles, draft/published isolation, review/reason,
photo/visibility, escaping/email validation, persistence and protected-field
checks pass. Source design lint0fail/0warn. Real browser1024/768/390/320 fits all
sections/access table; mobile menu, Owner path, role views, publishing and reload
verified. Both fonts loaded, no browser errors. Final556,330bytes. Active dark
theme inspected; no physical-device or authenticated app/API/DB checks.

No app/DB changes, permission changes, deployment or commit. Earlier comparisons
retained. Full app checks not rerun. QA server90780 stopped, viewport reset,
owned browser tab closed. Style: framed sheet, seed889410301, existing Haven
fonts/palette. Authoring/check scripts stay in ignored `.tmp/landing-ux-comparison/`.

Plan-only follow-up: user explicitly requested room-type create/edit/activate/
deactivate/archive, physical-room assignment/reassignment and standard-amenity
inheritance with per-room additions/exclusions, without a new prototype. Added
`docs/plans/2026-11-11-room-type-lifecycle-and-amenity-inheritance.md` and linked it
from the editor proposal and fictional-profile mapping. Current vs planned
behavior is explicit, including existing Manager/rate governance, protected
commitments, vestigial `rooms.amenities` and historical snapshots. No HTML/app/DB
changes; acceptance checks are future requirements, not executed implementation QA.
