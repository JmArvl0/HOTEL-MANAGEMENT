# Right-edge AI drawer prototype — 2026-11-22

The user reviewed the first system-wide AI prototype and supplied a screenshot marking the right edge of a staff module. They requested a pinned-summary-style toggle there, with AI content overlaying the module so its cards, filters, table, and detail do not move.

Updated `public/prototypes/haven-ai-system-preview.html`, `.css`, and `.js`: the staff assistant now has a compact right-edge dock with a status and one-line stored-guidance preview. The toggle opens a fixed drawer over the workspace; it closes with the toggle or Escape. The open drawer follows module and selected-record context. Role changes close it. The separate Guest concierge uses the same visual preview pattern but remains distinct from the proposed staff assistant; the Manager HAVEN AI workspace does not get a duplicate drawer. The toggle is display-only and causes no Gemini analysis or hotel write.

Reconciled the proposed placement report, root AI assistant specification, and supplementary plan with this prototype variation. User visual review is still needed before the layout is accepted for live implementation. No live application behavior, database, approval process, or Stripe integration changed.

Verification: `node --check public/prototypes/haven-ai-system-preview.js` passed; `node public/prototypes/haven-ai-system-preview.smoke.cjs` passed for eight account views, 94 staff entries, drawer open/close and fixed positioning, event refresh, request flow, refusal, and exceptions; PostCSS parsed the stylesheet. Browser visual QA remains unavailable because browser control blocked the local preview URL.
