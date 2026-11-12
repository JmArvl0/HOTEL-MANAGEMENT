import { describe, expect, it } from "vitest";
import { DEFAULT_WEBSITE_CONTENT, websiteContentSchema, websiteText, websitePhotoKeys, websiteContentChanges } from "./website-content";

describe("website content contract", () => {
  it("shows actual before/after values for publication without including stable identifiers", () => {
    const next = structuredClone(DEFAULT_WEBSITE_CONTENT); next.contact.phone = "+63 2 8123 4567";
    expect(websiteContentChanges(DEFAULT_WEBSITE_CONTENT, next)).toEqual([{ field: "contact / phone", before: DEFAULT_WEBSITE_CONTENT.contact.phone, after: "+63 2 8123 4567" }]);
    expect(websiteContentChanges(next, next)).toEqual([]);
  });
  it("keeps the default property explicitly fictional with credited place-photo choices", () => {
    expect(DEFAULT_WEBSITE_CONTENT.isDemo).toBe(true);
    expect(DEFAULT_WEBSITE_CONTENT.clientInformationReviewed).toBe(false);
    expect(websiteText(DEFAULT_WEBSITE_CONTENT.identity.headline, DEFAULT_WEBSITE_CONTENT)).toBe("Your Haven in Manila.");
    expect(websitePhotoKeys(DEFAULT_WEBSITE_CONTENT)).toContain("rizal");
  });
  it("rejects arbitrary image URLs and invalid contact information", () => {
    const copy = structuredClone(DEFAULT_WEBSITE_CONTENT);
    copy.media.heroImageKey = "https://unmanaged.example/image.jpg";
    expect(websiteContentSchema.safeParse(copy).success).toBe(false);
    copy.media.heroImageKey = "room"; copy.contact.email = "not an email";
    expect(websiteContentSchema.safeParse(copy).success).toBe(false);
  });
  it("does not accept duplicated financial rules or operational inventory", () => {
    const parsed = websiteContentSchema.parse({ ...DEFAULT_WEBSITE_CONTENT, policies: { depositPercent: 99 }, rooms: [{ number: "101" }] });
    expect(parsed).not.toHaveProperty("policies"); expect(parsed).not.toHaveProperty("rooms");
  });
  it("supports additions/removals and section visibility while retaining identity validation", () => {
    const content = structuredClone(DEFAULT_WEBSITE_CONTENT);
    content.amenities = []; content.media.gallery = []; content.customFaq = []; content.pageVisibility.gallery = false;
    expect(websiteContentSchema.safeParse(content).success).toBe(true);
    content.identity.shortName = "An impractically long wordmark";
    expect(websiteContentSchema.safeParse(content).success).toBe(false);
  });
});
