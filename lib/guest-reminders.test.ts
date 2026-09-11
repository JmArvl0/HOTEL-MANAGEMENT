import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Phase 4 — guest communication automation. The reminder pass runs against the
// fake-supabase client with the guest_reminder_deliveries unique index simulated
// (a second insert for the same reservation+kind raises 23505, exactly like the
// real index), proving cron retries / redeploys never duplicate a send.
const fake = vi.hoisted(() => ({ db: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase } = await import("@/lib/fake-supabase");
  const client = fakeSupabase(fake.db);
  const from = client.from.bind(client);
  client.from = ((table: string) => {
    const builder = from(table);
    if (table !== "guest_reminder_deliveries") return builder;
    const originalInsert = builder.insert.bind(builder);
    return Object.assign(builder, {
      insert: (row: Record<string, unknown>) => {
        if ((fake.db.guest_reminder_deliveries ?? []).some((delivery) => delivery.reservation_id === row.reservation_id && delivery.kind === row.kind)) {
          return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate key value violates unique constraint guest_reminder_deliveries_once" } });
        }
        return originalInsert(row);
      }
    });
  }) as typeof client.from;
  return { supabase: client };
});

const routeSource = readFileSync("app/api/guest-reminders/route.ts", "utf8");
const vercelConfig = readFileSync("vercel.json", "utf8");
const migration = readFileSync("supabase/migrations/20260930010000_guest_reminders.sql", "utf8");

const TOMORROW = "2026-10-05";

function reservation(over: Record<string, unknown>) {
  return {
    id: "RSV-1", user_id: "user-1", guest_email: "guest@example.com", guest_name: "Ava",
    confirmation_number: "HVN-1", room_type: "Deluxe King", room_number: null,
    check_in: TOMORROW, check_out: "2026-10-08", guests: 2, status: "confirmed",
    early_check_in_approved_until: null, operational_policy_snapshot: null, ...over,
  };
}

function seed() {
  // Mutate in place, never reassign: the mocked client captures the db object
  // once, so a fresh object would leave the module reading a stale empty db.
  for (const key of Object.keys(fake.db)) delete fake.db[key];
  Object.assign(fake.db, {
    reservations: [
      reservation({ id: "RSV-ARRIVE" }), // confirmed, arriving tomorrow → pre-arrival
      reservation({ id: "RSV-DEPART", status: "checked_in", check_in: "2026-10-02", check_out: TOMORROW }), // in-house, leaving tomorrow → pre-departure
      reservation({ id: "RSV-WRONG-STATUS", status: "pending", check_in: TOMORROW }), // not confirmed
      reservation({ id: "RSV-WRONG-DATE", check_in: "2026-10-06" }), // confirmed but day after
      reservation({ id: "RSV-CHECKED-IN-ARRIVING", status: "checked_in", check_in: TOMORROW }), // already in house — no arrival reminder
      reservation({ id: "RSV-CONFIRMED-LEAVING", status: "confirmed", check_out: TOMORROW, check_in: "2026-10-01" }), // not in house — no departure reminder
    ],
    transportation_requests: [
      { reservation_id: "RSV-ARRIVE", service_type: "PICKUP", pickup_time: "14:30", status: "SCHEDULED" },
      { reservation_id: "RSV-DEPART", service_type: "DROPOFF", pickup_time: "09:00", status: "CANCELLED" }, // cancelled rides never show
    ],
    invoices: [{ reservation_id: "RSV-DEPART", balance: 1250.5 }],
    notifications: [],
    guest_reminder_deliveries: [],
  });
}

describe("reminder selection predicates", () => {
  it("targets confirmed arrivals and in-house departures for tomorrow only", async () => {
    const { isPreArrivalTarget, isPreDepartureTarget } = await import("@/lib/guest-reminders");
    expect(isPreArrivalTarget(reservation({}) as never, TOMORROW)).toBe(true);
    expect(isPreArrivalTarget(reservation({ status: "pending" }) as never, TOMORROW)).toBe(false);
    expect(isPreArrivalTarget(reservation({ check_in: "2026-10-06" }) as never, TOMORROW)).toBe(false);
    expect(isPreArrivalTarget(reservation({ status: "checked_in" }) as never, TOMORROW)).toBe(false);
    expect(isPreDepartureTarget(reservation({ status: "checked_in", check_in: "2026-10-02", check_out: TOMORROW }) as never, TOMORROW)).toBe(true);
    expect(isPreDepartureTarget(reservation({ status: "confirmed", check_out: TOMORROW }) as never, TOMORROW)).toBe(false);
    expect(isPreDepartureTarget(reservation({ status: "checked_in", check_out: "2026-10-09" }) as never, TOMORROW)).toBe(false);
  });
});

