/**
 * Context-aware normalization for Ask HAVEN assistant answers.
 *
 * Gemini sometimes emits backslash-escaped Markdown (`\###`, `\*\*`, `\-`,
 * `1\.`) and whitespace entities (`&#x20;`). This normalizes ONLY patterns
 * that are clearly Markdown syntax — never a global backslash strip, so
 * legitimate backslashes (paths, `a\b`, unpaired markers) survive untouched.
 *
 * Applied to ASSISTANT answers only. User questions stay verbatim.
 */

const SPACE_ENTITIES = /&#x20;|&#32;|&nbsp;/gi;

function normalizeLineStart(line: string): string {
  // Escaped ATX heading at line start: `\### Title` -> `### Title`.
  let out = line.replace(/^(\s*)\\(#{1,3}(?:\s|$))/, "$1$2");
  // Escaped unordered marker at line start: `\- item` -> `- item`.
  out = out.replace(/^(\s*)\\([-*+](?:\s|$))/, "$1$2");
  // Escaped ordered marker at line start: `1\. item` -> `1. item`.
  out = out.replace(/^(\s*)(\d+)\\(\.\s)/, "$1$2$3");
  // Escaped horizontal rule: `\---` -> `---`.
  out = out.replace(/^(\s*)\\(-{3,})(\s*)$/, "$1$2$3");
  // Escaped blockquote marker (rendered as plain text downstream): `\> x` -> `> x`.
  out = out.replace(/^(\s*)\\(>(?:\s|$))/, "$1$2");
  return out;
}

function normalizeInline(line: string): string {
  // Paired escaped emphasis on the same line: `\*\*FACT:\*\*` -> `**FACT:**`.
  let out = line.replace(/\\\*\\\*(.+?)\\\*\\\*/g, "**$1**");
  // Paired escaped single emphasis: `\*note\*` -> `*note*`.
  out = out.replace(/\\\*(?!\*)(.+?)\\\*(?!\*)/g, "*$1*");
  // Digit + escaped period (ordered-marker-like mid-line): `Step 1\.` -> `Step 1.`.
  out = out.replace(/(\d)\\(\.)/g, "$1$2");
  return out;
}

export function normalizeAiAnswer(text: string): string {
  return text
    .replace(SPACE_ENTITIES, " ")
    .split("\n")
    .map((line) => normalizeInline(normalizeLineStart(line)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
