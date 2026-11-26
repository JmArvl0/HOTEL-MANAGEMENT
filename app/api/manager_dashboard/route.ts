import { publicJson } from "@/lib/server-errors";
import { requirePermission } from "@/lib/authorization";
import { databaseMode, getDashboard } from "@/lib/data";
import { canUseStaffWorkspace } from "@/lib/permissions";

export async function GET() {
  const result = await requirePermission(canUseStaffWorkspace, "This dashboard is available to operational staff.");
  if (result.error) return result.error;
  try { return publicJson({ data: await getDashboard(result.session.user.role, result.session.user.id), mode: databaseMode }); }
  catch { return publicJson({ error: "We couldn't load the dashboard. Please try again." }, { status: 500 }); }
}
