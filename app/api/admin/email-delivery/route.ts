import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { guardAdmin, adminGuardFailed } from "@/lib/admin-route";
import { sendTestEmail, smtpConfigured, smtpSender, verifySmtpConnection } from "@/lib/otp-transport";

/**
 * Factual email-delivery status for the Security Configuration panel. Every
 * field is derived live: env presence plus the latest connection-test audit
 * row. "Ready" appears only after a passing test — never by configuration
 * alone. No credential or message content is ever exposed here.
 */
export async function GET() {
  const c = await guardAdmin();
  if (adminGuardFailed(c)) return c;
  let lastChecked: string | null = null;
  let lastResult: "passed" | "failed" | null = null;
  const { data } = await c.client.from("audit_logs").select("created_at,after_data")
    .eq("action", "smtp_connection_tested").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (data) {
    lastChecked = typeof data.created_at === "string" ? data.created_at : null;
    const ok = (data.after_data as { ok?: unknown } | null)?.ok;
    lastResult = ok === true ? "passed" : ok === false ? "failed" : null;
  }
  const configured = smtpConfigured();
  return NextResponse.json({
    data: {
      configured,
      sender: configured ? smtpSender() : null,
      lastChecked,
      lastResult,
      otpReady: configured && lastResult === "passed",
    },
  });
}

const testSchema = z.object({ action: z.enum(["verify", "send"]) });

/**
 * Authorized delivery check. "verify" performs the SMTP handshake only.
 * "send" delivers a real test message — always to the requesting
 * administrator's own session email, never to a client-supplied address.
 * Both outcomes are audited without secrets or message content.
 */
export async function POST(request: Request) {
  const c = await guardAdmin();
  if (adminGuardFailed(c)) return c;
  const parsed = testSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose verify or send." }, { status: 400 });

  if (parsed.data.action === "verify") {
    const result = await verifySmtpConnection();
    await c.client.from("audit_logs").insert({
      user_id: c.actorId, action: "smtp_connection_tested", entity_type: "service_configuration",
      entity_id: "smtp", after_data: { ok: result.ok, reason: result.ok ? null : result.reason },
    });
    if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.reason === "unconfigured" ? 400 : 502 });
    return NextResponse.json({ ok: true });
  }

  const session = await getServerSession(authOptions);
  const address = session?.user.email?.trim();
  if (!address) return NextResponse.json({ error: "No session email to test with." }, { status: 400 });
  const result = await sendTestEmail({ to: address });
  // Probe content carries no code by construction (see buildTestEmail), so a
  // test message can never complete a challenge.
  await c.client.from("audit_logs").insert({
    user_id: c.actorId, action: "smtp_test_email_sent", entity_type: "service_configuration",
    entity_id: "smtp", after_data: { ok: result.ok },
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: result.reason === "unconfigured" ? 400 : 502 });
  return NextResponse.json({ ok: true });
}
