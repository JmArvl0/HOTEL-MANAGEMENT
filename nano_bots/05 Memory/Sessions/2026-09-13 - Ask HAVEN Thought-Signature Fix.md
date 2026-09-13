# Ask HAVEN Thought-Signature Fix

**Date:** 2026-09-13
**Scope:** Gemini integration reliability only — Ask HAVEN HTTP 400 thought_signature fix.
No hotel business logic touched.

## Root cause

`app/api/ai/ask/route.ts` rebuilt the model turn from the SDK `functionCalls`
getter (`{ functionCall: { name, args } }`), discarding the `thoughtSignature`
sibling Gemini 3 returns on the same `Part`. The next `generateContent` call
sent unsigned functionCall history → HTTP 400. Brief/explain/report-summary
(use no tools) were unaffected, matching the report.

## Fix

- Ask loop now appends `candidates[0].content` verbatim
  (`getModelContentForToolHistory` in `lib/ai/gemini-client.ts`): full parts
  array by reference — signatures, order, call ids intact. `functionCalls`
  getter is used only to decide which read-only tools to execute.
- Fail-safe rule: tool calls present but model content unrecoverable →
  `AI_TOOL_CONTEXT_ERROR`, generic user message, no loop continuation.
  No unsigned reconstruction anywhere in the tool path.
- Responses echo SDK call `id` when present (`buildFunctionResponseParts`),
  preserving order for parallel calls.
- `callModel` classifies 400 + signature-context messages as new
  `tool_context` reason (detection helper `isToolContextMessage`); logs carry
  category only — never provider body, signature, key, or prompt.
- Raw `[AI DEBUG]` provider messages removed from all four AI routes. Ask
  returns "HAVEN AI couldn't complete that request right now. Please try
  again." (`AI_ASK_FAILURE_MESSAGE`); brief/explain/report-summary return the
  existing generic unavailable message.
- Model unchanged: `gemini-3.6-flash`, `lib/ai/gemini-client.ts` documented as
  single source of truth, `GEMINI_MODEL` override kept. SDK `@google/genai`
  2.21.0 verified (`npm list`) with `Part.thoughtSignature`, `FunctionCall.id`
  / `FunctionResponse.id`, `Candidate.content`, `Content{role,parts}` shapes.
- Tools unchanged: 9 read-only, zero params, PII-minimized.

## Verification

- New `lib/ai/tool-history.test.ts` — 14/14 (single/multi/parallel
  preservation, fail-safe null, id echo + order, tool-failure payload,
  400→tool_context vs other-400→unavailable, no key/signature leak,
  read-only registry intact).
- Full gates: typecheck clean, lint 0 errors (71 pre-existing warnings),
  `npm test` **1008/1008**, `npm run build` clean.
- Manual Ask HAVEN verification pending (needs Manager session + live key):
  the 4 tool questions + multi-turn same-session follow-ups.

## Affected files

- `lib/ai/gemini-client.ts` (tool_context reason, helpers, sanitized log)
- `lib/ai/prompts.ts` (`AI_ASK_FAILURE_MESSAGE`)
- `app/api/ai/ask/route.ts` (preserve + fail-safe + sanitized errors)
- `app/api/ai/brief/route.ts`, `app/api/ai/explain/route.ts`,
  `app/api/ai/report-summary/route.ts` (debug removal)
- `lib/ai/tool-history.test.ts` (new)
- `SYSTEM.md` §7.13, `Current Status.md` (docs)

## Next

1. Manual Ask HAVEN test with live key (Manager login).
2. Commit this work (note: tree also holds unrelated uncommitted
   parallel-session changes — coordinate before committing).
