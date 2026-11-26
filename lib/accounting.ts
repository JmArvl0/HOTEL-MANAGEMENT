import { fromCentavos, toCentavos } from "@/lib/booking";
import { supabase } from "@/lib/supabase";
import { canViewAccountingLedger } from "@/lib/permissions";
import type { AccountingMetrics, AccountingSection, Role } from "@/lib/types";
import { readAllRows } from "@/lib/read-all-rows";

// Money is compared and combined in minor units only. These mirror the SQL side exactly so the
// dashboard, the tests and sync_invoice_financials cannot drift apart.
export type FolioStatus = "unpaid" | "partial" | "paid" | "credit" | "refunded" | "partial_refund";
export function folioState(amount: number, grossPaid: number, refunded: number) {
  const a = Math.max(toCentavos(amount), 0), gross = Math.max(toCentavos(grossPaid), 0), back = Math.max(toCentavos(refunded), 0);
  const net = Math.max(gross - back, 0), applied = Math.min(net, a), credit = Math.max(net - a, 0);
  const status: FolioStatus = credit > 0 ? "credit" : back > 0 && applied === 0 ? "refunded" : back > 0 ? "partial_refund" : a > 0 && applied >= a ? "paid" : applied > 0 ? "partial" : "unpaid";
  return { paid: fromCentavos(applied), balance: fromCentavos(Math.max(a - applied, 0)), creditBalance: fromCentavos(credit), status };
}
export const cashShiftVariance = (opening: number, cashCollected: number, cashPaidOut: number, counted: number) => {
  const expected = toCentavos(opening) + toCentavos(cashCollected) - toCentavos(cashPaidOut);
  return { expected: fromCentavos(expected), variance: fromCentavos(toCentavos(counted) - expected) };
};
export const reconciliationOutcome = (expected: number, settled: number) => {
  const variance = toCentavos(settled) - toCentavos(expected);
  return { variance: fromCentavos(variance), status: variance === 0 ? ("balanced" as const) : ("variance" as const) };
};
export const reversibleAmount = (chargeAmount: number, alreadyReversed: number) => fromCentavos(Math.max(toCentavos(chargeAmount) - toCentavos(alreadyReversed), 0));
export const adjustedFolioAmount = (folioAmount: number, direction: "debit" | "credit", amount: number) =>
  fromCentavos(Math.max(toCentavos(folioAmount) + (direction === "debit" ? toCentavos(amount) : -toCentavos(amount)), 0));
export const REFUND_RETRYABLE_STATUSES = ["pending", "failed"] as const;
export const isRefundActionable = (status: string) => (REFUND_RETRYABLE_STATUSES as readonly string[]).includes(status);

// VAT-inclusive tax breakdown, derived from the gross total. Mirrors the SQL in
// accounting_generate_document exactly (migration 20260928010000) so documents and
// dashboards cannot drift: net = gross / ((1+sc)*(1+vat)), service charge = sc*net,
// and the VAT line absorbs rounding so the three lines always sum to the gross.
// Returns null when no rates are configured — the document has no breakdown.
export function inclusiveTaxBreakdown(gross: number, vatRateBp: number, serviceChargeBp: number) {
  const g = Math.max(toCentavos(gross), 0);
  if (g <= 0 || (vatRateBp <= 0 && serviceChargeBp <= 0)) return null;
  const net = Math.round(g / ((1 + serviceChargeBp / 10000) * (1 + vatRateBp / 10000)));
  const serviceCharge = Math.round((net * serviceChargeBp) / 10000);
  const vat = g - net - serviceCharge;
  return {
    pricingBasis: "vat_inclusive" as const, vatRateBp, serviceChargeBp,
    netSubtotal: fromCentavos(net), serviceCharge: fromCentavos(serviceCharge),
    vatAmount: fromCentavos(vat), grossTotal: fromCentavos(g),
  };
}
export const ratePercent = (basisPoints: number) => `${basisPoints / 100}%`;

type Row = Record<string, unknown>;
export interface AccountingLedger {
  metrics: AccountingMetrics;
  transactions: Row[]; invoices: Row[]; charges: Row[]; adjustments: Row[];
  refunds: Row[]; refundAttempts: Row[]; cashShifts: Row[]; reconciliations: Row[]; documents: Row[];
}

export interface CashDrawerLedger {
  cashShifts: Row[];
  transactions: Row[];
  metrics: { cashVariance: number };
}

