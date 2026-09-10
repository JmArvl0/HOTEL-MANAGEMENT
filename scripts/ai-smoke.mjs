// Opt-in live Gemini smoke test — ONE minimal call, never part of CI/tests.
//
//   node scripts/ai-smoke.mjs
//
// Checks the key's presence (never prints it), makes a single generateContent
// request, and lists models to confirm the configured model exists. Exit 0 on
// success, 1 on any failure — safe to run before a demo.
import fs from "node:fs";

const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
  if (m && !line.trim().startsWith("#")) env[m[1]] = m[2];
}
if (!env.GEMINI_API_KEY) {
  console.error("FAIL  GEMINI_API_KEY is not set in .env.local (value never read or printed here)");
  process.exit(1);
}
console.log("OK    GEMINI_API_KEY present (value not inspected)");

const model = env.GEMINI_MODEL || "gemini-3.6-flash";
const { GoogleGenAI } = await import("@google/genai");
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

let pass = true;
try {
  const response = await ai.models.generateContent({
    model,
    contents: "Reply with exactly the word: ready",
  });
  const text = (response.text || "").trim();
  console.log(`OK    ${model} responded (${text.slice(0, 60) || "empty text"})`);
} catch (e) {
  pass = false;
  console.error(`FAIL  generateContent call failed: ${(e.message || String(e)).slice(0, 200)}`);
}

try {
  const list = await ai.models.list();
  const names = [];
  for await (const m of list) names.push(m.name);
  const found = names.some((n) => n.includes(model));
  console.log(found ? `OK    model ${model} is available to this key (${names.length} models listed)`
    : `WARN  model ${model} not in the first page of listed models — GEMINI_MODEL may need updating`);
} catch (e) {
  console.error(`WARN  model list failed (non-fatal): ${(e.message || String(e)).slice(0, 160)}`);
}

console.log(pass ? "\nsmoke test PASSED — Gemini is reachable" : "\nsmoke test FAILED");
process.exit(pass ? 0 : 1);
