import { describe, expect, it } from "vitest";
import { DEFAULT_WEBSITE_CONTENT, websiteContentSchema, type WebsiteImage } from "./website-content";
import { galleryCategory, hotelGalleryPhotos } from "./website-gallery";

describe("published website gallery", () => {
  it("starts the untouched fictional gallery at the facade with five exterior views", () => {
    const photos = hotelGalleryPhotos(DEFAULT_WEBSITE_CONTENT, []);
    expect(photos[0].label).toBe("Haven Hotel Exterior");
    expect(photos[0].categories).toEqual(["Exterior"]);
    expect(photos[0].photo.src).toBe("/website-samples/gallery/exterior.webp");
    expect(photos.filter(item => item.categories.includes("Exterior"))).toHaveLength(5);
    expect(photos).toHaveLength(9);
    expect(photos.every(item => item.photo.isIllustrative)).toBe(true);
  });
  it("honors uploaded client photos, captions and order without injecting samples", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const content = structuredClone(DEFAULT_WEBSITE_CONTENT);
    content.isDemo = false;
    content.media.gallery = [{ key: id, label: "Main facade", alt: "The entrance at street level", category: "Exterior", caption: "Arrive through the main doorway." }];
    const image: WebsiteImage = { id, alt: "Hotel front", image_kind: "property", width: 1600, height: 900, bytes: 10000 };
    const photos = hotelGalleryPhotos(websiteContentSchema.parse(content), [image]);
    expect(photos).toHaveLength(1);
    expect(photos[0]).toMatchObject({ label: "Main facade", alt: "The entrance at street level", caption: "Arrive through the main doorway.", categories: ["Exterior"], photo: { src: `/api/website/images/${id}`, isIllustrative: false } });
    expect(hotelGalleryPhotos(content, [{ ...image, deleting: true }])).toEqual([]);
    expect(hotelGalleryPhotos(content, [image], true)[0].photo.src).toBe(`/api/website/images/${id}?preview=1`);
  });
  it("preserves deliberate demo edits, removals and an empty gallery", () => {
    const content = structuredClone(DEFAULT_WEBSITE_CONTENT);
    content.media.gallery = [content.media.gallery[0]];
    expect(hotelGalleryPhotos(content, [])).toHaveLength(1);
    content.media.gallery = [];
    expect(hotelGalleryPhotos(content, [])).toEqual([]);
  });
  it("reads legacy categories and round-trips editable category and caption fields", () => {
    expect(galleryCategory({ key: "room", label: "Lobby", alt: "Reception" })).toBe("Shared Spaces");
    const content = structuredClone(DEFAULT_WEBSITE_CONTENT);
    content.media.gallery[0].category = "Dining";
    content.media.gallery[0].caption = "An evening at the table.";
    expect(websiteContentSchema.parse(content).media.gallery[0]).toMatchObject({ category: "Dining", caption: "An evening at the table." });
    expect(galleryCategory(content.media.gallery[0])).toBe("Dining");
  });
});
