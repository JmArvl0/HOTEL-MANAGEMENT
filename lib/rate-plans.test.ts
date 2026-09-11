import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DAY_LABELS,
  EVERY_DAY,
  daysBitmask,
  daysLabel,
  fromRate,
  nightlyRates,
  parseFrozenRates,
  stayTotal,
  uniformRate,
  type RatePlan,
} from "@/lib/rate-plans";

// The TS mirror of the `room_nightly_rates` SQL resolver (migration
// 20260929010000). The RPC is the pricing authority; these tests pin the
// mirror's priority rule, the roadmap's worked example (Friday ₱6,400 +
// Saturday ₱7,200 + Sunday ₱6,400 = ₱20,000), and the helpers the booking
// search/catalog/detail surfaces rely on.

const BASE = 6400; // Deluxe King base rate
const OCT = "2026-10-"; // Oct 2 2026 = Friday, Oct 3 = Saturday, Oct 4 = Sunday

const plan = (over: Partial<RatePlan> & Pick<RatePlan, "id" | "start_date" | "end_date" | "nightly_rate">): RatePlan => ({
  room_type_id: "type-1",
  name: "Test plan",
  days_of_week: EVERY_DAY,
  status: "active",
  ...over,
});

describe("days-of-week bitmask helpers", () => {
  it("maps labels to bits and back to labels", () => {
    expect(DAY_LABELS).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(daysBitmask(["Mon"])).toBe(1);
    expect(daysBitmask(["Sun"])).toBe(64);
    expect(daysBitmask(["Fri", "Sat"])).toBe(48);
    expect(daysBitmask(DAY_LABELS)).toBe(EVERY_DAY);
    expect(daysLabel(127)).toBe("Every day");
    expect(daysLabel(31)).toBe("Weekdays");
    expect(daysLabel(96)).toBe("Weekends");
    expect(daysLabel(1)).toBe("Mon");
    expect(daysLabel(0)).toBe("No days");
  });
});

describe("nightlyRates resolver mirror", () => {
  it("prices the roadmap example: Fri 6400 + Sat 7200 + Sun 6400 = 20000, never 6400 x 3", () => {
    const weekend = plan({ id: "p1", start_date: `${OCT}01`, end_date: `${OCT}31`, nightly_rate: 7200, days_of_week: daysBitmask(["Sat"]) });
    const rates = nightlyRates(BASE, [weekend], `${OCT}02`, `${OCT}05`);
    expect(rates).toEqual([
      { date: `${OCT}02`, rate: 6400 },
      { date: `${OCT}03`, rate: 7200 },
      { date: `${OCT}04`, rate: 6400 },
    ]);
    expect(stayTotal(rates)).toBe(20000);
    expect(uniformRate(rates)).toBeNull();
  });

  it("falls back to base_rate when no plan matches", () => {
    const rates = nightlyRates(BASE, [], `${OCT}02`, `${OCT}05`);
    expect(rates).toHaveLength(3);
    expect(rates.every((night) => night.rate === 6400)).toBe(true);
    expect(stayTotal(rates)).toBe(19200);
    expect(uniformRate(rates)).toBe(6400);
  });

  it("ignores plans on nights their days-of-week does not cover", () => {
    const weekdays = plan({ id: "p1", start_date: `${OCT}01`, end_date: `${OCT}31`, nightly_rate: 5000, days_of_week: daysBitmask(["Mon", "Tue", "Wed", "Thu", "Fri"]) });
    const rates = nightlyRates(BASE, [weekdays], `${OCT}02`, `${OCT}05`);
    expect(rates.map((night) => night.rate)).toEqual([5000, 6400, 6400]); // Sat + Sun stay base
  });

  it("prefers the narrowest date range on overlap (specific dated override wins)", () => {
    const seasonal = plan({ id: "wide", start_date: `${OCT}01`, end_date: `${OCT}31`, nightly_rate: 7500 });
    const holiday = plan({ id: "narrow", start_date: `${OCT}03`, end_date: `${OCT}03`, nightly_rate: 9000 });
    const rates = nightlyRates(BASE, [seasonal, holiday], `${OCT}02`, `${OCT}05`);
    expect(rates.map((night) => night.rate)).toEqual([7500, 9000, 7500]);
  });

  it("breaks equal-width ties on decided_at desc, then id desc — never input order", () => {
    const a = plan({ id: "aaa", start_date: `${OCT}01`, end_date: `${OCT}31`, nightly_rate: 7000, decided_at: "2026-09-28T10:00:00Z" });
    const b = plan({ id: "zzz", start_date: `${OCT}01`, end_date: `${OCT}31`, nightly_rate: 8000, decided_at: "2026-09-29T10:00:00Z" });
    expect(nightlyRates(BASE, [a, b], `${OCT}02`, `${OCT}03`)[0].rate).toBe(8000); // later decision wins
    expect(nightlyRates(BASE, [b, a], `${OCT}02`, `${OCT}03`)[0].rate).toBe(8000); // order-independent
    a.decided_at = b.decided_at;
    expect(nightlyRates(BASE, [a, b], `${OCT}02`, `${OCT}03`)[0].rate).toBe(8000); // larger id wins
  });

  it("never prices a pending, rejected, or retired plan", () => {
    const plans = (["pending", "rejected", "retired"] as const).map((status, i) =>
      plan({ id: `p${i}`, start_date: `${OCT}01`, end_date: `${OCT}31`, nightly_rate: 9999, status }));
    expect(nightlyRates(BASE, plans, `${OCT}02`, `${OCT}05`).every((night) => night.rate === 6400)).toBe(true);
  });

  it("handles an open-ended-looking same-day window and an inverted window", () => {
    expect(nightlyRates(BASE, [], `${OCT}02`, `${OCT}02`)).toEqual([]); // zero nights
    expect(nightlyRates(BASE, [], `${OCT}05`, `${OCT}02`)).toEqual([]); // check-out before check-in
  });
});

