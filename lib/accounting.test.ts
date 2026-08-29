import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { adjustedFolioAmount, cashShiftVariance, folioState, isRefundActionable, reconciliationOutcome, reversibleAmount } from "@/lib/accounting";
import { canAcceptOverpayment, canAdjustFolio, canCollectPayment, canIssueFinancialDocument, canOperateCashShift, canPostFolioCharge, canProcessRefund, canReconcileFinancials, canViewAccountingLedger } from "@/lib/permissions";
import type { Role } from "@/lib/types";

const read = (path: string) => readFileSync(path, "utf8");
const ledgerMigration = read("supabase/migrations/20260829010000_accounting_financial_operations.sql");
const rpcMigration = read("supabase/migrations/20260829020000_accounting_operations_rpcs.sql");
const schema = read("supabase/schema.sql");
const accountingLib = read("lib/accounting.ts");
const chargeRoute = read("app/api/front-desk/reservations/[id]/charge/route.ts");
const paymentRoute = read("app/api/front-desk/reservations/[id]/payment/route.ts");
const resourceRoute = read("app/api/resources/[resource]/route.ts");
const dashboard = read("components/manager/manager-dashboard-client.tsx");

const walk = (dir: string): string[] => readdirSync(dir).flatMap((entry) => { const path = join(dir, entry); return statSync(path).isDirectory() ? walk(path) : [path]; });
const accountingRoutes = walk("app/api/accounting").filter((path) => path.endsWith("route.ts"));
const roles: Role[] = ["owner", "admin", "manager", "front_desk", "housekeeping", "maintenance", "accounting", "guest"];
const allowedBy = (can: (role: Role) => boolean) => roles.filter(can).sort();

// ---------------------------------------------------------------- folio arithmetic (spec 82, 83)
describe("authoritative folio state", () => {
  it("derives an unpaid folio", () => expect(folioState(8900, 0, 0)).toEqual({ paid: 0, balance: 8900, creditBalance: 0, status: "unpaid" }));
  it("derives a partially paid folio from the deposit", () => expect(folioState(8900, 2670, 0)).toEqual({ paid: 2670, balance: 6230, creditBalance: 0, status: "partial" }));
  it("derives a settled folio", () => expect(folioState(8900, 8900, 0)).toEqual({ paid: 8900, balance: 0, creditBalance: 0, status: "paid" }));
  it("holds an overpayment as folio credit instead of a negative balance", () => expect(folioState(8900, 10000, 0)).toEqual({ paid: 8900, balance: 0, creditBalance: 1100, status: "credit" }));
  it("reports a partial refund without discarding the original payment", () => expect(folioState(8900, 8900, 2670)).toEqual({ paid: 6230, balance: 2670, creditBalance: 0, status: "partial_refund" }));
  it("reports a fully refunded folio", () => expect(folioState(8900, 2670, 2670)).toEqual({ paid: 0, balance: 8900, creditBalance: 0, status: "refunded" }));
  it("never returns a negative balance when refunds exceed the folio", () => expect(folioState(1000, 1000, 5000).balance).toBe(1000));
  it("is exact on values that drift in binary floating point", () => expect(folioState(0.3, 0.1, 0)).toEqual({ paid: 0.1, balance: 0.2, creditBalance: 0, status: "partial" }));
  it("accumulates centavo amounts without drift", () => expect(folioState(100.01, 33.33, 0).balance).toBe(66.68));
});

describe("cash shift variance", () => {
  it("computes expected cash from the float plus collections less payouts", () => expect(cashShiftVariance(2000, 15400, 2670, 14730)).toEqual({ expected: 14730, variance: 0 }));
  it("records a shortage as a negative variance rather than editing a payment", () => expect(cashShiftVariance(2000, 5000, 0, 6800).variance).toBe(-200));
  it("records an overage as a positive variance", () => expect(cashShiftVariance(0, 1000, 0, 1050).variance).toBe(50));
  it("is exact on centavo counts", () => expect(cashShiftVariance(0, 0.3, 0.1, 0.2)).toEqual({ expected: 0.2, variance: 0 }));
});

describe("payment source reconciliation", () => {
  it("balances when the statement matches the recorded collections", () => expect(reconciliationOutcome(15400, 15400)).toEqual({ variance: 0, status: "balanced" }));
  it("flags a variance in either direction", () => { expect(reconciliationOutcome(15400, 15000)).toEqual({ variance: -400, status: "variance" }); expect(reconciliationOutcome(15400, 15900).status).toBe("variance"); });
});

