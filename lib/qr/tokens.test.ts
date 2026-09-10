// QR token infrastructure, exercised against the fake-supabase seam: hash-only
// storage, rotate-on-fetch, revoke, room-token reuse, and the scan audit row.
// Route-level authorization (role sets, current-state re-checks) is string-asserted
// against the resolve/issue route files — same idiom as the other migration-content
// tests — because the guards live in the route modules.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeDb } from "@/lib/fake-supabase";

const fake = vi.hoisted(() => ({ db: {} as FakeDb }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase: make } = await import("@/lib/fake-supabase");
  return { supabase: make(fake.db) };
});

const { findQrToken, hashQrToken, issueReservationQrToken, ensureRoomQrToken, rotateRoomQrToken, logQrScan, generateQrToken } = await import("@/lib/qr/tokens");

const RESERVATION = "11111111-1111-1111-1111-111111111111";
const ROOM = "22222222-2222-2222-2222-222222222222";
const STAFF = "33333333-3333-3333-3333-333333333333";
const OLD_TOKEN = "old-token-value";

function seed(): FakeDb {
  return {
    reservations: [{ id: RESERVATION, check_out: "2026-09-12", status: "confirmed" }],
    rooms: [{ id: ROOM, qr_code: null }],
    qr_tokens: [
      { id: "tok-old", token_hash: hashQrToken(OLD_TOKEN), resource_type: "reservation", resource_id: RESERVATION, purpose: "check_in", created_at: "2026-09-05T00:00:00Z", expires_at: "2026-09-14T00:00:00Z", revoked_at: null }
    ],
    qr_scan_events: []
  };
}

// The mocked client captured fake.db by reference — mutate in place, never reassign.
beforeEach(() => {
  for (const key of Object.keys(fake.db)) delete (fake.db as Record<string, unknown>)[key];
  Object.assign(fake.db, seed());
});

describe("token primitives", () => {
  it("stores and looks up by SHA-256 hash only — the plaintext is never a lookup key", async () => {
    const token = generateQrToken();
    fake.db.qr_tokens!.push({ id: "tok-x", token_hash: hashQrToken(token), resource_type: "room", resource_id: ROOM, purpose: "room_operations", created_at: "2026-09-08T00:00:00Z", expires_at: null, revoked_at: null });
    expect(hashQrToken(token)).toMatch(/^[0-9a-f]{64}$/);
    const found = await findQrToken(token);
    expect(found).not.toBeNull();
    expect(found!.id).toBe("tok-x");
  });

  it("returns null for unknown tokens", async () => {
    expect(await findQrToken("never-issued")).toBeNull();
  });

  it("issues 256-bit URL-safe tokens (opaque, not derived from any guest data)", () => {
    const a = generateQrToken();
    const b = generateQrToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url
  });
});

