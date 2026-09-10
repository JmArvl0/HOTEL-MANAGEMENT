import { Type, type Schema } from "@google/genai";
import { z } from "zod";

/**
 * Zod validators (the gate — model output never renders without passing) and
 * matching Gemini response schemas (the guide — asks the model for the shape
 * in the first place).
 */

// ---- AI daily brief ---------------------------------------------------------

export const BriefSchema = z.object({
  summary: z.string().min(1).max(1200),
  priority_actions: z.array(z.object({ action: z.string().min(1).max(300), rationale: z.string().max(500) })).min(1).max(6),
  warnings: z.array(z.string().min(1).max(400)).max(6).default([]),
  prediction_explanations: z.array(z.object({ label: z.string().min(1).max(120), text: z.string().min(1).max(600) })).max(6).default([])
});
export type Brief = z.infer<typeof BriefSchema>;

export const BriefResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    priority_actions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { action: { type: Type.STRING }, rationale: { type: Type.STRING } }, required: ["action"] } },
    warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
    prediction_explanations: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { label: { type: Type.STRING }, text: { type: Type.STRING } }, required: ["label", "text"] } }
  },
  required: ["summary", "priority_actions"]
};

// ---- Ask HAVEN --------------------------------------------------------------

export const AskReplySchema = z.object({
  answer: z.string().min(1).max(2400),
  data_basis: z.string().max(400).default("")
});
export type AskReply = z.infer<typeof AskReplySchema>;

export const AskResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: { answer: { type: Type.STRING }, data_basis: { type: Type.STRING } },
  required: ["answer"]
};

// ---- Explain prediction -----------------------------------------------------

export const ExplanationSchema = z.object({
  explanation: z.string().min(1).max(1500),
  key_factors: z.array(z.string().min(1).max(300)).min(1).max(6),
  data_quality_note: z.string().max(400)
});
export type Explanation = z.infer<typeof ExplanationSchema>;

export const ExplanationResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    explanation: { type: Type.STRING },
    key_factors: { type: Type.ARRAY, items: { type: Type.STRING } },
    data_quality_note: { type: Type.STRING }
  },
  required: ["explanation", "key_factors", "data_quality_note"]
};

// ---- AI-assisted report summary ---------------------------------------------

export const ReportSummarySchema = z.object({
  summary: z.string().min(1).max(1500),
  highlights: z.array(z.string().min(1).max(300)).max(8).default([]),
  variance_notes: z.array(z.string().min(1).max(300)).max(4).default([])
});
export type ReportSummary = z.infer<typeof ReportSummarySchema>;

export const ReportSummaryResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
    variance_notes: { type: Type.ARRAY, items: { type: Type.STRING } }
  },
  required: ["summary"]
};
