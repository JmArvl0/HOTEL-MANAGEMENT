# Ask HAVEN Markdown Rendering

**Date:** 2026-09-13
**Scope:** UI/rendering only. ThoughtSignature/tool-history logic, model
(`gemini-3.6-flash`), read-only tools, and hotel business logic untouched
(verified: `git diff` on the tool loop shows only the prior fix + the new
`normalizeAiAnswer` call on the final answer string).

## Root cause of raw Markdown

Two halves: (1) the panel rendered answers as a raw string
(`<p>{turn.text}</p>` — no Markdown support existed anywhere, no renderer
dependency in the project); (2) Gemini literally emits backslash-escaped
Markdown (`\###`, `\*\*`, `\-`, `1\.`) and space entities (`&#x20;`) with
nothing in `ASK_TASK`/system prompt telling it otherwise. JSON transport
cannot invent backslashes, so the escapes are model-originated.

## Fix

- `ASK_TASK` style rules: compact dashboard Markdown (short ### headings,
  bullets, numbered recommendations, bold for labels only), plain Markdown
  only, never backslash-escape. FACT/PREDICTION/RECOMMENDATION kept, no
  added verbosity.
- `lib/ai/answer-format.ts` → `normalizeAiAnswer` (server, final assistant
  answer only): line-start escapes (`\###`, `\-`, `1\.`, `\---`, `\>`),
  same-line paired `\*\*`/`\*`, digit-period `1\.`, and `&#x20;`/`&#32;`/
  `&nbsp;` → space. No global backslash strip — paths and unpaired markers
  survive (tested).
- `components/manager/ai-markdown.tsx`: hand-rolled zero-dep subset renderer
  (##/###, paragraphs, ul/ol incl. one nested level, **bold**, *italic*,
  `code`, `---`; React text nodes only, no `dangerouslySetInnerHTML`, so
  `<script>`/raw HTML is inert; no links/images/tables). Assistant turns
  only — user questions stay literal `<p>` text.
- `.ai-md` styles in `manager-dashboard-theme.css` (dark + light, mobile
  inherits `max-width:100%` + `overflow-wrap:anywhere` from `.ai-turn`).

## svgAsk artifact

No `svgAsk` literal in source. Panel renders inside `.app-shell`, so the
`.app-shell .sr-only` label stays visually hidden — the copied
"Ask HAVEN a question**svgAsk**" is a copy/accessibility-serialization
artifact (hidden label text + button icon serialized as "svg" + "Ask"), not
visible rendering. No visual/CSS changes made for it; hardened anyway:
`aria-hidden="true"` on the decorative Send icon, tested button name "Ask",
label association, and no svg text leak.

## Verification

- `lib/ai/answer-format.test.ts` 9/9, `ai-markdown.test.tsx` 8/8,
  `haven-ai-panel.test.tsx` +2 (assistant renders, user literal, a11y).
- Full gates: typecheck clean, lint 0 errors (71 pre-existing warnings),
  `npm test` **1027/1027** (91 files), `npm run build` clean.
- Manual browser verification pending (Manager Ask page, live key):
  supplies + housekeeping + plain-text questions per task spec.

## Affected files

- `lib/ai/answer-format.ts` + `.test.ts` (new)
- `components/manager/ai-markdown.tsx` + `.test.tsx` (new)
- `components/manager/haven-ai-panel.tsx` (+2 panel tests)
- `app/api/ai/ask/route.ts` (ASK_TASK line + normalize call only)
- `app/manager-dashboard-theme.css` (`.ai-md` block + light mirrors)
- `SYSTEM.md` §7.13, `Current Status.md` (docs)

## Next

1. Manual browser test (checklist in task spec).
2. Commit (tree still holds other uncommitted work — coordinate first).
