# Housekeeping Design Prototype

The [interactive preview](../../../../public/prototypes/housekeeping-preview.html)
uses sample records for the Housekeeping attendant role. The room queue
orders active work by priority, next arrival, and task age. Stage counts
filter the list. The selected room keeps its arrival, recorded sample state,
service notes, activity, and next action in one place.

Chrome verified claiming, cleaning, checklist submission, both inspection
outcomes, reclean, Do Not Disturb and maintenance holds, deferral, issue
reporting, guest requests, and reset. Phone navigation restores the queue
filter and focus. Layout checks covered 320–1,440 px in Chrome and the main
action was visible at 1,366 × 768. Desktop screenshots were reviewed in both
themes. Prototype JavaScript lint, typecheck, 46 focused tests, and all
2,424 repository tests passed.

The production build hit Windows filesystem permission errors in the
isolated build directory with both Turbopack and webpack. Chrome opened
the standalone HTML directly and loaded its bundled assets.

The revised preview keeps its sample date and time in the header. Its
account switcher covers the three roles with a dedicated Housekeeping page.
Housekeeping works and inspects tasks, Manager can reprioritize open tasks,
and Front Desk follows room readiness and arrivals. Owner sees housekeeping
metrics in Executive Operations. The role switch preserves sample changes.
Chrome verified all three views and 12 viewport widths. Typecheck,
prototype JavaScript lint, and 43 focused tests passed on the revision.
