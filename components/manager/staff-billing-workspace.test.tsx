// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import StaffBillingWorkspace from "./staff-billing-workspace";
import { attachBillingDeposits, attachBillingEntries, type BillingFolio } from "@/lib/staff-billing";

const stay = { id: "RSV-42", confirmation_number: "HVN-42", guest_name: "Mara Cruz", room_number: "205", check_out: "2026-11-10", status: "checked_in" };
const upcoming = { id: "RSV-43", confirmation_number: "HVN-43", guest_name: "Nico Reyes", check_in: "2026-11-11", status: "pending", deposit_required: 2940 };
const deposit = { id: "PAY-43", reservation_id: "RSV-43", status: "pending_verification", purpose: "reservation_deposit", amount: 2940 };
const folios: BillingFolio[] = [{
  key: "INV-42",
  invoice: { id: "INV-42", reservation_id: stay.id, amount: 12400, paid: 6000, balance: 6400, status: "partial" },
  reservation: stay,
  deposits: [],
  activity: [{ id: "PAY-42", purpose: "stay_payment", status: "paid", amount: 6000, method: "card" }],
}];

function setup(role: "front_desk" | "accounting") {
  const fetchBilling = vi.fn(async () => ({ ok: true, json: async () => ({
    data: { today: "2026-11-10", folios: attachBillingDeposits(folios, [{ payment: deposit, reservation: upcoming }]) },
  }) }));
  vi.stubGlobal("fetch", fetchBilling);
  const callbacks = { onCollect: vi.fn(), onReviewDeposit: vi.fn(), onOpenReservation: vi.fn() };
  render(<StaffBillingWorkspace role={role} refreshVersion={0} search="" onSearch={vi.fn()} {...callbacks} />);
  return callbacks;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("prioritizes in-house checkout balances and opens the protected collection action", async () => {
  const { onCollect } = setup("front_desk");
  const summary = await screen.findByRole("group", { name: "Billing summary" });
  expect(within(summary).getAllByText("₱6,400")).toHaveLength(2);
  expect(within(summary).getByText("Awaiting Accounting")).toBeTruthy();
  const queue = screen.getByRole("group", { name: "Billing queue" });
  fireEvent.click(within(queue).getByRole("button", { name: "Checkout due" }));
  expect(within(screen.getByRole("table", { name: "Guest folios" })).queryByText("Nico Reyes")).toBeNull();
  const details = screen.getByRole("complementary", { name: "Folio details" });
  expect(within(details).getByText("₱6,000", { selector: "dd" })).toBeTruthy();
  fireEvent.click(within(details).getByRole("button", { name: "Collect payment" }));
  expect(onCollect).toHaveBeenCalledWith(stay);
  fireEvent.click(within(queue).getByRole("button", { name: "Deposit review" }));
  expect(within(details).getByText("Accounting reviews deposit submissions.")).toBeTruthy();
  expect(within(details).queryByRole("button", { name: "Review deposit" })).toBeNull();
  expect(within(details).queryByRole("button", { name: "Collect payment" })).toBeNull();
});

it("shows Accounting the real deposit review action even before a folio exists", async () => {
  const { onReviewDeposit } = setup("accounting");
  const queue = await screen.findByRole("group", { name: "Billing queue" });
  fireEvent.click(within(queue).getByRole("button", { name: "Deposit review" }));
  expect(screen.getByText("Folio not issued")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Review deposit" }));
  expect(onReviewDeposit).toHaveBeenCalledWith({ ...deposit, reservation: upcoming });
});

it("keeps the selected folio visible when a refresh settles it and removes it from Checkout due", async () => {
  const settled = { ...folios[0], invoice: { id: "INV-42", amount: 12400, paid: 12400, balance: 0, status: "paid" } };
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { today: "2026-11-10", folios } }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { today: "2026-11-10", folios: [settled] } }) }));
  const props = { role: "front_desk" as const, search: "", onSearch: vi.fn(), onCollect: vi.fn(), onReviewDeposit: vi.fn(), onOpenReservation: vi.fn() };
  const view = render(<StaffBillingWorkspace {...props} refreshVersion={0} />);
  fireEvent.click(await screen.findByRole("button", { name: "Checkout due" }));
  fireEvent.click(screen.getByRole("button", { name: "Collect payment" }));
  view.rerender(<StaffBillingWorkspace {...props} refreshVersion={1} />);
  await screen.findByText("Balance settled");
  expect(screen.getByText("No matching folios")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Mara Cruz" })).toBeTruthy();
});

it("links deposits by invoice first and retains pending deposits without an invoice", () => {
  const laterInvoice = { ...folios[0], key: "INV-99", invoice: { ...folios[0].invoice, id: "INV-99" } };
  const linked = { ...deposit, id: "PAY-42-LEGACY", reservation_id: null, invoice_id: "INV-42" };
  const joined = attachBillingDeposits([laterInvoice, ...folios], [{ payment: linked, reservation: null }, { payment: deposit, reservation: upcoming }]);
  expect(joined.map(row => [row.key, row.deposits.map(item => item.id)])).toEqual([
    ["INV-99", []], ["INV-42", ["PAY-42-LEGACY"]], ["reservation:RSV-43", ["PAY-43"]],
  ]);
});

