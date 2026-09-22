// Roadmap Phase 9 — commercial-readiness contracts.
//
// 9A (payments): REVERSED 2026-10-16 — the hotel selected a real provider — GCash/bank reference + proof +
// human verification. No "Pay online" UI may ever appear, and no payment
// provider abstraction is created unless it deletes code (it wouldn't — it
// doesn't exist).
// 9B (OTA): three nullable provenance columns exist on reservations and
// NOTHING in the app reads or writes them — an integration that doesn't exist
// cannot pretend to exist.
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

function filesBelow(directory: string): string[] {
  return readdirSync(join(process.cwd(), directory)).flatMap((name) => {
    const path = join(directory, name);
    return statSync(join(process.cwd(), path)).isDirectory() ? filesBelow(path) : path.endsWith(".ts") || path.endsWith(".tsx") ? [path] : [];
  });
}

describe("9B — OTA-readiness columns (migration 20260934010000)", () => {
  const sql = read("supabase/migrations/20260934010000_ota_readiness.sql");

  it("adds exactly three nullable provenance columns plus one lookup index", () => {
    expect(sql).toContain("add column if not exists external_channel text");
    expect(sql).toContain("add column if not exists external_reference text");
    expect(sql).toContain("add column if not exists external_synced_at timestamptz");
    expect(sql).toContain("reservations_external_reference_idx");
  });

  it("ships no sync machinery — no functions, triggers, policies, or seeds", () => {
    expect(sql).not.toMatch(/create (or replace )?(function|trigger|policy)/i);
    expect(sql).not.toMatch(/insert into/i);
  });

  it("has no consumer anywhere in the app — no sync code, no UI, no fake integration", () => {
    for (const path of [...filesBelow("app"), ...filesBelow("components"), ...filesBelow("lib")]) {
      if (path.includes("ota-readiness.test")) continue;
      expect(read(path), path).not.toMatch(/external_channel|external_reference|external_synced_at/);
    }
  });
});

describe("9A — gateway is real, manual GCash stays as fallback", () => { it("verifies webhook HMAC before any DB read", () => { expect(read("app/api/webhooks/payments/route.ts")).toContain("verifyWebhookSignature"); }); it("keeps manual GCash as the new-booking deposit method", () => { const booking = read("lib/booking.ts"); expect(booking).toContain('paymentMethod: z.literal("manual_gcash")'); }); it("tells guests the truth on the manual path", () => { expect(read("components/booking/payment-method-selector.tsx")).toContain("verify it before your booking is"); }); it("confirms gateway money only through the audited RPC", () => { expect(read("lib/gateway-store.ts")).toContain("confirm_gateway_payment"); }); });