import { NextResponse } from "next/server";
import { guardCatalog, adminGuardFailed } from "@/lib/admin-route";
import { getPricingRecommendations } from "@/lib/analytics/pricing-service";

const PRICING_ROLES = new Set(["manager", "owner", "admin"]);

export async function GET() {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  if (!PRICING_ROLES.has(c.role)) return NextResponse.json({ error: "Predictive pricing access required." }, { status: 403 });
  try {
    return NextResponse.json({ data: await getPricingRecommendations(c.client) });
  } catch {
    return NextResponse.json({ error: "Unable to calculate pricing recommendations." }, { status: 500 });
  }
}
