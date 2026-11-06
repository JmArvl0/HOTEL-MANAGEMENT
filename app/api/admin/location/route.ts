import { NextResponse } from "next/server";
import { locationFailure } from "@/lib/location-content-route";
import { revalidatePath } from "next/cache";
import { guardAdmin, adminGuardFailed } from "@/lib/admin-route";
import { locationDeleteSchema, locationSaveSchema } from "@/lib/location-content";

export async function GET() {
  const context = await guardAdmin(); if (adminGuardFailed(context)) return context;
  const { data, error } = await context.client.rpc("website_location_admin", { p_actor: context.actorId });
  return error ? locationFailure(error) : NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
}
async function mutate(request: Request, deleting: boolean) {
  const context = await guardAdmin(); if (adminGuardFailed(context)) return context;
  let json: unknown; try { const raw = await request.text(); if (raw.length > 24000) return NextResponse.json({ error: "Content is too large." }, { status: 413 }); json = JSON.parse(raw); } catch { return NextResponse.json({ error: "Invalid JSON content." }, { status: 400 }); }
  const parsed = deleting ? locationDeleteSchema.safeParse(json) : locationSaveSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check your content.", fields: parsed.error.flatten() }, { status: 400 });
  const body = parsed.data;
  const { data, error } = await context.client.rpc("website_content_write", { p_actor: context.actorId, p_kind: body.kind, p_action: deleting ? "delete" : "save", p_id: body.id, p_version: body.version, p_body: "body" in body ? body.body : {} });
  if (error) return locationFailure(error);
  // A committed content save must not be reported as failed if cache invalidation
  // is temporarily unavailable. The page also has its existing five-minute TTL.
  try { revalidatePath("/"); } catch { /* The next scheduled regeneration will reread content. */ }
  return NextResponse.json({ data });
}
export const POST = (request: Request) => mutate(request, false);
export const DELETE = (request: Request) => mutate(request, true);
