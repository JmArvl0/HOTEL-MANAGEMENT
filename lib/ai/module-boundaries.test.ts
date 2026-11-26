import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("module assistant server boundary", () => {
  it("keeps client-safe metadata free of server dependencies", () => {
    const metadata = source("lib/ai/module-metadata.ts");
    expect(metadata).not.toMatch(/modules\.server|module-context|gemini-client|@\/lib\/supabase|@google\/genai/);
  });

  it("keeps the client card off the server registry, database and Gemini", () => {
    const card = source("components/manager/module-ai-card.tsx");
    expect(card).not.toMatch(/modules\.server|module-context|gemini-client|@\/lib\/supabase|@google\/genai/);
  });
});
