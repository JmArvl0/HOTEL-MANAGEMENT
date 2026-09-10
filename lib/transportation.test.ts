import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canCancelTransportation, canOperateTransportation, canViewTransportation } from "@/lib/permissions";
import { transportationPreferencesSchema } from "@/lib/booking";
import { isDateWithinStay, transportationRequestSchema } from "@/lib/transportation";
import { canTransition, CUSTOMER_CANCELLABLE_STATUSES, isAssignmentVisible, isCustomerCancellable, isTerminalStatus, TRANSPORTATION_TRANSITIONS } from "@/lib/transportation-display";

const migration = readFileSync("supabase/migrations/20260905010000_transportation_requests.sql", "utf8");
const checkoutMigration = readFileSync("supabase/migrations/20260906010000_transportation_at_checkout.sql", "utf8");
const fareMigration = readFileSync("supabase/migrations/20260910010000_transportation_folio_charge.sql", "utf8");
const stayWindowMigration = readFileSync("supabase/migrations/20260911010000_transportation_stay_window.sql", "utf8");
const customerRequestForm = readFileSync("components/customer/transportation-request-form.tsx", "utf8");
const customerSubmitRoute = readFileSync("app/api/account/transportation/route.ts", "utf8");
const customerCancelRoute = readFileSync("app/api/account/transportation/[id]/cancel/route.ts", "utf8");
const staffListRoute = readFileSync("app/api/transportation/route.ts", "utf8");
const staffTransitionRoute = readFileSync("app/api/transportation/[id]/transition/route.ts", "utf8");
const managerPanel = readFileSync("components/manager/transportation-panel.tsx", "utf8");
const managerTheme = readFileSync("app/manager-dashboard-theme.css", "utf8");
const customerList = readFileSync("components/customer/transportation-request-list.tsx", "utf8");
const holdsRoute = readFileSync("app/api/booking/holds/route.ts", "utf8");
const guestDetailsForm = readFileSync("components/booking/guest-details-form.tsx", "utf8");
const envExample = readFileSync(".env.example", "utf8");
const permissions = readFileSync("lib/permissions.ts", "utf8");

// Recursive file walk for the standalone (no external API) sweep.
const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  return entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".next" ? walk(path) : entry.isFile() ? [path] : [];
});

describe("transportation migration — server-side enforcement", () => {
  it("guards roles NULL-safely (inactive actor can never pass)", () => {
    expect(migration).toContain("if actor is null or actor<>'guest' then raise exception'CUSTOMER_ACCESS_REQUIRED'");
    expect(migration).toContain("if actor is null or actor not in('front_desk','manager') then raise exception'TRANSPORTATION_AUTHORITY_REQUIRED'");
  });
  it("enforces reservation ownership server-side", () => {
    expect(migration).toContain("where id=p_reservation_id and user_id=p_user_id for update");
    expect(migration).toContain("join reservations r on r.id=tr.reservation_id where tr.id=p_request_id and r.user_id=p_user_id for update of tr");
  });
  it("allows requests only for confirmed or in-house stays", () => {
    expect(migration).toContain("if r.status not in('confirmed','checked_in') then raise exception'RESERVATION_NOT_REQUEST_READY'");
  });
  it("validates the full state machine with no skipping", () => {
    expect(migration).toContain("when'REVIEW'then allowed_from:=array['REQUESTED']");
    expect(migration).toContain("when'SCHEDULE'then allowed_from:=array['REVIEWED']");
    expect(migration).toContain("when'ASSIGN'then allowed_from:=array['SCHEDULED']");
    expect(migration).toContain("when'START'then allowed_from:=array['ASSIGNED']");
    expect(migration).toContain("when'COMPLETE'then allowed_from:=array['IN_PROGRESS']");
    expect(migration).toContain("if not(t.status=any(allowed_from)) then raise exception'TRANSPORTATION_TRANSITION_INVALID'");
  });
  it("limits the Manager to CANCEL/REJECT — Front Desk executes", () => {
    expect(migration).toContain("if p_action in('REVIEW','SCHEDULE','ASSIGN','START','COMPLETE') and actor<>'front_desk' then raise exception'TRANSPORTATION_AUTHORITY_REQUIRED'");
  });
  it("requires a reason to cancel or reject", () => {
    expect(migration).toContain("if p_action in('CANCEL','REJECT') and v_reason is null then raise exception'TRANSPORTATION_REASON_REQUIRED'");
  });
  it("uses optimistic concurrency (version + STALE) and row locks", () => {
    expect(migration.match(/version<>p_expected_version/g)).toHaveLength(2);
    expect(migration).toContain("for update");
    expect(migration).toContain("'TRANSPORTATION_REQUEST_STALE'");
  });
  it("prevents duplicates: partial unique index on active requests + idempotency key", () => {
    expect(migration).toContain("create unique index if not exists transportation_requests_active_unique");
    expect(migration).toContain("where status in('REQUESTED','REVIEWED','SCHEDULED','ASSIGNED','IN_PROGRESS')");
    expect(migration).toContain("idempotency_key uuid not null unique");
  });
  it("requires complete return details for ROUND_TRIP", () => {
    expect(migration).toContain("check(service_type<>'ROUND_TRIP' or (return_location is not null and return_date is not null and return_time is not null))");
  });
  it("locks the table and functions down to the service role", () => {
    expect(migration).toContain("revoke all on table public.transportation_requests from public,anon,authenticated");
    expect(migration).toContain("revoke all on function public.customer_submit_transportation_request");
    expect(migration).toContain("grant execute on function public.customer_submit_transportation_request");
    expect(migration).toContain("to service_role");
  });
  it("is additive and keeps history — no drops, no deletes", () => {
    expect(migration).toContain("create table if not exists public.transportation_requests");
    expect(migration).toContain("on delete restrict");
    expect(migration).not.toMatch(/drop\s+(table|function|column)/i);
    expect(migration).not.toMatch(/delete\s+from/i);
  });
});

