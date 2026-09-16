// Pre-arrival governance + surface-independence contracts: the in-stay catalog
// keeps working exactly as before, and only the Manager touches the
// booking/inventory linkage.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const patchRoute = readFileSync("app/api/catalog/request-types/[id]/route.ts", "utf8");
const getRoute = readFileSync("app/api/catalog/request-types/route.ts", "utf8");
const portalCatalog = readFileSync("lib/request-catalog.ts", "utf8");
const holdsRoute = readFileSync("app/api/booking/holds/route.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20261005010000_pre_arrival_inventory_requests.sql",
  "utf8"
);

describe("pre-arrival governance", () => {
  it("gates the inventory linkage on the Manager role alone", () => {
    expect(patchRoute).toContain("canConfigurePreArrival(c.role)");
    expect(patchRoute).toContain("Pre-arrival request configuration requires Manager authority.");
    // Generic catalog administration keeps its existing roles — only the two
    // new keys take the stricter path.
    expect(patchRoute).toContain("guardCatalog()");
    expect(patchRoute).toContain('"inventory_item_id", "pre_arrival_requestable"');
  });

  it("exposes the new columns for the Manager panel without changing POST", () => {
    expect(getRoute).toContain("inventory_item_id,pre_arrival_requestable");
    expect(patchRoute).toContain("inventory_item_id,pre_arrival_requestable,created_at");
  });
});

describe("in-stay independence", () => {
  it("leaves the portal catalog reader on active rows only", () => {
    expect(portalCatalog).not.toContain("pre_arrival");
    expect(portalCatalog).not.toContain("inventory");
  });

  it("never redefines the in-stay routing function", () => {
    expect(migration).not.toContain("create or replace function public.guest_request_route");
  });

  it("keeps deactivation as the shared kill-switch while enablement stays separate", () => {
    expect(migration).toContain("pre_arrival_requestable boolean not null default false");
  });
});

describe("submit-time revalidation wiring", () => {
  it("rechecks the live offering in the holds route before the RPC", () => {
    expect(holdsRoute).toContain("findUnavailableSelections(p.requestOptions,live)");
    expect(holdsRoute).toContain("PRE_ARRIVAL_UNAVAILABLE_MESSAGE");
    expect(holdsRoute.indexOf("getPreArrivalOptions()")).toBeLessThan(holdsRoute.indexOf("create_booking_hold"));
  });
});
