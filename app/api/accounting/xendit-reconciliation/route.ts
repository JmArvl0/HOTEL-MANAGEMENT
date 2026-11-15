import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { z } from "zod";
import { guardFailed, guardFinancial } from "@/lib/financial-route";
import { getXenditSession } from "@/lib/xendit";
import { attachXenditSession, settleKnownXenditSession } from "@/lib/xendit-store";

const accountingOnly = () => guardFinancial(role => role === "accounting", "Accounting access required.");
const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("check"), paymentId: z.string().uuid(), sessionId: z.string().regex(/^ps-[a-zA-Z0-9-]{1,60}$/).optional() }),
  z.object({ action: z.literal("resolve"), paymentId: z.string().uuid(), evidence: z.string().trim().min(8).max(500) }),
]);

export async function GET(request: Request) {
  const context = await accountingOnly();
  if (guardFailed(context)) return context;
  const page = new URL(request.url).searchParams.get("page") ?? "0";
  if (!/^(0|[1-9][0-9]{0,5})$/.test(page)) return publicJson({ error: "Choose a valid page." }, { status: 400 });
  const offset = Number(page) * 50;
  const { data, error, count } = await context.client.from("xendit_payment_reviews")
    .select("payment_id,reason,opened_at,payments!inner(reservation_id,amount,gateway_checkout_amount,provider_reference_id,gateway_reference_id,gateway_payment_id)", { count: "exact" })
    .eq("state", "open").order("opened_at").order("payment_id").range(offset, offset + 49);
  if (error) return publicJson({ error: "Unable to load the review queue." }, { status: 503 });
  return publicJson({ data, total: count });
}

export async function POST(request: Request) {
  const context = await accountingOnly();
  if (guardFailed(context)) return context;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Check the review details and try again." }), { status: 400 });
  const input = parsed.data;
  if (input.action === "resolve") {
    const { error } = await context.client.rpc("resolve_xendit_payment_review", {
      p_payment: input.paymentId, p_actor: context.actorId, p_evidence: input.evidence,
    });
    if (error?.message.includes("PAYMENT_REVIEW_NOT_OPEN")) return publicJson({ error: "This review is already closed." }, { status: 409 });
    if (error) return publicJson({ error: "Unable to save the reconciliation." }, { status: 503 });
    return publicJson({ data: { outcome: "resolved" } });
  }
  const { data: review, error } = await context.client.from("xendit_payment_reviews")
    .select("payment_id").eq("payment_id", input.paymentId).eq("state", "open").maybeSingle();
  if (error) return publicJson({ error: "Unable to load the payment review." }, { status: 503 });
  if (!review) return publicJson({ error: "This review is no longer open." }, { status: 404 });
  const result = await context.client.from("payments").select("provider_reference_id,gateway_reference_id,gateway_checkout_amount,amount")
    .eq("id", review.payment_id).eq("payment_gateway", "xendit").single();
  if (result.error || !result.data) return publicJson({ error: "Unable to load the Xendit payment." }, { status: 503 });
  const payment = result.data;
  const sessionId = input.sessionId || payment.gateway_reference_id;
  if (!sessionId) return publicJson({ error: "Enter the matching session ID from the Xendit dashboard." }, { status: 400 });
  try {
    const trusted = await getXenditSession(sessionId);
    if (trusted.reference_id !== payment.provider_reference_id || trusted.amount !== Number(payment.gateway_checkout_amount ?? payment.amount)
        || (payment.gateway_reference_id && trusted.payment_session_id !== payment.gateway_reference_id)) {
      return publicJson({ error: "The Xendit session does not match this payment." }, { status: 409 });
    }
    if (!payment.gateway_reference_id) await attachXenditSession(context.client, trusted);
    const outcome = await settleKnownXenditSession(context.client, trusted);
    return publicJson({ data: outcome });
  } catch {
    return publicJson({ error: "Unable to confirm the session with Xendit. Review the dashboard reference and retry." }, { status: 503 });
  }
}
