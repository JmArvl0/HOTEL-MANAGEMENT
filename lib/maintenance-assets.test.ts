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
  const linked = read("app/api/maintenance/asset-work/route.ts");

  it("gates the registry to maintenance and manager — Owner/Admin supervise, never operate", () => {
    expect(list).toMatch(/\["maintenance",\s*"manager"\]/);
    expect(actions).toContain('role === "maintenance" || role === "manager"');
    expect(list).not.toContain('"owner"');
    expect(list).not.toContain('"admin"');
    expect(actions).not.toContain('"owner"');
    expect(actions).not.toContain('"admin"');
    expect(list).toContain("Asset registry access required.");
    expect(actions).toContain("Equipment history access required.");
  });

  it("keeps only the audited linked service mutation", () => {
    for (const rpc of ["maintenance_register_asset", "maintenance_record_asset_service", "maintenance_apply_asset_change"]) {
      expect(list + actions + linked).not.toContain(`"${rpc}"`);
    }
    expect(linked).toContain('rpc("record_linked_asset_service"');
    expect(list + actions + linked).not.toMatch(/from\("(?:maintenance_assets|rooms)"\)\.(insert|update|delete)/);
  });
});

describe("surface contract (manager-dashboard-client.tsx)", () => {
  const ui = read("components/manager/manager-dashboard-client.tsx");

  it("keeps linked maintenance history on the Hotel work-order page", () => {
    expect(ui).toContain("<PreventiveWorkPanel");
    expect(ui).not.toContain("Register asset");
    const panel = read("components/manager/preventive-work-panel.tsx");
    expect(panel).toContain("Record linked service");
    expect(panel).not.toContain('action: "create"');
  });
});
