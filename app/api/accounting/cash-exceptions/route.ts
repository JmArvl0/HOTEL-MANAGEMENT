import { publicJson } from "@/lib/server-errors";
import { validationBody } from "@/lib/errors";
import { numericInput } from "@/lib/input-validation";

import { z } from "zod";
import { canReconcileFinancials } from "@/lib/permissions";
import { guardFinancial, guardFailed } from "@/lib/financial-route";

export async function GET(request: Request) {
  const ctx = await guardFinancial(canReconcileFinancials, "Accounting access required."); if (guardFailed(ctx)) return ctx;
  const page = numericInput(z.number().int().min(1).max(100000)).safeParse(new URL(request.url).searchParams.get("page") ?? 1);
  if (!page.success) return publicJson(validationBody(page.error, { error: "Invalid page." }), { status: 400 });
  const { data, error, count } = await ctx.client.from("payments").select("id,reservation_id,amount,reference,created_at,cash_exception_reviews(note,version,reviewed_at)", { count: "exact" }).eq("method", "cash").eq("status", "paid").is("cash_shift_id", null).order("created_at", { ascending: false }).order("id").range((page.data - 1) * 25, page.data * 25 - 1);
  if (error) return publicJson({ error: "Cash exception history is unavailable right now. Try again shortly, or contact the system administrator if it continues." }, { status: 503 });
  return publicJson({ data, count, page: page.data });
}
export async function POST(request: Request) {
  const ctx = await guardFinancial(canReconcileFinancials, "Accounting access required."); if (guardFailed(ctx)) return ctx;
  const parsed = z.object({ paymentId: z.string().uuid(), note: z.string().trim().min(3).max(1000), version: z.number().int().nonnegative() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Enter an investigation note." }), { status: 400 });
  const { error } = await ctx.client.rpc("review_cash_exception", { p_actor: ctx.actorId, p_payment: parsed.data.paymentId, p_note: parsed.data.note, p_version: parsed.data.version });
  if (error) return publicJson({ error: "The exception has changed. Refresh and try again." }, { status: 409 });
  return publicJson({ data: { reviewed: true } });
}
