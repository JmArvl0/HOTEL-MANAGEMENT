// Roadmap Phase 5 — deposit-verification SLA visibility. Pure aging/banding
// helpers plus source-scan contracts for the migration (governed column, snapshot
// key, single admin signature after the stale-overload drop, revoke/grant footer)
// and the surfaces that render it. VISIBILITY ONLY: nothing here decides anything.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  depositAgeBand, depositAgeMinutes, depositSlaSummary, formatDepositAge,
  DEFAULT_DEPOSIT_SLA_HOURS, DEPOSIT_ATTENTION_MINUTES,
} from "./deposit-sla";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString();

describe("deposit aging bands", () => {
  it("normal under an hour, attention at an hour, breach at the SLA threshold", () => {
    expect(depositAgeBand(minutesAgo(30), 4)).toBe("normal");
    expect(depositAgeBand(minutesAgo(DEPOSIT_ATTENTION_MINUTES), 4)).toBe("attention");
    expect(depositAgeBand(minutesAgo(240), 4)).toBe("breach"); // exactly 4h → breach
    expect(depositAgeBand(minutesAgo(240 - 1), 4)).toBe("attention");
  });

  it("sla 0 disables the breach band (attention still applies)", () => {
    expect(depositAgeBand(minutesAgo(10000), 0)).toBe("attention");
  });

  it("missing or future timestamps never age into a band", () => {
    expect(depositAgeBand(null, 4)).toBe("normal");
    expect(depositAgeBand(undefined, 4)).toBe("normal");
    expect(depositAgeMinutes(new Date(Date.now() + 60000).toISOString())).toBe(0);
  });

  it("formats ages as minutes under an hour and h/mm beyond", () => {
    expect(formatDepositAge(30)).toBe("30m");
    expect(formatDepositAge(45.4)).toBe("45m");
    expect(formatDepositAge(125)).toBe("2h 05m");
  });

  it("summarizes oldest age and past-SLA count, empty-safe", () => {
    expect(depositSlaSummary([], 4)).toEqual({ oldestMinutes: 0, pastSla: 0 });
    expect(depositSlaSummary([30, 90, 300], 4)).toEqual({ oldestMinutes: 300, pastSla: 1 });
    expect(depositSlaSummary([30, 90, 300], 0)).toEqual({ oldestMinutes: 300, pastSla: 0 }); // SLA off
    expect(DEFAULT_DEPOSIT_SLA_HOURS).toBe(4);
  });
});

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

  it("both governance dialogs edit the SLA and send depositSlaHours", () => {
    for (const path of ["components/owner/owner-dashboard-client.tsx", "components/admin/admin-dashboard-client.tsx"]) {
      const source = read(path);
      expect(source).toMatch(/deposit_sla_hours\s*\?\?\s*4/);
      expect(source).toMatch(/depositSlaHours: ?Number\(data\.depositSla\)/);
    }
  });

  it("getDashboard computes aging metrics and a breach bell alert for Accounting only", () => {
    const data = read("lib/data.ts");
    expect(data).toMatch(/deposit_sla_hours/);
    expect(data).toMatch(/oldestPendingVerificationMinutes/);
    expect(data).toMatch(/pendingPastSla/);
    expect(data).toMatch(/Deposit verification past SLA/);
    expect(data).toMatch(/const pendingAges=refundRole\?/); // accounting-gated
  });

  it("the queue renders aging chips from the shared band helper, never deciding anything", () => {
    const ui = read("components/manager/manager-dashboard-client.tsx");
    expect(ui).toMatch(/badge sla-\$\{band\}/);
    expect(ui).toMatch(/depositAgeBand\(item\.submitted_at,depositSlaHours\)/);
    expect(ui).not.toMatch(/Past SLA[^"']*auto/i);
  });
});