describe("transportation fare on the folio (charged at assignment)", () => {
  it("adds fare columns additively and never drops or deletes", () => {
    expect(fareMigration).toContain("add column if not exists fare_amount numeric(12,2)");
    expect(fareMigration).toContain("add column if not exists fare_posted_at timestamptz");
    expect(fareMigration).not.toMatch(/drop\s+(table|column)/i);
    expect(fareMigration).not.toMatch(/delete\s+from/i);
  });
  it("requires a vehicle at ASSIGN and derives the fare from its flat rate, x2 for round trips", () => {
    expect(fareMigration).toContain("if v_vehicle is null then raise exception'INVALID_VEHICLE_TYPE'");
    expect(fareMigration).toContain("v_fare:=round((v_vt.base_fare+v_vt.booking_fee)*(case t.service_type when'ROUND_TRIP'then 2 else 1 end),2)");
  });
  it("posts exactly one 'transportation' folio charge with a deterministic idempotency key", () => {
    expect(fareMigration).toContain("md5(t.id||'|transport-fare')::uuid");
    expect(fareMigration).toContain("'transportation',v_fare");
    expect(fareMigration).toContain("if not exists(select 1 from folio_charges where idempotency_key=v_fare_key)then");
  });
  it("grows the invoice and mirrors post_folio_charge's status math", () => {
    expect(fareMigration).toContain("update invoices set amount=amount+v_fare,balance=balance+v_fare,status=case when paid>0 then'partial'else'unpaid'end");
    expect(fareMigration).toContain("update reservations set payment_status=case when deposit>0 then'partial'else'unpaid'end");
    expect(fareMigration).toContain("if v_res.status not in('confirmed','checked_in')then raise exception'TRANSPORTATION_RESERVATION_NOT_READY'");
  });
  it("keeps the recreated RPC service-role only", () => {
    expect(fareMigration).toContain("revoke all on function public.staff_transition_transportation_request(uuid,text,jsonb,uuid,integer) from public,anon,authenticated");
    expect(fareMigration).toContain("grant execute on function public.staff_transition_transportation_request(uuid,text,jsonb,uuid,integer) to service_role");
  });
  it("staff UI requires the vehicle type, shows the fare, and surfaces it once posted", () => {
    expect(managerPanel).toContain("Choose a vehicle type — its fare is charged to the guest folio.");
    expect(managerPanel).toContain("type.base_fare + type.booking_fee");
    expect(managerPanel).toContain("fare_amount: number | null");
    expect(staffListRoute).toContain("fare_amount");
    expect(staffTransitionRoute).toContain("TRANSPORTATION_RESERVATION_NOT_READY");
    expect(customerList).toContain("added to your stay folio");
  });
});

