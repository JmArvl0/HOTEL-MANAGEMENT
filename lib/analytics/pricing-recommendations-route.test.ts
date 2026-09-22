import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const getRoute = readFileSync("app/api/analytics/pricing-recommendations/route.ts", "utf8");
const proposeRoute = readFileSync("app/api/analytics/pricing-recommendations/propose/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20261018010000_predictive_dynamic_pricing.sql", "utf8");

describe("predictive pricing API and governance contract", () => {
  it("limits recommendation reads to Manager, Owner, and Admin", () => {
    expect(getRoute).toContain('new Set(["manager", "owner", "admin"])');
    expect(getRoute).toContain("403");
  });

  it("limits proposals to Manager and uses the governed analytics wrapper", () => {
    expect(proposeRoute).toContain('c.role !== "manager"');
    expect(proposeRoute).toContain('rpc("manager_propose_analytics_rate_plans"');
    expect(proposeRoute).not.toContain('.from("room_rate_plans").insert');
  });

  it("keeps proposals pending and never updates live/base rates", () => {
    expect(migration).toContain("manager_propose_room_rate_plan(");
    expect(migration).toContain("created_from_analytics = true");
    expect(migration).toContain("'pending'");
    expect(migration).not.toMatch(/update\s+room_types\s+set\s+base_rate/i);
    expect(migration).not.toMatch(/status\s*=\s*'active'/i);
  });

  it("records the originating model run in both the proposal and audit history", () => {
    expect(migration).toContain("analytics_model_run_id");
    expect(migration).toContain("propose_analytics_room_rate_plan");
    expect(migration).toContain("'modelRunId'");
  });
});
