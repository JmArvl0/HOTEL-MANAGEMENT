import { NextRequest, NextResponse } from "next/server";
import { guardCatalog, adminGuardFailed } from "@/lib/admin-route";

const ACCEPTED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const MAX_BYTES = 5 * 1024 * 1024;

/** Upload one room photo into the public `room-photos` bucket; returns its public URL. */
export async function POST(request: NextRequest) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image file to upload." }, { status: 400 });
    const ext = ACCEPTED[file.type];
    if (!ext) return NextResponse.json({ error: "Only JPEG, PNG, or WebP images are supported." }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image must be 5 MB or smaller." }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await c.client.storage.from("room-photos").upload(path, bytes, { contentType: file.type, upsert: false });
    if (error) return NextResponse.json({ error: "Upload failed. Try again or paste an image URL instead." }, { status: 500 });
    const { data: pub } = c.client.storage.from("room-photos").getPublicUrl(path);
    return NextResponse.json({ url: pub.publicUrl }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Upload failed. Try again or paste an image URL instead." }, { status: 500 });
  }
}

// Cleanup of create-modal photos abandoned before the room type existed. Only
// bare <uuid>.<ext> objects this upload flow creates are deletable — never an
// arbitrary path. Best-effort: a storage miss is still a success.
const OBJECT_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/;
export async function DELETE(request: NextRequest) {
  const c = await guardCatalog();
  if (adminGuardFailed(c)) return c;
  try {
    const { url } = await request.json();
    const path = typeof url === "string" ? url.split("/").pop() ?? "" : "";
    if (!OBJECT_PATH.test(path)) return NextResponse.json({ error: "Not a room photo managed by this catalog." }, { status: 400 });
    await c.client.storage.from("room-photos").remove([path]);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unable to remove the photo." }, { status: 500 });
  }
}
