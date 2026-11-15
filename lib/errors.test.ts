import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ERROR_COPY, userMessage, validationBody, validationErrors } from "@/lib/errors";
import { logServerError, publicJson } from "@/lib/server-errors";
import { fetchPublic, readResponse } from "@/lib/client-errors";

describe("public error boundaries", () => {
  it("maps known messages and keeps arbitrary diagnostics internal", () => {
    expect(userMessage("Unauthorized")).toBe(ERROR_COPY.signIn);
    expect(userMessage("Database unavailable.")).toBe(ERROR_COPY.unavailable);
    for (const detail of ["23505 duplicate key password=private", "NetworkError: Failed to fetch", "SyntaxError: unexpected <html>", "XENDIT_SESSION_MISMATCH", "at handler (server.ts:4)"]) {
      expect(userMessage(new Error(detail), "Unable to load rooms. Please retry.")).toBe("Unable to load rooms. Please retry.");
    }
  });

  it("formats real schema failures without altering the validation constraints", () => {
    const schema = z.object({ firstName: z.string().min(1), email: z.string().email(), guests: z.number().int().min(1).max(8), notes: z.string().max(500) });
    const result = schema.safeParse({ firstName: "", email: "private-invalid-input", guests: 1.5, notes: "x".repeat(501) });
    if (result.success) throw new Error("Expected invalid fixture");
    const body = validationErrors(result.error);
    expect(body.fields.firstName).toBe("Please enter your first name.");
    expect(body.error).toBe("Please enter your first name.");
    expect(body.fields.email).toBe("Please enter a valid email address.");
    expect(body.fields.guests).toMatch(/whole number/);
    expect(body.fields.notes).toContain("500 characters or fewer");
    expect(JSON.stringify(body)).not.toMatch(/private-invalid-input|Expected integer|String must|Invalid email/);
    expect(schema.safeParse({ firstName: "Ava", email: "ava@example.invalid", guests: 2, notes: "" }).success).toBe(true);
  });

  it("preserves full paths and does not collapse two different nested fields", () => {
    const schema = z.object({ arrival: z.object({ pickupDate: z.string().min(1) }), departure: z.object({ pickupDate: z.string().min(1) }) });
    const result = schema.safeParse({ arrival: { pickupDate: "" }, departure: { pickupDate: "" } });
    if (result.success) throw new Error("Expected invalid fixture");
    const body = validationErrors(result.error);
    expect(Object.keys(body.fieldErrors)).toEqual(["arrival.pickupDate", "departure.pickupDate"]);
    expect(body.fields).not.toHaveProperty("pickupDate");
  });

  it("turns an invalid internal reference into page recovery, not an editable field", () => {
    const result = z.object({ idempotencyKey: z.string().uuid() }).safeParse({ idempotencyKey: "private-reference" });
    if (result.success) throw new Error("Expected invalid fixture");
    const body = validationErrors(result.error);
    expect(body.fields).toEqual({});
    expect(body.error).toMatch(/Reopen/);
    expect(JSON.stringify(body)).not.toMatch(/uuid|private-reference/);
  });

  it("preserves the legacy flattened field shape and single-field registration contract", () => {
    const result = z.object({ email: z.string().email() }).safeParse({ email: "invalid" });
    if (result.success) throw new Error("Expected invalid fixture");
    expect(validationBody(result.error, { fields: result.error.flatten() }).fields).toEqual({ formErrors: [], fieldErrors: { email: ["Please enter a valid email address."] } });
    expect(validationBody(result.error, { field: "email" }).error).toBe("Please enter a valid email address.");
  });

  it("retains API statuses, headers, success payloads and machine discriminators", async () => {
    const success = publicJson({ data: { id: "booking-fixture" } }, { status: 201, headers: { "Cache-Control": "no-store" } });
    expect(success.status).toBe(201);
    expect(success.headers.get("Cache-Control")).toBe("no-store");
    expect(await success.json()).toEqual({ data: { id: "booking-fixture" } });
    const rejected = publicJson({ error: "EMAIL_FAILED", message: "private SMTP exception" }, { status: 502 });
    const body = await rejected.json();
    expect(rejected.status).toBe(502);
    expect(body.error).toBe("EMAIL_FAILED");
    expect(body.message).not.toContain("private SMTP");
  });

  it("keeps formatted fields usable through the server boundary", async () => {
    const result = z.object({ firstName: z.string().min(1) }).safeParse({ firstName: "" });
    if (result.success) throw new Error("Expected invalid fixture");
    const body = await publicJson(validationBody(result.error), { status: 400 }).json();
    expect(body.fields.firstName).toBe("Please enter your first name.");
  });

  it("does not serialize an exception object or diagnostic properties in an error envelope", async () => {
    const body = await publicJson({ error: { message: "private SQL row values" }, details: "private-details", stack: "private-stack", hint: "private-hint", fields: { name: "private SQL detail" }, fieldErrors: { name: "private SQL detail" }, message: { internal: "private provider object" } }, { status: 500 }).json();
    expect(JSON.stringify(body)).not.toMatch(/private|SQL|"(?:stack|hint|details)"/);
    expect(body.error).toBe(ERROR_COPY.unavailable);
  });

  it("sanitizes legacy field responses while preserving generated field instructions", async () => {
    const body = await readResponse(Response.json({ error: "Invalid input", fields: { name: "SQL exception: private guest", firstName: "Use at least 2 characters for your first name." } }, { status: 400 }));
    expect(body.fields.name).toBe(ERROR_COPY.fields);
    expect(body.fields.firstName).toBe("Use at least 2 characters for your first name.");
  });

  it("does not log exception messages, row details, hints or submitted secrets", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      logServerError("Cash shift update", { code: "23505", message: "password=fixture-private", details: "guest email", hint: "token=fixture-private" });
      expect(log).toHaveBeenCalledWith("Cash shift update", { code: "23505", requestId: expect.any(String) });
      expect(JSON.stringify(log.mock.calls)).not.toMatch(/fixture-private|guest email/);
    } finally { log.mockRestore(); }
  });

  it("treats a lost write response as unknown and preserves the caller's retry identity", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch: private-host"));
    try {
      const init = { method: "POST", body: JSON.stringify({ idempotencyKey: "same-fixture-key" }) };
      const response = await fetchPublic("/api/front-desk/reservations", init);
      const body = await readResponse(response);
      expect(response.ok).toBe(false);
      expect(body.outcome).toBe("unknown");
      expect(body.error).toMatch(/Check Reservations/);
      expect(body.error).not.toContain("private-host");
      expect(fetch).toHaveBeenCalledWith("/api/front-desk/reservations", init);
    } finally { fetch.mockRestore(); }
  });

  it("handles HTML proxy pages without exposing HTML or announcing success", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>private backend trace</html>", { status: 200, headers: { "Content-Type": "text/html" } }));
    try {
      const response = await fetchPublic("/api/booking/payments/xendit", { method: "POST" });
      const body = await readResponse(response);
      expect(response.ok).toBe(false);
      expect(body.outcome).toBe("unknown");
      expect(body.error).toMatch(/before paying/);
      expect(JSON.stringify(body)).not.toContain("backend trace");
    } finally { fetch.mockRestore(); }
  });

  it("does not consume binary downloads", async () => {
    const original = new Response("fixture-pdf", { headers: { "Content-Type": "application/pdf" } });
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(original);
    try { expect(await (await fetchPublic("/api/account/receipt/download")).text()).toBe("fixture-pdf"); }
    finally { fetch.mockRestore(); }
  });
});
