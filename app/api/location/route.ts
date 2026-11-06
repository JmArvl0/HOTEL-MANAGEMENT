import { NextResponse } from "next/server";
import { getPublishedLocation } from "@/lib/location-content-server";
export const dynamic = "force-dynamic";
export async function GET() { const result = await getPublishedLocation(); return result.unavailable ? NextResponse.json({ error: "The local guide is unavailable." }, { status: 503 }) : NextResponse.json({ data: result.content }, { headers: { "Cache-Control": "no-store" } }); }