describe("reversals and adjustments", () => {
  it("reverses only the un-reversed portion of a charge", () => expect(reversibleAmount(1500, 500)).toBe(1000));
  it("never offers a negative reversal", () => expect(reversibleAmount(1500, 1500)).toBe(0));
  it("increases the folio on a debit adjustment", () => expect(adjustedFolioAmount(8900, "debit", 500)).toBe(9400));
  it("reduces the folio on a credit adjustment", () => expect(adjustedFolioAmount(8900, "credit", 500)).toBe(8400));
  it("floors an over-large credit at zero rather than going negative", () => expect(adjustedFolioAmount(500, "credit", 900)).toBe(0));
});

describe("refund retry semantics", () => {
  it("treats pending and failed refunds as actionable", () => { expect(isRefundActionable("pending")).toBe(true); expect(isRefundActionable("failed")).toBe(true); });
  it("refuses to re-act on a settled or cancelled refund", () => { expect(isRefundActionable("processed")).toBe(false); expect(isRefundActionable("cancelled")).toBe(false); });
});

// ------------------------------------------------------------------- RBAC matrix (spec 6, 89, 99)
describe("financial RBAC matrix", () => {
  it("limits refunds, adjustments, overpayment acceptance and reconciliation to financial authority", () => {
    for (const can of [canProcessRefund, canAdjustFolio, canAcceptOverpayment, canReconcileFinancials]) expect(allowedBy(can)).toEqual(["accounting", "admin", "owner"]);
  });
  it("lets any cash handler collect payments, run a shift and issue a document", () => {
    for (const can of [canCollectPayment, canOperateCashShift, canIssueFinancialDocument]) expect(allowedBy(can)).toEqual(["accounting", "admin", "front_desk", "owner"]);
  });
  it("keeps operational charge posting away from Accounting", () => { expect(allowedBy(canPostFolioCharge)).toEqual(["admin", "front_desk", "owner"]); expect(canPostFolioCharge("accounting")).toBe(false); });
  it("denies every financial capability to housekeeping, maintenance and guests", () => {
    for (const role of ["housekeeping", "maintenance", "guest"] as Role[])
      for (const can of [canProcessRefund, canAdjustFolio, canAcceptOverpayment, canReconcileFinancials, canCollectPayment, canOperateCashShift, canIssueFinancialDocument, canPostFolioCharge, canViewAccountingLedger]) expect(can(role)).toBe(false);
  });
});