it("offers a retry if the initial billing read fails", async () => {
  const request = vi.fn()
    .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Billing unavailable." }) })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { today: "2026-11-10", folios: [] } }) });
  vi.stubGlobal("fetch", request);
  render(<StaffBillingWorkspace role="front_desk" refreshVersion={0} search="" onSearch={vi.fn()} onCollect={vi.fn()} onReviewDeposit={vi.fn()} onOpenReservation={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Retry billing" }));
  await waitFor(() => expect(screen.getByText("No folios on record")).toBeTruthy());
});

it("shows posted charges and corrections beside payment activity in Billing", async () => {
  const detailed = [{
    ...folios[0],
    reservation: { ...stay, total: 12400, created_at: "2026-11-08T09:00:00Z" },
    charges: [{ id: "CHG-42", description: "Minibar", category: "incidental", amount: 1200, status: "posted", created_at: "2026-11-09T08:00:00Z" }],
    adjustments: [{ id: "ADJ-42", transaction_type: "credit", direction: "credit", reason: "Goodwill credit", amount: 400, created_at: "2026-11-09T09:00:00Z" }],
  }];
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: { today: "2026-11-10", folios: detailed } }) })));
  render(<StaffBillingWorkspace role="front_desk" refreshVersion={0} search="" onSearch={vi.fn()} onCollect={vi.fn()} onReviewDeposit={vi.fn()} onOpenReservation={vi.fn()} />);
  const detail = await screen.findByRole("complementary", { name: "Folio details" });
  expect(within(detail).getByText("Minibar")).toBeTruthy();
  expect(within(detail).getByText("Goodwill credit")).toBeTruthy();
  expect(within(detail).getByText(/Stay payment/)).toBeTruthy();
  expect(within(detail).getByText("+₱11,600")).toBeTruthy();
  fireEvent.click(within(detail).getByRole("button", { name: "Charges" }));
  expect(within(detail).queryByText("Goodwill credit")).toBeNull();
  expect(within(detail).getByText("Minibar")).toBeTruthy();
});

it("keeps statement and Accounting corrections in Billing without giving Front Desk correction actions", async () => {
  const charge = { id: "CHG-42", description: "Minibar", category: "incidental", amount: 1200, status: "posted" };
  const detailed = [{ ...folios[0], charges: [charge], adjustments: [] }];
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: { today: "2026-11-10", folios: detailed } }) })));
  const actions = { onCollect: vi.fn(), onReviewDeposit: vi.fn(), onOpenReservation: vi.fn(), onIssueStatement: vi.fn(), onAdjustFolio: vi.fn(), onReverseCharge: vi.fn() };
  const view = render(<StaffBillingWorkspace role="front_desk" refreshVersion={0} search="" onSearch={vi.fn()} {...actions} />);
  const detail = await screen.findByRole("complementary", { name: "Folio details" });
  fireEvent.click(within(detail).getByRole("button", { name: "Issue statement" }));
  expect(actions.onIssueStatement).toHaveBeenCalledWith(stay.id);
  expect(within(detail).queryByRole("button", { name: "Record adjustment" })).toBeNull();
  expect(within(detail).queryByRole("button", { name: "Reverse charge" })).toBeNull();
  view.rerender(<StaffBillingWorkspace role="accounting" refreshVersion={0} search="" onSearch={vi.fn()} {...actions} />);
  fireEvent.click(within(detail).getByRole("button", { name: "Record adjustment" }));
  fireEvent.click(within(detail).getByRole("button", { name: "Reverse charge" }));
  expect(actions.onAdjustFolio).toHaveBeenCalledWith(stay.id);
  expect(actions.onReverseCharge).toHaveBeenCalledWith(charge);
});

it("attaches complete ledger entries by invoice, then reservation, without leaking unrelated rows", () => {
  const linked = attachBillingEntries(folios,
    [{ id: "PAY-A", invoice_id: "INV-42" }, { id: "PAY-B", reservation_id: stay.id }, { id: "PAY-X" }],
    [{ id: "CHG-A", invoice_id: "INV-42" }],
    [{ id: "ADJ-A", reservation_id: stay.id }]);
  expect(linked[0].activity.map(row => row.id)).toEqual(["PAY-A", "PAY-B"]);
  expect(linked[0].charges?.map(row => row.id)).toEqual(["CHG-A"]);
  expect(linked[0].adjustments?.map(row => row.id)).toEqual(["ADJ-A"]);
});

it("marks an unsettled payment as unapplied to the folio balance", async () => {
  const pendingPayment = { id: "PAY-PENDING", purpose: "stay_payment", status: "pending_verification", amount: 500, method: "gcash" };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data: { today: "2026-11-10", folios: [{ ...folios[0], activity: [pendingPayment] }] } }) })));
  render(<StaffBillingWorkspace role="front_desk" refreshVersion={0} search="" onSearch={vi.fn()} onCollect={vi.fn()} onReviewDeposit={vi.fn()} onOpenReservation={vi.fn()} />);
  const detail = await screen.findByRole("complementary", { name: "Folio details" });
  expect(within(detail).getByText("Not applied to balance", { exact: false })).toBeTruthy();
  expect(within(detail).getByText("₱500", { selector: "b" })).toBeTruthy();
});
