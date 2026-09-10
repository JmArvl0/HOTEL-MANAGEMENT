import { ApiError, GoogleGenAI, type Content, type FunctionDeclaration, type GenerateContentResponse, type Schema } from "@google/genai";
import type { z } from "zod";

/**
 * Server-side Gemini client. Server-only — importing this from a client
 * component would expose nothing directly, but the API key must never be read
 * outside server code. GEMINI_API_KEY stays in .env.local / the deployment
 * environment; there is deliberately no NEXT_PUBLIC_ Gemini variable.
 *
 * Every call returns a discriminated result and NEVER throws, so a Gemini
 * outage can only take down AI explanations — reservations, payments,
 * housekeeping and reports keep working.
 */

export type AiFailureReason = "unconfigured" | "unavailable" | "rate_limited" | "timeout" | "invalid";
export type AiResult<T> =
  | { ok: true; data: T; model: string; latencyMs: number }
  // httpStatus/errorCode carry Google's safe error category (e.g. 403
  // PERMISSION_DENIED) so server logs can distinguish auth/project denials
  // from bad requests, retired models and outages — the user-facing fallback
  // stays generic. Never includes the key or prompt content.
  | { ok: false; reason: AiFailureReason; message: string; httpStatus?: number; errorCode?: string };

/** Default is a long-term stable Gemini model with tool use; override with GEMINI_MODEL. */
export const GEMINI_MODEL_DEFAULT = "gemini-3.6-flash";

const blank = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const apiKey = () => blank(process.env.GEMINI_API_KEY);
export const geminiModel = () => blank(process.env.GEMINI_MODEL) ?? GEMINI_MODEL_DEFAULT;
export const aiConfigured = () => Boolean(apiKey());

let client: GoogleGenAI | null = null;
const getClient = () => {
  const key = apiKey();
  if (!key) return null;
  client ??= new GoogleGenAI({ apiKey: key });
  return client;
};

const DEFAULT_TIMEOUT_MS = 20_000;

export interface GeminiCallOptions {
  systemInstruction?: string;
  contents: string | Content[];
  temperature?: number;
  responseSchema?: Schema;
  tools?: FunctionDeclaration[];
  timeoutMs?: number;
}

async function callModel(options: GeminiCallOptions): Promise<AiResult<GenerateContentResponse>> {
  const ai = getClient();
  if (!ai) return { ok: false, reason: "unconfigured", message: "GEMINI_API_KEY is not configured on the server." };
  const model = geminiModel();
  const started = Date.now();
  try {
    const response = await ai.models.generateContent({
      model,
      contents: options.contents,
      config: {
        systemInstruction: options.systemInstruction,
        temperature: options.temperature,
        responseMimeType: options.responseSchema ? "application/json" : undefined,
        responseSchema: options.responseSchema,
        tools: options.tools?.length ? [{ functionDeclarations: options.tools }] : undefined,
        abortSignal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
      }
    });
    return { ok: true, data: response, model, latencyMs: Date.now() - started };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Gemini error";
    // ApiError carries Google's HTTP status; some SDK/network errors expose a
    // numeric code on the JSON body instead. Safe fields only — never headers.
    const httpStatus = error instanceof ApiError ? error.status : typeof (error as { code?: unknown })?.code === "number" ? (error as { code: number }).code : undefined;
    const errorCode = typeof (error as { error?: { status?: unknown } })?.error?.status === "string" ? (error as { error: { status: string } }).error.status : undefined;
    // One safe server-side line per failed call so the real category (auth
    // denial, retired model, quota, outage) is diagnosable from the logs.
    console.error(`[ai] Gemini call failed — model=${model} reason=%s httpStatus=%s errorCode=%s message=${message.slice(0, 200)}`,
      httpStatus === 429 ? "rate_limited" : error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError") ? "timeout" : "unavailable",
      httpStatus ?? "n/a", errorCode ?? "n/a");
    if (error instanceof ApiError && error.status === 429) return { ok: false, reason: "rate_limited", message, httpStatus, errorCode };
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return { ok: false, reason: "timeout", message, httpStatus, errorCode };
    return { ok: false, reason: "unavailable", message, httpStatus, errorCode };
  }
}

export function extractText(response: GenerateContentResponse): string {
  return typeof response.text === "string" ? response.text : "";
}

/** Structured output: JSON response guided by an SDK schema, then zod-validated before it ever reaches the UI. */
export async function generateJson<T>(options: GeminiCallOptions & { schema: z.ZodType<T> }): Promise<AiResult<T>> {
  const result = await callModel(options);
  if (!result.ok) return result;
  try {
    const parsed = JSON.parse(extractText(result.data));
    const validated = options.schema.safeParse(parsed);
    if (!validated.success) return { ok: false, reason: "invalid", message: "Gemini response did not match the expected structure." };
    return { ok: true, data: validated.data, model: result.model, latencyMs: result.latencyMs };
  } catch {
    return { ok: false, reason: "invalid", message: "Gemini returned unparseable JSON." };
  }
}

export async function generateText(options: GeminiCallOptions): Promise<AiResult<string>> {
  const result = await callModel(options);
  if (!result.ok) return result;
  const text = extractText(result.data);
  if (!text.trim()) return { ok: false, reason: "invalid", message: "Gemini returned an empty response." };
  return { ok: true, data: text, model: result.model, latencyMs: result.latencyMs };
}

/** Raw tool-calling pass for the Ask HAVEN loop; the caller executes tools and appends function responses. */
export async function generateWithTools(options: GeminiCallOptions): Promise<AiResult<GenerateContentResponse>> {
  return callModel(options);
}
