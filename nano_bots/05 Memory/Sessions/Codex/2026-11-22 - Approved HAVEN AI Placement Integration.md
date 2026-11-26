# Approved HAVEN AI placement integration — 2026-11-22

The user approved the existing-layout, fixed right-edge AI overlay prototype
and asked for live Gemini guidance in the local system. The seven staff account
shells now mount one live drawer for the 94 mapped module entries. Manager's
dedicated HAVEN AI page does not nest the drawer; Guest retains its concierge.
The prototype launcher can still open the fictional sample for comparison.
The old inline module cards are no longer mounted in the shared staff layout.

`GET /api/ai/placement` authenticates the role and module, returns the approved
purpose and supported role-scoped aggregate facts, and makes no Gemini call.
The drawer preserves module layout, stays below the header, and keeps its
right-edge toggle open or closed. `POST /api/ai/placement` is a deliberate Ask
action: server validation rejects off-scope questions, reads only permitted
facts, calls Gemini, checks cited fact IDs and numbers, and records interaction
metadata without prompts or answers. It has no operational write path.

An authenticated Front Desk browser check showed the live drawer and a Gemini
answer using actual aggregate HAVEN facts. The other six staff accounts,
mobile view, and both themes have not had equivalent live visual QA. Focused
tests passed (40); full suite passed (248 files, 2,545 tests). Typecheck and
touched-file ESLint passed (existing dashboard hook warnings remain). The
normal sandbox build hit Windows EPERM creating an isolated output directory;
the elevated isolated webpack build passed after a test typing correction.

Stored event-driven recommendations, record-specific analysis, and automatic
approvals were not implemented. The remote Supabase migration ledger is ahead
of this checkout and does not include the pending module-assistant migration;
no remote migration was applied. The live placement route uses the existing
generic Ask audit schema. The specific Guest Request eligibility policy and
later exception policy still require review before automatic actions.
