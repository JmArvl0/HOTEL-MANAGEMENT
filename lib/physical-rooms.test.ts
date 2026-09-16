import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const roster = readFileSync("components/manager/room-roster-panel.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20260916010000_physical_room_management.sql", "utf8");
const createReasonMigration = readFileSync("supabase/migrations/20261002010000_room_create_reason_optional.sql", "utf8");
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
  it("sends versioned writes and requires a reason only when editing", () => {
    expect(roster).toContain("version: editing.configuration_version");
    // The reason gate and payload key apply to edits; creation sends no reason.
    expect(roster).toContain("!creating && draft.reason");
    expect(roster).toContain("...(editing ? { reason:");
    expect(roster).toContain("editing.commitments > 0");
    expect(roster).toContain("reassign to change type");
  });
  it("renders no Reason for change field when adding a room", () => {
    // The reason block is gated on edit mode; create mode never shows it.
    const reasonAt = roster.indexOf("pr-reason");
    expect(reasonAt).toBeGreaterThan(-1);
    expect(roster.slice(Math.max(0, reasonAt - 500), reasonAt)).toContain("{editing && (");
    expect(roster).toContain("Required because changes to existing room configuration are audited.");
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
  it("POST requires no reason while PATCH still demands one", () => {
    expect(roomsRoute).not.toMatch(/reason:z\.string\(\)\.trim\(\)\.min\(3\)/);
    expect(roomsRoute).toContain("reason:z.string().trim().max(500).optional()");
    expect(idRoute).toContain("reason:z.string().trim().min(3).max(500)");
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
  it("creation accepts a blank reason but still audits; updates still require one", () => {
    // The reason check is gone from the create guard only — number/type/floor stay.
    expect(createReasonMigration).toContain("CREATE OR REPLACE FUNCTION public.admin_create_room(");
    expect(createReasonMigration).not.toContain("FUNCTION public.admin_update_room_metadata");
    const guard = createReasonMigration.slice(
      createReasonMigration.indexOf("v_number:=nullif"),
      createReasonMigration.indexOf("raise exception'INVALID_ROOM_CONFIGURATION'")
    );
    expect(guard).not.toContain("p_reason");
    // The audit row is still written on every create; a supplied reason is kept,
    // a blank one is omitted — never a fabricated placeholder.
    expect(createReasonMigration).toContain("'admin_create_room'");
    expect(createReasonMigration).toContain("insert into audit_logs");
    expect(createReasonMigration).not.toContain("Room created");
    // The original migration still guards the update path with a reason.
    expect(migration).toContain("nullif(trim(p_reason),'')is null or not exists(select 1 from room_types");
  });
});

describe("error copy", () => {
  it("maps the new RPC codes to guidance a manager can act on", () => {
    expect(adminRoute).toContain("ROOM_HAS_FUTURE_COMMITMENT");
    expect(adminRoute).toContain("ROOM_NUMBER_TAKEN");
    expect(adminRoute).toContain("Reassign those guests");
  });
});
