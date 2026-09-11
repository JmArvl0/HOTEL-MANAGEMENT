import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync("components/catalog/room-catalog-panel.tsx", "utf8");
const roomDetails = readFileSync("components/booking/room-details.tsx", "utf8");
const roomTypesRoute = readFileSync("app/api/catalog/room-types/route.ts", "utf8");
const roomTypesIdRoute = readFileSync("app/api/catalog/room-types/[id]/route.ts", "utf8");
const roomsRoute = readFileSync("app/api/catalog/rooms/route.ts", "utf8");
const rosterPanel = readFileSync("components/manager/room-roster-panel.tsx", "utf8");
const photosRoute = readFileSync("app/api/catalog/photos/route.ts", "utf8");
const badgeLib = readFileSync("lib/room-type-badge.ts", "utf8");
const badgeMigration = readFileSync("supabase/migrations/20260925010000_room_type_badge_colors.sql", "utf8");
const governanceMigration = readFileSync("supabase/migrations/20260927010000_badge_color_governance.sql", "utf8");
const landing = readFileSync("app/(landing-page)/page.tsx", "utf8");
const landingIntent = readFileSync("components/landing/booking-intent.tsx", "utf8");
const searchPage = readFileSync("app/(booking)/booking/search/page.tsx", "utf8");
const roomResults = readFileSync("components/booking/room-results.tsx", "utf8");
const nextConfig = readFileSync("next.config.mjs", "utf8");

describe("room-type badge colors", () => {
  it("offers a curated swatch selector with a live preview, not a color picker", () => {
    expect(panel).toContain("ROOM_TYPE_COLORS.map");
    expect(panel).toContain('<RoomTypeBadge name={colorName(key)} colorKey={key}/>');
    expect(panel).toContain('role="radiogroup" aria-label="Badge color"');
    expect(panel).toContain("Preview:");
    expect(panel).not.toContain("type=\"color\"");
  });
  it("disables colors held by other active types and names the owner — never hides them", () => {
    expect(panel).toContain("const colorOwner = (items: RoomType[], key: string, editingId?: string) =>");
    // Reservation scope: active OR pending-proposal types hold their color.
    expect(panel).toContain("(item.active || pendingOf(item))");
    expect(panel).toContain("disabled={Boolean(owner)}");
    expect(panel).toContain("{owner && <small>{owner.name}</small>}");
  });
  it("requires a badge color before creation — no neutral escape hatch", () => {
    expect(panel).toContain('if (creating && !draft.badgeColorKey) { notify("Choose a badge color for this room type."); return; }');
    expect(panel).toContain('<label className="form-label">Badge color <span className="required">*</span></label>');
    expect(panel).not.toContain('onClick={() => set("badgeColorKey", null)}');
  });
  it("shows the color read-only to a Manager editing an active type", () => {
    expect(panel).toContain("editing && canPropose && editing.active");
    expect(panel).toContain("only Owner/Admin can change the badge color of an active room type");
  });
  it("sends the color on every write path — the full-state PATCHes must not clear it", () => {
    expect(roomTypesRoute).toContain("const badgeColorKey = z.enum(ROOM_TYPE_COLORS)");
    expect(roomTypesRoute).toContain("p_badge_color_key: v.badgeColorKey");
    expect(roomTypesIdRoute).toContain("badgeColorKey: z.enum(ROOM_TYPE_COLORS).nullable()");
    expect(roomTypesIdRoute).toContain("p_badge_color_key: v.badgeColorKey");
    expect(panel).toContain("badgeColorKey: draft.badgeColorKey");
    // Photo saves ride the same versioned PATCH — they re-send the current color.
    expect(panel).toContain("badgeColorKey: photoType.badge_color_key ?? null");
  });
  it("serves the color key with the catalog", () => {
    expect(roomTypesRoute).toContain("photo_urls,badge_color_key");
  });
  it("stores semantic keys with DB-enforced active-type uniqueness and a name backfill", () => {
    expect(badgeLib).toContain('"sage", "gold", "ocean", "plum", "terracotta", "slate", "sand", "lavender"');
    expect(badgeMigration).toContain("add column if not exists badge_color_key text");
    expect(badgeMigration).toContain("where active and badge_color_key is not null");
    expect(badgeMigration).toContain("where name = 'Garden Twin'");
    expect(badgeMigration).toContain("where name = 'Deluxe King'");
    expect(badgeMigration).toContain("where name = 'Ocean Suite'");
    expect(badgeMigration).toContain("where name = 'Executive Suite'");
    // Concurrent claims cannot both pass: the unique index backstops the pre-checks.
    expect(badgeMigration).toContain("exception when unique_violation then");
    expect(badgeMigration).toContain("raise exception 'ROOM_TYPE_COLOR_TAKEN'");
  });
  it("reserves colors through the approval workflow — pending proposals hold them", () => {
    // Every claim path takes the same per-color advisory lock, then checks the
    // reservation scope: active OR pending-proposal types.
    const locks = governanceMigration.match(/pg_advisory_xact_lock\(hashtext\('rt-badge:'/g) ?? [];
    expect(locks.length).toBe(4); // create, update, propose, review-approve
    const scopeChecks = governanceMigration.match(/or exists \(select 1 from room_rate_proposals q/g) ?? [];
    expect(scopeChecks.length).toBe(4);
    expect(governanceMigration).toContain("raise exception 'ROOM_TYPE_COLOR_TAKEN'");
  });
  it("approve = activate: one decision publishes a still-inactive type with its color", () => {
    expect(governanceMigration).toContain("if not t.active then");
    expect(governanceMigration).toContain("update room_types set base_rate = p.proposed_rate, active = true, version = version + 1");
  });
  it("makes active-type recolors an Owner/Admin decision", () => {
    expect(governanceMigration).toContain("raise exception 'BADGE_COLOR_CHANGE_APPROVAL_REQUIRED'");
  });
  it("reviews show the proposed color and the one-step publish", () => {
    expect(panel).toContain("Approving sets the rate and publishes the room type");
    expect(panel).toContain("Badge color: ${colorName(item.badge_color_key)}");
  });
  it("physical rooms inherit the badge from their room type — no per-room color", () => {
    expect(roomsRoute).toContain('"id,name,base_rate,active,badge_color_key"');
    expect(rosterPanel).toContain("<RoomTypeBadge name={label(room.type)} colorKey={colorOf(room.type)}/>");
    expect(rosterPanel).toContain("const colorOf = (typeName: string)");
    expect(rosterPanel).not.toContain("badgeColorKey: draft");
  });
});

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