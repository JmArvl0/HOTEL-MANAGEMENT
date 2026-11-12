import { testHotel, testPlace, testRoute } from "@/tests/fixtures/location-content";
import { describe, expect, it } from "vitest";
import { hotelDirections, routeDirections, placeNavigation, nearbyPlaceMap, safeGoogleEmbedUrl, locationSaveSchema, locationDistance, locationImageUrl } from "./location-content";

describe("hotel website Maps navigation", () => {
  it("gives each route its own origin and the same current destination", () => {
    const airport = new URL(routeDirections(testRoute, testHotel)!); const city = new URL(routeDirections({ ...testRoute, maps_label: "Manila City Hall, Manila, Philippines" }, testHotel)!);
    expect(airport.searchParams.get("origin")).not.toBe(city.searchParams.get("origin"));
    expect(airport.searchParams.get("destination")).toBe(city.searchParams.get("destination"));
    expect(airport.searchParams.get("api")).toBe("1");
    expect(new URL(routeDirections(testRoute, { ...testHotel, maps_label: "New & changed hotel" })!).searchParams.get("destination")).toBe("New & changed hotel");
  });
  it("preserves zero coordinates, rejects absent/invalid coordinates and does not invent a location", () => {
    expect(new URL(hotelDirections({ ...testHotel, latitude: 0, longitude: 0, maps_label: "" })!).searchParams.get("destination")).toBe("0,0");
    for (const latitude of [null, NaN, Infinity, 91]) expect(hotelDirections({ ...testHotel, latitude })).toBeNull();
    expect(hotelDirections(null)).toBeNull();
  });
  it("uses category search only for explicitly labeled demo places; real places use directions", () => {
    expect(new URL(placeNavigation(testPlace, testHotel)!).pathname).toBe("/maps/search/");
    const url = new URL(placeNavigation(testPlace, { ...testHotel, is_demo: false })!);
    expect(url.pathname).toBe("/maps/dir/"); expect(url.searchParams.get("destination")).toBe("0,0");
    expect(url.searchParams.get("origin")).toBe("Rizal Park, Manila");
  });
  it("focuses on reviewed coordinates and limits search-based map previews to the demo", () => {
    const verified = { ...testPlace, verified_at: "2026-11-06", latitude: 14.5870316, longitude: 120.9810252 };
    const exact = new URL(nearbyPlaceMap(verified, { ...testHotel, is_demo: false })!);
    expect(exact.origin).toBe("https://www.google.com");
    expect(exact.searchParams.get("q")).toBe("14.5870316,120.9810252");
    expect(exact.searchParams.get("output")).toBe("embed");
    expect(nearbyPlaceMap({ ...verified, verified_at: null }, { ...testHotel, is_demo: false })).toBeNull();

    const query = "cafés near Rizal Park & output=other";
    const demo = new URL(nearbyPlaceMap({ ...testPlace, latitude: null, longitude: null, maps_search: query }, testHotel)!);
    expect(demo.searchParams.get("q")).toBe(query);
    expect(demo.searchParams.getAll("output")).toEqual(["embed"]);
  });
  it.each(["javascript:alert(1)", "data:text/html,x", "http://www.google.com/maps/embed?pb=x", "https://google.com.evil.test/maps/embed?pb=x", "https://user@www.google.com/maps/embed?pb=x", "https://www.google.com:443/maps/embed?pb=x#fragment", "https://www.google.com/maps/embed/v1/place?key=x", "https://www.google.com/maps/embed?pb=x&key=paid", "https://www.google.com/maps/embed?pb=", "<iframe src='https://www.google.com/maps/embed?pb=x'></iframe>"])("rejects unsafe/unsupported embed %s", value => expect(safeGoogleEmbedUrl(value)).toBeNull());
  it("accepts only the supported official Share/Embed URL", () => expect(safeGoogleEmbedUrl(testHotel.embed_url)).toBe(testHotel.embed_url));
});
describe("content validation and distance labels", () => {
  it("rejects a missing coordinate pair and invalid publication", () => { const { id, version } = testHotel; const body = Object.fromEntries(Object.entries(testHotel).filter(([key]) => !["id", "version", "updated_at", "location_revision"].includes(key))); expect(locationSaveSchema.safeParse({ kind: "hotel", id, version, body: { ...body, longitude: null } }).success).toBe(false); expect(locationSaveSchema.safeParse({ kind: "hotel", id, version, body: { ...body, address: "" } }).success).toBe(false); });
  it("never labels a sample distance or straight-line distance as a verified driving estimate", () => { expect(locationDistance(testPlace, true)).toBeNull(); expect(locationDistance({ ...testPlace, distance_m: 1200, distance_basis: "straight_line" }, false)).toBe("1.2 km · straight-line distance · manually maintained · reviewed 2026-11-06"); expect(locationDistance({ ...testPlace, distance_m: null }, false)).toBeNull(); });
  it("exposes only owned media IDs or curated local sample images", () => { expect(locationImageUrl({ ...testPlace, image_id: "../../private" })).toBe("/location-samples/cafe.webp"); expect(locationImageUrl({ ...testPlace, sample_image: null })).toBeNull(); expect(locationImageUrl({ ...testPlace, image_id: testPlace.id }, true)).toBe(`/api/location/images/${testPlace.id}?preview=1`); });
});
