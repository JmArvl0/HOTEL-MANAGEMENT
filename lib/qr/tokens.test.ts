// QR token infrastructure, exercised against the fake-supabase seam: hash-only
// storage, stable lifecycle identity, legacy rotation recovery, revoke, room-token
// reuse, and the scan audit row. Route-level authorization (role sets,
// current-state re-checks) is string-asserted against the resolve/issue route
// files — same idiom as the other migration-content tests — because the guards
// live in the route modules.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeDb } from "@/lib/fake-supabase";

const fake = vi.hoisted(() => ({ db: {} as FakeDb }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase: make } = await import("@/lib/fake-supabase");
  return { supabase: make(fake.db) };
});

const { findQrToken, hashQrToken, ensureReservationQrToken, rotateReservationQrToken, ensureRoomQrToken, rotateRoomQrToken, logQrScan, generateQrToken } = await import("@/lib/qr/tokens");

const RESERVATION = "11111111-1111-1111-1111-111111111111";
const ROOM = "22222222-2222-2222-2222-222222222222";
const STAFF = "33333333-3333-3333-3333-333333333333";
const OLD_TOKEN = "old-token-value";

function seed(): FakeDb {
  return {
    reservations: [{ id: RESERVATION, check_out: "2026-09-12", status: "confirmed", qr_code: null }],
    rooms: [{ id: ROOM, qr_code: null }],
    qr_tokens: [],
    qr_scan_events: []
  };
}

function seedLegacyActiveHash() {
  fake.db.qr_tokens!.push({ id: "tok-old", token_hash: hashQrToken(OLD_TOKEN), resource_type: "reservation", resource_id: RESERVATION, purpose: "check_in", created_at: "2026-09-05T00:00:00Z", expires_at: "2026-09-14T00:00:00Z", revoked_at: null });
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

describe("ensureReservationQrToken — one stable identity per active stay", () => {
  it("issues a stable QR with no fixed expiry for a confirmed reservation", async () => {
    const issued = await ensureReservationQrToken(RESERVATION, STAFF);
    expect(issued).not.toBeNull();
    expect(issued!.dataUrl).toMatch(/^data:image\/png;base64,/);
    const rows = fake.db.qr_tokens!.filter((row) => row.resource_id === RESERVATION);
    expect(rows).toHaveLength(1);
    expect(rows[0].revoked_at ?? null).toBeNull();
    expect(rows[0].expires_at ?? null).toBeNull(); // lifecycle owns validity, not a date
    expect(rows[0].purpose).toBe("check_in");
    expect(rows[0].created_by).toBe(STAFF);
    // Only the hash was stored — the plaintext lives solely in the rendered data URL.
    expect(Object.values(rows[0]).some((value) => typeof value === "string" && value.startsWith("data:image"))).toBe(false);
  });

  it("returns the SAME QR on repeated views without new token rows", async () => {
    const first = await ensureReservationQrToken(RESERVATION, STAFF);
    const second = await ensureReservationQrToken(RESERVATION, STAFF);
    const third = await ensureReservationQrToken(RESERVATION, STAFF);
    expect(second!.dataUrl).toBe(first!.dataUrl);
    expect(third!.dataUrl).toBe(first!.dataUrl);
    expect(fake.db.qr_tokens!.filter((row) => row.resource_id === RESERVATION)).toHaveLength(1);
  });

  it("keeps the same QR for a checked-in stay (extensions and room moves change dates, never identity)", async () => {
    fake.db.reservations!.find((row) => row.id === RESERVATION)!.status = "checked_in";
    const before = await ensureReservationQrToken(RESERVATION, STAFF);
    // Simulate an extension + room move: only dates/room change, never the token.
    fake.db.reservations!.find((row) => row.id === RESERVATION)!.check_out = "2026-09-22";
    const after = await ensureReservationQrToken(RESERVATION, STAFF);
    expect(after!.dataUrl).toBe(before!.dataUrl);
    expect(fake.db.qr_tokens!.filter((row) => row.resource_id === RESERVATION)).toHaveLength(1);
  });

  it("first view after migration replaces one unrecoverable legacy hash with exactly one stable QR", async () => {
    // Legacy state: active hash row, no plaintext mirror — the old image is
    // unrecoverable, so exactly one successor is issued and the old row dies.
    seedLegacyActiveHash();
    const first = await ensureReservationQrToken(RESERVATION, STAFF);
    expect(first).not.toBeNull();
    const rows = fake.db.qr_tokens!.filter((row) => row.resource_id === RESERVATION);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === "tok-old")!.revoked_at).toBeTruthy();
    const live = rows.filter((row) => !row.revoked_at);
    expect(live).toHaveLength(1);
    // The mirror now holds the successor: later views are stable, no rotation.
    const second = await ensureReservationQrToken(RESERVATION, STAFF);
    const third = await ensureReservationQrToken(RESERVATION, STAFF);
    expect(second!.dataUrl).toBe(first!.dataUrl);
    expect(third!.dataUrl).toBe(first!.dataUrl);
    expect(fake.db.qr_tokens!.filter((row) => row.resource_id === RESERVATION)).toHaveLength(2);
  });

  it("refuses terminal and pending reservations — no QR can be born closed", async () => {
    for (const status of ["checked_out", "cancelled", "no_show", "pending"]) {
      fake.db.reservations!.find((row) => row.id === RESERVATION)!.status = status;
      expect(await ensureReservationQrToken(RESERVATION, STAFF)).toBeNull();
    }
    expect(fake.db.qr_tokens!.filter((row) => row.resource_id === RESERVATION)).toHaveLength(0);
  });

  it("issues nothing for an unknown reservation", async () => {
    expect(await ensureReservationQrToken("missing", STAFF)).toBeNull();
  });
});