describe("transportation workspace layout", () => {
  it("separates the KPI summary from the filter controls", () => {
    expect(managerTheme).toContain(".tp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:16px}");
  });
});

describe("transportation stay-window enforcement", () => {
  it("accepts both boundary dates and rejects dates outside the stay", () => {
    expect(isDateWithinStay("2026-09-06", "2026-09-06", "2026-09-08")).toBe(true);
    expect(isDateWithinStay("2026-09-08", "2026-09-06", "2026-09-08")).toBe(true);
    expect(isDateWithinStay("2026-09-05", "2026-09-06", "2026-09-08")).toBe(false);
    expect(isDateWithinStay("2026-09-09", "2026-09-06", "2026-09-08")).toBe(false);
  });
  it("binds both native calendars to the selected reservation", () => {
    expect(customerRequestForm).toContain('min={stayStart} max={stayEnd}');
    expect(customerRequestForm).toContain('min={pickupDate || stayStart} max={stayEnd}');
    expect(customerRequestForm).toContain('setSelectedReservationId(event.target.value)');
  });
  it("guards inserts and updates in the database without rewriting existing rows", () => {
    expect(stayWindowMigration).toContain("before insert or update of reservation_id, pickup_date, return_date");
    expect(stayWindowMigration).toContain("new.pickup_date < v_check_in");
    expect(stayWindowMigration).toContain("new.return_date > v_check_out");
    expect(stayWindowMigration).not.toMatch(/delete\s+from|truncate\s+|drop\s+table/i);
  });
  it("checks the owning stay in the API before invoking the RPC", () => {
    expect(customerSubmitRoute).toContain('.eq("user_id",session.user.id)');
    expect(customerSubmitRoute).toContain("isDateWithinStay(p.pickupDate");
    expect(customerSubmitRoute).toContain("TRANSPORTATION_OUTSIDE_STAY_WINDOW");
  });
});

describe("transportation routes", () => {
  it("customer routes are guest-only and call the owning RPCs", () => {
    for (const route of [customerSubmitRoute, customerCancelRoute]) {
      expect(route).toContain('session.user.role!=="guest"');
      expect(route).toContain('NextResponse.json({error:"Customer access required."},{status:403})');
    }
    expect(customerSubmitRoute).toContain('"customer_submit_transportation_request"');
    expect(customerSubmitRoute).toContain('RESERVATION_NOT_FOUND');
    expect(customerSubmitRoute).toContain('TRANSPORTATION_REQUEST_DUPLICATE');
    expect(customerCancelRoute).toContain('"customer_cancel_transportation_request"');
    expect(customerCancelRoute).toContain('CANCELLATION_NOT_PERMITTED');
  });
  it("staff routes gate visibility and limit operation to Front Desk", () => {
    expect(staffListRoute).toContain("canViewTransportation");
    expect(staffListRoute).toContain("guardTransportation");
    expect(staffTransitionRoute).toContain("if((OPERATIONAL as readonly string[]).includes(action)&&!canOperateTransportation(context.role))");
    expect(staffTransitionRoute).toContain("if((action===\"CANCEL\"||action===\"REJECT\")&&!details.reason)");
    expect(staffTransitionRoute).toContain('"staff_transition_transportation_request"');
    expect(permissions).toContain("canOperateTransportation");
    expect(permissions).toContain("canCancelTransportation");
    expect(permissions).toContain("canViewTransportation");
  });
});

