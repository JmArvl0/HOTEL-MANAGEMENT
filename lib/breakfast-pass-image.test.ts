import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import sharp from "sharp";
import { breakfastPassPng } from "./breakfast-pass-image";

describe("breakfast pass image", () => {
  it("keeps the date's opaque QR readable at full and phone widths", async () => {
    const code = `HBF1.${"0123456789abcdef".repeat(4)}`;
    const png = await breakfastPassPng({ code, date: "21 November 2026", hours: "6:30 AM – 10:00 AM", venue: "The Haven Table & Café", room: "Room 301", reference: "HVN-TEST", allowance: 2 });
    for (const width of [900, 390]) {
      const { data, info } = await sharp(png).resize({ width }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data).toBe(code);
    }
  }, 20_000);
});
