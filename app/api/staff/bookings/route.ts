import { NextResponse } from "next/server";
import { z } from "zod";
import { hotelGuard, hotelRpc } from "@/lib/hotel-operations-route";
import { publicJson } from "@/lib/server-errors";

const query = z.object({
  scope: z.enum(["window", "history", "board"]),
  from: z.iso.date().optional(),
  through: z.iso.date().optional(),
  queue: z.enum(["all", "arrivals", "upcoming", "in_house", "departures", "closed"]).default("all"),
  closed: z.enum(["all", "checked_out", "cancelled", "no_show"]).default("all"),
  search: z.string().trim().max(120).default(""),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
}).refine(({ scope, from, through }) => scope !== "window" || Boolean(from && through &&
  Date.parse(through) >= Date.parse(from) && Date.parse(through) - Date.parse(from) <= 13 * 86400000));

export async function GET(request: Request) {
  const ctx = await hotelGuard(["front_desk", "manager", "owner"]);
  if (ctx instanceof NextResponse) return ctx;
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return publicJson({ error: "Choose a valid booking queue and date range." }, { status: 400 });
  const { scope, from, through, queue, closed, search, page } = parsed.data;
  return hotelRpc(ctx, "hotel_front_office_booking_page", {
    p_scope: scope, p_from: from ?? null, p_through: through ?? null,
    p_queue: queue, p_closed: closed, p_search: search, p_page: page,
  });
}
