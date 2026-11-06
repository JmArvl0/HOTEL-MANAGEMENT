import { z } from "zod";

export const LOCATION_IMAGE_LIMIT = 5 * 1024 * 1024;
export const SAMPLE_IMAGES = ["cafe", "shopping", "garden", "transport", "airport", "city"] as const;
export const LOCATION_HOTEL_ID = "00000000-0000-4000-8000-000000000001";
const text = (max: number) => z.string().trim().max(max);
const date = z.string().date().nullable();
const source = text(1000).refine(value => !value || safeHttpsUrl(value), "Use a complete HTTPS verification link.");
const status = z.enum(["draft", "published"]);
const geo = { latitude: z.number().finite().min(-90).max(90).nullable(), longitude: z.number().finite().min(-180).max(180).nullable(), maps_label: text(200), google_place_id: text(200).regex(/^[A-Za-z0-9_-]*$/, "Invalid Google place ID."), verification_source: source, verified_at: date };
const distance = { distance_m: z.number().finite().min(0).max(2000000).nullable(), distance_basis: z.enum(["walking", "driving", "straight_line"]), distance_reviewed_at: date };
const image = { image_id: z.string().uuid().nullable(), sample_image: z.enum(SAMPLE_IMAGES).nullable(), image_alt: text(180) };
const ordered = { status, sort_order: z.number().int().min(0).max(10000) };