describe("totals and display helpers", () => {
  it("sums centavo-exactly where naive float addition drifts", () => {
    expect(stayTotal([{ date: "d1", rate: 333.33 }, { date: "d2", rate: 333.33 }, { date: "d3", rate: 333.33 }])).toBe(999.99);
  });

  it("keeps a uniform figure only when every night prices the same", () => {
    expect(uniformRate([])).toBeNull();
    expect(uniformRate([{ date: "d1", rate: 100 }])).toBe(100);
    expect(uniformRate([{ date: "d1", rate: 100 }, { date: "d2", rate: 100 }])).toBe(100);
    expect(uniformRate([{ date: "d1", rate: 100 }, { date: "d2", rate: 120 }])).toBeNull();
  });

  it("shows the lowest night as the catalog From-rate, ignoring inactive plans", () => {
    expect(fromRate(6400, [plan({ id: "p1", start_date: `${OCT}01`, end_date: `${OCT}31`, nightly_rate: 5000 })])).toBe(5000);
    expect(fromRate(6400, [plan({ id: "p1", start_date: `${OCT}01`, end_date: `${OCT}31`, nightly_rate: 5000, status: "pending" })])).toBe(6400);
    expect(fromRate(6400, [plan({ id: "p1", start_date: `${OCT}01`, end_date: `${OCT}31`, nightly_rate: 9000 })])).toBe(6400);
  });

  it("parses frozen breakdowns and drops junk entries; legacy null is empty", () => {
    expect(parseFrozenRates(null)).toEqual([]);
    expect(parseFrozenRates(undefined)).toEqual([]);
    expect(parseFrozenRates("nope")).toEqual([]);
    expect(parseFrozenRates([{ date: "2026-10-02", rate: 6400 }, { date: "2026-10-03", rate: "7200" }, { rate: 1 }, { date: "", rate: 1 }, "junk", null])).toEqual([
      { date: "2026-10-02", rate: 6400 },
      { date: "2026-10-03", rate: 7200 },
    ]);
  });
});

// The SQL contract — pinned against the migration source the same way
// lib/tax-documents.test.ts pins its migration.
const migration = readFileSync("supabase/migrations/20260929010000_room_rate_plans.sql", "utf8");