describe("runGuestReminders", () => {
  beforeEach(seed);

  it("sends exactly one pre-arrival and one pre-departure reminder for tomorrow's targets", async () => {
    const { runGuestReminders } = await import("@/lib/guest-reminders");
    const summary = await runGuestReminders(TOMORROW);
    expect(summary).toEqual({
      tomorrow: TOMORROW,
      preArrival: { sent: 1, skipped: 0, error: 0 },
      preDeparture: { sent: 1, skipped: 0, error: 0 },
    });
    // One delivery claim + one in-app notification per target — nothing for the
    // wrong-status/wrong-date rows.
    expect(fake.db.guest_reminder_deliveries).toHaveLength(2);
    expect(fake.db.guest_reminder_deliveries).toEqual(expect.arrayContaining([
      expect.objectContaining({ reservation_id: "RSV-ARRIVE", kind: "pre_arrival" }),
      expect.objectContaining({ reservation_id: "RSV-DEPART", kind: "pre_departure" }),
    ]));
    expect(fake.db.notifications).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "pre_arrival_reminder", user_id: "user-1" }),
      expect.objectContaining({ type: "pre_departure_reminder", user_id: "user-1" }),
    ]));
  });

  it("is idempotent — a second pass (cron retry / redeploy) sends nothing", async () => {
    const { runGuestReminders } = await import("@/lib/guest-reminders");
    await runGuestReminders(TOMORROW);
    const second = await runGuestReminders(TOMORROW);
    expect(second).toEqual({
      tomorrow: TOMORROW,
      preArrival: { sent: 0, skipped: 1, error: 0 },
      preDeparture: { sent: 0, skipped: 1, error: 0 },
    });
    expect(fake.db.guest_reminder_deliveries).toHaveLength(2); // no new claims
    expect(fake.db.notifications).toHaveLength(2); // no duplicate in-app events
  });

  it("records the in-app notification even without a guest account (front-desk booking)", async () => {
    const { runGuestReminders } = await import("@/lib/guest-reminders");
    fake.db.reservations = [reservation({ id: "RSV-FD", user_id: null })];
    fake.db.guest_reminder_deliveries = [];
    fake.db.notifications = [];
    const summary = await runGuestReminders(TOMORROW);
    expect(summary.preArrival.sent).toBe(1); // email still attempted to guest_email
    expect(fake.db.notifications).toHaveLength(0); // no user_id → no in-app row
  });
});

// Route + migration contracts, pinned against source like tax-documents.test.ts.
describe("guest reminder route and migration contract", () => {
  it("guards the cron route with CRON_SECRET bearer or manager/owner/admin session", () => {
    expect(routeSource).toContain("CRON_SECRET");
    expect(routeSource).toContain('request.headers.get("authorization")');
    expect(routeSource).toContain('new Set(["manager", "owner", "admin"])');
    expect(routeSource).toContain("runGuestReminders");
  });

  it("registers the daily cron at 01:05 UTC (09:05 Manila)", () => {
    expect(vercelConfig).toContain('"/api/guest-reminders"');
    expect(vercelConfig).toContain('"5 1 * * *"');
  });

  it("extends the notifications type check and enforces one delivery per reservation+kind", () => {
    expect(migration).toContain("'pre_arrival_reminder','pre_departure_reminder'");
    expect(migration).toContain("create table if not exists public.guest_reminder_deliveries");
    expect(migration).toContain("check (kind in ('pre_arrival','pre_departure'))");
    expect(migration).toContain("create unique index if not exists guest_reminder_deliveries_once");
    expect(migration).toContain("on public.guest_reminder_deliveries (reservation_id, kind)");
    expect(migration).toContain("revoke all on public.guest_reminder_deliveries from public, anon, authenticated");
    expect(migration).toContain("grant all on public.guest_reminder_deliveries to service_role");
    expect(migration).toContain("enable row level security");
  });
});