describe("transportation is standalone — no external transport APIs", () => {
  it("ships no TomTom config or transfer checkout code", () => {
    expect(envExample).not.toContain("TOMTOM_API_KEY");
    expect(existsSync("app/api/booking/transfer")).toBe(false);
    expect(existsSync("lib/transfer.ts")).toBe(false);
    const offenders = ["app", "lib", "components"].flatMap((dir) => walk(dir)).filter((path) => !path.endsWith(".test.ts") && /api\.tomtom\.com|TOMTOM_API_KEY/.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});

describe("transportation display rules (pure)", () => {
  it("allows exactly the linear path plus cancel/reject", () => {
    expect(TRANSPORTATION_TRANSITIONS.REVIEW).toEqual({ from: ["REQUESTED"], to: "REVIEWED" });
    expect(TRANSPORTATION_TRANSITIONS.COMPLETE).toEqual({ from: ["IN_PROGRESS"], to: "COMPLETED" });
    expect(canTransition("REQUESTED", "REVIEW")).toBe(true);
    expect(canTransition("REQUESTED", "ASSIGN")).toBe(false);
    expect(canTransition("SCHEDULED", "COMPLETE")).toBe(false);
    for (const status of ["COMPLETED", "CANCELLED", "REJECTED"]) {
      expect(isTerminalStatus(status)).toBe(true);
      for (const action of Object.keys(TRANSPORTATION_TRANSITIONS)) expect(canTransition(status, action as keyof typeof TRANSPORTATION_TRANSITIONS)).toBe(false);
    }
  });
  it("lets guests self-cancel only before the hotel commits resources", () => {
    expect([...CUSTOMER_CANCELLABLE_STATUSES]).toEqual(["REQUESTED", "REVIEWED"]);
    expect(isCustomerCancellable("REVIEWED")).toBe(true);
    expect(isCustomerCancellable("SCHEDULED")).toBe(false);
    expect(isAssignmentVisible("ASSIGNED")).toBe(true);
    expect(isAssignmentVisible("REVIEWED")).toBe(false);
  });
});

describe("transportation request schema (service-type conditionals)", () => {
  const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const later = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  const base = { reservationId: "res-1", pickupDate: future, pickupTime: "14:30", passengerCount: 2, idempotencyKey: "00000000-0000-4000-8000-000000000001" };
  it("PICKUP needs only the pickup side", () => {
    expect(transportationRequestSchema.safeParse({ ...base, serviceType: "PICKUP", pickupLocation: "NAIA Terminal 3, Pasay" }).success).toBe(true);
    expect(transportationRequestSchema.safeParse({ ...base, serviceType: "PICKUP" }).success).toBe(false);
  });
  it("DROPOFF needs only the destination", () => {
    expect(transportationRequestSchema.safeParse({ ...base, serviceType: "DROPOFF", dropoffLocation: "Clark Airport, Pampanga" }).success).toBe(true);
    expect(transportationRequestSchema.safeParse({ ...base, serviceType: "DROPOFF" }).success).toBe(false);
  });
  it("ROUND_TRIP needs complete return details on or after the pickup", () => {
    const ride = { pickupLocation: "NAIA Terminal 3, Pasay", returnLocation: "Hotel lobby" };
    expect(transportationRequestSchema.safeParse({ ...base, serviceType: "ROUND_TRIP", ...ride, returnDate: later, returnTime: "09:00" }).success).toBe(true);
    expect(transportationRequestSchema.safeParse({ ...base, serviceType: "ROUND_TRIP", ...ride }).success).toBe(false);
    expect(transportationRequestSchema.safeParse({ ...base, serviceType: "ROUND_TRIP", ...ride, returnDate: "2020-01-01", returnTime: "09:00" }).success).toBe(false);
  });
  it("caps passengers at 20 and refuses past pickup dates", () => {
    expect(transportationRequestSchema.safeParse({ ...base, serviceType: "PICKUP", pickupLocation: "NAIA Terminal 3, Pasay", passengerCount: 21 }).success).toBe(false);
    expect(transportationRequestSchema.safeParse({ ...base, serviceType: "PICKUP", pickupLocation: "NAIA Terminal 3, Pasay", pickupDate: "2020-01-01" }).success).toBe(false);
  });
});

describe("transportation at checkout (deferred filing, mirrors guest_requests)", () => {
  it("adds preference columns additively", () => {
    expect(checkoutMigration).toContain("alter table public.booking_holds add column if not exists transportation_preferences jsonb");
    expect(checkoutMigration).toContain("alter table public.reservations add column if not exists transportation_preferences jsonb");
    expect(checkoutMigration).not.toMatch(/drop\s+(table|column)/i);
  });
  it("validates preferences strictly in create_booking_hold and re-grants the 16-arg overload", () => {
    expect(checkoutMigration).toContain("raise exception 'INVALID_TRANSPORTATION_PREFERENCES'");
    expect(checkoutMigration).toContain("if v_pickup_date<p_check_in or v_pickup_date>p_check_out");
    expect(checkoutMigration).toContain("grant execute on function public.create_booking_hold(uuid,text,date,date,integer,text,text,text,text,text,text,text,text,jsonb,jsonb,jsonb)");
    expect(checkoutMigration).not.toContain("drop function if exists public.submit_reservation_deposit");
  });
  it("carries preferences hold -> reservation in submit_reservation_deposit", () => {
    expect(checkoutMigration).toContain("h.transportation_preferences");
  });
  it("files exactly once, never raising inside the confirmation transaction", () => {
    expect(checkoutMigration).toContain("md5(r.id||'|transportation')::uuid");
    expect(checkoutMigration).toContain("file_booking_transportation_skipped");
    expect(checkoutMigration).toContain("exception when unique_violation then");
    expect(checkoutMigration).toContain("exception when others then");
  });
  it("fills the hotel side from policy and wires a second confirm trigger", () => {
    expect(checkoutMigration).toContain("into hotel_label from hotel_operational_policies where key='default'");
    expect(checkoutMigration).toContain("create trigger file_booking_transportation_on_confirm after insert or update of status on public.reservations");
    expect(checkoutMigration).toContain("perform public.file_booking_transportation_request(new.id)");
  });
  it("holds route passes preferences and maps the validation error to 400", () => {
    expect(holdsRoute).toContain("p_transportation_preferences:p.transportationPreferences??null");
    expect(holdsRoute).toContain('INVALID_TRANSPORTATION_PREFERENCES');
    expect(holdsRoute).toContain('{status:400}');
  });
  it("checkout form offers the opt-in and posts preferences only when requested", () => {
    expect(guestDetailsForm).toContain("Need a ride?");
    expect(guestDetailsForm).toContain("...(needRide ? { transportationPreferences: {");
    expect(guestDetailsForm).toContain("SERVICE_OPTIONS.map((option)");
  });
});

describe("transportation preferences schema (checkout conditionals)", () => {
  const inStay = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const later = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
  const base = { pickupDate: inStay, pickupTime: "14:30", passengerCount: 2 };
  it("PICKUP needs only the pickup side", () => {
    expect(transportationPreferencesSchema.safeParse({ ...base, serviceType: "PICKUP", pickupLocation: "NAIA Terminal 3, Pasay" }).success).toBe(true);
    expect(transportationPreferencesSchema.safeParse({ ...base, serviceType: "PICKUP" }).success).toBe(false);
  });
  it("DROPOFF needs only the destination", () => {
    expect(transportationPreferencesSchema.safeParse({ ...base, serviceType: "DROPOFF", dropoffLocation: "Clark Airport, Pampanga" }).success).toBe(true);
    expect(transportationPreferencesSchema.safeParse({ ...base, serviceType: "DROPOFF" }).success).toBe(false);
  });
  it("ROUND_TRIP needs complete return details on or after the pickup", () => {
    const ride = { pickupLocation: "NAIA Terminal 3, Pasay", returnLocation: "Hotel lobby" };
    expect(transportationPreferencesSchema.safeParse({ ...base, serviceType: "ROUND_TRIP", ...ride, returnDate: later, returnTime: "09:00" }).success).toBe(true);
    expect(transportationPreferencesSchema.safeParse({ ...base, serviceType: "ROUND_TRIP", ...ride }).success).toBe(false);
    expect(transportationPreferencesSchema.safeParse({ ...base, serviceType: "ROUND_TRIP", ...ride, returnDate: "2020-01-01", returnTime: "09:00" }).success).toBe(false);
  });
  it("caps passengers at 20", () => {
    expect(transportationPreferencesSchema.safeParse({ ...base, serviceType: "PICKUP", pickupLocation: "NAIA Terminal 3, Pasay", passengerCount: 21 }).success).toBe(false);
  });
});
describe("transportation permissions", () => {
  it("gives Front Desk operation, Manager cancel/reject, Owner read, others nothing", () => {
    expect(canOperateTransportation("front_desk")).toBe(true);
    expect(canOperateTransportation("manager")).toBe(false);
    expect(canCancelTransportation("front_desk")).toBe(true);
    expect(canCancelTransportation("manager")).toBe(true);
    expect(canCancelTransportation("owner")).toBe(false);
    for (const role of ["owner", "front_desk", "manager"] as const) expect(canViewTransportation(role)).toBe(true);
    for (const role of ["housekeeping", "maintenance", "accounting", "guest", "admin"] as const) {
      expect(canViewTransportation(role)).toBe(false);
      expect(canOperateTransportation(role)).toBe(false);
      expect(canCancelTransportation(role)).toBe(false);
    }
  });
});
