# General Gemini Assistant Concept (2026-11-21)

Superseded on 2026-11-22 by the user's module-context correction (D-043).
The concept URL now redirects to the module placement preview.

The user clarified the capstone intent: one general Gemini assistant should
assist hotel management across authorized account workflows. The previous
module-card interpretation was superseded. D-042 records the direction; D-041
and the earlier module implementation plan are retained as historical local
work, not deployment instructions.

Created `public/prototypes/haven-general-ai-preview.html` with one persistent
HAVEN AI workspace, freeform question composer, sample answers, role switcher
for Front Desk, Housekeeping, Maintenance, Accounting, Manager, Owner, and
System Administrator, and an explicit facts / HAVEN predictions / protected
QR operations / Gemini explanation boundary. All content is invented and
scripted, with no network calls. The earlier preview URL redirects here.

Verified JavaScript syntax, CSS parsing, seven-role switching, sample-answer
interaction, answer reset on role change, and HTML escaping in jsdom. Brave
visual review covered desktop and 375px/320px mobile layouts; 320px had no
document horizontal overflow. The current preview tab is open for review.
No live UI/API, database, migration, or Gemini integration changed. The
existing general assistant still permits only Manager/Owner/Admin; the local
module-card implementation must be reconciled before any release.
