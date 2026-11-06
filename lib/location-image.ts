import sharp from "sharp";
import { LOCATION_IMAGE_LIMIT } from "@/lib/location-content";

export async function prepareLocationImage(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > LOCATION_IMAGE_LIMIT) throw new Error("Choose a nonempty image, 5 MB or smaller.");
  const buffer = Buffer.from(bytes);
  const format = buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "png"
    : buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff ? "jpeg"
    : buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" ? "webp" : null;
  if (!format || mime !== `image/${format}`) throw new Error("Only genuine JPEG, PNG, or WebP images are supported. The file type must match its contents.");
  try {
    const decoder = sharp(buffer, { limitInputPixels: 24000000, failOn: "warning", animated: true });
    const metadata = await decoder.metadata();
    if (metadata.format !== format || !metadata.width || !metadata.height || metadata.width > 6000 || metadata.height > 6000 || (metadata.pages ?? 1) !== 1) throw new Error("dimensions");
    const { data, info } = await decoder.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    if (!data.length || data.length > LOCATION_IMAGE_LIMIT) throw new Error("size");
    return { data, width: info.width, height: info.height };
  } catch { throw new Error("Use a valid, single-frame image no larger than 6000 × 6000 pixels (24 megapixels)."); }
}

export async function readLocationUpload(request: Request): Promise<FormData> {
  const limit = LOCATION_IMAGE_LIMIT + 64 * 1024;
  if (Number(request.headers.get("content-length") ?? 0) > limit || !request.body) throw new Error("The upload is too large or empty.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) { await reader.cancel(); throw new Error("The upload must be 5 MB or smaller."); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  return new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
}
