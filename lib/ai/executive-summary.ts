import { Type, type Schema } from "@google/genai";
import { z } from "zod";
import type { DailyReportSnapshot } from "@/lib/front-desk-reports";

// AI Executive Shift Summary — three grounded sections over an authoritative
// DailyReportSnapshot. The snapshot is the record; Gemini narrates only, and
// every figure must come from it.

export const ExecutiveDigestSchema = z.object({
  executiveOverview: z.string().min(1).max(1200),
  bottlenecks: z.array(z.string().min(1).max(300)).max(6).default([]),
  actionPlan: z.array(z.string().min(1).max(300)).max(6).default([]),
});
export type ExecutiveDigest = z.infer<typeof ExecutiveDigestSchema>;

export const ExecutiveDigestResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    executiveOverview: { type: Type.STRING },
    bottlenecks: { type: Type.ARRAY, items: { type: Type.STRING } },
    actionPlan: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["executiveOverview"],
};

export const EXECUTIVE_DIGEST_TASK = `Summarize HAVEN's Daily Front Desk Operations Report snapshot below as an executive shift digest for the Manager/Owner.
Rules:
- Every figure must come from the snapshot. Do not invent or recompute numbers.
- executiveOverview: 2-4 sentences on occupancy flow (arrivals/departures), collections, and the day's overall shape.
- bottlenecks: housekeeping delays (awaiting inspection, turnaround), deposit verification backlogs, open maintenance, escalated requests — only ones visible in the snapshot; empty when the day is clean.
- actionPlan: concrete next-shift priorities derived from the above; empty when nothing needs action.
- The rooms section is a point-in-time snapshot at generation, not per-day history — treat it as such.`;

/** Render the snapshot as the model context — aggregates only, no guest PII. */
export function buildExecutiveDigestContext(report: DailyReportSnapshot): string {
  return `Report date: ${report.reportDate}\n\n${JSON.stringify(report, null, 2)}`;
}
