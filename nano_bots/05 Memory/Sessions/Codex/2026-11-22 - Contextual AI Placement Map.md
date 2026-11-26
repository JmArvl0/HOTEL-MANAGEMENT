# Contextual AI Placement Map (2026-11-22)

The user clarified that personnel should receive AI help inside the modules
they use, with a distinct purpose and brief description for each placement.
Front Desk Bookings is the concrete process-guide example; Lost & Found needs
claim/custody checks. D-043 supersedes the separate general-assistant concept.

Mapped the five operational account menus from `config/role-navigation.ts` and
the actual `access` list in `manager-dashboard-client.tsx`: Front Desk 17,
Housekeeping 8, Maintenance 6, Accounting 13, Manager 20 visible entries.
`docs/ai-placement-by-account.md` names the proposed AI purpose and description
for every one. `public/prototypes/ai-module-placements-preview.html` is a static
role/module concept preview; older preview URLs redirect to it. Its examples
are scripted and it makes no hotel or Gemini calls.

Verified JS syntax, CSS parsing, all 64 role/module selections, purpose and
description rendering, examples, icon availability, and `git diff --check`.
The local static server returned HTTP 200 for the preview. Browser visual QA
could not run because the browser-control runtime failed at startup, before
opening a page. No live UI/API/DB implementation or hosted migration changed.

## Later correction — report only

The user explicitly said no prototype is needed now and asked for analysis and
suggestions. The four contextual-preview files from this session were removed,
the earlier prototype redirects were restored, and the report was revised to
rank the strongest placements instead of implying that all 64 should be built.
The 64 entries remain an opportunity inventory; no live AI integration changed.

## Latest scope clarification — system-wide AI

The user rejected a capstone scope centered on Bookings or any other single
module. The report now recommends one general Gemini assistant reachable
across all authorized staff modules, with module-specific context and purposes.
Owner and System Administrator navigation were added to the inventory, bringing
it to 94 visible staff account/module entries. The Guest concierge remains a
separate existing surface. This is analysis only; no new prototype or live AI
integration was made.
