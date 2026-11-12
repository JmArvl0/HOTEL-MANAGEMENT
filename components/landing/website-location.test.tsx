import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EMPTY_LOCATION, type LocationContent } from "@/lib/location-content";
import { testHotel } from "@/tests/fixtures/location-content";
const state = vi.hoisted(() => ({ content: {} as LocationContent }));
vi.mock("@/lib/location-content-server", () => ({ getPublishedLocation: async () => ({ content: state.content, unavailable: false }) }));
vi.mock("@/lib/website-content-server", async () => {
  const { DEFAULT_WEBSITE_CONTENT } = await import("@/lib/website-content");
  return { getPublishedWebsiteContent: async () => ({ content: DEFAULT_WEBSITE_CONTENT, images: [], unavailable: false }) };
});
import { WebsiteLocation, HotelContactMapLink } from "./website-location";
beforeEach(() => { state.content = { ...EMPTY_LOCATION, hotel: testHotel }; });
describe("published hotel SEO and contact link", () => {
  it("never advertises the fictional demo as a real hotel in structured data", async () => { expect(renderToStaticMarkup(await WebsiteLocation())).not.toContain('application/ld+json'); });
  it("emits verified client coordinates and safely escapes script-like text", async () => {
    state.content.hotel = { ...testHotel, is_demo: false, name: "Hotel </script><script>alert(1)</script>" };
    const html = renderToStaticMarkup(await WebsiteLocation()), json = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    expect(json).toBeTruthy(); expect(json).not.toContain("</script>"); const value = JSON.parse(json!);
    expect(value.name).toBe(state.content.hotel.name); expect(value.geo.latitude).toBe(testHotel.latitude); expect(value["@type"]).toBe("Hotel");
  });
  it("omits hotel structured data for draft or unverified client content", async () => {
    for (const hotel of [{ ...testHotel, is_demo: false, status: "draft" as const }, { ...testHotel, is_demo: false, verified_at: null }]) { state.content.hotel = hotel; expect(renderToStaticMarkup(await WebsiteLocation())).not.toContain('application/ld+json'); }
  });
  it("uses the configured destination for the retained contact link and hides missing pins", async () => {
    const html = renderToStaticMarkup(await HotelContactMapLink()); expect(html).toContain("Rizal+Park%2C+Manila"); state.content.hotel = null; expect(renderToStaticMarkup(await HotelContactMapLink())).toBe("");
  });
});
