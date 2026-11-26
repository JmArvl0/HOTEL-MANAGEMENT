import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { validationBody } from "@/lib/errors";
import { pesoAmount } from "@/lib/input-validation";
import { canAcceptOverpayment } from "@/lib/permissions";
import { publicJson } from "@/lib/server-errors";
import { supabase } from "@/lib/supabase";
import type { Role } from "@/lib/types";

const allowed = new Set(["front_desk", "accounting"]);
const schema = z.object({
  amount: pesoAmount(0.01, 10000000),
  method: z.enum(["cash", "card", "bank_transfer", "gcash"]),
  reference: z.string().trim().max(120).optional().nullable(),
  idempotencyKey: z.string().uuid(),
  allowOverpayment: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.method !== "cash" && (!value.reference || value.reference.length < 2)) {
    ctx.addIssue({ code: "custom", message: "A transaction reference is required for electronic payment methods." });
  }
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending) return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  if (!allowed.has(session.user.role)) return publicJson({ error: "Payment access required." }, { status: 403 });
  if (!supabase) return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: parsed.error.issues[0]?.message ?? "Please check the payment amount, method and reference." }), { status: 400 });

  const { amount, method, reference, idempotencyKey, allowOverpayment } = parsed.data;
  const overpay = allowOverpayment === true;
  if (overpay && !canAcceptOverpayment(session.user.role as Role)) return publicJson({ error: "Accounting authorization is required to accept an overpayment." }, { status: 403 });
  const isCash = method === "cash";
  const { data, error } = await supabase.rpc("hms_collect_payment", {
    p_reservation_id: (await params).id,
    p_amount: amount,
    p_method: method,
    p_reference: isCash ? null : (reference ?? ""),
    p_idempotency_key: idempotencyKey,
    p_staff_user_id: session.user.id,
    p_allow_overpayment: overpay,
  });
  if (error) {
    if (!isCash && error.code === "23505" && error.message.includes('"payments_manual_reference_unique"')) {
      return publicJson({
        code: "DUPLICATE_PAYMENT_REFERENCE",
        error: "This transaction reference is already recorded for this payment method. Check this folio's payment history. If you can't find it, ask Accounting to verify the reference before collecting again.",
      }, { status: 409 });
    }
    const message = error.message.includes("PAYMENT_EXCEEDS_BALANCE")
      ? "Payment exceeds the outstanding folio balance. Accounting can accept it as a folio credit."
      : error.message.includes("OVERPAYMENT_FORBIDDEN")
        ? "Accounting authorization is required to accept an overpayment."
        : error.message.includes("CASH_SHIFT_REQUIRED")
          ? "Open a cash shift in Cash & Shifts before collecting a cash payment."
          : error.message.includes("RESERVATION_NOT_PAYMENT_READY")
            ? "Payments require an active reservation or a cancelled/no-show folio with a posted settlement."
            : "Unable to record payment.";
    return publicJson({ error: message }, { status: error.message.includes("FORBIDDEN") ? 403 : 409 });
  }
  return publicJson({ data: { ...(data ?? {}), unattributedCash: false } });
}
