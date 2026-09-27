import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { migrationStatus, pendingMigrations } from "@/lib/system-health";

describe("migrationStatus", () => {
  it("flags remote_behind when fewer migrations are applied than exist locally", () => {
    expect(migrationStatus(52, 53)).toBe("remote_behind");
  });

  it("reports in_sync when the ledger matches or exceeds local files", () => {
    expect(migrationStatus(53, 53)).toBe("in_sync");
    expect(migrationStatus(54, 53)).toBe("in_sync");
  });

  it("reports unknown when the local file count is unavailable", () => {
    expect(migrationStatus(53, null)).toBe("unknown");
  });
});

describe("pendingMigrations", () => {
  it("returns local files missing from the ledger, by version", () => {
    const local = [
      { version: "20260923010000", name: "stay_extension_exception", appliedAt: null },
      { version: "20261017010000", name: "express_checkin", appliedAt: null },
    ];
    expect(pendingMigrations(local, [{ version: "20260923010000", name: "stay_extension_exception", appliedAt: null }])).toEqual([
      { version: "20261017010000", name: "express_checkin", appliedAt: null },
    ]);
    expect(pendingMigrations(local, local)).toEqual([]);
  });
});

describe("migration apply-log contract (20261024010000 + fixes)", () => {
  const dir = (file: string) => readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8");
  const sql = dir("20261024010000_migration_apply_log.sql");

  it("tracks first-seen dates with backfilled approximation", () => {
    expect(sql).toContain("create table if not exists public.migration_apply_log");
    expect(sql).toMatch(/approximate boolean not null default false/);
    expect(sql).toMatch(/on conflict \(version\) do nothing/);
    // Return shape changes, so the old signature is dropped first.
    expect(sql).toMatch(/drop function if exists public\.admin_read_migration_ledger\(\)/);
    expect(sql).toMatch(/returns table\(version text, name text, applied_at timestamptz, approximate boolean\)/);
    expect(sql).toContain("grant execute on function public.admin_read_migration_ledger() to service_role");
  });

  it("the upsert avoids the OUT-parameter ambiguity (42702)", () => {
    // ON CONFLICT (version) parses as an expression and collides with the
    // OUT parameter — the final statement uses a qualified NOT EXISTS insert.
    const fixed = dir("20261024030000_migration_ledger_upsert.sql");
    const body = fixed.slice(fixed.indexOf("begin"));
    expect(body).not.toMatch(/on conflict/i);
    expect(body).toMatch(/where not exists/);
    expect(body).toMatch(/seen\.version = src\.version/);
  });

  it("the admin data route maps ledger dates and audit actors without secret columns", () => {
    const route = readFileSync(join(process.cwd(), "app/api/admin/data/route.ts"), "utf8");
    expect(route).toMatch(/applied_at/);
    expect(route).toMatch(/user_id/);
    expect(route).toMatch(/System Administrator/);
    expect(route).not.toMatch(/password_hash|private_key|secret_text/i);
  });
});
