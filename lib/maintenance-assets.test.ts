// Roadmap Phase 8 — preventive maintenance foundation. Pure due-window math
// plus source-scan contracts pinning the phase's hard rules: the due schedule
// is DERIVED in the database (generated column), the registry starts empty
// (no fake assets are ever seeded), and a due service NEVER blocks a room —
// no code path in the migration, routes, or UI touches room state.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { assetDueWindow, daysUntil } from "./maintenance-assets";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("due-window math", () => {
  it("counts whole days between YYYY-MM-DD dates (negative = overdue)", () => {
    expect(daysUntil("2026-10-01", "2026-10-01")).toBe(0);
    expect(daysUntil("2026-10-01", "2026-10-08")).toBe(7);
    expect(daysUntil("2026-10-01", "2026-09-27")).toBe(-4);
  });

  it("buckets assets into the card groups by due date, never by guesswork", () => {
    expect(assetDueWindow({ next_service_date: "2026-09-27" }, "2026-10-01")).toBe("overdue");
    expect(assetDueWindow({ next_service_date: "2026-10-01" }, "2026-10-01")).toBe("due_7"); // due today is this week
    expect(assetDueWindow({ next_service_date: "2026-10-08" }, "2026-10-01")).toBe("due_7");
    expect(assetDueWindow({ next_service_date: "2026-10-31" }, "2026-10-01")).toBe("due_30");
    expect(assetDueWindow({ next_service_date: "2026-12-01" }, "2026-10-01")).toBe("scheduled");
    expect(assetDueWindow({ next_service_date: null }, "2026-10-01")).toBe("unscheduled"); // no history = no due date
  });
});

describe("migration contract (20260932010000_maintenance_assets.sql)", () => {
  const sql = read("supabase/migrations/20260932010000_maintenance_assets.sql");

  it("derives next_service_date as a stored generated column from last service + interval", () => {
    expect(sql).toContain("next_service_date date generated always as (last_serviced_at + service_interval_days) stored");
  });

  it("seeds nothing — the only insert is the register RPC's parameterized one (no literal rows)", () => {
    // Exactly one INSERT INTO maintenance_assets exists, and its VALUES clause
    // writes caller-supplied parameters — a seed block would be extra inserts
    // or literal values.
    expect(sql.match(/insert\s+into\s+maintenance_assets/gi)).toHaveLength(1);
    expect(sql).toMatch(/insert\s+into\s+maintenance_assets[\s\S]*?values\(\s*trim\(p_name/i);
  });

  it("never touches rooms — a due service cannot block or unblock anything", () => {
    expect(sql).not.toMatch(/update\s+(public\.)?rooms/i);
    expect(sql).not.toMatch(/room_is_sellable|housekeeping_restore_room_state|maintenance_restore_room_state/i);
  });

  it("enables RLS with no policies, and every RPC is service-role-only with a null-safe actor guard", () => {
    expect(sql).toContain("alter table public.maintenance_assets enable row level security");
    expect(sql).not.toMatch(/create policy/i);
    expect(sql.match(/if actor is null or actor not in\(/g)).toHaveLength(4); // role set itself is tightened by 20260933010000
    expect(sql).toMatch(/revoke execute on function public\.maintenance_register_asset[\s\S]*from anon,authenticated/);
    expect(sql).toContain("grant execute on function public.maintenance_register_asset");
    expect(sql).toContain("maintenance_deactivate_asset(uuid,uuid,text) to service_role");
  });

  it("keeps Owner/Admin out of departmental execution — the guard is maintenance/manager only", () => {
    const followUp = read("supabase/migrations/20260933010000_maintenance_asset_roles.sql");
    // The tightening migration is the live body; the original 20260932010000
    // text is historical. The live guard set must not include owner/admin.
    expect(followUp).not.toContain("'owner'");
    expect(followUp).not.toContain("'admin'");
    expect(followUp.match(/not in\('maintenance','manager'\)/g)).toHaveLength(4);
  });

  it("audits every registry action", () => {
    for (const action of ["maintenance_register_asset", "maintenance_record_asset_service", "maintenance_update_asset", "maintenance_deactivate_asset"]) {
      expect(sql).toContain(`'${action}'`);
    }
  });
});

describe("route contracts", () => {
  const list = read("app/api/maintenance/assets/route.ts");
  const actions = read("app/api/maintenance/assets/[id]/[action]/route.ts");

  it("gates the registry to maintenance and manager — Owner/Admin supervise, never operate", () => {
    expect(list).toMatch(/\["maintenance",\s*"manager"\]/);
    expect(actions).toMatch(/\["maintenance",\s*"manager"\]/);
    expect(list).not.toContain('"owner"');
    expect(list).not.toContain('"admin"');
    expect(actions).not.toContain('"owner"');
    expect(actions).not.toContain('"admin"');
    expect(list).toContain("Asset registry access required.");
    expect(actions).toContain("Asset registry access required.");
  });

  it("every mutation runs through its audited RPC — no direct table writes, no room writes", () => {
    for (const rpc of ["maintenance_register_asset", "maintenance_record_asset_service", "maintenance_update_asset", "maintenance_deactivate_asset"]) {
      expect(list + actions).toContain(`"${rpc}"`);
    }
    expect(list + actions).not.toMatch(/from\("maintenance_assets"\)\.(insert|update|delete)/);
    expect(list + actions).not.toMatch(/from\("rooms"\)\.(insert|update|delete)/); // rooms are read-only lookups
  });

  it("rejects future service dates and resolves staff-typed rooms to ids", () => {
    expect(list).toContain("cannot be in the future");
    expect(actions).toContain("cannot be in the future");
    expect(list).toMatch(/from\("rooms"\)\.select\("id"\)\.or\(/);
  });
});

describe("surface contract (manager-dashboard-client.tsx)", () => {
  const ui = read("components/manager/manager-dashboard-client.tsx");

  it("renders the due-window card group with an explicit no-auto-block disclosure", () => {
    expect(ui).toContain("Preventive maintenance");
    expect(ui).toContain("Register asset");
    expect(ui).toContain("a room is never blocked because a service is due");
    expect(ui).toContain("ASSET_DUE_WINDOWS.map"); // groups come from the shared window list
    expect(ui).toContain("Record service");
  });

  it("states the empty registry honestly instead of showing sample equipment", () => {
    expect(ui).toContain("No assets registered yet");
    expect(ui).toContain("no sample assets are created");
  });
});
