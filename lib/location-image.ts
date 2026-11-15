import sharp from "sharp";
import { LOCATION_IMAGE_LIMIT } from "@/lib/location-content";

export async function prepareLocationImage(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > LOCATION_IMAGE_LIMIT) throw new Error("Choose an image file no larger than 5 MB.");
  const buffer = Buffer.from(bytes);
  const format = buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ? "png"
    : buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff ? "jpeg"
    : buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" ? "webp" : null;
  if (!format || mime !== `image/${format}`) throw new Error("This file could not be read as a JPEG, PNG or WebP image. Choose another photo or export it in one of these formats.");
  try {
    const decoder = sharp(buffer, { limitInputPixels: 24000000, failOn: "warning", animated: true });
    const metadata = await decoder.metadata();
    if (metadata.format !== format || !metadata.width || !metadata.height || metadata.width > 6000 || metadata.height > 6000 || (metadata.pages ?? 1) !== 1) throw new Error("dimensions");
    const { data, info } = await decoder.rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
    if (!data.length || data.length > LOCATION_IMAGE_LIMIT) throw new Error("size");
    return { data, width: info.width, height: info.height };
  } catch { throw new Error("Choose a still image up to 6000 pixels wide and high, with no more than 24 million pixels in total."); }
}

export async function readLocationUpload(request: Request): Promise<FormData> {
  const limit = LOCATION_IMAGE_LIMIT + 64 * 1024;
  if (Number(request.headers.get("content-length") ?? 0) > limit || !request.body) throw new Error("Choose an image file no larger than 5 MB.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > limit) { await reader.cancel(); throw new Error("The upload must be 5 MB or smaller."); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  return new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData();
}

export async function isDecodableEvidenceImage(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > LOCATION_IMAGE_LIMIT) return false;
  try {
    const decoder = sharp(Buffer.from(bytes), { limitInputPixels: 24000000, failOn: "warning", animated: true });
    const metadata = await decoder.metadata();
    if (!metadata.width || !metadata.height || metadata.width > 6000 || metadata.height > 6000 || (metadata.pages ?? 1) !== 1) return false;
    await decoder.stats();
    return true;
  } catch { return false; }
}