describe("server-side authorization", () => {
  it("guards every accounting route before touching the database", () => { expect(accountingRoutes.length).toBeGreaterThanOrEqual(8); for (const path of accountingRoutes) expect(read(path)).toContain("guardFinancial"); });
  it("validates every accounting request body with zod", () => { const writers = accountingRoutes.filter((path) => /export async function (POST|PATCH|PUT)/.test(read(path))); expect(writers.length).toBeGreaterThanOrEqual(7); for (const path of writers) expect(read(path), path).toMatch(/z\.(object|union|discriminatedUnion)/); });
  it("re-checks overpayment authority server-side rather than trusting the client flag", () => expect(paymentRoute).toContain("canAcceptOverpayment(session.user.role as Role)"));
  it("keeps folio corrections out of the operational charge categories", () => { expect(chargeRoute).toContain('z.enum(["incidental","room_service","laundry","minibar","extension"])'); expect(chargeRoute).not.toContain('"adjustment"'); });
  it("gates operational charge posting to operational roles only", () => expect(chargeRoute).toContain('["owner","admin","front_desk"]'));
  it("never exposes ledger tables through the generic CRUD resource surface", () => { for (const table of ["financial_adjustments", "cash_shifts", "payment_reconciliations", "refund_attempts", "financial_documents", "folio_charges"]) expect(resourceRoute).not.toContain(table); });
  it("re-derives every accounting mutation through an RPC instead of a table write", () => { for (const path of accountingRoutes) { const body = read(path); if (body.includes(".rpc(")) expect(body).not.toMatch(/\.from\(["'][a-z_]+["']\)\.(insert|update|delete)/); } });
});

// ------------------------------------------------------- financial correctness in SQL (25, 80, 81)
describe("accounting RPC hardening", () => {
  const definitions = rpcMigration.split("create or replace function public.").slice(1);
  it("defines every accounting operation as a hardened security definer function", () => {
    expect(definitions.length).toBe(14);
    for (const body of definitions) { expect(body).toContain("security definer"); expect(body).toContain("set search_path=public"); }
  });
  it("revokes the folio recomputation helper from public and never grants it to the API role", () => {
    expect(rpcMigration).toContain("revoke all on function public.sync_invoice_financials");
    expect(rpcMigration).not.toContain("grant execute on function public.sync_invoice_financials");
  });
  it("revokes and re-grants every function whose signature changed or is new", () => {
    for (const name of ["accounting_reject_deposit", "accounting_reverse_charge", "accounting_record_adjustment", "accounting_fail_refund", "accounting_open_cash_shift", "accounting_close_cash_shift", "accounting_reconcile_cash_shift", "accounting_reconcile_payments", "accounting_generate_document", "record_staff_payment"]) {
      expect(rpcMigration).toContain(`revoke all on function public.${name}`);
      expect(rpcMigration).toContain(`grant execute on function public.${name}`);
    }
  });
  it("gates each privileged operation on the acting staff role inside the function", () => {
    for (const [name, code] of [["accounting_reverse_charge", "CHARGE_REVERSAL_FORBIDDEN"], ["accounting_record_adjustment", "ADJUSTMENT_FORBIDDEN"], ["process_refund", "REFUND_PROCESSING_FORBIDDEN"], ["accounting_fail_refund", "REFUND_PROCESSING_FORBIDDEN"], ["accounting_reconcile_payments", "RECONCILIATION_FORBIDDEN"], ["accounting_reconcile_cash_shift", "RECONCILIATION_FORBIDDEN"], ["accounting_open_cash_shift", "CASH_SHIFT_FORBIDDEN"], ["accounting_generate_document", "DOCUMENT_FORBIDDEN"]]) {
      const body = definitions.find((definition) => definition.startsWith(name))!;
      expect(body, name).toContain(code);
    }
  });
  it("keeps every financial mutation idempotent", () => {
    for (const name of ["accounting_reverse_charge", "accounting_record_adjustment", "accounting_close_cash_shift", "accounting_reconcile_payments", "accounting_generate_document"]) expect(definitions.find((definition) => definition.startsWith(name))!, name).toContain("p_idempotency_key");
    expect(definitions.find((definition) => definition.startsWith("process_refund"))!).toContain("idempotency_key=rr.id");
  });
  it("serializes concurrent financial work on the same folio", () => { for (const name of ["process_refund", "accounting_reverse_charge", "accounting_record_adjustment", "accounting_close_cash_shift"]) expect(definitions.find((definition) => definition.startsWith(name))!, name).toMatch(/for update|pg_advisory_xact_lock/); });
  it("refuses to refund more than the folio actually received", () => expect(rpcMigration).toContain("REFUND_EXCEEDS_RECEIVED"));
  it("requires a reason before any reversal, adjustment, rejection or refund failure", () => { for (const code of ["REVERSAL_REASON_REQUIRED", "ADJUSTMENT_REASON_REQUIRED", "REJECTION_REASON_REQUIRED", "REFUND_FAILURE_REASON_REQUIRED"]) expect(rpcMigration).toContain(code); });
  it("requires a variance explanation before a shift or period is reconciled", () => expect(rpcMigration.match(/VARIANCE_EXPLANATION_REQUIRED/g)?.length).toBeGreaterThanOrEqual(2));
  it("computes expected cash and reconciliation totals from recorded payments, not from the request", () => {
    const shift = definitions.find((definition) => definition.startsWith("accounting_close_cash_shift"))!;
    expect(shift).toContain("from payments");
    expect(shift).toContain("v_expected:=round(s.opening_amount+v_in-v_out,2)");
    expect(definitions.find((definition) => definition.startsWith("accounting_reconcile_payments"))!).toContain("from payments");
  });
  it("rounds every money expression to two decimal places in the database", () => expect(rpcMigration.match(/round\(/g)?.length).toBeGreaterThan(30));
  it("keeps settled financial history intact - no truncation or deletion of ledger rows", () => {
    for (const pattern of [/truncate/i, /drop table/i, /delete from public\.payments/i, /delete from payments/i, /delete from folio_charges/i, /delete from audit_events/i]) expect(rpcMigration).not.toMatch(pattern);
  });
  it("blocks edits to settled payments and audit history with database triggers", () => { expect(ledgerMigration).toContain("SETTLED_PAYMENT_IMMUTABLE"); expect(ledgerMigration).toContain("AUDIT_HISTORY_IMMUTABLE"); });
  it("recomputes folio totals through the single authoritative helper", () => {
    for (const name of ["record_staff_payment", "post_folio_charge", "front_desk_extend_stay", "accounting_reverse_charge", "accounting_record_adjustment"]) expect(definitions.find((definition) => definition.startsWith(name))!, name).toContain("sync_invoice_financials");
  });
  it("strips anon and authenticated execute from every security definer function", () => {
    for (const body of [rpcMigration, schema]) { expect(body).toContain("p.prosecdef"); expect(body).toContain("array['anon','authenticated']"); expect(body).toContain("revoke all on function %s from public"); }
  });
  it("keeps the folio recomputation helper unreachable from the API role", () => expect(rpcMigration).toContain("revoke all on function public.sync_invoice_financials(text)from service_role"));
});

describe("migration safety", () => {
  it("applies the accounting ledger and RPCs through the schema the migrator actually runs", () => { expect(schema).toContain("create or replace function public.accounting_reconcile_payments"); expect(schema).toContain("protect_settled_payment"); expect(schema).toContain("credit_balance"); });
  it("uses only additive, re-runnable statements", () => { for (const body of [ledgerMigration, rpcMigration]) { expect(body).not.toMatch(/drop table/i); expect(body).not.toMatch(/truncate/i); expect(body).not.toMatch(/drop schema/i); } });
  it("adds new ledger tables and columns conditionally so existing data survives", () => { expect(ledgerMigration).toMatch(/create table if not exists/); expect(ledgerMigration).toMatch(/add column if not exists/); });
  it("re-applies the room overlap constraint without aborting on the index it already created", () => expect(schema).toContain("exception when duplicate_object or duplicate_table then null"));
});

// ---------------------------------------------------- privacy and provider honesty (7, 79, 87, 99)
describe("accounting privacy", () => {
  it("selects no guest contact, identity or authentication material into the ledger", () => {
    const allowLists = accountingLib.match(/const [A-Z_]+_FIELDS = "[^"]+"/g) ?? [];
    expect(allowLists.length).toBe(9);
    for (const list of allowLists) for (const field of ["email", "phone", "password", "token", "secret", "identity_document", "special_requests", "preferences"]) expect(list, list).not.toContain(field);
  });
  it("never writes provider secrets or card data into a financial document snapshot", () => { for (const field of ["card_number", "cvv", "secret_key", "password_hash", "session_token"]) expect(rpcMigration).not.toContain(field); });
});

describe("no fabricated payment provider state", () => {
  const sources = [...walk("lib"), ...walk("app")].filter((path) => /\.(ts|tsx|sql)$/.test(path) && !path.endsWith(".test.ts")).map(read);
  it("never invents a provider success, settlement or verification state", () => {
    for (const body of [...sources, rpcMigration, ledgerMigration]) for (const token of ["PAYMENT_SUCCESS", "REFUND_SUCCESS", "PROVIDER_VERIFIED"]) expect(body).not.toContain(token);
  });
  it("records refund settlement as an operator attempt that stays retryable on failure", () => {
    const fail = rpcMigration.split("create or replace function public.accounting_fail_refund")[1];
    expect(fail).toContain("insert into refund_attempts");
    expect(fail).toContain("'retryable',true");
  });
});

// ------------------------------------------------------------ dashboard integration (63, 89, 102)
describe("accounting dashboard", () => {
  it("exposes every accounting workspace without inventing an empty module", () => { for (const target of ["transactions", "folios", "cash_shifts", "reconciliation", "documents"]) expect(dashboard).toContain(`${target}:`); });
  it("reads the ledger from the guarded accounting endpoint, not the generic resource surface", () => expect(dashboard).toContain('"/api/accounting/ledger"'));
  it("routes every financial action to an accounting or front-desk endpoint", () => { for (const url of ["/api/accounting/adjustments", "/api/accounting/reconciliations", "/api/accounting/cash-shifts", "/api/accounting/documents"]) expect(dashboard).toContain(url); });
  it("keeps operational charge posting behind the operational capability", () => expect(dashboard).toContain("canManage&&inHouse&&<button className=\"btn btn-soft\" onClick={()=>postCharge(reservation)}"));
  it("reports no hard-coded operational metric", () => { expect(dashboard).not.toContain("<h2>92%</h2>"); expect(dashboard).not.toContain("8.2%"); });
  it("offers a refund retry only through the server-validated refund endpoint", () => { expect(dashboard).toContain("isRefundActionable(String(item.status))"); expect(dashboard).toContain("/process"); });
});
