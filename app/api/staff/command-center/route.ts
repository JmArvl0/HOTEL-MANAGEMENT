import { publicJson } from "@/lib/server-errors";
import { guardManager, managerGuardFailed } from "@/lib/manager-route";
import { canReadHotelOverview, loadCommandCenter } from "@/lib/command-center";

export async function GET() {
  const context = await guardManager(canReadHotelOverview, "Hotel Command Center access required.");
  if (managerGuardFailed(context)) return context;
  try { return publicJson({ data: await loadCommandCenter(context) }); }
  catch { return publicJson({ error: "The hotel overview is temporarily unavailable." }, { status: 503 }); }
}
