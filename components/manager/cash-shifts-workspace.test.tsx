// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import CashShiftsWorkspace from "./cash-shifts-workspace";
import OperationalHandoverPanel from "./operational-handover-panel";
import type { AccountingLedger } from "@/lib/accounting";
import type { CashRecord } from "@/lib/cash-shift-display";

const active = { id: "current-drawer", staff_user_id: "maria", staff_name: "Maria Santos", status: "open", opening_amount: 10000, collected: 24920, opened_at: "2026-11-04T07:00:00+08:00", location: "Front Desk", actual_cash: null, expected_cash: null, variance: null };
const closed = { ...active, id: "previous-drawer", staff_name: "John Cruz", status: "closed", opened_at: "2026-11-03T07:00:00+08:00", closed_at: "2026-11-03T15:00:00+08:00", expected_cash: 34920, actual_cash: 34850, variance: -70, close_notes: "Count verified, shortage retained" };
function ledger(shifts: CashRecord[] = [active, closed]): AccountingLedger {
  return {
    metrics: { grossCollected: 28420, refundsIssued: 3500, netRevenue: 24920, outstandingBalance: 0, folioCredit: 0, pendingVerification: 0, pendingRefunds: 0, failedRefunds: 0, openCashShifts: shifts.filter(s => s.status === "open").length, unreconciledShifts: shifts.filter(s => s.status === "closed").length, cashVariance: -70, openReconciliationVariance: 0 },
    cashShifts: shifts, transactions: [{ id: "payment", cash_shift_id: "current-drawer", purpose: "stay_payment", amount: 28420, status: "paid", created_at: "2026-11-04T08:00:00+08:00", reservation_id: "HVN-0412", reference: "CASH-0412" }, { id: "refund", cash_shift_id: "current-drawer", purpose: "refund", amount: 3500, status: "paid", created_at: "2026-11-04T09:00:00+08:00", reservation_id: "HVN-0412", reference: "REF-0412" }], invoices: [], charges: [], adjustments: [], refunds: [], refundAttempts: [], reconciliations: [], documents: [],
  };
}
const emptyHandovers = { data: { staff: [], handovers: [] } };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const props = () => ({ ledger: ledger(), actorId: "maria", role: "front_desk" as const, search: "", setSearch: vi.fn(), onOpen: vi.fn(), onRefresh: vi.fn(), onOpenHandovers: vi.fn() });
function stubReads() { const fetch = vi.fn(async () => reply(emptyHandovers)); vi.stubGlobal("fetch", fetch); return fetch; }
function review() { fireEvent.click(screen.getAllByRole("button", { name: "Review count & close" })[0]); return screen.getByRole("dialog", { name: "Review count & close" }); }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Cash & Shifts workspace", () => {
  it("keeps an unsubmitted draft only while mounted and sends no write when leaving the module", async () => {
    const writes = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => { if (init?.method) writes(); return reply(emptyHandovers); }));
    const p = props(); const first = render(<CashShiftsWorkspace {...p} />);
    await screen.findByText(/No unresolved cash follow-up appears/);
    review(); fireEvent.change(screen.getByLabelText("Physical cash counted (PHP)"), { target: { value: "34850" } });
    fireEvent.click(screen.getByRole("button", { name: "Keep draft & return" }));
    first.unmount(); render(<CashShiftsWorkspace {...p} />);
    await screen.findByText(/No unresolved cash follow-up appears/);
    review(); expect((screen.getByLabelText("Physical cash counted (PHP)") as HTMLInputElement).value).toBe("");
    expect(writes).not.toHaveBeenCalled();
  });
  it("shows the active drawer and paid refund basis without inventing a physical count or another open action", async () => {
    stubReads(); render(<CashShiftsWorkspace {...props()} />);
    await screen.findByText(/No unresolved cash follow-up appears/);
    expect(screen.getByRole("heading", { name: "Current shift" })).toBeTruthy();
    expect(screen.getAllByText("₱34,920.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Difference unavailable").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Open cash shift" })).toBeNull();
    expect(within(screen.getByRole("table", { name: "Shift cash movements" })).getByText("−₱3,500.00")).toBeTruthy();
    expect(screen.getAllByText("Not supplied").length).toBeGreaterThan(0);
  });
  it("preserves a draft through Cancel, filtering and same-drawer refresh, then resets for a new drawer", async () => {
    stubReads(); const p = props(); const { rerender } = render(<CashShiftsWorkspace {...p} />);
    await screen.findByText(/No unresolved cash follow-up appears/);
    review(); fireEvent.change(screen.getByLabelText("Physical cash counted (PHP)"), { target: { value: "34850" } });
    fireEvent.change(screen.getByLabelText("Count note / variance explanation"), { target: { value: "Independent count" } });
    fireEvent.click(screen.getByRole("button", { name: "Keep draft & return" }));
    fireEvent.change(screen.getByLabelText("Shift status"), { target: { value: "reconciled" } });
    rerender(<CashShiftsWorkspace {...p} ledger={ledger([{ ...active, collected: 25020 }, closed])} />);
    review(); expect((screen.getByLabelText("Physical cash counted (PHP)") as HTMLInputElement).value).toBe("34850");
    fireEvent.keyDown(document, { key: "Escape" });
    rerender(<CashShiftsWorkspace {...p} ledger={ledger([{ ...active, id: "replacement" }, closed])} />);
    review(); expect((screen.getByLabelText("Physical cash counted (PHP)") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("Count note / variance explanation") as HTMLTextAreaElement).value).toBe("");
  });
  it("does not expose closing inputs to another Front Desk cashier", async () => {
    stubReads(); render(<CashShiftsWorkspace {...props()} actorId="john" />);
    await screen.findByText(/No unresolved cash follow-up appears/);
    expect(screen.queryByRole("button", { name: "Review count & close" })).toBeNull();
    expect(screen.getByText(/Maria Santos owns this drawer/)).toBeTruthy();
    expect(screen.queryByLabelText("Physical cash counted (PHP)")).toBeNull();
  });
  it("requires an independent new count when the operator or role changes", async () => {
    stubReads(); const p = props(); const { rerender } = render(<CashShiftsWorkspace {...p} />);
    await screen.findByText(/No unresolved cash follow-up appears/);
    review(); fireEvent.change(screen.getByLabelText("Physical cash counted (PHP)"), { target: { value: "34920" } });
    fireEvent.click(screen.getByRole("button", { name: "Keep draft & return" }));
    rerender(<CashShiftsWorkspace {...p} role="accounting" actorId="sara" />);
    review(); expect((screen.getByLabelText("Physical cash counted (PHP)") as HTMLInputElement).value).toBe("");
  });
  it("labels stale ledger data without clearing the count draft on refresh failure", async () => {
    stubReads(); const p = props(); const { rerender } = render(<CashShiftsWorkspace {...p} />);
    await screen.findByText(/No unresolved cash follow-up appears/);
    review(); fireEvent.change(screen.getByLabelText("Physical cash counted (PHP)"), { target: { value: "34920" } });
    fireEvent.click(screen.getByRole("button", { name: "Keep draft & return" }));
    rerender(<CashShiftsWorkspace {...p} refreshError="Network unavailable" />);
    expect(screen.getByText(/Values below are from the last successful ledger read/)).toBeTruthy();
    review(); expect((screen.getByLabelText("Physical cash counted (PHP)") as HTMLInputElement).value).toBe("34920");
  });
  it("retains failed-close input and idempotency key, then reports the server's final values", async () => {
    const writes: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init?.method) return reply(emptyHandovers);
      writes.push(JSON.parse(String(init.body)));
      return writes.length === 1 ? reply({ error: "Temporary close failure" }, 503) : reply({ data: { expectedCash: 35000, actualCash: 34850, variance: -150 } });
    }));
    render(<CashShiftsWorkspace {...props()} />); await screen.findByText(/No unresolved cash follow-up appears/);
    review(); fireEvent.change(screen.getByLabelText("Physical cash counted (PHP)"), { target: { value: "34850" } });
    fireEvent.change(screen.getByLabelText("Count note / variance explanation"), { target: { value: "Physical count verified" } });
    fireEvent.submit(screen.getByRole("button", { name: "Close shared drawer" }).closest("form")!);
    await screen.findByText("Temporary close failure");
    expect((screen.getByLabelText("Physical cash counted (PHP)") as HTMLInputElement).value).toBe("34850");
    fireEvent.submit(screen.getByRole("button", { name: "Close shared drawer" }).closest("form")!);
    await screen.findByText(/Drawer closed. Expected ₱35,000.00; counted ₱34,850.00; variance -₱150.00/);
    expect(writes).toHaveLength(2); expect(writes[0].idempotencyKey).toBe(writes[1].idempotencyKey);
    expect(writes[0].actualCash).toBe(34850);
  });
  it("cancels balanced reconciliation without a request and lets Accounting explicitly submit blank optional notes", async () => {
    const writes: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { if (!init?.method) return reply(emptyHandovers); writes.push({ url, body: JSON.parse(String(init.body)) }); return reply({ data: { status: "reconciled" } }); }));
    render(<CashShiftsWorkspace {...props()} role="accounting" ledger={ledger([{ ...closed, variance: 0, actual_cash: 34920 }])} />);
    await screen.findByText(/No unresolved cash follow-up appears/);
    fireEvent.click(screen.getByRole("button", { name: "Reconcile shift previous-drawer" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(writes).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Reconcile shift previous-drawer" }));
    fireEvent.submit(screen.getByRole("button", { name: "Record reconciliation" }).closest("form")!);
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(writes[0]).toEqual({ url: "/api/accounting/cash-shifts/previous-drawer", body: { action: "reconcile" } });
  });
  it("requires an explanation for reconciled variance and targets the selected historical shift", async () => {
    const writes: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { if (init?.method) writes.push(url); return reply(init?.method ? { data: {} } : emptyHandovers); }));
    render(<CashShiftsWorkspace {...props()} role="accounting" />); await screen.findByText(/No unresolved cash follow-up appears/);
    fireEvent.click(screen.getByRole("button", { name: "Reconcile shift previous-drawer" }));
    fireEvent.submit(screen.getByRole("button", { name: "Record reconciliation" }).closest("form")!);
    expect(screen.getByText(/Explain the recorded variance/)).toBeTruthy(); expect(writes).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Reconciliation notes (required)"), { target: { value: "Review confirms shortage" } });
    fireEvent.submit(screen.getByRole("button", { name: "Record reconciliation" }).closest("form")!);
    await screen.findByText(/Its recorded variance remains -₱70.00/);
    expect(writes).toEqual(["/api/accounting/cash-shifts/previous-drawer"]);
  });
  it("keeps historical details, all pages and current operations available independently", async () => {
    stubReads(); const shifts = [active, ...Array.from({ length: 11 }, (_, i) => ({ ...closed, id: `history-${i}`, staff_name: `Cashier ${i}` }))];
    render(<CashShiftsWorkspace {...props()} ledger={ledger(shifts)} />); await screen.findByText(/No unresolved cash follow-up appears/);
    fireEvent.click(screen.getByRole("button", { name: "Next page of matching shifts" }));
    fireEvent.click(screen.getByRole("button", { name: "View shift history-10" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Count verified, shortage retained")).toBeTruthy();
    expect(within(dialog).getByText("Net collected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close dialog" }));
    expect(screen.getByRole("heading", { name: "Current shift" })).toBeTruthy();
  });
  it("keeps cash usable if handovers fail and does not convert that error into a zero count", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ error: "Unavailable" }, 503)));
    render(<CashShiftsWorkspace {...props()} />); await screen.findByText(/Cash follow-up could not be confirmed/);
    expect(screen.queryByText(/No unresolved cash follow-up appears/)).toBeNull();
    expect(screen.getByRole("heading", { name: "Current shift" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry handovers" })).toBeTruthy();
  });
  it("shows authorized source-linked follow-up and navigates to its existing record", async () => {
    const onOpenHandovers = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async () => reply({ data: { staff: [{ id: "maria", name: "Maria Santos", role: "front_desk" }, { id: "john", name: "John Cruz", role: "front_desk" }], handovers: [{ id: "follow-up", source_type: "cash_shift", source_id: "previous-drawer", submitted_by: "john", follow_up_user_id: "maria", summary: "Investigate previous shortage", submitted_at: "2026-11-04T07:02:00+08:00", acknowledged_at: null, resolved_at: null }] } })));
    render(<CashShiftsWorkspace {...props()} onOpenHandovers={onOpenHandovers} />);
    await screen.findByText("Investigate previous shortage"); expect(screen.getByText(/1 cash handover awaits your acknowledgement/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "View follow-up" })); expect(onOpenHandovers).toHaveBeenCalledWith("follow-up");
    expect(screen.queryByText(/transferred/i)).toBeNull();
  });
  it("offers opening without fabricating an active drawer and retains recorded reconciled shortages", async () => {
    stubReads(); const p = props(); render(<CashShiftsWorkspace {...p} ledger={ledger([{ ...closed, status: "reconciled" }])} />);
    await screen.findByText(/No unresolved cash follow-up appears/); expect(screen.getByRole("heading", { name: "No drawer is open" })).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Open cash shift" })[0]); expect(p.onOpen).toHaveBeenCalledOnce();
    expect(screen.getAllByText("Short by").length).toBeGreaterThan(0); expect(screen.queryByRole("button", { name: /Reconcile shift/ })).toBeNull();
  });
  it("focuses the authorized handover record when navigating to existing Operational Handover", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ data: { staff: [], handovers: [{ id: "focused-record", source_type: "cash_shift", source_id: "previous-drawer", submitted_by: "john", follow_up_user_id: "maria", summary: "Selected cash follow-up", submitted_at: "2026-11-04T07:02:00+08:00", acknowledged_at: null, resolved_at: null }] } })));
    render(<OperationalHandoverPanel role="front_desk" actorId="maria" focusId="focused-record" />);
    await screen.findByText("Selected cash follow-up");
    await waitFor(() => expect(document.activeElement?.id).toBe("cash-follow-up-focused-record"));
    expect(screen.getByRole("button", { name: "Acknowledge" })).toBeTruthy();
  });
});