describe("issueReservationQrToken — rotate on every fetch", () => {
  it("revokes the previous active token and records a fresh one expiring check-out + 2 days", async () => {
    const issued = await issueReservationQrToken(RESERVATION, STAFF);
    expect(issued).not.toBeNull();
    expect(issued!.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(issued!.expiresAt).toBe("2026-09-14T00:00:00.000Z");

    const rows = fake.db.qr_tokens!.filter((row) => row.resource_id === RESERVATION);
    expect(rows).toHaveLength(2);
    const old = rows.find((row) => row.id === "tok-old")!;
    expect(old.revoked_at).toBeTruthy(); // the previously displayed QR is dead
    const fresh = rows.find((row) => row.id !== "tok-old")!;
    expect(fresh.revoked_at ?? null).toBeNull();
    expect(fresh.purpose).toBe("check_in");
    expect(fresh.created_by).toBe(STAFF);
    // Only the hash was stored — the plaintext lives solely in the rendered data URL.
    expect(Object.values(fresh).some((value) => typeof value === "string" && value.startsWith("data:image"))).toBe(false);
  });

  it("issues nothing for an unknown reservation", async () => {
    expect(await issueReservationQrToken("missing", STAFF)).toBeNull();
  });
});

describe("room operations QR", () => {
  it("rotates: revokes active tokens, stores the hash, mirrors the plaintext in rooms.qr_code for placard re-rendering", async () => {
    const token = await rotateRoomQrToken(ROOM, STAFF);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const room = fake.db.rooms!.find((row) => row.id === ROOM)!;
    expect(room.qr_code).toBe(token);
    const hashRow = fake.db.qr_tokens!.find((row) => row.resource_type === "room")!;
    expect(hashRow.token_hash).toBe(hashQrToken(token!));
    expect(hashRow.expires_at ?? null).toBeNull(); // placards are persistent by design
  });

  it("reuses an existing active placard token instead of rotating", async () => {
    const first = await ensureRoomQrToken(ROOM, STAFF);
    const second = await ensureRoomQrToken(ROOM, STAFF);
    expect(second).toBe(first);
    expect(fake.db.qr_tokens!.filter((row) => row.resource_type === "room")).toHaveLength(1);
  });

  it("rotates when the mirrored plaintext no longer matches an active hash row", async () => {
    await ensureRoomQrToken(ROOM, STAFF);
    // Simulate the hash row being revoked (manager rotation elsewhere): reuse is refused.
    for (const row of fake.db.qr_tokens!) if (row.resource_type === "room") row.revoked_at = "2026-09-07T00:00:00Z";
    const rotated = await ensureRoomQrToken(ROOM, STAFF);
    expect(rotated).toBeTruthy();
    expect(fake.db.qr_tokens!.filter((row) => row.resource_type === "room" && (row.revoked_at ?? null) === null)).toHaveLength(1);
  });
});

describe("scan audit", () => {
  it("records every scan of a known token", async () => {
    await logQrScan({ tokenId: "tok-old", scannerUserId: STAFF, scannerRole: "front_desk", resourceType: "reservation", resourceId: RESERVATION, action: "check_in", result: "authorized" });
    await logQrScan({ tokenId: "tok-old", scannerUserId: STAFF, scannerRole: "front_desk", resourceType: "reservation", resourceId: RESERVATION, action: "check_in", result: "ineligible" });
    expect(fake.db.qr_scan_events).toHaveLength(2);
    expect(fake.db.qr_scan_events![1]).toMatchObject({ result: "ineligible", scanner_role: "front_desk" });
  });
});

// ---- Route-level guard string assertions -------------------------------------

const resolveRoute = readFileSync("app/api/qr/resolve/route.ts", "utf8");
const reservationQrRoute = readFileSync("app/api/qr/reservation/[id]/route.ts", "utf8");
const roomQrRoute = readFileSync("app/api/qr/room/[roomId]/route.ts", "utf8");
const rotateRoute = readFileSync("app/api/qr/room/[roomId]/rotate/route.ts", "utf8");

describe("resolve route authorization (string-asserted)", () => {
  it("requires a session and resolves the token by hash through the shared validation path", () => {
    expect(resolveRoute).toContain("getServerSession");
    expect(resolveRoute).toContain("findQrToken");
  });

  it("refuses revoked and expired tokens with 410, unknown tokens with 404", () => {
    expect(resolveRoute).toMatch(/revoked_at[\s\S]{0,200}410/);
    expect(resolveRoute).toMatch(/expired[\s\S]{0,200}410/);
    expect(resolveRoute).toContain("404");
  });

  it("re-checks current reservation state — a non-confirmed reservation can never initiate check-in", () => {
    expect(resolveRoute).toMatch(/reservations[\s\S]{0,400}status/);
    expect(resolveRoute).toContain("409");
    expect(resolveRoute).toContain("ineligible");
  });

  it("audits every resolution of a known token", () => {
    expect(resolveRoute).toContain("logQrScan");
  });

  it("limits reservation QR issuance to the owning guest or staff, confirmed reservations only", () => {
    expect(reservationQrRoute).toContain("user_id");
    expect(reservationQrRoute).toContain("409");
  });

  it("limits room QR rendering to staff and rotation to manager/owner/admin", () => {
    expect(roomQrRoute).toContain("STAFF");
    expect(rotateRoute).toContain("manager");
  });
});
