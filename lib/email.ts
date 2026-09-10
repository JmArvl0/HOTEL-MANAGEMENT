/**
 * Server-side transactional email via Resend's HTTP API — plain fetch, no SDK.
 * Server-only: RESEND_API_KEY is read only here, never a NEXT_PUBLIC_ variable.
 *
 * Same contract as lib/ai/gemini-client: every call returns a discriminated
 * result and NEVER throws, so an email outage can only skip a notification —
 * reservations, payments and housekeeping keep working. A missing key is not
 * an error: the system is designed to run without any email provider.
 */

export type EmailFailureReason = "unconfigured" | "failed";
export type EmailResult = { ok: true } | { ok: false; reason: EmailFailureReason; message: string };

const blank = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export const emailConfigured = () => Boolean(blank(process.env.RESEND_API_KEY));
const fromAddress = () => blank(process.env.RESEND_FROM) ?? "Haven Hotel <onboarding@resend.dev>";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const key = blank(process.env.RESEND_API_KEY);
  if (!key) return { ok: false, reason: "unconfigured", message: "RESEND_API_KEY is not configured on the server." };
  if (!blank(message.to)) return { ok: false, reason: "failed", message: "No recipient address." };
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: fromAddress(), to: message.to, subject: message.subject, html: message.html }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
    // The response body is never forwarded anywhere; only the status decides.
    if (!response.ok) return { ok: false, reason: "failed", message: `Resend responded ${response.status}.` };
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed", message: "Email delivery request failed." };
  }
}

/** The minimal branded envelope every guest email shares. */
export function guestEmailHtml(heading: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f0f4f3;font-family:Georgia,serif;color:#103e48">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
<p style="letter-spacing:.2em;font-size:12px;color:#084b55;margin:0 0 16px">HAVEN HOTEL &amp; RESIDENCES</p>
<h1 style="font-size:20px;margin:0 0 16px">${heading}</h1>
${bodyHtml}
<p style="font-size:12px;color:#8a8a8a;margin:32px 0 0">Sent by the Haven Makati guest portal. Sign in to view your reservation details.</p>
</div></body></html>`;
}
