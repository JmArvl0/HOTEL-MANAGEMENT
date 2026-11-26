# AI bubble interaction prototype — 2026-11-23

Superseded on 2026-11-25 by the user's exclusive side-panel direction. The
sample component and bubble CSS described below were removed; this record is
retained as history. See [[2026-11-25 - Exclusive Staff AI Panel]].

The user supplied a sketch as a visual idea, not an exact layout, and asked
for a sample before changing the current collapsible AI control. The requested
interaction was a noticeable circular gradient AI icon with a glowing border;
AI and recommendation options rising from it; a readable translucent
recommendation preview with a strong border and close button; and solid
content-sized dialogs with useful names and close controls.

`components/ai/placement-preview-drawer.tsx` now implements the sample over
the real staff module layout. The orb opens two labeled choices:
Recommendations and Ask HAVEN AI. The preview summary is independently
dismissible. Each option opens its own panel, and Escape or the close button
returns focus to the originating choice. The Ask answer is scripted, and the
recommendation state selector and revision control remain sample-only. CSS in
`components/ai/ai-bubble-prototype.css` owns the gradient, glow, upward
transition, solid panels and responsive height cap. The launcher wording was
updated. The live `haven-ai-drawer.tsx`, APIs, and database were untouched.

Verification: targeted preview tests 4/4; full Vitest suite 248 files and
2,545 tests; `npm run typecheck`; touched-file ESLint; `git diff --check`;
isolated webpack production build. The normal Turbopack sandbox build failed
to create a Windows junction, and a sandboxed webpack build failed to mkdir;
the permitted isolated webpack retry passed. Build outputs and generated
Next config edits were removed. Authenticated Front Desk browser QA observed
the desktop and 390px phone sample in the light theme, including the separate
panels, responsive scrolling when an answer grows, and closing behavior.
Other roles and dark theme were not visually checked. No migration,
deployment, or operational write occurred.

Next: collect the user's visual feedback on placement, labels, opacity,
panel width, and whether this concept should replace the live drawer.
