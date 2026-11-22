import { hotelToday } from "@/lib/booking";
import { publicJson } from "@/lib/server-errors";
import { guardManager, managerGuardFailed } from "@/lib/manager-route";
import { loadAnalyticalReport, validateReportRange } from "@/lib/analytics/analytical-report";
import { shiftDate } from "@/lib/analytics/types";
import { canReadHotelOverview } from "@/lib/command-center";

export async function GET(request: Request) {
  const context = await guardManager(canReadHotelOverview, "Analytical Report access required.");
  if (managerGuardFailed(context)) return context;
  const filters = new URL(request.url).searchParams;
  const roomType = filters.get("roomType") || undefined;
  const source = filters.get("source") || undefined;
  try {
    const policy = await context.client.from("hotel_operational_policies").select("hotel_timezone").eq("key", "default").single();
    if (policy.error) throw policy.error;
    const zone = String(policy.data.hotel_timezone);
    const today = hotelToday(zone);
    const range = validateReportRange(filters.get("from") ?? shiftDate(today, -30), filters.get("through") ?? shiftDate(today, -1), today);
    if (!range || (roomType?.length ?? 0) > 120 || (source?.length ?? 0) > 120) return publicJson({ error: "Choose up to 90 completed hotel days and valid filters." }, { status: 400 });
    return publicJson({ data: { ...await loadAnalyticalReport(context.client, range, zone, roomType, source), calendarToday: today } });
  } catch { return publicJson({ error: "The analytical report could not be loaded. Try again." }, { status: 503 }); }
}
