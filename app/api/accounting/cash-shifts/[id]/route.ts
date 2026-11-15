import { z } from "zod";
import { canOperateCashShift, canReconcileFinancials } from "@/lib/permissions";
import { guardFailed, guardFinancial, invalid, rpcFailure } from "@/lib/financial-route";
import { pesoAmount } from "@/lib/input-validation";
import { validationMessage } from "@/lib/errors";
import { logServerError, publicJson } from "@/lib/server-errors";

type Params = { params: Promise<{ id: string }> };
const messages = {
  CASH_SHIFT_NOT_FOUND: "That cash shift no longer exists.",
  CASH_SHIFT_NOT_OPEN: "That drawer is already closed. Refresh to view its recorded count.",
  CASH_SHIFT_FORBIDDEN: "Only the drawer opener or Accounting may count and close this drawer.",
  CASH_ACTIVITY_CHANGED: "Cash activity changed. Take a fresh physical count before saving or closing.",
  DRAFT_VERSION_CONFLICT: "A newer count draft exists. Reload the saved draft before continuing.",
  INVALID_COUNTED_CASH: "Enter a valid independent physical cash count.",
  VARIANCE_EXPLANATION_REQUIRED: "Explain the cash difference before recording this action.",
  IDEMPOTENCY_CONFLICT: "This request was already recorded with different details. Refresh before continuing.",
  RECONCILIATION_FORBIDDEN: "You don't have permission to perform this accounting action. Ask Accounting for help.",
  CASH_SHIFT_NOT_CLOSED: "Close this drawer before Accounting reconciliation.",
  "Could not find the function": "Cash & Shifts is unavailable right now. Contact the system administrator if it continues."
};
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("close"), draftVersion: z.number().int().positive(), idempotencyKey: z.string().uuid() }),
  z.object({ action: z.literal("reconcile"), notes: z.string().trim().max(400).optional() })
]);
const draftSchema = z.object({
  actualCash: pesoAmount(0, 10000000), notes: z.string().trim().max(400).default(""),
  basis: z.string().regex(/^[a-f0-9]{32}$/), version: z.number().int().min(0).max(2147483646)
});

export async function GET(_request: Request, { params }: Params) {
  const context = await guardFinancial(canOperateCashShift, "Cash handling access required.");
  if (guardFailed(context)) return context;
  const { data, error } = await context.client.rpc("cash_count_context", { p_shift_id: (await params).id, p_staff_user_id: context.actorId });
  if (error) return rpcFailure(error, messages, "Unable to load the saved count. Retry before closing.");
  return publicJson({ data });
}

export async function PUT(request: Request, { params }: Params) {
  const context = await guardFinancial(canOperateCashShift, "Cash handling access required.");
  if (guardFailed(context)) return context;
  const parsed = draftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid(validationMessage(parsed.error));
  const value = parsed.data;
  const { data, error } = await context.client.rpc("save_cash_count_draft", {
    p_shift_id: (await params).id, p_staff_user_id: context.actorId, p_actual_cash: value.actualCash,
    p_notes: value.notes, p_basis: value.basis, p_version: value.version
  });
  if (error) return rpcFailure(error, messages, "Unable to save the count draft. Your entries are preserved.");
  return publicJson({ data });
}

// Close consumes a persisted physical count/version. Financial totals always
// come from the database transaction, never from the browser's financial values.
export async function PATCH(request: Request, { params }: Params) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalid(validationMessage(parsed.error));
  const action = parsed.data;
  const context = await guardFinancial(action.action === "close" ? canOperateCashShift : canReconcileFinancials, "Cash handling authorization required.");
  if (guardFailed(context)) return context;
  const id = (await params).id;
  const { data, error } = action.action === "close"
    ? await context.client.rpc("close_cash_count_draft", { p_shift_id: id, p_staff_user_id: context.actorId, p_version: action.draftVersion, p_idempotency_key: action.idempotencyKey })
    : await context.client.rpc("accounting_reconcile_cash_shift", { p_shift_id: id, p_staff_user_id: context.actorId, p_notes: action.notes ?? null });
  if (error) {
    logServerError("update cash shift failed", error);
    return rpcFailure(error, messages, "Unable to update this cash shift. Your entries are preserved.");
  }
  return publicJson({ data });
}
