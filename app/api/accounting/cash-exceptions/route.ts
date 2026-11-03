import { NextResponse } from "next/server";
import { z } from "zod";
import { canReconcileFinancials } from "@/lib/permissions";
import { guardFinancial, guardFailed } from "@/lib/financial-route";

export async function GET(request: Request) {
  const ctx = await guardFinancial(canReconcileFinancials, "Accounting access required."); if (guardFailed(ctx)) return ctx;
  const page = z.coerce.number().int().min(1).max(100000).safeParse(new URL(request.url).searchParams.get("page") ?? 1);
  if (!page.success) return NextResponse.json({ error: "Invalid page." }, { status: 400 });
  const { data, error, count } = await ctx.client.from("payments").select("id,reservation_id,amount,reference,created_at,cash_exception_reviews(note,version,reviewed_at)", { count: "exact" }).eq("method", "cash").eq("status", "paid").is("cash_shift_id", null).order("created_at", { ascending: false }).order("id").range((page.data - 1) * 25, page.data * 25 - 1);
  if (error) return NextResponse.json({ error: "Cash exception history is unavailable. Try again or check pending migrations." }, { status: 503 });
  return NextResponse.json({ data, count, page: page.data });
}
export async function POST(request: Request) {
  const ctx = await guardFinancial(canReconcileFinancials, "Accounting access required."); if (guardFailed(ctx)) return ctx;
  const parsed = z.object({ paymentId: z.string().uuid(), note: z.string().trim().min(3).max(1000), version: z.number().int().nonnegative() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter an investigation note." }, { status: 400 });
  const { error } = await ctx.client.rpc("review_cash_exception", { p_actor: ctx.actorId, p_payment: parsed.data.paymentId, p_note: parsed.data.note, p_version: parsed.data.version });
  if (error) return NextResponse.json({ error: "The exception has changed. Refresh and try again." }, { status: 409 });
  return NextResponse.json({ data: { reviewed: true } });
}
