import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The three correctness fixes from the 2026-09-23 standards audit live in SECURITY
// DEFINER bodies, so the contract is pinned against the migration source: the
// modification reprice must preserve posted folio charges (never rewrite the invoice),
// the early check-in window must honor the requested arrival time, and retired rooms
// must be unassignable at the desk.
const migration = readFileSync("supabase/migrations/20260926010000_approval_execution_fixes.sql", "utf8");
const assignRoute = readFileSync("app/api/front-desk/reservations/[id]/assign/route.ts", "utf8");

describe("reservation modification preserves the folio", () => {
  it("reprices the room component only and settles through sync_invoice_financials", () => {
    // New amount = target rate x new nights + every posted folio charge.
    expect(migration).toContain("coalesce((select sum(amount)from folio_charges where reservation_id=r.id),0)into new_total");
    expect(migration).toContain("update invoices set amount=new_total where id=i.id;perform sync_invoice_financials(i.id)");
    // The old rewrite (amount replaced AND balance/status recomputed in place) is gone.
    expect(migration).not.toContain("balance=greatest(new_total-new_paid,0)");
  });
});

describe("early check-in honors the requested arrival time", () => {
  it("approves through requestedTime on the check-in date, with the 8h window as fallback", () => {
    expect(migration).toContain("(a.requested_action->>'requestedTime')");
    expect(migration).toMatch(/early_check_in_approved_until=\(\(r\.check_in::text\|\|' '\|\|\(a\.requested_action->>'requestedTime'\)\)/);
    // Legacy/unparseable requests, and requests whose time already passed, keep a usable window.
    expect(migration).toContain("now()+interval'8 hours'");
  });
});

describe("retired rooms are unassignable at the desk", () => {
  it("assign_room raises ROOM_INACTIVE and the route explains it", () => {
    expect(migration).toContain("if not coalesce(room.administratively_active,true)then raise exception'ROOM_INACTIVE';end if;");
    expect(assignRoute).toContain('ROOM_INACTIVE:"That room is administratively retired."');
  });
});
