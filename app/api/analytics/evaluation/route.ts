import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { hotelToday } from "@/lib/booking";
import { publicJson } from "@/lib/server-errors";
import { evaluationRange, loadForecastEvaluation } from "@/lib/analytics/evaluation-data";
import { validateReportRange } from "@/lib/analytics/analytical-report";

const roles = new Set(["manager", "owner", "admin"]);
const filters = z.object({
  metric: z.enum(["occupancy", "housekeeping", "inventory"]).default("occupancy"),
  days: z.enum(["14", "30", "90"]).default("30")
});

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending) {
    return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  }
  if (!roles.has(session.user.role)) return publicJson({ error: "Analytics access required." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const parsed = filters.safeParse({ metric: params.get("metric") ?? undefined, days: params.get("days") ?? undefined });
  if (!parsed.success) return publicJson({ error: "Choose a supported forecast and date range." }, { status: 400 });
  const { metric, days } = parsed.data;
  const today = hotelToday();
  const from = params.get("from");
  const through = params.get("through");
  const range = from || through ? validateReportRange(from ?? "", through ?? "", today) : evaluationRange(today, Number(days));
  if (!range) return publicJson({ error: "Choose up to 90 completed hotel days." }, { status: 400 });
  try {
    const evidence = await loadForecastEvaluation(metric, range.from, range.through);
    return publicJson({ data: { ...range, ...evidence } });
  } catch {
    return publicJson({ error: "Forecast evaluation is temporarily unavailable." }, { status: 500 });
  }
}
