import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { after } from "next/server";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { getSecurityPolicy, otpTtlMinutes } from "@/lib/security-policy";
import { generateOtpCode, otpCodeVerifier, otpIssuable } from "@/lib/auth-otp";
import { buildPasswordResetOtpEmail, maskEmail } from "@/lib/otp-email";
import { sendAccountEmail, smtpConfigured } from "@/lib/otp-transport";
import { authRequestBudget } from "@/lib/auth-request-budget";

const schema = z.object({ email: z.string().trim().toLowerCase().email().max(200) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Enter a valid email address." }), { status: 400 });
  if (!supabase) return publicJson({ error: "Password reset is temporarily unavailable." }, { status: 503 });
  const { email } = parsed.data;
  const challengeId = randomUUID();
  const budget = await authRequestBudget("password_reset", email, request.headers);
  if (budget === "allowed") {
    const client = supabase;
    const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;
    after(async () => {
      try { await issueReset(client, email, challengeId, ip, userAgent); }
      catch { console.error("Password reset delivery failed"); }
    });
  }
  return publicJson({ ok: true, masked: maskEmail(email), challengeId });
}

async function issueReset(client: NonNullable<typeof supabase>, email: string, challengeId: string, ip: string | null, userAgent: string | null) {
  const { data: account, error } = await client.from("user_accounts").select("id,email,active").eq("email", email).maybeSingle();
  if (error) throw error;
  const log = { user_id: account?.id ?? null, email, ip_address: ip, user_agent: userAgent };
  if (!account?.active) {
    await client.from("password_reset_logs").insert({ ...log, status: "requested" });
    return;
  }
  if (otpIssuable().ok !== true || !smtpConfigured()) {
    await client.from("password_reset_logs").insert({ ...log, status: "failed" });
    return;
  }
  const policy = await getSecurityPolicy();
  const code = generateOtpCode();
  const verifier = otpCodeVerifier(challengeId, code);
  if (!verifier) return;
  const issue = await client.rpc("auth_otp_issue_for_purpose", {
    p_purpose: "password_reset", p_user_id: account.id, p_challenge_id: challengeId, p_code_verifier: verifier,
    p_ttl_seconds: policy.otpTtlSeconds, p_cooldown_seconds: policy.otpResendCooldownSeconds,
  });
  if (issue.error) return;
  const tokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
  const token = await client.from("account_recovery_tokens").insert({ user_id: account.id, token_hash: tokenHash, created_by: null,
    expires_at: new Date(Date.now() + 3600000).toISOString() }).select("id").single();
  const audit = token.data && !token.error ? await client.from("password_reset_logs").insert({
    ...log, token_id: token.data.id, challenge_id: challengeId, status: "requested",
  }) : null;
  const sent = audit && !audit.error
    ? await sendAccountEmail({ to: email, message: buildPasswordResetOtpEmail({ code, ttlMinutes: otpTtlMinutes(policy) }) })
    : null;
  if (!sent?.ok) {
    if (token.data) await client.from("account_recovery_tokens").delete().eq("id", token.data.id);
    await client.from("auth_otp_challenges").update({ invalidated_at: new Date().toISOString() }).eq("id", challengeId);
    if (audit && !audit.error) await client.from("password_reset_logs").update({ status: "failed" }).eq("challenge_id", challengeId);
    else await client.from("password_reset_logs").insert({ ...log, status: "failed" });
  }
}
