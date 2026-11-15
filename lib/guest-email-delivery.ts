import { sendEmail, type EmailMessage } from "@/lib/email";
import { supabase } from "@/lib/supabase";

export async function deliverGuestEmail(key: string, message: EmailMessage, retry = false) {
  if (!supabase) return "skipped";
  try {
    const claim = await supabase.rpc("claim_guest_email_delivery", { p_key: key, p_retry: retry });
    if (claim.error) return "error";
    if (!claim.data) return "skipped";
    const result = await sendEmail({ ...message, idempotencyKey: key });
    const state = result.ok ? "sent" : result.reason === "unconfigured" ? "skipped" : "failed";
    const finish = await supabase.rpc("finish_guest_email_delivery", {
      p_key: key, p_attempt: claim.data, p_state: state,
      p_provider_id: result.ok ? result.providerId ?? null : null,
      p_failure: result.ok ? null : result.reason,
    });
    return finish.error || state === "failed" ? "error" : state;
  } catch {
    return "error";
  }
}
