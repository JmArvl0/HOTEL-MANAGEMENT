import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
describe("migration contract (20260931010000_deposit_sla.sql)", () => {
  const sql = read("supabase/migrations/20260931010000_deposit_sla.sql");

  it("adds the governed column with a 0–72 check and default 4", () => {
    expect(sql).toMatch(/add column deposit_sla_hours integer not null default 4/);
    expect(sql).toMatch(/check \(deposit_sla_hours between 0 and 72\)/);
  });

  it("exposes depositSlaHours through the policy snapshot", () => {
    expect(sql).toMatch(/'depositSlaHours',deposit_sla_hours/);
  });

  it("admin update takes p_deposit_sla_hours, validates 0–72, and stamps the audit", () => {
    expect(sql).toMatch(/p_deposit_sla_hours integer/);
    expect(sql).toMatch(/p_deposit_sla_hours is null or p_deposit_sla_hours not between 0 and 72/);
    expect(sql).toMatch(/deposit_sla_hours=p_deposit_sla_hours/);
    expect(sql).toMatch(/'depositSlaHours',p_deposit_sla_hours/);
  });

  it("drops the stale 17-param overload so only one signature exists", () => {
    expect(sql).toMatch(/drop function if exists public\.admin_update_operational_policy\(text,time,time,time,boolean,integer,integer,integer,integer,integer,boolean,boolean,integer,integer,text,integer,uuid\)/);
    // the new 18-param signature is revoked from public/anon/authenticated and granted to service_role
    const signature = "admin_update_operational_policy(text,time,time,time,boolean,integer,integer,integer,integer,integer,boolean,boolean,integer,integer,integer,text,integer,uuid)";
    expect(sql).toContain(`revoke all on function public.${signature}from public,anon,authenticated`);
    expect(sql).toContain(`revoke execute on function public.${signature}from anon,authenticated`);
    expect(sql).toContain(`grant execute on function public.current_operational_policy_snapshot(),public.${signature}to service_role`);
  });
});

describe("surface contracts", () => {
  it("the policy route validates depositSlaHours 0–72 and passes it to the RPC", () => {
    const route = read("app/api/admin/policy/route.ts");
    expect(route).toMatch(/depositSlaHours:z\.coerce\.number\(\)\.int\(\)\.min\(0\)\.max\(72\)/);
    expect(route).toMatch(/p_deposit_sla_hours:v\.depositSlaHours/);
  });

  it("both governance forms carry the historical SLA through policy updates", () => {
    for (const path of ["components/owner/owner-dashboard-client.tsx", "components/admin/admin-dashboard-client.tsx"]) {
      const source = read(path);
      expect(source).toMatch(/deposit_sla_hours\s*\?\?\s*4/);
      expect(source).toMatch(/depositSlaHours: Number\(item\.deposit_sla_hours \?\? 4\)/);
      expect(source).not.toContain('key: "depositSla"');
    }
  });
});
