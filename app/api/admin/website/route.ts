import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { guardAdmin, adminGuardFailed } from "@/lib/admin-route";
import { DEFAULT_WEBSITE_CONTENT, websiteContentSchema, websiteDocumentLimit } from "@/lib/website-content";
import { websiteContentFailure } from "@/lib/website-content-route";
import { getPublishedLocation } from "@/lib/location-content-server";
import { getPublicBookingInformation } from "@/lib/public-booking-information-server";

export async function GET() {
  const context = await guardAdmin(); if (adminGuardFailed(context)) return context;
  const [{ data, error }, location] = await Promise.all([context.client.rpc("website_landing_admin", { p_actor: context.actorId }), getPublishedLocation()]);
  if (error || !data) return websiteContentFailure(error ?? { message: "Unavailable" });
  const draft = websiteContentSchema.safeParse(data.draft), published = websiteContentSchema.safeParse(data.published);
  return NextResponse.json({ data: { ...data, draft: draft.success ? draft.data : DEFAULT_WEBSITE_CONTENT, published: published.success ? published.data : DEFAULT_WEBSITE_CONTENT }, location: location.content.hotel, information: await getPublicBookingInformation() }, { headers: { "Cache-Control": "no-store" } });
}

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), version: z.number().int().positive(), content: websiteContentSchema }),
  z.object({ action: z.literal("publish"), version: z.number().int().positive(), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("discard"), version: z.number().int().positive() }),
]);
export async function POST(request: Request) {
  const context = await guardAdmin(); if (adminGuardFailed(context)) return context;
  const text = await request.text();
  if (Buffer.byteLength(text) > websiteDocumentLimit + 2048) return NextResponse.json({ error: "Shorten the website copy before saving." }, { status: 413 });
  let json: unknown; try { json = JSON.parse(text); } catch { return NextResponse.json({ error: "Invalid website content." }, { status: 400 }); }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the website content." }, { status: 400 });
  const body = parsed.data;
  const { data, error } = await context.client.rpc("website_landing_write", { p_actor: context.actorId, p_action: body.action, p_version: body.version, p_document: body.action === "save" ? body.content : null, p_reason: body.action === "publish" ? body.reason : null });
  if (error) return websiteContentFailure(error);
  if (body.action === "publish") {
    for (const path of ["/", "/privacy", "/terms", "/booking-policy", "/gallery"]) revalidatePath(path);
  }
  return NextResponse.json({ data });
}
