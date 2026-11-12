# Before You Arrive FAQ — 2026-11-12

Adapted the supplied arrival FAQ reference to the site's existing warm ivory
background. Added centered Playfair copy, a gold sprout divider, reused botanical
art, a brass doorway outline, two wave lines, quick links, icon disclosures and
a compact support strip. No new bitmap assets, packages or schema changes.

The original policy-derived answers and every Website Content custom question
remain. Five shortcuts open/focus their native disclosure, briefly highlight it
when motion is allowed and leave other questions available. Native Enter/Space
controls, named answer regions, visible focus and reduced-motion handling remain
accessible. Phones scroll the shortcuts horizontally and stack support actions.
The default nine questions and support strip fit below the header at 1440×960;
additional custom questions and expanded answers use normal page scrolling.

Call/email actions use the Website Content phone/email fields in both modes.
The user corrected the initial demo fallback and explicitly requested mock
Contact Front Desk / Email us actions. Owner/Admin configure their destinations
in Website Content → Contact & arrival → Front Desk phone / Front Desk email,
using the existing save/review/publish flow. The default demo uses mock phone
`+63 2 8000 0000` and reserved email `hello@haven.example`. The guest preview
uses the same component. No contact message, email or call was sent.

Verification:

- Node 22.22.2 final production build, standalone typecheck and touched TS/TSX
  ESLint passed. Generated paths from this task's builds were removed from
  tsconfig/next-env without replacing other sessions' entries.
- Focused 26 tests / 6 files passed, including four new behavioral FAQ tests.
- Full suite passed: 2,473 tests / 238 files, using two workers. Existing jsdom
  navigation/canvas notices appeared. The first unrestricted-worker run was
  stopped to reduce memory use; its result is not counted.
- Final production in-app browser screenshots at 1440×960, 768×1024, 390×844
  and 320×740: no horizontal document overflow or clipped question text; all
  nine questions retained. Mobile shortcut overflow stays within its own row.
- Browser verified shortcut focus/open behavior, configured breakfast text,
  minus toggle and native Enter/Space close behavior. Mobile support actions
  remain full width. Physical devices and iOS Safari were not tested.
- Initial sandbox build failed on Turbopack's dependency junction. The final
  build passed with approved local process access outside the sandbox.

Design skill review: single existing section with a supplied direction, so no
random direction draw. Browser QA used the supported CUA surface instead of the
skill's separate browser driver. Its source linter reported four failures and
four warnings for reference-required gold rules, outlines and the subtle card
shadow; these were intentionally retained, not reported as a clean design lint.

ROUND 2 (subjective screenshot critique)
Seen in one second: calm guest arrival information on Haven's existing canvas.
Idea: Haven's existing ivory and doorway detail frame practical arrival answers.
Live thing: five shortcuts open and focus the actual policy-backed FAQ.
Layout: heading=centered / shortcuts=row / answers=wide accordion / support=strip.
Scores: design 8 · usability 8.5 · creativity 7 · content 9 → overall 8.1.
Caps applied: none in the scoped section.
Top problems from round 1 addressed: desktop vertical spacing compacted to fit
the default questions and support; phone actions stacked; small widths keep
questions readable and shortcuts reachable. Architecture remains flat linework
to match the current site instead of introducing a separate photographic backdrop.

Evidence: `.tmp/arrival-faq/final-{1440,768,390,320}.png`,
`browser-results.json`, `full-tests-bounded.log`, `build-verified.log`.
Final preview: `http://127.0.0.1:3069/#faq`. No database writes, commit or release.

Contact correction follow-up: Node22 production build, standalone typecheck,
touched ESLint and eight focused tests passed. Regression coverage verifies
client contacts, default mocks and edited demo contact values while keeping
the exact requested action labels and support copy. Desktop and390px production
browser inspection confirms the mock tel/mailto destinations and stacked phone
buttons. Evidence: `contact-build.log`, `contact-final-{1440,390}.png`.
Earlier full-suite and four-size results above are the pre-correction checkpoint.

Homepage follow-up: removed the Make yourself at home section and its paragraph
from the homepage. Rooms now immediately follows hero/booking. Scoped CSS centers
Rooms & suites and Amenities & dining headings and supporting text. Node22 final
production build, standalone typecheck, touched TSX ESLint and two landing
structure tests passed. Production browser at1440 and390 confirms centered
headers/subtitles, absent introduction, direct booking-to-Rooms flow and no page
overflow. Evidence: `headers-build.log`, `centered-{rooms,amenities}-{1440,390}.png`.
Existing preview3069 was refreshed. No database write or deployment.
