// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RefundPayoutDialog from "./refund-payout-dialog";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("requires explicit cash drawer confirmation and records the selected payout", async () => {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async url => new Response(JSON.stringify({ data: url === "/api/accounting/ledger" ? { cashShifts: [{ id: "drawer", status: "open", location: "Front Desk", staff_name: "Maria", opening_amount: 1000, collected: 2000 }] } : { refund_status: "processed" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  const onSaved = vi.fn();
  render(<RefundPayoutDialog refund={{ id: "refund", eligible_amount: 250 }} drawer={null} basisLabel="Within policy" onClose={vi.fn()} onSaved={onSaved} />);
  expect((screen.getByLabelText("Payout method") as HTMLSelectElement).value).toBe("");
  fireEvent.change(screen.getByLabelText("Payout method"), { target: { value: "cash" } });
  expect((screen.getByRole("button", { name: "Record completed refund" }) as HTMLButtonElement).disabled).toBe(true);
  await screen.findByText(/Recorded available cash/);
  fireEvent.change(screen.getByLabelText("Cash drawer used"), { target: { value: "drawer" } });
  fireEvent.change(screen.getByLabelText("Payout / transaction reference"), { target: { value: "Voucher-250" } });
  fireEvent.click(screen.getByLabelText(/I confirm this refund has actually been paid/));
  fireEvent.click(screen.getByRole("button", { name: "Record completed refund" }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const post = fetch.mock.calls.find(([, init]) => init?.method === "POST")!;
  expect(JSON.parse(String(post[1]?.body))).toEqual({ method: "cash", cashShiftId: "drawer", reference: "Voucher-250" });
});
it("never submits a cash drawer with an external payout", async () => {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => new Response(JSON.stringify({ data: {} }), { status: 200 })); vi.stubGlobal("fetch", fetch);
  render(<RefundPayoutDialog refund={{ id: "refund", eligible_amount: 250 }} drawer={null} basisLabel="Within policy" onClose={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Payout method"), { target: { value: "bank_transfer" } });
  fireEvent.change(screen.getByLabelText("Payout / transaction reference"), { target: { value: "Bank-250" } });
  fireEvent.click(screen.getByLabelText(/I confirm this refund has actually been paid/));
  fireEvent.click(screen.getByRole("button", { name: "Record completed refund" }));
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ method: "bank_transfer", cashShiftId: null, reference: "Bank-250" });
});
it("blocks cash payout recording when the current drawer read fails, even with a cached drawer", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Unavailable" }), { status: 503 })));
  render(<RefundPayoutDialog refund={{ id: "refund", eligible_amount: 250 }} drawer={{ id: "cached", status: "open" }} basisLabel="Within policy" onClose={vi.fn()} onSaved={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Payout method"), { target: { value: "cash" } });
  await screen.findByText(/Current drawer unavailable/);
  expect((screen.getByLabelText("Cash drawer used") as HTMLSelectElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Record completed refund" }) as HTMLButtonElement).disabled).toBe(true);
});
