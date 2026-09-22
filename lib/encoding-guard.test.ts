// UTF-8 mojibake guard. In 2026-10 the working tree carried double-encoded
// characters (UTF-8 bytes decoded as Windows-1252 and re-encoded) in two UI
// files while HEAD was clean. This test fails loudly on those byte
// signatures so a recurrence is caught at test time instead of reaching
// rendered tables, badges, and modals.
//
// NOTE: every non-ASCII value below is written as a unicode escape so this
// file stays pure ASCII and can never carry the bytes it guards against.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["app", "components", "lib", "supabase", "config"];
const EXTENSIONS = [".ts", ".tsx", ".sql", ".mjs"];

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules") continue;
        walk(full);
      } else if (EXTENSIONS.some((ext) => full.endsWith(ext))) {
        out.push(full);
      }
    }
  };
  for (const root of ROOTS) walk(join(process.cwd(), root));
  return out;
}

const FCC = String.fromCharCode;
const C2 = FCC(0xC2);
const E2 = FCC(0xE2);
const C3 = FCC(0xC3);
const AC = FCC(0x20AC);
const A1A = FCC(0x201A);
const T20 = FCC(0x2020);
const EM = FCC(0x2014);
const EN = FCC(0x2013);
const OQ = FCC(0x2018);
const CQ = FCC(0x2019);
const OD = FCC(0x201C);
const CD = FCC(0x201D);
const EL = FCC(0x2026);
const NB = FCC(0x00A0);
const MD = FCC(0x00B7);
const ML = FCC(0x00D7);

// Double-encoding leaders plus C1 controls (never legitimate in source).
const C1 = String.fromCharCode(128) + "-" + String.fromCharCode(159);
const MOJIBAKE = new RegExp(
  C2 + "|" + E2 + "(?=[" + AC + A1A + T20 + "])|" + C3 + "(?=[" + EM + EN + OQ + CQ + OD + CD + EL + NB + MD + ML + "])|[" + C1 + "]",
  "u"
);

const MIDDOT = FCC(0xB7);
const EMDASH = FCC(0x2014);
const ARROW = FCC(0x2192);
const TIMES = FCC(0xD7);

describe("utf-8 mojibake guard", () => {
  it("no source file carries double-encoding signatures", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const text = readFileSync(file, "utf8");
      if (MOJIBAKE.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  it("the repaired files carry proper single-codepoint punctuation", () => {
    const dashboard = readFileSync(join(process.cwd(), "components/manager/manager-dashboard-client.tsx"), "utf8");
    const detail = readFileSync(join(process.cwd(), "components/customer/reservation-detail-view.tsx"), "utf8");
    for (const text of [dashboard, detail]) {
      expect(text).toContain(MIDDOT);
      expect(text).toContain(EMDASH);
    }
    expect(dashboard).toContain(ARROW);
    expect(detail).toContain(TIMES);
  });
});
