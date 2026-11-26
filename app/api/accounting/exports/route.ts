import { publicJson } from "@/lib/server-errors";

import { z } from "zod";
import { guardFailed, guardFinancial, invalid } from "@/lib/financial-route";
import { buildFinanceCloseExport, financeExportContentType, renderFinanceCloseExport } from "@/lib/finance-export";

const query = z.object({ date: z.string().date(), format: z.enum(["csv", "xlsx", "pdf", "json"]) });

export async function GET(request: Request) {
  const context = await guardFinancial(role => role === "accounting", "Accounting export access required.");
  if (guardFailed(context)) return context;
  const params = new URL(request.url).searchParams;
  const parsed = query.safeParse({ date: params.get("date"), format: params.get("format") });
  if (!parsed.success) return invalid("Choose a valid closed date and file format.");
  const { date, format } = parsed.data;
  try {
    const { data, error } = await context.client.from("hotel_night_audits")
      .select("business_date,closed_at,snapshot").eq("business_date", date).maybeSingle();
    if (error) throw error;
    if (!data) return publicJson({ error: "A saved night close is required for that date." }, { status: 404 });
    const batch = buildFinanceCloseExport(data);
    const bytes = renderFinanceCloseExport(batch, format);
    const { error: auditError } = await context.client.from("audit_logs").insert({
      user_id: context.actorId, action: "download_finance_close_export", entity_type: "operating_day", entity_id: date,
      after_data: { batchId: batch.id, format },
    });
    if (auditError) throw auditError;
    return new Response(bytes, {
      headers: {
        "Content-Type": financeExportContentType[format],
        "Content-Disposition": `attachment; filename="${batch.id}.${format}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return publicJson({ error: "Unable to prepare the closed-day export. Please try again." }, { status: 503 });
  }
}
