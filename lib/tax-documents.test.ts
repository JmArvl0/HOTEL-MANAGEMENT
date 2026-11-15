import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inclusiveTaxBreakdown, ratePercent } from "@/lib/accounting";

// Tax-aware financial documents (migration 20260928010000): VAT-INCLUSIVE pricing —
// totals never change; receipts and folio statements derive the breakdown from the
// gross. The contract is pinned against the migration source (the SQL lives in
// SECURITY DEFINER bodies) and the TS mirror must agree with it exactly.
const migration = readFileSync("supabase/migrations/20260928010000_tax_aware_documents.sql", "utf8");
const dedupMigration = readFileSync("supabase/migrations/20261115010000_dedup_financial_documents.sql", "utf8");
const paidCorrectionMigration = readFileSync("supabase/migrations/20261115020000_correct_unlinked_invoice_paid.sql", "utf8");
const policyRoute = readFileSync("app/api/admin/policy/route.ts", "utf8");

describe("inclusive tax breakdown", () => {
  it("derives net, service charge and VAT that sum exactly to the gross", () => {
    // 1000 net + 100 service charge + 132 VAT (12% of 1100) = 1232 gross.
    const breakdown = inclusiveTaxBreakdown(1232, 1200, 1000)!;
    expect(breakdown.pricingBasis).toBe("vat_inclusive");
    expect(breakdown.netSubtotal).toBe(1000);
    expect(breakdown.serviceCharge).toBe(100);
    expect(breakdown.vatAmount).toBe(132);
    expect(breakdown.grossTotal).toBe(1232);
  });
  it("keeps the lines summing to the gross at awkward amounts (VAT absorbs rounding)", () => {
    for (const gross of [0.01, 333.33, 9999.99, 123456.78]) {
      const breakdown = inclusiveTaxBreakdown(gross, 1200, 1000)!;
      expect(Math.round((breakdown.netSubtotal + breakdown.serviceCharge + breakdown.vatAmount) * 100))
        .toBe(Math.round(gross * 100));
    }
  });
  it("returns no breakdown when no rates are configured", () => {
    expect(inclusiveTaxBreakdown(1232, 0, 0)).toBeNull();
    expect(inclusiveTaxBreakdown(0, 1200, 1000)).toBeNull();
  });
  it("formats basis points as a percent", () => {
    expect(ratePercent(1200)).toBe("12%");
    expect(ratePercent(1250)).toBe("12.5%");
  });
});

describe("migration 20260928010000 contract", () => {
  it("adds Owner-governed rate columns with bounds checks", () => {
    expect(migration).toContain("vat_rate_bp integer not null default 1200 check(vat_rate_bp between 0 and 10000)");
    expect(migration).toContain("service_charge_bp integer not null default 1000 check(service_charge_bp between 0 and 10000)");
  });
  it("freezes the rates into every future policy snapshot", () => {
    expect(migration).toContain("'vatRateBp',vat_rate_bp,'serviceChargeBp',service_charge_bp");
  });
  it("derives the document breakdown from the frozen rates, VAT absorbing rounding", () => {
    expect(migration).toContain("coalesce((r.operational_policy_snapshot->>'vatRateBp')::int,pol.vat_rate_bp)");
    expect(migration).toContain("'taxBreakdown',jsonb_build_object('pricingBasis','vat_inclusive'");
    expect(migration).toContain("v_vat:=v_gross-v_net-v_sc");
    // Zero rates keep documents exactly as before — no breakdown attached.
    expect(migration).toContain("if v_vat_bp+v_sc_bp>0 then");
  });
  it("extends the Owner/Admin policy update and drops the stale overload", () => {
    expect(migration).toContain("p_vat_rate_bp integer,p_service_charge_bp integer");
    expect(migration).toContain("vat_rate_bp=p_vat_rate_bp,service_charge_bp=p_service_charge_bp");
    expect(migration).toContain("drop function if exists public.admin_update_operational_policy(text,time,time,time,boolean,integer,integer,integer,integer,integer,boolean,boolean,text,integer,uuid)");
  });
  it("keeps the recreated functions service-role only", () => {
    for (const name of ["current_operational_policy_snapshot", "accounting_generate_document", "admin_update_operational_policy"]) {
      expect(migration).toContain(`revoke all on function public.${name}`);
      expect(migration).toContain(`revoke execute on function public.${name}`);
    }
    expect(migration).toContain("to service_role");
  });
  it("validates the new rates at the route boundary", () => {
    expect(policyRoute).toContain("vatRateBp:z.coerce.number().int().min(0).max(10000)");
    expect(policyRoute).toContain("serviceChargeBp:z.coerce.number().int().min(0).max(10000)");
    expect(policyRoute).toContain("p_vat_rate_bp:v.vatRateBp,p_service_charge_bp:v.serviceChargeBp");
  });
});

describe("folio statement dedup (migration 20261115010000)", () => {
  it("checks existing folio documents by reservation before inserting", () => {
    expect(dedupMigration).toContain("where reservation_id = r.id");
    expect(dedupMigration).toContain("and document_type = 'folio'");
  });
  it("compares the full financial snapshot before considering a duplicate", () => {
    expect(dedupMigration).toContain("snapshot->>'folioAmount'");
    expect(dedupMigration).toContain("snapshot->>'paid'");
    expect(dedupMigration).toContain("snapshot->>'balance'");
    expect(dedupMigration).toContain("snapshot->>'creditBalance'");
    expect(dedupMigration).toContain("snapshot->>'folioStatus'");
  });
  it("returns the existing document instead of creating a duplicate", () => {
    expect(dedupMigration).toContain("'deduplicated',true");
    expect(dedupMigration).toContain("existing.document_number");
  });
  it("only dedups folio statements, not receipts", () => {
    expect(dedupMigration).toContain("if p_document_type = 'folio' then");
  });
  it("keeps grants service-role only", () => {
    expect(dedupMigration).toContain("revoke all on function public.accounting_generate_document");
    expect(dedupMigration).toContain("grant execute on function public.accounting_generate_document");
    expect(dedupMigration).toContain("to service_role");
  });
});

describe("unlinked invoice paid correction (migration 20261115020000)", () => {
  it("targets the three affected invoices", () => {
    for (const id of ["INV-7799", "INV-7800", "INV-7801"]) {
      expect(paidCorrectionMigration).toContain(id);
    }
  });
  it("sets paid to zero on affected invoices", () => {
    expect(paidCorrectionMigration).toContain("paid = 0");
  });
  it("resets balance to the invoice amount", () => {
    expect(paidCorrectionMigration).toContain("balance = amount");
  });
  it("marks corrected invoices as unpaid", () => {
    expect(paidCorrectionMigration).toContain("status = 'unpaid'");
  });
  it("only touches invoices with nonzero paid", () => {
    expect(paidCorrectionMigration).toContain("and paid > 0");
  });
  it("writes audit log entries for each correction", () => {
    expect(paidCorrectionMigration).toContain("correct_unlinked_invoice_paid");
    expect(paidCorrectionMigration).toContain("Paid total had no linked payment transaction");
  });
  it("recomputes folio financials through sync_invoice_financials", () => {
    expect(paidCorrectionMigration).toContain("sync_invoice_financials");
  });
  it("creates no payment records", () => {
    expect(paidCorrectionMigration).not.toContain("insert into payments");
  });
});
