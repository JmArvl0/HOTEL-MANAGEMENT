import { userMessage } from "@/lib/errors";
import { publicJson } from "@/lib/server-errors";
import { NextRequest } from "next/server";
import { guardCatalog, adminGuardFailed } from "@/lib/admin-route";
import { prepareLocationImage, readLocationUpload } from "@/lib/location-image";

export async function POST(request: NextRequest) {
  const context = await guardCatalog();
  if (adminGuardFailed(context)) return context;
  let prepared: Awaited<ReturnType<typeof prepareLocationImage>>;
  try {
    const file = (await readLocationUpload(request)).get("file");
    if (!(file instanceof File)) return publicJson({ error: "Choose a room photo to upload." }, { status: 400 });
    prepared = await prepareLocationImage(new Uint8Array(await file.arrayBuffer()), file.type);
  } catch (error) {
    return publicJson({ error: userMessage(error, "We couldn't read this photo. Choose a valid JPEG, PNG or WebP image and try again.") }, { status: 400 });
  }
  const bucket = context.client.storage.from("room-photos");
  const path = `${crypto.randomUUID()}.webp`;
  const uploaded = await bucket.upload(path, prepared.data, { contentType: "image/webp", upsert: false });
  if (uploaded.error) return publicJson({ error: "Could not upload the room photo." }, { status: 503 });
  const staged = await context.client.rpc("catalog_stage_room_photo", { p_actor: context.actorId, p_path: path });
  if (staged.error) {
    await bucket.remove([path]);
    return publicJson({ error: "Could not register the photo. Try again." }, { status: 503 });
  }
  return publicJson({ url: bucket.getPublicUrl(path).data.publicUrl }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const context = await guardCatalog();
  if (adminGuardFailed(context)) return context;
  const body = await request.json().catch(() => null);
  const path = typeof body?.url === "string" ? body.url.split("/").pop() ?? "" : "";
  const bucket = context.client.storage.from("room-photos");
  if (!/^[0-9a-f-]{36}\.webp$/.test(path) || bucket.getPublicUrl(path).data.publicUrl !== body?.url) {
    return publicJson({ error: "Choose a photo uploaded through this catalog." }, { status: 400 });
  }
  const staged = await context.client.rpc("catalog_request_room_photo_deletion", { p_actor: context.actorId, p_path: path });
  if (staged.error?.message.includes("ROOM_PHOTO_IN_USE")) return publicJson({ error: "Remove the photo from the room type before deleting it." }, { status: 409 });
  if (staged.error?.message.includes("ROOM_PHOTO_NOT_FOUND")) return publicJson({ error: "This photo is no longer available. Refresh the photo list." }, { status: 404 });
  if (staged.error) return publicJson({ error: "We couldn't check where this photo is used. Please try again before deleting it." }, { status: 503 });
  const removed = await bucket.remove([path]);
  if (removed.error) return publicJson({ error: "We couldn't remove the photo file. Please try deleting it again." }, { status: 503 });
  return publicJson({ ok: true });
}
