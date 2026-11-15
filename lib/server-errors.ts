import { NextResponse } from "next/server";
import { errorCategory, statusMessage, userMessage, safeFieldMessages } from "@/lib/errors";

/** Preserve status, success bodies and legacy machine discriminators. Never serialize an exception. */
export function publicJson<Body>(body: Body, init?: ResponseInit): NextResponse<Body> {
  if (!body || typeof body !== "object" || !("error" in body)) return NextResponse.json(body, init);
  const value = body as Record<string, unknown>;
  const status = init?.status ?? 400;
  const machine = typeof value.error === "string" && /^[A-Z][A-Z_0-9]+$/.test(value.error);
  const message = userMessage(machine ? value.message : value.error, statusMessage(status));
  const fields = value.fields && typeof value.fields === "object" ? safeFieldMessages(value.fields) : undefined;
  const safe = Object.fromEntries(Object.entries(value).filter(([key]) => !["stack", "details", "hint", "exception", "raw", "sql"].includes(key)));
  const response = { ...safe, error: machine ? value.error : message, ...(machine || "message" in value ? { message } : {}),
    code: typeof value.code === "string" ? value.code : machine ? value.error : `REQUEST_${status}`,
    category: value.category ?? errorCategory(status), outcome: value.outcome ?? (status >= 500 ? "unknown" : "rejected"),
    ...(fields ? { fields } : {}), ...(value.fieldErrors ? { fieldErrors: safeFieldMessages(value.fieldErrors) } : {}) };
  return NextResponse.json(response, init) as NextResponse<Body>;
}

/** Keep bounded diagnostic codes; DB messages/details/hints and entire exceptions are not log fields. */
export function logServerError(operation: string, error: unknown) {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" && /^[A-Z0-9_]{2,64}$/.test(error.code) ? error.code : "UNEXPECTED_FAILURE";
  console.error(operation, { code, requestId: crypto.randomUUID() });
}
