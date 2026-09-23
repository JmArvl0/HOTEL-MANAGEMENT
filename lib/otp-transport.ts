/**
 * Server-only OTP email delivery via Nodemailer (SMTP). Never import from
 * client components — the transporter holds SMTP credentials.
 *
 * Contract mirrors lib/email.ts: results are discriminated, send paths never
 * throw, and a missing configuration is a distinct outcome so callers (and
 * the admin delivery panel) can report it honestly instead of guessing.
 */
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { buildOtpEmail, buildTestEmail, type OtpEmailMessage } from "@/lib/otp-email";

export type OtpEmailFailureReason = "unconfigured" | "failed";
export type OtpEmailResult = { ok: true } | { ok: false; reason: OtpEmailFailureReason; message: string };

const blank = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const CONNECT_TIMEOUT_MS = 10_000;
const SEND_TIMEOUT_MS = 15_000;

export function smtpConfigured(): boolean {
  return Boolean(blank(process.env.SMTP_HOST) && blank(process.env.SMTP_USER) && blank(process.env.SMTP_PASSWORD));
}

export function smtpSender(): string {
  return blank(process.env.SMTP_FROM) ?? "HAVEN Security <security@haven.example>";
}

function smtpPort(): number {
  const parsed = Number(blank(process.env.SMTP_PORT) ?? "587");
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 587;
}

function smtpSecure(): boolean {
  const explicit = blank(process.env.SMTP_SECURE)?.toLowerCase();
  if (explicit === "true") return true;
  if (explicit === "false") return false;
  return smtpPort() === 465;
}

let cachedTransporter: Transporter | null = null;

export function resetOtpTransporter() {
  cachedTransporter = null;
}

function transporter(): Transporter | null {
  if (!smtpConfigured()) return null;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: blank(process.env.SMTP_HOST),
      port: smtpPort(),
      // Port 465 negotiates TLS immediately; 587 upgrades via STARTTLS.
      secure: smtpSecure(),
      requireTLS: !smtpSecure(),
      auth: { user: blank(process.env.SMTP_USER), pass: blank(process.env.SMTP_PASSWORD) },
      // Certificate validation stays enabled; no insecure fallback exists.
      connectionTimeout: CONNECT_TIMEOUT_MS,
      greetingTimeout: CONNECT_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    });
  }
  return cachedTransporter;
}

/** Live SMTP handshake (connect + authenticate). Never throws, never sends. */
export async function verifySmtpConnection(): Promise<OtpEmailResult> {
  const transport = transporter();
  if (!transport) return { ok: false, reason: "unconfigured", message: "SMTP is not configured on the server." };
  try {
    await transport.verify();
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed", message: "SMTP connection or authentication failed." };
  }
}

/** Connectivity probe to the administrator's own address. No code, no session. */
export async function sendTestEmail(input: { to: string }): Promise<OtpEmailResult> {
  const transport = transporter();
  if (!transport) return { ok: false, reason: "unconfigured", message: "SMTP is not configured on the server." };
  if (!blank(input.to)) return { ok: false, reason: "failed", message: "No recipient address." };
  const message = buildTestEmail();
  try {
    await transport.sendMail({ from: smtpSender(), to: input.to, subject: message.subject, text: message.text, html: message.html });
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed", message: "The test email could not be delivered." };
  }
}

/** Generic account-security send (recovery links, reset codes). Never throws. */
export async function sendAccountEmail(input: { to: string; message: OtpEmailMessage }): Promise<OtpEmailResult> {
  const transport = transporter();
  if (!transport) return { ok: false, reason: "unconfigured", message: "SMTP is not configured on the server." };
  if (!blank(input.to)) return { ok: false, reason: "failed", message: "No recipient address." };
  try {
    await transport.sendMail({
      from: smtpSender(), to: input.to,
      subject: input.message.subject, text: input.message.text, html: input.message.html,
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed", message: "The email could not be delivered." };
  }
}

export async function sendOtpEmail(input: { to: string; code: string; ttlMinutes: number }): Promise<OtpEmailResult> {
  const transport = transporter();
  if (!transport) return { ok: false, reason: "unconfigured", message: "SMTP is not configured on the server." };
  if (!blank(input.to)) return { ok: false, reason: "failed", message: "No recipient address." };
  const message = buildOtpEmail({ code: input.code, ttlMinutes: input.ttlMinutes });
  try {
    await transport.sendMail({
      from: smtpSender(),
      to: input.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed", message: "The verification email could not be delivered." };
  }
}
