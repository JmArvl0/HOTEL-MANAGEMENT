import { publicJson } from "@/lib/server-errors";

import { getPublishedLocation } from "@/lib/location-content-server";
export const dynamic = "force-dynamic";
export async function GET() { const result = await getPublishedLocation(); return result.unavailable ? publicJson({ error: "The local guide is unavailable." }, { status: 503 }) : publicJson({ data: result.content }, { headers: { "Cache-Control": "no-store" } }); }