describe("migration 20260929010000 contract", () => {
  it("creates the rate plan registry with the documented constraints", () => {
    expect(migration).toContain("create table if not exists public.room_rate_plans");
    expect(migration).toContain("days_of_week integer not null default 127");
    expect(migration).toContain("nightly_rate numeric(12,2) not null check (nightly_rate >= 0)");
    expect(migration).toContain("check (status in ('pending','active','rejected','retired'))");
    expect(migration).toContain("constraint room_rate_plans_sane_days check (days_of_week between 1 and 127)");
    // One open (pending or active) plan per (room type, name).
    expect(migration).toContain("create unique index if not exists room_rate_plans_one_open");
    expect(migration).toContain("where (status in ('pending','active'))");
    expect(migration).toContain("revoke all on public.room_rate_plans from public, anon, authenticated");
    expect(migration).toContain("grant all on public.room_rate_plans to service_role");
  });

  it("adds the freeze columns so later plan changes never reprice a booking", () => {
    expect(migration).toContain("alter table public.booking_holds add column if not exists nightly_rates jsonb");
    expect(migration).toContain("alter table public.reservations add column if not exists nightly_rates jsonb");
  });

  it("defines the ONE resolver with the documented deterministic priority", () => {
    expect(migration).toContain("create or replace function public.room_nightly_rates(p_room_type text, p_from date, p_to date)");
    expect(migration).toContain("security definer");
    // Narrowest range first, then decided_at desc, then id desc — never DB order.
    expect(migration).toContain("order by (p.end_date - p.start_date) asc, p.decided_at desc nulls last, p.id desc");
    expect(migration).toContain("and p.status = 'active'");
  });

  it("routes every pricing site through the resolver and freezes the breakdown", () => {
    // Hold creation prices per night and freezes the breakdown + a display rate
    // only when uniform.
    expect(migration).toContain("case when count(distinct rate)=1 then min(rate)else null end");
    expect(migration).toContain("nightly_rates,expires_at)");
    // Deposit submission compares the recomputed per-night SUM (not a single rate)
    // against the frozen hold subtotal.
    expect(migration).toContain("if round((select coalesce(sum(rate),0)from room_nightly_rates(h.room_type,h.check_in,h.check_out)),2)<>round(h.subtotal,2)then raise exception'RATE_CHANGED';end if;");
    expect(migration).toContain("h.nightly_rates)returning id into rid");
    // Extension prices the added nights and appends them to the frozen breakdown.
    expect(migration).toContain("nightly_rates=coalesce(nightly_rates,'[]'::jsonb)||v_rates");
    // Approval stamps carry the full breakdown with a nullable uniform rate.
    expect(migration).toContain("'nightlyRates',v_nightly");
  });

  it("keeps the propose → approve → retire governance with null-safe authority guards", () => {
    expect(migration).toContain("create or replace function public.manager_propose_room_rate_plan");
    expect(migration).toContain("if actor is null or actor <> 'manager' then raise exception 'MANAGER_AUTHORITY_REQUIRED'; end if;");
    expect(migration).toContain("create or replace function public.admin_review_room_rate_plan");
    expect(migration).toContain("if actor is null or actor not in ('owner', 'admin') then raise exception 'ADMIN_AUTHORITY_REQUIRED'; end if;");
    expect(migration).toContain("create or replace function public.manager_retire_room_rate_plan");
    expect(migration).toContain("if actor is null or actor not in ('manager', 'owner', 'admin') then raise exception 'RATE_PLAN_AUTHORITY_REQUIRED'; end if;");
    // Approving a plan never touches base_rate — plans are additive overlays.
    expect(migration).not.toMatch(/update\s+room_types\s+set\s+base_rate/i);
  });

  it("revokes every RPC from public/anon/authenticated and grants service_role only", () => {
    const functions = [
      "room_nightly_rates(text, date, date)",
      "manager_propose_room_rate_plan(uuid, text, date, date, integer, numeric, text, uuid)",
      "admin_review_room_rate_plan(uuid, text, text, uuid)",
      "manager_retire_room_rate_plan(uuid, text, uuid)",
      "create_booking_hold(uuid, text, date, date, integer, text, text, text, text, text, text, text, text, jsonb, jsonb, jsonb)",
      "submit_reservation_deposit(uuid, uuid, text, text, text, text, text, integer)",
      "front_desk_create_reservation(text, text, text, text, date, date, integer, text, text, text, uuid, uuid)",
      "front_desk_extend_stay(text, date, text, uuid, uuid)",
      "front_desk_extend_stay_preview(text, date, uuid)",
      "customer_request_reservation_change(uuid, text, date, date, text, integer, text, text, uuid)",
      "front_desk_execute_manager_approval(uuid, text, uuid)",
      "request_manager_approval(text, text, text, text, uuid, text, text, text, jsonb, uuid)",
    ];
    for (const name of functions) {
      expect(migration).toContain(`revoke all on function public.${name} from public, anon, authenticated`);
      expect(migration).toContain(`grant execute on function public.${name} to service_role`);
    }
  });
});
