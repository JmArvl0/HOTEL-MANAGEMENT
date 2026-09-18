import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Request-a-Change redesign contracts: one complete modal, authoritative
// availability, server-side duplicate protection, approval routes to Manager
// while Front Desk executes, and exactly-once customer notification.
const read = (path: string) => readFileSync(path, "utf8");
const route = read("app/api/account/reservations/[id]/change-request/route.ts");
const roomOptions = read("app/api/account/reservations/[id]/room-options/route.ts");
const actions = read("components/customer/reservation-actions.tsx");
const detailView = read("components/customer/reservation-detail-view.tsx");
const detailPage = read("app/(booking)/(customer)/my-reservations/[id]/page.tsx");
const rpc = read("supabase/migrations/20260929010000_room_rate_plans.sql");
const notifyMigration = read("supabase/migrations/20261007010000_change_request_notifications.sql");
const notificationsLib = read("lib/notifications.ts");

describe("single complete modal", () => {
  it("collects dates, room type, and required reason in one dialog", () => {
    expect(actions).toContain('title="Request a reservation change"');
    expect(actions).toContain('type="date"');
    expect(actions).toContain("HavenSelect");
    expect(actions).toContain("<textarea");
    expect(actions).toContain("Submit change request");
  });
  it("has no second reason step (change flow stays one modal; cancel is its own one modal)", () => {
    expect(actions).not.toContain("changeStep");
    // Change modal + cancel modal, each self-contained. The old
    // PromptDialog+ConfirmDialog cancel pair is gone (see cancel-reservation tests).
    expect(actions.match(/<Modal\s/g)?.length).toBe(2);
    expect(actions).not.toContain("PromptDialog");
    expect(actions).not.toContain("ConfirmDialog");
  });
  it("keeps the reason a plain textarea with no dropdown affordance", () => {
    expect(actions).toContain('id="change-reason"');
    expect(actions).not.toContain("change-reason-chevron");
    expect(actions).not.toMatch(/reason.*Chevron|Chevron.*reason/i);
  });
  it("shows a current-stay summary and required markers on date fields", () => {
    expect(actions).toContain("Current stay:");
    expect(actions).toContain("Requested check-in");
    expect(actions).toContain("Requested check-out");
  });
  it("states explicitly when no alternative room types exist", () => {
    expect(actions).toContain("No alternative room types are available for these dates.");
  });
  it("requires the reason client-side and server-side with the same floor", () => {
    expect(actions).toContain("trimmedReason.length < 3");
    expect(route).toContain("reason: z.string().trim().min(3).max(500)");
    expect(rpc).toContain("nullif(trim(p_reason),'')is null");
  });
});

describe("authoritative room-type availability", () => {
  it("serves options from the booking inventory engine, not a hardcoded list", () => {
    expect(roomOptions).toContain("getAvailability");
    expect(roomOptions).not.toMatch(/"(Garden|Deluxe|Ocean|Executive)/);
  });
  it("projects name and units only and hides unavailable types", () => {
    expect(roomOptions).toContain("availableUnits");
    expect(roomOptions).toMatch(/availableUnits > 0/);
    expect(roomOptions).not.toContain("base_rate");
    expect(roomOptions).not.toContain("photo");
  });
  it("stays ownership-scoped to the requesting guest", () => {
    expect(roomOptions).toContain('.eq("user_id", session.user.id)');
  });
  it("lets a date-only change through by keeping the current type selectable", () => {
    expect(actions).toContain("Keep current room type");
  });
});

describe("one unresolved request per reservation", () => {
  it("blocks creation server-side on pending or approved rows", () => {
    expect(rpc).toContain("status in('pending','approved')");
    expect(rpc).toContain("CHANGE_ALREADY_OPEN");
    expect(route).toContain("CHANGE_ALREADY_OPEN");
    expect(route).toContain('"A reservation change is already awaiting review or execution."');
  });
  it("serializes concurrent submissions on the reservation row lock", () => {
    expect(rpc).toContain("where id=p_reservation_id and user_id=p_user_id for update");
  });
  it("replays the same idempotency key instead of inserting twice", () => {
    expect(rpc).toContain("where idempotency_key=p_idempotency_key");
  });
  it("replaces the action button with a non-action pending state", () => {
    expect(actions).toContain("Change request under review");
    expect(actions).toContain("aria-disabled");
  });
  it("derives the pending state from unresolved statuses only", () => {
    expect(detailView).toContain('["pending", "approved"]');
  });
});

describe("approval authorizes, Front Desk executes", () => {
  // Scope to the customer function body: the same migration file also holds
  // the Front Desk executor, so file-level assertions would prove nothing.
  const customerFn = rpc.slice(
    rpc.indexOf("create or replace function public.customer_request_reservation_change("),
    rpc.indexOf("-- front_desk_execute_manager_approval:")
  );
  it("routes near-term changes into the Manager approval engine", () => {
    expect(customerFn).toContain("insert into manager_approval_requests");
    expect(customerFn).toContain("'reservation_modification'");
  });
  it("never approves its own request — it only files pending rows", () => {
    expect(customerFn).toContain("then'executed'else'pending'end");
    expect(customerFn).not.toContain("review_manager_approval");
  });
  it("preserves the self-service path past the modification window", () => {
    expect(rpc).toContain("selfServiceModificationDays");
    expect(rpc).toContain("'executed'");
  });
  it("keeps the transport restriction with its Front Desk message", () => {
    expect(rpc).toContain("TRANSPORT_REQUIRES_STAFF");
    expect(route).toContain("TRANSPORT_REQUIRES_STAFF");
    expect(route).toContain("message Front Desk");
  });
});

describe("exactly-once customer notification", () => {
  it("adds a dedicated notification type with a per-request dedupe index", () => {
    expect(notifyMigration).toContain("reservation_change_submitted");
    expect(notifyMigration).toContain("notifications_change_submitted_once");
    expect(notificationsLib).toContain("reservation_change_submitted");
  });
  it("records the bell entry after success without ever failing the response", () => {
    expect(route).toContain("notifyWithOptionalEmail");
    expect(route).toContain("reservation_change_submitted");
  });
  it("maps internal states to customer language without renaming them", () => {
    expect(detailView).toContain("Under review");
    expect(detailView).toContain("Approved — preparing your update");
    expect(detailView).toContain("Change request declined");
    expect(rpc).not.toContain("Under review");
  });
  it("passes the requested stay through to the status panel", () => {
    expect(detailPage).toContain("requested_check_in");
    expect(detailPage).toContain("requested_room_type");
    expect(detailView).toContain("crd-change-status");
  });
});
