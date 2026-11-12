import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAdmin, adminGuardFailed } from "@/lib/admin-route";
import { prepareLocationImage, readLocationUpload } from "@/lib/location-image";
import { websiteContentFailure } from "@/lib/website-content-route";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const context = await guardAdmin(); if (adminGuardFailed(context)) return context;
  let image: Awaited<ReturnType<typeof prepareLocationImage>>; let alt: string; let imageKind: "property" | "area";
  try {
    const form = await readLocationUpload(request), file = form.get("file");
    const metadata = z.object({ alt: z.string().trim().min(3).max(150), imageKind: z.enum(["property", "area"]) }).parse({ alt: form.get("alt"), imageKind: form.get("imageKind") });
    if (!(file instanceof File)) throw new Error("Choose an image file.");
    image = await prepareLocationImage(new Uint8Array(await file.arrayBuffer()), file.type);
    alt = metadata.alt; imageKind = metadata.imageKind;
  } catch (cause) { return NextResponse.json({ error: cause instanceof Error && !(cause instanceof z.ZodError) ? cause.message : "Describe the photo and choose its property/area category." }, { status: 400 }); }
  const id = crypto.randomUUID(), key = `${context.actorId}/${id}.webp`, bucket = context.client.storage.from("website-images");
  const uploaded = await bucket.upload(key, image.data, { contentType: "image/webp", upsert: false });
  if (uploaded.error) return NextResponse.json({ error: "Photo upload failed. Try again." }, { status: 503 });
  const { data, error } = await context.client.rpc("website_landing_image_write", { p_actor: context.actorId, p_action: "register", p_id: id, p_details: { alt, imageKind, width: image.width, height: image.height, bytes: image.data.length } });
  if (error) { await bucket.remove([key]); return websiteContentFailure(error); }
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(request: Request) {
  const context = await guardAdmin(); if (adminGuardFailed(context)) return context;
  const parsed = z.object({ id: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose an uploaded photo." }, { status: 400 });
  const args = { p_actor: context.actorId, p_id: parsed.data.id };
  const result = await context.client.rpc("website_landing_image_write", { ...args, p_action: "delete" });
  if (result.error) return websiteContentFailure(result.error);
  const removed = await context.client.storage.from("website-images").remove([result.data.storage_key]);
  if (removed.error) return NextResponse.json({ error: "Private-file cleanup is pending. Retry deleting this photo." }, { status: 503 });
  const finished = await context.client.rpc("website_landing_image_write", { ...args, p_action: "finish_delete" });
  return finished.error ? websiteContentFailure(finished.error) : NextResponse.json({ ok: true });
}
