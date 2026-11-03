// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import StockIntegrityPanel from "./stock-integrity-panel";
import CashCountPanel from "./cash-count-panel";
import type { AccountingLedger } from "@/lib/accounting";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const data = { items: [{ id: "ITM-1", name: "Hand towels", quantity: 10, reorder_point: 2, unit: "pieces", updated_at: "2026-11-03T08:00:00Z" }], movements: [] };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe("HMS workflow forms", () => {
 it("preserves a failed stock draft and reuses the operation key on an unchanged retry", async () => {
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => { if (!init?.method) return response({ data }); posts.push(JSON.parse(String(init.body))); return response({ error: "Save unavailable. Your entries are preserved." }, 503); }));
  render(<StockIntegrityPanel role="housekeeping" />);
  await screen.findByText("Hand towels");
  fireEvent.change(screen.getByLabelText("Quantity to issue"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Room / operational reference"), { target: { value: "Room 204" } });
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Extra supplies" } });
  fireEvent.click(screen.getByRole("button", { name: "Save movement" }));
  await screen.findByRole("alert");
  expect((screen.getByLabelText("Quantity to issue") as HTMLInputElement).value).toBe("2");
  expect((screen.getByLabelText("Reason") as HTMLTextAreaElement).value).toBe("Extra supplies");
  fireEvent.click(screen.getByRole("button", { name: "Save movement" }));
  await waitFor(() => expect(posts).toHaveLength(2));
  expect(posts[0].idempotencyKey).toBe(posts[1].idempotencyKey);
 });
 it("keeps Manager stock visibility read-only", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => response({ data })));
  render(<StockIntegrityPanel role="manager" />);
  await screen.findByText("Hand towels");
  expect(screen.queryByRole("button", { name: "Save movement" })).toBeNull();
 });
 it("starts physical cash count blank and requires a variance explanation", () => {
  const ledger = { cashShifts: [{ id: "shift-1", status: "open", staff_user_id: "actor", opening_amount: 1000, collected: 2000 }] } as unknown as AccountingLedger;
  render(<CashCountPanel ledger={ledger} actorId="actor" role="front_desk" onSaved={() => {}} />);
  const count = screen.getByLabelText("Physical cash counted (PHP)") as HTMLInputElement;
  expect(count.value).toBe("");
  fireEvent.change(count, { target: { value: "2990" } });
  expect((screen.getByLabelText("Count note / variance explanation") as HTMLTextAreaElement).required).toBe(true);
  fireEvent.submit(screen.getByRole("button", { name: "Close shared drawer" }).closest("form")!);
  expect(screen.getByRole("alert").textContent).toContain("Explain the cash difference");
 });
 it("restricts shared drawer closure to its opener or Accounting", () => {
  const ledger = { cashShifts: [{ id: "shift-1", status: "open", staff_user_id: "other", opening_amount: 1000, collected: 2000 }] } as unknown as AccountingLedger;
  render(<CashCountPanel ledger={ledger} actorId="actor" role="front_desk" onSaved={() => {}} />);
  expect(screen.queryByRole("button", { name: "Close shared drawer" })).toBeNull();
  expect(screen.getByText(/The opener or Accounting/)).toBeTruthy();
 });
});
