import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync("components/catalog/room-catalog-panel.tsx", "utf8");
const roomDetails = readFileSync("components/booking/room-details.tsx", "utf8");
const roomTypesRoute = readFileSync("app/api/catalog/room-types/route.ts", "utf8");
const roomTypesIdRoute = readFileSync("app/api/catalog/room-types/[id]/route.ts", "utf8");
const photosRoute = readFileSync("app/api/catalog/photos/route.ts", "utf8");
const landing = readFileSync("app/(landing-page)/page.tsx", "utf8");
const landingIntent = readFileSync("components/landing/booking-intent.tsx", "utf8");
const searchPage = readFileSync("app/(booking)/booking/search/page.tsx", "utf8");
const roomResults = readFileSync("components/booking/room-results.tsx", "utf8");
const nextConfig = readFileSync("next.config.mjs", "utf8");

describe("room-type catalog card hybrid", () => {
  it("renders each type as a card with cover, rate, room count, and published state", () => {
    expect(panel).toContain("catalog-card-media");
    expect(panel).toContain("roomPrimary(item.photo_urls, item.name)");
    expect(panel).toContain("{peso(item.base_rate)}");
    expect(panel).toContain("in service");
    expect(panel).toContain('item.active ? "Published" : "Unpublished"');
    expect(panel).not.toContain("<table");
  });
  it("explains why an unpublished type is not public, mirroring the server gates", () => {
    expect(panel).toContain("Rate approval pending");
    expect(panel).toContain("Nightly rate required");
  });
  it("keeps every action on existing audited endpoints — no new writes", () => {
    expect(panel).toContain("fetch(`/api/catalog/room-types/${photoType.id}`");
    expect(panel).toContain("fetch(\"/api/catalog/photos\"");
    expect(panel).not.toContain("supabase");
    // The only DELETE is best-effort cleanup of orphaned create-modal uploads —
    // catalog data still moves exclusively through the audited RPC routes.
    const deletes = panel.match(/method: "DELETE"/g) ?? [];
    expect(deletes.length).toBe(1);
    expect(panel).toContain('fetch("/api/catalog/photos", { method: "DELETE"');
    // Photo saves ride the same versioned, reasoned update as every other edit.
    expect(panel).toContain("version: photoType.version");
    expect(panel).toContain("reason: reason.trim()");
  });
});

describe("photo manager modal", () => {
  it("marks the first photo as cover and offers explicit set-as-cover", () => {
    expect(panel).toContain('className="photo-tile"');
    expect(panel).toContain("photo-cover-tag");
    expect(panel).toContain('aria-label="Set as cover"');
    expect(panel).toContain("movePhoto(index, 0)");
  });
  it("keeps the upload and URL validation contract", () => {
    expect(panel).toContain("/^image\\/(jpeg|png|webp)$/.test(file.type)");
    expect(panel).toContain("5 * 1024 * 1024");
    expect(panel).toContain("A room type can hold up to 24 photos.");
    expect(panel).toContain('accept="image/jpeg,image/png,image/webp"');
  });
  it("requires an audited reason and reuses the versioned PATCH schema", () => {
    expect(roomTypesIdRoute).toContain("p_expected_version");
    expect(roomTypesIdRoute).toContain("reason: z.string().trim().min(3)");
  });
});

describe("creation requires a photo", () => {
  it("refuses to create without an uploaded photo and sends photoUrls on create", () => {
    expect(panel).toContain("At least one room photo is required.");
    expect(panel).toContain("createPhotos.length === 0");
    expect(panel).toContain("photoUrls: createPhotos");
    // Create is blocked while an upload is in flight (no half-attached photos).
    expect(panel).toContain("disabled={busy || (!editing && uploading)}");
    // The old passive "add photos later" note is gone.
    expect(panel).not.toContain("Add photos after creating the type");
  });
  it("enforces the photo requirement at the API layer, not just in the UI", () => {
    expect(roomTypesRoute).toContain("photoUrls: z.array(z.string().trim().url().max(400)).min(1).max(24)");
    expect(roomTypesRoute).toContain("p_photo_urls: v.photoUrls");
  });
  it("cleans up abandoned uploads through a guarded storage-only DELETE", () => {
    expect(photosRoute).toContain("export async function DELETE");
    expect(photosRoute).toContain("OBJECT_PATH");
    expect(photosRoute).toContain("remove([path])");
    // Only bare <uuid>.<jpg|png|webp> objects this flow creates are deletable.
    expect(photosRoute).toContain("Not a room photo managed by this catalog.");
  });
});

describe("guest-view preview", () => {
  it("reuses the guest room-details body rather than duplicating it", () => {
    expect(roomDetails).toContain("export function RoomTypeDetailsBody");
    expect(roomDetails).toContain("export function RoomDetailsButton");
    expect(panel).toContain("<RoomTypeDetailsBody");
    expect(panel).toContain("previewRoom(preview)");
  });
  it("flags unpublished types as drafts and never offers booking from preview", () => {
    expect(panel).toContain("DRAFT — not visible to guests");
    expect(panel).toContain("rd-draft-banner");
    expect(panel).not.toContain("Book this room");
  });
});

describe("catalog GET aggregates physical-room counts in one pass", () => {
  it("counts rooms per type without per-type queries", () => {
    expect(roomTypesRoute).toContain('from("rooms").select("type,administratively_active")');
    expect(roomTypesRoute).toContain("physicalRooms");
    expect(roomTypesRoute).toContain("activeRooms");
    expect(roomTypesRoute).toContain("guardCatalog");
  });
});

describe("landing page room cards are DB-driven", () => {
  it("reads active room types with live rates instead of hardcoded prices", () => {
    expect(landing).toContain('from("room_types")');
    expect(landing).toContain('.eq("active", true)');
    expect(landing).toContain("order(\"base_rate\"");
    // Card rendering lives in the client intent module; still photo-chained and en-PH priced.
    expect(landingIntent).toContain("roomPrimary(");
    expect(landingIntent).toContain("Intl.NumberFormat");
    expect(landingIntent).not.toContain("base_rate: 5");
  });
  it("renders an empty state instead of hardcoded rooms when the catalog is unavailable", () => {
    expect(landing).toContain("coast-catalog-empty");
    expect(landing).toContain("revalidate = 300");
  });
});

describe("intent-aware room discovery", () => {
  it("derives the search mode from the URL and browses the same DB catalog", () => {
    expect(searchPage).toContain("parseSearchIntent(raw)");
    expect(searchPage).toContain("getRoomCatalog()");
    expect(searchPage).toContain("getAvailability(");
    expect(searchPage).toContain("focusRoomType");
  });
  it("never fabricates availability without dates and labels the focused room in text", () => {
    expect(roomResults).toContain("Check dates");
    expect(roomResults).toContain("room-focus-chip");
    expect(roomResults).toContain("Selected from homepage");
  });
});

describe("landing image allowlist", () => {
  it("limits remote landing images to the exact Unsplash photo path and linked Supabase project", () => {
    expect(nextConfig).toContain('hostname: "images.unsplash.com", pathname: "/photo-*"');
    expect(nextConfig).toContain('hostname: "vztkkugkvqjghftnlxxr.supabase.co"');
    expect(nextConfig).not.toContain('hostname: "**.supabase.co"');
    expect(nextConfig).not.toContain('hostname: "images.unsplash.com", pathname: "/**"');
  });
});