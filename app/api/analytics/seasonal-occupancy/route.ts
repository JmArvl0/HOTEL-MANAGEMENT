import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { hotelToday } from "@/lib/booking";
import { publicJson } from "@/lib/server-errors";
import { loadSeasonalOccupancy } from "@/lib/analytics/seasonal-data";
import { seasonalRange } from "@/lib/analytics/seasonal-occupancy";

const roles = new Set(["manager", "owner", "admin"]);
const filters = z.object({ view: z.enum(["month", "date"]), target: z.string(), referenceYear: z.coerce.number().int() });

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.disabled || session.user.otpPending) {
    return publicJson({ error: "Please sign in to continue." }, { status: 401 });
  }
  if (!roles.has(session.user.role)) return publicJson({ error: "Analytics access required." }, { status: 403 });

  const params = new URL(request.url).searchParams;
  const parsed = filters.safeParse(Object.fromEntries(params));
  const today = hotelToday();
  const range = parsed.success ? seasonalRange(parsed.data, today) : null;
  if (!range) return publicJson({ error: "Choose a valid target within the planning window and a reference year before the target year." }, { status: 400 });

  try {
    return publicJson({ data: await loadSeasonalOccupancy(range, today) });
  } catch {
    return publicJson({ error: "The seasonal outlook is temporarily unavailable." }, { status: 500 });
  }
}