describe("rotateReservationQrToken — staff compromise recovery only", () => {
  it("revokes the live token and issues a fresh stable successor", async () => {
    const before = await ensureReservationQrToken(RESERVATION, STAFF);
    const rotated = await rotateReservationQrToken(RESERVATION, STAFF);
    expect(rotated).not.toBeNull();
    expect(rotated!.dataUrl).not.toBe(before!.dataUrl);
    expect(fake.db.qr_tokens!.filter((row) => row.resource_id === RESERVATION && !row.revoked_at)).toHaveLength(1);
    const again = await ensureReservationQrToken(RESERVATION, STAFF);
    expect(again!.dataUrl).toBe(rotated!.dataUrl);
  });

  it("refuses to resurrect terminal reservations", async () => {
    await ensureReservationQrToken(RESERVATION, STAFF);
    fake.db.reservations!.find((row) => row.id === RESERVATION)!.status = "checked_out";
    expect(await rotateReservationQrToken(RESERVATION, STAFF)).toBeNull();
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

  it("re-checks current reservation state — terminal stays resolve 410 expired, pending resolves 409", () => {
    expect(resolveRoute).toMatch(/reservations[\s\S]{0,400}status/);
    expect(resolveRoute).toMatch(/checked_out[\s\S]{0,600}410/);
    expect(resolveRoute).toMatch(/cancelled[\s\S]{0,600}410/);
    expect(resolveRoute).toMatch(/no_show[\s\S]{0,600}410/);
    expect(resolveRoute).toContain("409");
    expect(resolveRoute).toContain("ineligible");
  });

  it("authorizes checked-in stays with the same QR — extensions and room moves never invalidate it", () => {
    expect(resolveRoute).toContain("checked_in");
    expect(resolveRoute).toMatch(/status !== "confirmed" && [\s\S]{0,80}status !== "checked_in"/);
  });

  it("never performs check-in from a scan — resolution only identifies the reservation", () => {
    expect(resolveRoute).not.toContain("front_desk_check_in(");
    expect(resolveRoute).not.toContain("supabase.rpc(");
  });

  it("audits every resolution of a known token", () => {
    expect(resolveRoute).toContain("logQrScan");
  });

  it("limits reservation QR issuance to the owning guest or staff, active stays only, terminal refused server-side", () => {
    expect(reservationQrRoute).toContain("user_id");
    expect(reservationQrRoute).toContain("409");
    expect(reservationQrRoute).toContain("RESERVATION_QR_ACTIVE_STATUSES");
    expect(reservationQrRoute).toContain("cannot be reissued");
    expect(reservationQrRoute).not.toContain("issueReservationQrToken");
  });

  it("limits room QR rendering to staff and rotation to manager/owner/admin", () => {
    expect(roomQrRoute).toContain("STAFF");
    expect(rotateRoute).toContain("manager");
  });
});

describe("reservations.qr_code bearer-token containment", () => {
  // The plaintext mirror is a sensitive bearer token: it may appear in the
  // QR token module, its migration, and this test — nowhere else in
  // app/lib/components source. In particular never in general reservation
  // queries (all explicit column lists), logs, audit payloads, AI inputs,
  // or analytics inputs.
  const sources: string[] = [];
  const collect = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry).replace(/\\/g, "/");
      if (statSync(full).isDirectory()) { collect(full); continue; }
      if (!/\.(ts|tsx)$/.test(entry) || /\.test\.(ts|tsx)$/.test(entry)) continue;
      sources.push(full);
    }
  };
  for (const dir of ["app", "lib", "components"]) collect(dir);

  it("never selects every reservation column (which would sweep the token up)", () => {
    const star = sources.filter((file) =>
      /from\("reservations"\)\.select\("\*"\)/.test(readFileSync(file, "utf8")) ||
      /from\('reservations'\)\.select\('\*'\)/.test(readFileSync(file, "utf8")));
    expect(star).toEqual([]);
  });

  it("references the plaintext mirror only inside the QR token module", () => {
    // Room placard pages resolve through ensureRoomQrToken and never touch
    // the literal themselves — verified by this scan, not by convention.
    const holders = sources.filter(
      (file) => readFileSync(file, "utf8").includes("qr_code") && !file.endsWith("lib/qr/tokens.ts")
    );
    expect(holders).toEqual([]);
  });

  it("never logs, audits, or forwards the token plaintext", () => {
    for (const file of sources) {
      const text = readFileSync(file, "utf8");
      if (!text.includes("qr_code")) continue;
      if (file.endsWith("lib/qr/tokens.ts")) continue;
      expect(text).not.toMatch(/console\.(log|error).*qr_code|after_data.*qr_code|qr_code.*after_data/i);
    }
  });

  it("never feeds reservation tokens into AI or analytics inputs", () => {
    for (const dir of ["lib/ai", "lib/analytics"]) {
      const names: string[] = [];
      const walk = (d: string) => {
        for (const entry of readdirSync(d)) {
          const full = join(d, entry).replace(/\\/g, "/");
          if (statSync(full).isDirectory()) { walk(full); continue; }
          if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) names.push(full);
        }
      };
      walk(dir);
      for (const file of names) expect(readFileSync(file, "utf8")).not.toContain("qr_code");
    }
  });
});
