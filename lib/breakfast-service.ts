import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { breakfastPassCode } from "@/lib/breakfast";
import { supabase } from "@/lib/supabase";

const command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify"), passCode: breakfastPassCode }).strict(),
  z.object({ action: z.literal("redeem"), passCode: breakfastPassCode, quantity: z.number().int().min(1).max(8), requestId: z.string().uuid() }).strict(),
]);

export function restaurantBreakfastOutlet(request: Request): string | null {
  const token = process.env.HAVEN_RESTAURANT_BREAKFAST_TOKEN;
  const outlet = process.env.HAVEN_RESTAURANT_BREAKFAST_OUTLET;
  const offered = request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
  if (!token || !/^[A-Za-z0-9_-]{32,256}$/.test(token) || !outlet || !/^[a-z0-9-]{1,40}$/.test(outlet) || !offered) return null;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(token), digest(offered)) ? outlet : null;
}

export async function breakfastService(request: Request, principal: { staff: string } | { outlet: string }) {
  const headers = { "Cache-Control": "private, no-store" };
  const reply = (body: object, status: number) => Response.json(body, { status, headers });
  if (!supabase) return reply({ status: "unavailable" }, 503);
  const input = command.safeParse(await request.json().catch(() => null));
  if (!input.success) return reply({ status: "invalid" }, 400);
  const data = input.data;
  const result = await supabase.rpc("hotel_breakfast_service", {
    p_code: data.passCode, p_staff: "staff" in principal ? principal.staff : null, p_outlet: "outlet" in principal ? principal.outlet : null,
    p_quantity: data.action === "redeem" ? data.quantity : null, p_request: data.action === "redeem" ? data.requestId : null,
  });
  if (result.error?.message.includes("BREAKFAST_FORBIDDEN")) return reply({ status: "forbidden" }, 403);
  if (result.error || !result.data) return reply({ status: "unavailable" }, 503);
  const status = result.data.status;
  return reply(result.data, status === "invalid" ? 404 : ["valid", "recorded"].includes(status) ? 200 : 409);
}
