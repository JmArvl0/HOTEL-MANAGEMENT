// @vitest-environment jsdom
import { useState, type ComponentType } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { AccountingLedger } from "@/lib/accounting";
import type { RecordItem } from "@/lib/types";

type Props = {
  ledger: AccountingLedger;
  search: string;
  setSearch: (value: string) => void;
  canVerify: boolean;
  canIssueDocument: boolean;
  rejectDeposit: (row: RecordItem) => void;
  generateDocument: (payload: { documentType: "receipt"; paymentId: string }) => void;
  openDepositVerification: (paymentId: string) => void;
  openIssuedReceipt: (documentNumber: string) => void;
  openCashInvestigation?: () => void;
};

let TransactionsWorkspace: ComponentType<Props>;

beforeAll(async () => {
  const loadedWorkspace = await vi.importActual<{ default: ComponentType<Props> }>("./transactions-workspace").catch(() => null);
  expect(loadedWorkspace, "the approved Transactions workspace is not integrated yet").not.toBeNull();
  TransactionsWorkspace = loadedWorkspace!.default;
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T12:00:00+08:00"));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

const rows = [
  { id: "paid-today", reservation_id: "stay-maya", purpose: "stay_payment", method: "cash", reference: "CASH-205", amount: 2000, status: "paid", created_at: "2026-11-14T16:30:00Z", cash_shift_id: "drawer-1", received_by_name: "Alex" },
  { id: "refund-today", reservation_id: "stay-jo", purpose: "refund", method: "cash", reference: "REF-350", amount: 350.25, status: "paid", created_at: "2026-11-15T02:00:00Z" },
  { id: "pending-today", reservation_id: "stay-maya", purpose: "reservation_deposit", method: "manual_gcash", reference: "GC-123", amount: 1000, status: "pending_verification", created_at: "2026-11-15T01:00:00Z", submitted_at: "2026-11-15T01:00:00Z" },
  { id: "failed-today", reservation_id: "stay-jo", purpose: "stay_payment", method: "manual_bank", reference: "BT-404", amount: 200, status: "failed", decision_reason: "Amount does not match proof", created_at: "2026-11-15T00:00:00Z", reviewed_at: "2026-11-15T03:00:00Z" },
  { id: "paid-yesterday", reservation_id: "stay-jo", purpose: "stay_payment", method: "card", reference: "CARD-800", amount: 800, status: "paid", created_at: "2026-11-14T08:00:00Z" },
];

const ledger = {
  transactions: rows,
  invoices: [
    { reservation_id: "stay-maya", guest_name: "Maya Santos" },
    { reservation_id: "stay-jo", guest_name: "Jo Cruz" },
  ],
  metrics: {},
  charges: [], adjustments: [], refunds: [], refundAttempts: [], cashShifts: [], reconciliations: [], documents: [],
} as unknown as AccountingLedger;

function setup(overrides: Partial<Props> = {}) {
  const props: Props = {
    ledger, search: "", setSearch: vi.fn(), canVerify: true, canIssueDocument: true,
    rejectDeposit: vi.fn(), generateDocument: vi.fn(), openDepositVerification: vi.fn(), openIssuedReceipt: vi.fn(), ...overrides,
  };
  function Harness() {
    const [search, setSearch] = useState(props.search);
    return <TransactionsWorkspace {...props} search={search} setSearch={value => { props.setSearch(value); setSearch(value); }} />;
  }
  render(<Harness />);
  return props;
}

describe("live Transactions workspace", () => {
  it("opens on the Manila business day and keeps pending and refunds out of gross collections", () => {
    setup();
    const summary = screen.getByRole("region", { name: "Money movement" });
    expect(within(summary).getByText("₱2,000.00")).toBeTruthy();
    expect(within(summary).getByText("₱350.25")).toBeTruthy();
    expect(within(summary).getByText("₱1,649.75")).toBeTruthy();
    expect(within(summary).getByText("1", { selector: "dd" })).toBeTruthy();
    expect(screen.getByText("4 records in view")).toBeTruthy();
    expect(screen.queryByText("CARD-800")).toBeNull();
  });

  it("filters real records by status, type, reference, and period", () => {
    setup();
    const statusFilters = screen.getByRole("group", { name: "Transaction status" });
    fireEvent.click(within(statusFilters).getByRole("button", { name: /Awaiting review/ }));
    expect(screen.getByText("1 record in view")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Maya Santos.*GC-123/ })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Period" }), { target: { value: "all" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), { target: { value: "stay_payment" } });
    fireEvent.click(within(statusFilters).getByRole("button", { name: /All \d/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Search transactions" }), { target: { value: "CARD-800" } });
    expect(screen.getByText("1 record in view")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Jo Cruz.*CARD-800/ })).toBeTruthy();
  });

  it("assigns a later-settled payment to its settlement day, as Accounting Reports does", () => {
    const settledToday = { ...rows[4], id: "settled-today", reference: "CARD-LATER", amount: 725, verified_at: "2026-11-15T04:00:00Z" };
    setup({ ledger: { ...ledger, transactions: [...rows, settledToday] } as AccountingLedger });
    const summary = screen.getByRole("region", { name: "Money movement" });
    expect(within(summary).getByText("₱2,725.00")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Jo Cruz.*CARD-LATER/ })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Period" }), { target: { value: "yesterday" } });
    expect(screen.queryByRole("button", { name: /Jo Cruz.*CARD-LATER/ })).toBeNull();
  });

  it("shows recorded context and preserves valid Accounting actions", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: /Maya Santos.*GC-123/ }));
    expect(screen.getByText("Awaiting Accounting review")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open Deposit Verification" }));
    expect(props.openDepositVerification).toHaveBeenCalledWith("pending-today");
    fireEvent.click(screen.getByRole("button", { name: "Reject payment" }));
    expect(props.rejectDeposit).toHaveBeenCalledWith(rows[2]);
    fireEvent.click(screen.getByRole("button", { name: /Maya Santos.*CASH-205/ }));
    fireEvent.click(screen.getByRole("button", { name: "Issue receipt" }));
    expect(props.generateDocument).toHaveBeenCalledWith({ documentType: "receipt", paymentId: "paid-today" });
    fireEvent.click(screen.getByRole("button", { name: /Jo Cruz.*REF-350/ }));
    expect(screen.queryByRole("button", { name: "Issue receipt" })).toBeNull();
  });

  it("opens an existing receipt from Transactions without issuing another document", () => {
    const issued = { id: "doc-1", document_type: "receipt", document_number: "RCP-205", payment_id: "paid-today" };
    const props = setup({ ledger: { ...ledger, documents: [issued] } as AccountingLedger });
    fireEvent.click(screen.getByRole("button", { name: /Maya Santos.*CASH-205/ }));
    expect(screen.queryByRole("button", { name: "Issue receipt" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "View receipt" }));
    expect(props.openIssuedReceipt).toHaveBeenCalledWith("RCP-205");
    expect(props.generateDocument).not.toHaveBeenCalled();
  });

  it("routes drawer-less cash to Accounting's investigation queue without assigning a drawer", () => {
    const unlinked = { ...rows[0], id: "cash-exception", reference: "CASH-EXCEPTION", cash_shift_id: null };
    const openCashInvestigation = vi.fn();
    setup({ ledger: { ...ledger, transactions: [...rows, unlinked] } as AccountingLedger, openCashInvestigation });
    fireEvent.click(screen.getByRole("button", { name: /Maya Santos.*CASH-EXCEPTION/ }));
    expect(screen.getByText("Cash collected without a drawer link")).toBeTruthy();
    expect(screen.getByText(/Accounting investigates this historical collection/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open cash investigation" }));
    expect(openCashInvestigation).toHaveBeenCalledOnce();
    expect(screen.getByText("Not recorded")).toBeTruthy();
  });

  it("keeps Front Desk out of verification while retaining receipt issuance", () => {
    setup({ canVerify: false, canIssueDocument: true });
    fireEvent.click(screen.getByRole("button", { name: /Jo Cruz.*BT-404/ }));
    expect(screen.getByText("Amount does not match proof")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Reject payment" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Maya Santos.*CASH-205/ }));
    expect(screen.getByRole("button", { name: "Issue receipt" })).toBeTruthy();
  });

  it("keeps other recorded statuses discoverable instead of hiding them from filters", () => {
    const withOther = { ...ledger, transactions: [...rows, { ...rows[0], id: "other-today", status: "cancelled" }] } as AccountingLedger;
    setup({ ledger: withOther });
    const filters = screen.getByRole("group", { name: "Transaction status" });
    fireEvent.click(within(filters).getByRole("button", { name: /Other states 1/ }));
    expect(screen.getByText("1 record in view")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Maya Santos.*Cancelled/ })).toBeTruthy();
  });

  it("returns from mobile detail to the same row, and period changes return to the ledger", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    setup();
    const row = screen.getByRole("button", { name: /Maya Santos.*GC-123/ });
    fireEvent.click(row);
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Transaction detail" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to ledger" }));
    expect(document.activeElement).toBe(row);
    fireEvent.click(row);
    fireEvent.change(screen.getByRole("combobox", { name: "Period" }), { target: { value: "yesterday" } });
    expect(screen.getByRole("button", { name: /Jo Cruz.*CARD-800/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back to ledger" })).toBeNull();
  });
});
