import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20261012010000_guest_to_staff_conversion.sql")+read("supabase/migrations/20261012020000_guest_to_staff_conversion_input_hardening.sql");
const actions = read("app/api/admin/users/[id]/action/route.ts");
const adminGuard = read("lib/admin-route.ts");
const dashboard = read("components/admin/admin-dashboard-client.tsx");

describe("guest-to-staff conversion governance", () => {
  it("requires exact account identity, an eligible guest, and no booking or financial history", () => {
    expect(migration).toContain("admin_convert_guest_to_staff");
    expect(migration).toContain("lower(t.email)<>lower(trim(p_expected_email))");
    expect(migration).toContain("nullif(trim(p_expected_email),'') is null");
    expect(migration).toContain("p_expected_version is null");
    expect(migration).toContain("ACCOUNT_IDENTITY_MISMATCH");
    expect(migration).toContain("t.role<>'guest'");
    expect(migration).toContain("ACCOUNT_NOT_GUEST");
    expect(migration).toContain("GUEST_BUSINESS_HISTORY_CONFLICT");
    expect(migration).toContain("from booking_holds");
    expect(migration).toContain("from reservations");
    expect(migration).toContain("join guests g on g.id=r.guest_id");
  });

  it("preserves protected-role boundaries and prevents the generic role RPC from crossing guest/staff", () => {
    expect(migration).toContain("when actor='owner'");
    expect(migration).toContain("PROTECTED_ROLE_FORBIDDEN");
    expect(migration).toContain("not coalesce(allowed,false)");
    expect(migration).toContain("ROLE_CONVERSION_REQUIRED");
    expect(migration).toContain("(t.role='guest')<>(p_role='guest')");
  });

  it("creates the staff mirror and forces secure recovery while invalidating sessions and OTP", () => {
    expect(migration).toContain("insert into staff");
    expect(migration).toContain("password_hash='recovery-required'");
    expect(migration).toContain("recovery_required=true");
    expect(migration).toContain("account_status='inactive'");
    expect(migration).toContain("active=false");
    expect(migration).toContain("auth_version=auth_version+1");
    expect(migration).toContain("update auth_otp_challenges set invalidated_at=now()");
    expect(migration).toContain("insert into account_recovery_tokens");
  });

  it("exposes conversion only through the guarded Admin action route and maps safe errors", () => {
    expect(actions).toContain('action:z.enum(["status","role","metadata","recovery","convert"])');
    expect(actions).toContain("admin_convert_guest_to_staff");
    expect(actions).toContain("admin_convert_guest_to_staff_with_history");
    expect(actions).toContain("p_expected_email:v.expectedEmail");
    expect(actions).toContain("recoveryUrl");
    expect(adminGuard).toContain("GUEST_BUSINESS_HISTORY_CONFLICT");
    expect(adminGuard).toContain("ACCOUNT_IDENTITY_MISMATCH");
  });

  it("routes a guest Role action through conversion onboarding, never a label-only role update", () => {
    expect(dashboard).toContain('const converting=action==="role"&&String(item.role)==="guest"');
    expect(dashboard).toContain('action:converting?"convert":action');
    expect(dashboard).toContain("payload.expectedEmail=item.email");
    expect(dashboard).toContain("Conversion creates an inactive staff account");
  });

  it("does not mutate guest reservations, holds, payments, refunds, or audit history", () => {
    for (const table of ["reservations", "booking_holds", "payments", "refund_requests", "audit_logs"]) {
      expect(migration).not.toMatch(new RegExp(`(?:delete\\s+from|update)\\s+(?:public\\.)?${table}\\b`, "i"));
    }
    expect(migration).not.toMatch(/drop\s+table|truncate|database\s+reset/i);
  });
});
