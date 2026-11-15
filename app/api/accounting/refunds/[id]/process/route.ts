import { publicJson } from "@/lib/server-errors";

import { z } from "zod";
import { canProcessRefund } from "@/lib/permissions";
import { guardFailed, guardFinancial, invalid, rpcFailure } from "@/lib/financial-route";

const reference = z.string().trim().min(2).max(120);
const payout = z.discriminatedUnion("payoutMethod", [
  z.object({ reference, payoutMethod: z.literal("cash"), cashShiftId: z.string().uuid() }),
  z.object({ reference, payoutMethod: z.literal("noncash"), cashShiftId: z.null().optional() }),
]);
const explicit = z.discriminatedUnion("method", [
  z.object({ reference, method: z.literal("cash"), cashShiftId: z.string().uuid() }),
  z.object({ reference, method: z.enum(["bank_transfer", "gcash", "card"]), cashShiftId: z.null().optional() }),
]);
const schema = z.union([explicit, payout]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await guardFinancial(canProcessRefund, "You don't have permission to perform this accounting action. Ask Accounting for help.");
  if (guardFailed(context)) return context;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid("Enter a refund reference and payout method. Cash payouts require an open drawer.");

  const common = {
    p_refund_id: (await params).id,
    p_staff_user_id: context.actorId,
    p_reference: parsed.data.reference,
    p_cash_shift_id: parsed.data.cashShiftId ?? null,
  };
  const { data, error } = "method" in parsed.data
    ? await context.client.rpc("process_refund_with_payout", { ...common, p_method: parsed.data.method })
    : await context.client.rpc("process_refund", { ...common, p_payout_method: parsed.data.payoutMethod });
  if (error) return rpcFailure(error, {
    INSUFFICIENT_DRAWER_CASH: "The selected drawer does not have enough recorded cash for this refund.",
    REFUND_PAYOUT_INVALID: "Choose a valid payout method and matching drawer.",
    IDEMPOTENCY_CONFLICT: "This refund already has different payout details. Review the recorded refund before retrying.",
    REFUND_DRAWER_REQUIRED: "Open a drawer in Cash & Shifts before recording a cash refund.",
    REFUND_DRAWER_CHANGED: "That drawer is no longer open. Check Cash & Shifts before recording this payout.",
    CASH_SHIFT_REQUIRED: "That drawer is no longer open. Check Cash & Shifts before recording this payout.",
    REFUND_PAYOUT_CONFLICT: "This refund already has different payout details. Review the recorded refund before retrying.",
    REFUND_EXCEEDS_FOLIO_CREDIT: "The refundable folio credit has changed. Refresh the folio before processing.",
    REFUND_EXCEPTION_NOT_APPROVED: "This fee waiver requires a current approved refund exception.",
    REFUND_EXCEEDS_RECEIVED: "A refund cannot exceed the amount actually received for this folio.",
    REFUND_NOT_PENDING: "This refund is no longer open for settlement.",
    REFUND_NOT_FOUND: "That refund request no longer exists.",
    REFUND_PROCESSING_FORBIDDEN: "You don't have permission to perform this accounting action. Ask Accounting for help.",
  }, "Unable to process this refund.");
  return publicJson({ data: data?.[0] ?? data ?? null });
}
