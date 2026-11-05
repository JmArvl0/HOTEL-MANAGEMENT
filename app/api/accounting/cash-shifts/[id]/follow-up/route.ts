import { NextResponse } from "next/server";
import { guardFailed, guardFinancial } from "@/lib/financial-route";
import { canOperateCashShift } from "@/lib/permissions";
import { readAllRows } from "@/lib/read-all-rows";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await guardFinancial(canOperateCashShift, "Cash handling access required.");
  if (guardFailed(context)) return context;
  const id = (await params).id;
  try {
    const { data: shift, error } = await context.client.from("cash_shifts").select("id,status,closed_at").eq("id", id).maybeSingle();
    if (error) throw error;
    if (!shift) return NextResponse.json({ error: "Cash shift not found." }, { status: 404 });
    if (!shift.closed_at || shift.status === "open") return NextResponse.json({ error: "Close this drawer before checking its next steps." }, { status: 409 });
    const reportDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date(shift.closed_at));
    const handovers = await readAllRows(() => context.client.from("shift_handovers")
      .select("id,summary,follow_up_user_id,acknowledged_at,resolved_at,submitted_at")
      .eq("source_type", "cash_shift").eq("source_id", id).eq("department", context.role)
      .is("resolved_at", null).order("submitted_at", { ascending: false }));
    let report = null;
    let includesClose: boolean | null = null;
    if (context.role === "front_desk") {
      const result = await context.client.from("front_desk_reports").select("id,status,submitted_at,snapshot")
        .eq("report_date", reportDate).order("submitted_at", { ascending: false }).order("id").limit(1).maybeSingle();
      if (result.error) throw result.error;
      if (result.data) {
        report = { id: result.data.id, status: result.data.status, submittedAt: result.data.submitted_at };
        const generated = Date.parse(String(result.data.snapshot?.generatedAt ?? ""));
        if (Number.isFinite(generated)) includesClose = generated >= Date.parse(shift.closed_at);
      }
    }
    return NextResponse.json({ data: { handovers, reportDate, report, includesClose } });
  } catch {
    return NextResponse.json({ error: "Unable to confirm handover and report status. Retry." }, { status: 503 });
  }
}
