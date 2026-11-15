import { breakfastService, restaurantBreakfastOutlet } from "@/lib/breakfast-service";

export async function POST(request: Request) {
  if (process.env.HAVEN_RESTAURANT_BREAKFAST_ENABLED !== "true") return Response.json({ status: "unavailable" }, { status: 503 });
  const outlet = restaurantBreakfastOutlet(request);
  if (!outlet) return Response.json({ status: "unauthorized" }, { status: 401 });
  return breakfastService(request, { outlet });
}
