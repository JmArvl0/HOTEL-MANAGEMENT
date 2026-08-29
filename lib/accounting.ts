import { fromCentavos, toCentavos } from "@/lib/booking";
import { supabase } from "@/lib/supabase";
import { canViewAccountingLedger } from "@/lib/permissions";
import type { AccountingMetrics, Role } from "@/lib/types";

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

type Row = Record<string, unknown>;
export interface AccountingLedger {
  metrics: AccountingMetrics;
  transactions: Row[]; invoices: Row[]; charges: Row[]; adjustments: Row[];
  refunds: Row[]; refundAttempts: Row[]; cashShifts: Row[]; reconciliations: Row[]; documents: Row[];
}

// Least privilege: no guest email, phone, identity documents, password hashes, session material or
// payment credentials are selected anywhere in the Accounting ledger.
const PAYMENT_FIELDS = "id,reservation_id,invoice_id,purpose,method,reference,amount,currency,status,submitted_at,verified_at,reviewed_at,decision_reason,cash_shift_id,created_at";
const INVOICE_FIELDS = "id,reservation_id,guest_name,currency,amount,paid,balance,credit_balance,status,method,corporate_account,due_date,created_at";
const CHARGE_FIELDS = "id,invoice_id,reservation_id,description,category,amount,status,source,source_record_id,created_at";
const ADJUSTMENT_FIELDS = "id,invoice_id,reservation_id,transaction_type,direction,amount,reason,source_charge_id,created_at";
const REFUND_FIELDS = "id,reservation_id,invoice_id,reason,paid_deposit,refund_basis_points,eligible_amount,status,processed_at,reference,created_at";
const ATTEMPT_FIELDS = "id,refund_request_id,status,reference,reason,attempted_at";
const SHIFT_FIELDS = "id,staff_user_id,location,opening_amount,status,opened_at,closed_at,expected_cash,actual_cash,variance,close_notes,reconciled_at,reconciliation_notes";
const RECONCILIATION_FIELDS = "id,period_start,period_end,payment_method,expected_amount,settled_amount,variance,status,notes,reconciled_at";
const DOCUMENT_FIELDS = "id,document_number,document_type,reservation_id,payment_id,created_at";

const sum = (rows: Row[], key: string) => fromCentavos(rows.reduce((total, row) => total + toCentavos(Number(row[key] || 0)), 0));

export async function getAccountingLedger(role: Role): Promise<AccountingLedger | null> {
  if (!canViewAccountingLedger(role) || !supabase) return null;
  const client = supabase;
  const take = async (table: string, fields: string, order: string, limit = 200) =>
    ((await client.from(table).select(fields).order(order, { ascending: false }).limit(limit)).data ?? []) as unknown as Row[];
  const [transactions, invoices, charges, adjustments, refunds, refundAttempts, cashShifts, reconciliations, documents] = await Promise.all([
    take("payments", PAYMENT_FIELDS, "created_at", 300), take("invoices", INVOICE_FIELDS, "created_at", 300),
    take("folio_charges", CHARGE_FIELDS, "created_at", 300), take("financial_adjustments", ADJUSTMENT_FIELDS, "created_at"),
    take("refund_requests", REFUND_FIELDS, "created_at"), take("refund_attempts", ATTEMPT_FIELDS, "attempted_at"),
    take("cash_shifts", SHIFT_FIELDS, "opened_at"), take("payment_reconciliations", RECONCILIATION_FIELDS, "reconciled_at"),
    take("financial_documents", DOCUMENT_FIELDS, "created_at")
  ]);
  const staffIds = [...new Set(cashShifts.map((shift) => String(shift.staff_user_id)).filter(Boolean))];
  const staff = staffIds.length ? ((await client.from("user_accounts").select("id,name").in("id", staffIds)).data ?? []) : [];
  const nameById = new Map(staff.map((person) => [String(person.id), String(person.name)]));
  const settled = transactions.filter((row) => row.status === "paid");
  const gross = settled.filter((row) => row.purpose !== "refund");
  const back = settled.filter((row) => row.purpose === "refund");
  const closedShifts = cashShifts.filter((shift) => shift.status === "closed" || shift.status === "reconciled");
  const metrics: AccountingMetrics = {
    grossCollected: sum(gross, "amount"), refundsIssued: sum(back, "amount"),
    netRevenue: fromCentavos(Math.max(toCentavos(sum(gross, "amount")) - toCentavos(sum(back, "amount")), 0)),
    outstandingBalance: sum(invoices, "balance"), folioCredit: sum(invoices, "credit_balance"),
    pendingVerification: transactions.filter((row) => row.status === "pending_verification").length,
    pendingRefunds: refunds.filter((row) => row.status === "pending").length,
    failedRefunds: refunds.filter((row) => row.status === "failed").length,
    openCashShifts: cashShifts.filter((shift) => shift.status === "open").length,
    unreconciledShifts: cashShifts.filter((shift) => shift.status === "closed").length,
    cashVariance: sum(closedShifts, "variance"),
    openReconciliationVariance: sum(reconciliations.filter((row) => row.status === "variance"), "variance")
  };
  return {
    metrics, transactions, invoices, charges, adjustments, refunds, refundAttempts, reconciliations, documents,
    cashShifts: cashShifts.map((shift) => ({ ...shift, staff_name: nameById.get(String(shift.staff_user_id)) ?? "Unknown" }))
  };
}
