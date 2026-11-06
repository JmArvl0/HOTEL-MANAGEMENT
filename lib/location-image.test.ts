import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareLocationImage, readLocationUpload } from "./location-image";
describe("safe location image uploads", () => {
  it.each(["png", "jpeg", "webp"] as const)("decodes actual %s bytes and re-encodes metadata-free WebP", async format => {
    const input = await sharp({ create: { width: 24, height: 16, channels: 3, background: "#54745f" } }).toFormat(format).toBuffer();
    const result = await prepareLocationImage(input, `image/${format}`), metadata = await sharp(result.data).metadata();
    expect(metadata.format).toBe("webp"); expect(result.width).toBe(24); expect(result.height).toBe(16); expect(metadata.exif).toBeUndefined();
  });
  it("rejects empty/oversize bytes, HTML/SVG, corrupt data and spoofed MIME", async () => {
    for (const [input, type] of [[Buffer.alloc(0), "image/png"], [Buffer.alloc(5 * 1024 * 1024 + 1), "image/png"], [Buffer.from("<svg onload='alert(1)'/>"), "image/png"], [Buffer.from([255,216,255,0]), "image/jpeg"]] as const) await expect(prepareLocationImage(input, type)).rejects.toThrow();
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } }).png().toBuffer(); await expect(prepareLocationImage(png, "image/jpeg")).rejects.toThrow("match");
  });
  it("bounds decoded dimensions before resizing", async () => { const png = await sharp({ create: { width: 6001, height: 1, channels: 3, background: "white" } }).png().toBuffer(); await expect(prepareLocationImage(png, "image/png")).rejects.toThrow("6000"); });
  it("bounds the entire multipart request before parsing it", async () => { const request = new Request("https://example.invalid/upload", { method: "POST", headers: { "content-length": "9000000" }, body: "x" }); await expect(readLocationUpload(request)).rejects.toThrow("large"); });
});
