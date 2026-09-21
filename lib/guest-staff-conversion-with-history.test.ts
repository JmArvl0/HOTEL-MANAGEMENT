import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20261013010000_guest_to_staff_with_history.sql");
const base =
  read("supabase/migrations/20261012010000_guest_to_staff_conversion.sql") +
  read("supabase/migrations/20261012020000_guest_to_staff_conversion_input_hardening.sql");
const actions = read("app/api/admin/users/[id]/action/route.ts");
const adminGuard = read("lib/admin-route.ts");
const dashboard = read("components/admin/admin-dashboard-client.tsx");
const customerAuth = read("lib/customer-auth.ts");

describe("history-carrying guest-to-staff conversion (D-024)", () => {
  it("is a separate owner-only RPC that keeps every onboarding guarantee of the base converter", () => {
    expect(migration).toContain("admin_convert_guest_to_staff_with_history");
    expect(migration).toContain("actor<>'owner'");
    expect(migration).toContain("OWNER_AUTHORITY_REQUIRED");
    expect(migration).toContain("lower(t.email)<>lower(trim(p_expected_email))");
    expect(migration).toContain("t.role<>'guest'");
    expect(migration).toContain("password_hash='recovery-required'");
    expect(migration).toContain("recovery_required=true");
    expect(migration).toContain("active=false");
    expect(migration).toContain("auth_version=auth_version+1");
    expect(migration).toContain("update auth_otp_challenges set invalidated_at=now()");
    expect(migration).toContain("insert into account_recovery_tokens");
    expect(migration).toContain("insert into staff");
  });

  it("censuses carried history into audit instead of gating on it, and never rewrites business rows", () => {
    expect(migration).toContain("convertedWithHistory");
    expect(migration).toContain("holdsCarried");
    expect(migration).toContain("reservationsCarried");
    expect(migration).toContain("converted_with_guest_history");
    expect(migration).not.toContain("GUEST_BUSINESS_HISTORY_CONFLICT");
    for (const table of ["reservations", "booking_holds", "payments", "refund_requests", "audit_logs", "notifications"]) {
      expect(migration).not.toMatch(new RegExp(`(?:delete\\s+from|update)\\s+(?:public\\.)?${table}\\b`, "i"));
    }
  });

  it("leaves the base converter and the generic role RPC untouched", () => {
    expect(base).toContain("GUEST_BUSINESS_HISTORY_CONFLICT");
    expect(base).toContain("(t.role='guest')<>(p_role='guest')");
    expect(base).not.toContain("admin_convert_guest_to_staff_with_history");
    expect(base).not.toContain("converted_with_guest_history");
  });

  it("is reachable only through the guarded Admin convert action with an explicit flag", () => {
    expect(actions).toContain("withHistory:z.boolean().optional()");
    expect(actions).toContain("admin_convert_guest_to_staff_with_history");
    expect(adminGuard).toContain("OWNER_AUTHORITY_REQUIRED");
    expect(dashboard).toContain("withHistory");
    expect(dashboard).toContain("payload.withHistory=Boolean(data.withHistory)");
  });

  it("cannot leak guest workflows to converted staff: customer routes still require the guest role", () => {
    expect(customerAuth).toContain('session.user.role!=="guest"');
  });

  it("is service-role-only like every other governance RPC", () => {
    expect(migration).toContain(
      "grant execute on function public.admin_convert_guest_to_staff_with_history(uuid,text,text,text,text,text,integer,text,timestamptz,uuid) to service_role"
    );
    expect(migration).toContain("from public,anon,authenticated");
  });
});