// Least privilege: no guest email, phone, identity documents, password hashes, session material or
// payment credentials are selected anywhere in the Accounting ledger.
const PAYMENT_FIELDS = "id,reservation_id,invoice_id,purpose,method,reference,amount,currency,status,submitted_at,verified_at,reviewed_at,decision_reason,cash_shift_id,received_by,created_at";
const INVOICE_FIELDS = "id,reservation_id,guest_name,currency,amount,paid,balance,credit_balance,status,method,corporate_account,due_date,created_at";
const CHARGE_FIELDS = "id,invoice_id,reservation_id,description,category,amount,status,source,source_record_id,created_at";
const ADJUSTMENT_FIELDS = "id,invoice_id,reservation_id,transaction_type,direction,amount,reason,source_charge_id,created_at";
const REFUND_FIELDS = "id,reservation_id,invoice_id,reason,paid_deposit,refund_basis_points,eligible_amount,normal_policy_amount,exception_approval_id,status,processed_at,reference,created_at";
const ATTEMPT_FIELDS = "id,refund_request_id,status,reference,reason,attempted_at";
const SHIFT_FIELDS = "id,staff_user_id,location,opening_amount,status,opened_at,closed_at,expected_cash,actual_cash,variance,close_notes,reconciled_at,reconciliation_notes";
const RECONCILIATION_FIELDS = "id,period_start,period_end,payment_method,expected_amount,settled_amount,variance,status,notes,reconciled_at";
const DOCUMENT_FIELDS = "id,document_number,document_type,reservation_id,payment_id,snapshot,created_at";
const CASH_DRAWER_PAYMENT_FIELDS = "id,purpose,method,amount,currency,status,cash_shift_id,received_by,created_at";

const sum = (rows: Row[], key: string) => fromCentavos(rows.reduce((total, row) => total + toCentavos(Number(row[key] || 0)), 0));

export function summarizeCollections(payments: Row[]) {
  let collected = 0;
  let refunded = 0;
  for (const payment of payments) {
    if (payment.status !== "paid") continue;
    const amount = toCentavos(Number(payment.amount || 0));
    if (payment.purpose === "refund") refunded += amount;
    else collected += amount;
  }
  return {
    grossCollected: fromCentavos(collected),
    refundsIssued: fromCentavos(refunded),
    netCollections: fromCentavos(collected - refunded),
  };
}

export async function getAccountingLedger(role: Role, section?: AccountingSection | "active_drawer"): Promise<AccountingLedger | null> {
  if (!canViewAccountingLedger(role) || !supabase) return null;
  const client = supabase;
  const take = (table: string, fields: string, order: string) =>
    readAllRows<Row>(() => client.from(table).select(fields).returns<Row[]>().order(order, { ascending: false }));
  const includes = (scope: AccountingSection) => !section || section === scope;
  const [payments, invoices, charges, adjustments, cashShifts, documents, refunds, refundAttempts, reconciliations] = await Promise.all([
    includes("transactions") ? take("payments", PAYMENT_FIELDS, "created_at") :
      section === "folios" || section === "documents" ? readAllRows<Row>(() => client.from("payments")
        .select("id,amount,status,purpose").eq("status", "paid").returns<Row[]>()) : [],
    includes("folios") ? take("invoices", INVOICE_FIELDS, "created_at") : [],
    includes("folios") ? take("folio_charges", CHARGE_FIELDS, "created_at") : [],
    includes("folios") ? take("financial_adjustments", ADJUSTMENT_FIELDS, "created_at") : [],
    section === "active_drawer" ? readAllRows<Row>(() => client.from("cash_shifts").select(SHIFT_FIELDS).eq("status", "open").returns<Row[]>()) :
      includes("cash_shifts") || section === "reconciliation" ? take("cash_shifts", SHIFT_FIELDS, "opened_at") : [],
    includes("documents") ? take("financial_documents", DOCUMENT_FIELDS, "created_at") : [],
    !section || section === "reconciliation" ? take("refund_requests", REFUND_FIELDS, "created_at") : [],
    !section ? take("refund_attempts", ATTEMPT_FIELDS, "attempted_at") : [],
    includes("reconciliation") ? take("payment_reconciliations", RECONCILIATION_FIELDS, "reconciled_at") : [],
  ]);
  const shiftPayments = section === "cash_shifts" ? await readAllRows<Row>(() => client.from("payments")
    .select(PAYMENT_FIELDS).not("cash_shift_id", "is", null).order("created_at", { ascending: false }).returns<Row[]>()) :
    section === "active_drawer" && cashShifts.length ? await readAllRows<Row>(() => client.from("payments")
      .select(CASH_DRAWER_PAYMENT_FIELDS).eq("cash_shift_id", cashShifts[0].id).returns<Row[]>()) : [];
  const transactions = includes("transactions") ? payments : shiftPayments;
  const staffIds = [...new Set([...cashShifts.map(shift => shift.staff_user_id), ...transactions.map(payment => payment.received_by)].filter(Boolean).map(String))];
  const staff = staffIds.length ? await readAllRows(() => client.from("user_accounts").select("id,name").in("id", staffIds)) : [];
  const nameById = new Map(staff.map((person) => [String(person.id), String(person.name)]));
  // Per-shift cash collected, derived from the payments linked to each shift (in − refunds out)
  // so an open shift shows its running total and a closed one matches its expected-cash basis.
  const collectedByShift = new Map<string, number>();
  for (const row of transactions) {
    if (row.status !== "paid" || !row.cash_shift_id) continue;
    const key = String(row.cash_shift_id);
    const amount = row.purpose === "refund" ? -toCentavos(Number(row.amount || 0)) : toCentavos(Number(row.amount || 0));
    collectedByShift.set(key, (collectedByShift.get(key) ?? 0) + amount);
  }
  const closedShifts = cashShifts.filter((shift) => shift.status === "closed" || shift.status === "reconciled");
  const metrics: AccountingMetrics = {
    ...summarizeCollections(payments),
    outstandingBalance: sum(invoices, "balance"), folioCredit: sum(invoices, "credit_balance"),
    pendingRefunds: refunds.filter((row) => row.status === "pending").length,
    failedRefunds: refunds.filter((row) => row.status === "failed").length,
    openCashShifts: cashShifts.filter((shift) => shift.status === "open").length,
    unreconciledShifts: cashShifts.filter((shift) => shift.status === "closed").length,
    cashVariance: sum(closedShifts, "variance"),
    openReconciliationVariance: sum(reconciliations.filter((row) => row.status === "variance"), "variance")
  };
  return {
    metrics, transactions: transactions.map(payment => ({ ...payment, received_by_name: nameById.get(String(payment.received_by)) ?? null })), invoices, charges, adjustments, refunds, refundAttempts, reconciliations, documents,
    cashShifts: cashShifts.map((shift) => ({ ...shift, staff_name: nameById.get(String(shift.staff_user_id)) ?? "Unknown", collected: fromCentavos(collectedByShift.get(String(shift.id)) ?? 0) }))
  };
}

