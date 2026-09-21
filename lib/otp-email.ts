/**
 * Pure OTP email content + address masking. No I/O, no secrets — safe to
 * unit test and safe to import anywhere (the transporter stays server-only).
 */

export const OTP_CODE_LENGTH = 6;
export const OTP_CODE_PATTERN = /^\d{6}$/;

/** m***@example.com — the verify screen names the mailbox, never the address. */
export function maskEmail(email: unknown): string {
  if (typeof email !== "string") return "***";
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

export type OtpEmailMessage = { subject: string; html: string; text: string };

/**
 * Connectivity probe content. Carries NO code and states so explicitly — a
 * test message must never be confusable with a real verification code.
 */
export function buildTestEmail(): OtpEmailMessage {
  const subject = "HAVEN email delivery test";
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f8f6f1;font-family:Georgia,serif;color:#103e48">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #dce4e1;border-radius:12px;padding:32px">
<p style="letter-spacing:.2em;font-size:12px;color:#084b55;margin:0 0 16px">HAVEN HOTEL &amp; RESIDENCES</p>
<h1 style="font-size:20px;margin:0 0 12px">Email delivery is working</h1>
<p style="font-size:14px;margin:0">This is a connectivity test requested by a HAVEN administrator. It contains no verification code and authorizes nothing.</p>
<p style="font-size:12px;color:#8a8a8a;margin:32px 0 0">Sent by HAVEN account security.</p>
</div></body></html>`;
  const text = ["HAVEN HOTEL & RESIDENCES", "", "Email delivery is working", "", "This is a connectivity test requested by a HAVEN administrator. It contains no verification code and authorizes nothing."].join("\n");
  return { subject, html, text };
}

export function buildOtpEmail(input: { code: string; ttlMinutes: number }): OtpEmailMessage {
  const minutes = Math.max(1, Math.round(input.ttlMinutes));
  const subject = `Your HAVEN verification code: ${input.code}`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f8f6f1;font-family:Georgia,serif;color:#103e48">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #dce4e1;border-radius:12px;padding:32px">
<p style="letter-spacing:.2em;font-size:12px;color:#084b55;margin:0 0 16px">HAVEN HOTEL &amp; RESIDENCES</p>
<h1 style="font-size:20px;margin:0 0 12px">Your verification code</h1>
<p style="font-size:14px;margin:0 0 16px">Use this code to finish signing in to HAVEN. It expires in ${minutes} minute${minutes === 1 ? "" : "s"} and can be used once.</p>
<p style="font-size:32px;letter-spacing:.35em;font-weight:bold;color:#084b55;margin:0 0 16px">${input.code}</p>
<p style="font-size:13px;margin:0">If you did not request this login, ignore this message — your password alone cannot complete a sign-in while verification is required.</p>
<p style="font-size:12px;color:#8a8a8a;margin:32px 0 0">Sent by HAVEN account security. Never share this code with anyone.</p>
</div></body></html>`;
  const text = [
    "HAVEN HOTEL & RESIDENCES",
    "",
    "Your verification code",
    "",
    `Use this code to finish signing in to HAVEN: ${input.code}`,
    `It expires in ${minutes} minute${minutes === 1 ? "" : "s"} and can be used once.`,
    "",
    "If you did not request this login, ignore this message.",
    "Never share this code with anyone.",
  ].join("\n");
  return { subject, html, text };
}
