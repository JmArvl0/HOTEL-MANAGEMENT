# AI Module Account Prototype (2026-11-21)

Superseded later on 2026-11-21 by the user's clarification that the capstone
requires a general Gemini assistant, rather than AI tied to specific modules.
The old preview URL now redirects to `haven-general-ai-preview.html`.

The user requested a visual prototype before further live UI implementation.
Created a standalone sample-only preview at
`public/prototypes/ai-modules-preview.html`, with its own CSS and JavaScript.
It did not change the live module card, API, database, or permissions.

The preview switches among Front Desk, Housekeeping, Maintenance, Accounting,
and Manager accounts. The module choices follow the local role matrix: Manager
does not receive Accounting; Accounting receives only Accounting; Owner/Admin
are excluded from operational modules. Housekeeping's Guest Requests example
shows department-only counts. The card shows controlled focus areas, example
HAVEN facts, advisory next steps, and an explicit simulated Generate state.
All figures are invented; no network or AI call is made by the page.

Validation: JavaScript syntax and CSS parsing passed. A jsdom interaction
check covered role/module switching, Accounting and Manager visibility,
Housekeeping request scope, focus selection, interrupted generation, theme
toggle, icon availability, and zero fetches. Brave visual review passed for
desktop light mode, 375px phone light/dark, and 320px phone light mode. A
clipped role label found at 375px was corrected. The 320px page had no
horizontal overflow. `git diff --check` passed. Full app tests/build were not
rerun because only the standalone prototype files changed.

The preview remains open locally for user design review. No live Gemini or
hosted migration acceptance is implied by this prototype QA.
