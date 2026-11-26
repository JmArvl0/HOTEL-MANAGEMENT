import { publicJson } from "@/lib/server-errors";
import { z } from "zod";
import { getAccountingLedger } from "@/lib/accounting";
import { canViewAccountingLedger } from "@/lib/permissions";
import { guardFailed, guardFinancial, invalid } from "@/lib/financial-route";

const sectionSchema = z.enum(["transactions", "folios", "cash_shifts", "reconciliation", "documents", "active_drawer"]).optional();

export async function GET(request: Request) {
  const context = await guardFinancial(canViewAccountingLedger, "Financial ledger access required.");
  if (guardFailed(context)) return context;
  const section = sectionSchema.safeParse(new URL(request.url).searchParams.get("section") ?? undefined);
  if (!section.success) return invalid("Choose a valid ledger section.");
  try {
    const ledger = await getAccountingLedger(context.role, section.data);
    if (ledger) return publicJson({ data: ledger, role: context.role });
  } catch {
    // The caller receives a retryable availability error instead of a partial ledger.
  }
  return publicJson({ error: "This service is temporarily unavailable. Please try again shortly." }, { status: 503 });
}