export function safeHttpsUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.port && !/[\s<>"\\]/.test(value); } catch { return false; }
}
export function safeGoogleEmbedUrl(value: string): string | null {
  if (!safeHttpsUrl(value)) return null;
  const url = new URL(value);
  if (url.hostname !== "www.google.com" || url.pathname !== "/maps/embed" || url.hash || !url.searchParams.get("pb") || [...url.searchParams.keys()].some(key => key !== "pb")) return null;
  return url.href;
}
const hotelBody = z.object({ ...geo, status, is_demo: z.boolean(), name: text(120).min(1), address: text(500), entrance_notes: text(1000), embed_url: text(8192).refine(value => !value || safeGoogleEmbedUrl(value), "Paste a Google Maps Share / Embed URL, beginning https://www.google.com/maps/embed?pb=…"), directions_title: text(100).min(1), directions_description: text(400), nearby_title: text(100).min(1), nearby_description: text(400) }).strict();
const categoryBody = z.object({ ...ordered, name: text(60).min(1), slug: text(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase words separated by hyphens.") }).strict();
const placeBody = z.object({ ...geo, ...ordered, ...distance, ...image, name: text(120).min(1), description: text(1500), category_id: z.string().uuid().nullable(), featured: z.boolean(), maps_search: text(200), location_revision: z.number().int().nonnegative() }).strict();
const routeBody = z.object({ ...geo, ...ordered, ...distance, ...image, origin_name: text(120).min(1), description: text(1500), travel_mode: z.enum(["driving", "walking", "transit", "bicycling"]), location_revision: z.number().int().nonnegative() }).strict();
const envelope = { id: z.string().uuid().nullable(), version: z.number().int().nonnegative() };
export const locationSaveSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hotel"), ...envelope, body: hotelBody }),
  z.object({ kind: z.literal("category"), ...envelope, body: categoryBody }),
  z.object({ kind: z.literal("place"), ...envelope, body: placeBody }),
  z.object({ kind: z.literal("route"), ...envelope, body: routeBody }),
]).superRefine((input, context) => {
  const body = input.body;
  const issue = (field: string, message: string) => context.addIssue({ code: "custom", path: ["body", field], message });
  if ("latitude" in body && ((body.latitude === null) !== (body.longitude === null))) issue("latitude", "Enter both latitude and longitude, or leave both blank.");
  if ("image_id" in body) {
    if (body.image_id && body.sample_image) issue("image_id", "Choose an uploaded image or a sample photo.");
    if ((body.image_id || body.sample_image) && body.image_alt.length < 3) issue("image_alt", "Describe the image for screen readers.");
    if (body.distance_m !== null && body.status === "published" && !body.distance_reviewed_at) issue("distance_reviewed_at", "Date the manually maintained distance.");
  }
  if (body.status !== "published") return;
  if (input.kind === "hotel") {
    if (!input.body.address) issue("address", "Add the published address.");
    if (!input.body.is_demo && (!input.body.verified_at || !input.body.verification_source)) issue("verified_at", "Verify the hotel location before publishing.");
  } else if (input.kind === "place" && !input.body.category_id) issue("category_id", "Select a category before publishing.");
  if (input.kind === "hotel" || input.kind === "route") {
    if (input.body.latitude === null || input.body.longitude === null) issue("latitude", "Add verified coordinates before publishing.");
  }
});
export const locationDeleteSchema = z.object({ kind: z.enum(["hotel", "category", "place", "route"]), id: z.string().uuid(), version: z.number().int().nonnegative() }).strict();
export type LocationSave = z.infer<typeof locationSaveSchema>;
type Row = { id: string; version: number; updated_at: string };
export type LocationHotel = z.infer<typeof hotelBody> & Row & { location_revision: number };
export type LocationCategory = z.infer<typeof categoryBody> & Row;
export type LocationPlace = z.infer<typeof placeBody> & Row;
export type LocationRoute = z.infer<typeof routeBody> & Row;
export type LocationImage = { id: string; image_alt?: string; storage_key: string; bytes: number; width: number; height: number; deleting: boolean; created_at: string };
export type LocationContent = { hotel: LocationHotel | null; categories: LocationCategory[]; places: LocationPlace[]; routes: LocationRoute[] };
export type LocationEditorData = LocationContent & { images: LocationImage[] };
export const EMPTY_LOCATION: LocationContent = { hotel: null, categories: [], places: [], routes: [] };
type Point = Pick<LocationHotel, "latitude" | "longitude" | "maps_label" | "google_place_id">;
export function hasCoordinates(point: Pick<Point, "latitude" | "longitude">): boolean { return point.latitude !== null && point.longitude !== null && Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180; }
function destination(point: Point): string | null { return hasCoordinates(point) ? point.maps_label || `${point.latitude},${point.longitude}` : null; }
function directions(to: Point, from?: Point, mode?: LocationRoute["travel_mode"]): string | null {
  const end = destination(to), start = from ? destination(from) : null;
  if (!end || (from && !start)) return null;
  const url = new URL("https://www.google.com/maps/dir/"); url.searchParams.set("api", "1"); url.searchParams.set("destination", end);
  if (to.google_place_id) url.searchParams.set("destination_place_id", to.google_place_id);
  if (start) { url.searchParams.set("origin", start); if (from?.google_place_id) url.searchParams.set("origin_place_id", from.google_place_id); }
  if (mode) url.searchParams.set("travelmode", mode);
  return url.href;
}
export const hotelDirections = (hotel: LocationHotel | null) => hotel ? directions(hotel) : null;
export const routeDirections = (route: LocationRoute, hotel: LocationHotel) => directions(hotel, route, route.travel_mode);
export function placeNavigation(place: LocationPlace, hotel: LocationHotel): string | null {
  if (hotel.is_demo && place.maps_search) { const url = new URL("https://www.google.com/maps/search/"); url.searchParams.set("api", "1"); url.searchParams.set("query", place.maps_search); return url.href; }
  return directions(place, hotel);
}
export function locationImageUrl(record: Pick<LocationPlace, "image_id" | "sample_image">, preview = false): string | null {
  if (record.image_id && z.string().uuid().safeParse(record.image_id).success) return `/api/location/images/${record.image_id}${preview ? "?preview=1" : ""}`;
  return record.sample_image && SAMPLE_IMAGES.includes(record.sample_image) ? `/location-samples/${record.sample_image}.webp` : null;
}
export function locationDistance(place: Pick<LocationPlace, "distance_m" | "distance_basis" | "distance_reviewed_at">, demo: boolean): string | null {
  if (place.distance_m === null) return null;
  const value = place.distance_m < 1000 ? `${place.distance_m} m` : `${Number((place.distance_m / 1000).toFixed(1))} km`;
  if (demo) return `${value} · Sample distance · manually maintained`;
  const basis = { walking: "walking distance", driving: "driving distance", straight_line: "straight-line distance" }[place.distance_basis];
  return `${value} · ${basis} · manually maintained${place.distance_reviewed_at ? ` · reviewed ${place.distance_reviewed_at}` : ""}`;
}
