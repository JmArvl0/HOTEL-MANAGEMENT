import { userMessage, validationBody } from "@/lib/errors";
import { publicJson } from "@/lib/server-errors";


import { z } from "zod";
import { guardAdmin, adminGuardFailed } from "@/lib/admin-route";
import { prepareLocationImage, readLocationUpload } from "@/lib/location-image";
import { locationFailure } from "@/lib/location-content-route";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const context = await guardAdmin(); if (adminGuardFailed(context)) return context;
  let prepared: Awaited<ReturnType<typeof prepareLocationImage>>;
  try {
    const form = await readLocationUpload(request), file = form.get("file");
    if (!(file instanceof File)) return publicJson({ error: "Choose an image file." }, { status: 400 });
    prepared = await prepareLocationImage(new Uint8Array(await file.arrayBuffer()), file.type);
  } catch (cause) { return publicJson({ error: userMessage(cause, "We couldn't read this photo. Choose a valid JPEG, PNG or WebP image and try again.") }, { status: 400 }); }
  const id = crypto.randomUUID(), key = `${context.actorId}/${id}.webp`;
  const bucket = context.client.storage.from("location-images");
  const uploaded = await bucket.upload(key, prepared.data, { contentType: "image/webp", upsert: false });
  if (uploaded.error) return publicJson({ error: "Image upload failed. Please try again." }, { status: 503 });
  const result = await context.client.rpc("website_image_write", { p_actor: context.actorId, p_action: "register", p_id: id, p_details: { bytes: prepared.data.length, width: prepared.width, height: prepared.height } });
  if (result.error) { await bucket.remove([key]); return locationFailure(result.error); }
  return publicJson({ data: result.data }, { status: 201 });
}
export async function DELETE(request: Request) {
  const context = await guardAdmin(); if (adminGuardFailed(context)) return context;
  const body = await request.json().catch(() => null), parsed = z.object({ id: z.string().uuid() }).strict().safeParse(body);
  if (!parsed.success) return publicJson(validationBody(parsed.error, { error: "Select an uploaded image." }), { status: 400 });
  const { data, error } = await context.client.rpc("website_image_write", { p_actor: context.actorId, p_action: "delete", p_id: parsed.data.id });
  if (error) return locationFailure(error);
  const removed = await context.client.storage.from("location-images").remove([data.storage_key]);
  if (removed.error) return publicJson({ error: "The image still needs to be fully removed. Try deleting it again to finish." }, { status: 503 });
  const finished = await context.client.rpc("website_image_write", { p_actor: context.actorId, p_action: "finish_delete", p_id: parsed.data.id });
  return finished.error ? locationFailure(finished.error) : publicJson({ ok: true });
}