export async function getCashDrawerShifts(actorId: string) {
  if (!supabase) throw new Error("Drawer unavailable");
  const client = supabase;
  const drawerFields = "id,staff_user_id,location,opening_amount,status,opened_at,closed_at,expected_cash,actual_cash,variance,close_notes,reconciled_at";
  // The desk shares the open drawer and its latest handover. Older drawers belong to their opener.
  const [active, lastClosed, own] = await Promise.all([
    client.from("cash_shifts").select(drawerFields).eq("status", "open").order("opened_at", { ascending: false }).order("id").limit(1).maybeSingle(),
    client.from("cash_shifts").select(drawerFields).in("status", ["closed", "reconciled"]).order("opened_at", { ascending: false }).order("id").limit(1).maybeSingle(),
    client.from("cash_shifts").select(drawerFields).eq("staff_user_id", actorId).order("opened_at", { ascending: false }).order("id").limit(25),
  ]);
  if (active.error || lastClosed.error || own.error) throw new Error("Unable to verify drawer scope");
  return [...new Map([active.data, lastClosed.data, ...(own.data ?? [])]
    .filter(shift => shift !== null).map(shift => [shift.id, shift])).values()];
}

export async function getCashDrawerLedger(actorId: string): Promise<CashDrawerLedger> {
  if (!supabase) throw new Error("Drawer unavailable");
  const client = supabase;
  const shifts = await getCashDrawerShifts(actorId);
  const shiftIds = shifts.map(shift => shift.id);
  const transactions = shiftIds.length ? await readAllRows<Row>(() => client.from("payments")
    .select(CASH_DRAWER_PAYMENT_FIELDS).in("cash_shift_id", shiftIds).returns<Row[]>().order("created_at", { ascending: false })) : [];
  const staffIds = [...new Set([...shifts.map(shift => shift.staff_user_id), ...transactions.map(row => row.received_by)].filter(Boolean).map(String))];
  const staff = staffIds.length ? await readAllRows(() => client.from("user_accounts").select("id,name").in("id", staffIds)) : [];
  const names = new Map(staff.map(person => [String(person.id), String(person.name)]));
  const netByShift = new Map<unknown, number>();
  for (const payment of transactions) {
    if (payment.status !== "paid") continue;
    const amount = toCentavos(Number(payment.amount || 0));
    const net = payment.purpose === "refund" ? -amount : amount;
    netByShift.set(payment.cash_shift_id, (netByShift.get(payment.cash_shift_id) ?? 0) + net);
  }
  return {
    transactions: transactions.map(row => ({ ...row, received_by_name: names.get(String(row.received_by)) ?? null })),
    cashShifts: shifts.map(shift => ({
      ...shift, staff_name: names.get(String(shift.staff_user_id)) ?? "Unknown",
      collected: fromCentavos(netByShift.get(shift.id) ?? 0),
    })),
    metrics: { cashVariance: sum(shifts.filter(shift => shift.status !== "open"), "variance") },
  };
}
