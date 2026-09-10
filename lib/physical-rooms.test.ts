import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const roster = readFileSync("components/manager/room-roster-panel.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260916010000_physical_room_management.sql", "utf8");
const schema = readFileSync("supabase/schema.sql", "utf8");
const roomsRoute = readFileSync("app/api/catalog/rooms/route.ts", "utf8");
const idRoute = readFileSync("app/api/catalog/rooms/[id]/route.ts", "utf8");
const adminRoute = readFileSync("lib/admin-route.ts", "utf8");
const dashboard = readFileSync("components/manager/manager-dashboard-client.tsx", "utf8");

describe("physical room roster surface", () => {
  it("is a floor-grouped row list, not a CRUD table", () => {
    expect(roster).toContain("room-roster-row");
    expect(roster).toContain("Floor {floor}");
    expect(roster).not.toContain("<table");
  });
  it("states the administrative fact and the workflow-owned fact separately", () => {
    expect(roster).toContain("Inactive — retired");
    expect(roster).toContain("workflow-owned");
    expect(roster).toContain("Not editable here.");
  });
  it("never writes operational state", () => {
    // Everything the roster sends is in this one literal; status and
    // housekeeping are read for display and never appear in it.
    const payload = roster.slice(roster.indexOf("const payload = {"), roster.indexOf("const response = await fetch(creating"));
    expect(payload).not.toContain("status");
    expect(payload).not.toContain("housekeeping");
    expect(roster).not.toContain("supabase");
  });
  it("keeps room number create-only and exposes no rate input", () => {
    expect(roster).toContain("Room numbers are permanent");
    // The edit payload carries no number — it is spread in only when creating.
    expect(roster).toContain("...(creating ? { number: draft.number.trim() } : {})");
    expect(roster).not.toContain("rate");
  });
  it("sends versioned, reasoned writes and warns before the server has to refuse", () => {
    expect(roster).toContain("version: editing.configuration_version");
    expect(roster).toContain("reason: draft.reason.trim()");
    expect(roster).toContain("editing.commitments > 0");
    expect(roster).toContain("reassign to change type");
  });
  it("mounts behind catalog authority on Rooms & Availability", () => {
    expect(dashboard).toContain("RoomRosterPanel");
    expect(dashboard).toContain("Manage rooms");
    expect(dashboard).toContain('catalogAuthority = ["owner","admin","manager"]');
    expect(dashboard).toContain("manageRooms={catalogAuthority?");
  });
});

describe("catalog room routes carry no authority of their own", () => {
  it("guards both with guardCatalog and never trusts a client actor", () => {
    for (const route of [roomsRoute, idRoute]) {
      expect(route).toContain("guardCatalog");
      expect(route).toContain("adminGuardFailed");
      expect(route).toContain("adminRpcFailure");
      expect(route).toContain("p_actor_user_id:c.actorId");
      expect(route).not.toContain("actorId:body");
    }
  });
  it("PATCH accepts no room number and rides the same RPC as the governance route", () => {
    expect(idRoute).toContain("admin_update_room_metadata");
    expect(idRoute).toContain("p_expected_version");
    expect(idRoute).not.toContain("number:z.string");
  });
  it("POST exposes no rate and reports forward commitments for the UI hint", () => {
    expect(roomsRoute).toContain("admin_create_room");
    expect(roomsRoute).not.toContain("rate:z");
    expect(roomsRoute).toContain("commitments");
  });
});

describe("migration guards", () => {
  it("blocks a retype that would break check-in and a duplicate number", () => {
    expect(migration).toContain("ROOM_HAS_FUTURE_COMMITMENT");
    expect(migration).toContain("ROOM_NUMBER_TAKEN");
    expect(migration).toContain("unique_violation");
  });
  it("uses a NULL-safe role guard and copies the type's approved rate", () => {
    expect(migration).toContain("actor is null or actor not in");
    expect(migration).toContain("base_rate into");
  });
  it("persists why a room was retired", () => {
    expect(migration).toContain("deactivated_at");
    expect(migration).toContain("deactivation_reason");
  });
  it("revokes and grants per signature so anon keeps no EXECUTE", () => {
    for (const fn of ["admin_create_room", "admin_update_room_metadata"]) {
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${fn}\\(`));
      expect(migration).toMatch(new RegExp(`grant execute on function public\\.${fn}\\(`));
    }
    expect(migration).toContain("from public, anon, authenticated");
  });
  it("routes every inventory count through room_is_sellable", () => {
    expect(migration).toContain("room_is_sellable");
    // The old under-restricting predicate is gone from the snapshot too.
    expect(schema).not.toContain("r.status<>'maintenance' and(p_check_in");
    expect(schema).toContain("admin_create_room");
  });
});

describe("error copy", () => {
  it("maps the new RPC codes to guidance a manager can act on", () => {
    expect(adminRoute).toContain("ROOM_HAS_FUTURE_COMMITMENT");
    expect(adminRoute).toContain("ROOM_NUMBER_TAKEN");
    expect(adminRoute).toContain("Reassign those guests");
  });
});
