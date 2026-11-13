import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CHART_AXIS,
  CHART_FORECAST,
  CHART_GRID,
  CHART_OCCUPANCY,
  CHART_REPORT_OCCUPANCY,
} from "@/lib/chart-tokens";

// Chart color ownership contract (Stage 1 of the reference-design roadmap).
// Recharts needs raw hexes in SVG attributes, so the values live in one
// shared module (lib/chart-tokens.ts) and chart panels import them instead
// of declaring private palettes. Rendered-chart color results remain a
// manual browser checklist item - these tests cannot be visual verification.

const PANELS = [
  "components/manager/manager-overview.tsx",
  "components/manager/predictive-insights-panel.tsx",
  "components/manager/performance-reports.tsx",
];

describe("chart color source contract", () => {
  it("keeps the canonical values in the token module", () => {
    expect(CHART_GRID).toBe("#e8e7e2");
    expect(CHART_AXIS).toBe("#94a3b8");
    expect(CHART_OCCUPANCY).toBe("#176773");
    expect(CHART_REPORT_OCCUPANCY).toBe("#2a9098");
    expect(CHART_FORECAST).toBe("#b8860b");
  });

  it("consumes the tokens instead of private chart palettes", () => {
    for (const panel of PANELS) {
      const source = readFileSync(join(process.cwd(), panel), "utf8");
      expect(source, `${panel} must import from @/lib/chart-tokens`).toMatch(
        /@\/lib\/chart-tokens/
      );
      // Any later series/grid/axis hex literal added to these files breaks
      // single-source; the var(--line, ...) grid exception stays allowed.
      const rawHex = source.match(/(?:stroke|fill|stopColor)="#[0-9a-fA-F]{6}"/g) ?? [];
      expect(rawHex.filter((v) => !v.includes("currentColor")), `${panel} ${rawHex.join(", ")}`)
        .toEqual([]);
    }
  });
});
