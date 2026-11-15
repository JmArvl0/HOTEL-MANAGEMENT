import { publicJson } from "@/lib/server-errors";

import { guardCatalog, adminGuardFailed } from "@/lib/admin-route";
import { getPricingRecommendations } from "@/lib/analytics/pricing-service";

const PRICING_ROLES = new Set(["manager", "owner", "admin"]);

export async function GET() {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  if (!PRICING_ROLES.has(c.role)) return publicJson({ error: "Predictive pricing access required." }, { status: 403 });
  try {
    return publicJson({ data: await getPricingRecommendations(c.client) });
  } catch {
    return publicJson({ error: "Unable to calculate pricing recommendations." }, { status: 500 });
  }
}
