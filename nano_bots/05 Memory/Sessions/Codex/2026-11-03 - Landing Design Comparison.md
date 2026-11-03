# Landing Design Comparison — 2026-11-03

User requested analysis and a modern, premium, minimalist current/proposed
comparison. Deliverable is a local static prototype, not production implementation.

## Follow-up revisions

Latest request: research existing hotel pages and update the proposal. V4 reviewed
seven accessible official sites (Hoxton, Aman, Ett Hem, Rosewood, Four Seasons,
The Henry, Dusit) plus limited indexed Ace content (direct fetch 403). Sources and
review limits are in `public/prototypes/hotel-reference-study.md`. V4 uses a
two-part atmospheric hero, immediate date search, and a separate interactive room
finder. V3 archived as `landing-proposed-v3.html`. Browser checked 1440/768/390px
without horizontal overflow; Ocean Suite selection and mobile menu/Escape verified.
Syntax/ESLint pass. Current comparison refreshed. No production landing edits.

User explicitly invoked UI/UX Pro Max, Impeccable and taste for a fresh redesign.
V2 used a deep-ocean canvas and monumental wordmark; user rejected it as “AI slop.”
Initial V3 used an interactive room directory; user said it was too plain. Current
V3 adds layered room/pool photography, warm paper/forest/copper palette, thumbnail
room choices and personal headline “Make yourself at Haven.” Selecting room
changes photo/name/spec/rate/link. Desktop/mobile checked for overflow; selector
verified on Deluxe King (₱6,400). Syntax/ESLint pass. Earlier proposals archived
as `landing-proposed-v1.html` and `landing-proposed-v2.html`. Comparison updated.
No user acceptance yet; production landing remains untouched.

Read running page, landing source, booking intent, navigation and room imagery.
Applied design-taste-frontend and Impeccable guidance; selected uneven-photographs
direction with existing coastal palette and Playfair/Inter fonts. Local-only
Sites workflow. No subagents or hosting/publication.

Created `public/prototypes/landing-comparison.html`, `landing-proposed.html`, CSS,
JS, ESM generator, review, font copies from existing Next assets and screenshots.
Before uses genuine current-page screenshot; after is a full responsive prototype.
Retains all four observed rooms/rate snapshots, eight amenities and four policy
FAQs. Labels stock imagery, snapshot rates and illustrative portal. Removes
competing hero copy, technical operations promotion and repeated card framing
from the proposal; production remains untouched.

Verified visually at 1440/768/390px; no horizontal overflow and headings fit two
lines at tablet/mobile. Mobile booking ends ~808px in an 844px viewport. Browser
checked room carousel, experience switcher, FAQ, mobile menu + Escape, selected
dates/guest propagation into room links and checkout minimum. Comparison controls
and uncropped screenshot sizing checked. New JS/generator syntax and eslint pass.
No full app test/build rerun for static-only prototype. Unrelated working tree
changes, earlier shared sidebar implementation and untracked migration preserved.

User-facing URLs: `/prototypes/landing-comparison.html` and
`/prototypes/landing-proposed.html`. Detailed rationale/limits in
`public/prototypes/landing-review.md`. Implementation requires a subsequent user
request; do not treat this proposal as an approved system-wide visual replacement.
