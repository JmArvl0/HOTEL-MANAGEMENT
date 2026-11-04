// @vitest-environment jsdom
// Regression coverage for the three findings recorded during HMS workflow QA.
// These are component interaction checks; database integrity is tested separately
// with real PostgreSQL in scripts/test-hms-integrity.mjs.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import StockIntegrityPanel from "./stock-integrity-panel";
import CashCountPanel from "./cash-count-panel";
import type { AccountingLedger } from "@/lib/accounting";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const original = { id: "QA-ITEM", name: "QA hand towels", quantity: 10, reorder_point: 2, unit: "pieces", updated_at: "2026-11-03T08:00:00Z" };
describe("HMS QA regressions", () => {
 it("QA-01: refreshing balances must not silently rebase an existing physical-count draft", async () => {
  let reads = 0;
  const posts: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
   if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); return response({ error: "QA endpoint: no write performed" }, 409); }
   reads++;
   return response({ data: { items: [{ ...original, ...(reads > 1 ? { quantity: 8, updated_at: "2026-11-03T08:05:00Z" } : {}) }], movements: [] } });
  }));
  render(<StockIntegrityPanel role="housekeeping" />);
  await screen.findByText("QA hand towels");
  fireEvent.change(screen.getByLabelText("Movement type"), { target: { value: "count" } });
  fireEvent.change(screen.getByLabelText("Physical quantity counted"), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("Room / operational reference"), { target: { value: "QA physical count" } });
  fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "Counted before the other staff issue" } });
  fireEvent.click(screen.getByRole("button", { name: "Refresh balances" }));
  await screen.findByText("QA hand towels · 8 pieces available");
  fireEvent.submit(screen.getByRole("button", { name: "Save movement" }).closest("form")!);
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0].quantity).toBe(10);
  // Keep the original optimistic-lock baseline unless the physical count is
  // explicitly discarded/reconfirmed.
  expect(posts[0].expectedUpdated).toBe(original.updated_at);
  await screen.findByRole("alert");
  // Clearing and recounting is an explicit new draft against refreshed stock.
  fireEvent.change(screen.getByLabelText("Physical quantity counted"), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Physical quantity counted"), { target: { value: "8" } });
  fireEvent.submit(screen.getByRole("button", { name: "Save movement" }).closest("form")!);
  await waitFor(() => expect(posts).toHaveLength(2));
  expect(posts[1].expectedUpdated).toBe("2026-11-03T08:05:00Z");
  expect(posts[1].idempotencyKey).not.toBe(posts[0].idempotencyKey);
 });
 it("QA-02: a drawer switch must not submit the previous drawer's physical count to the new drawer", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url, body: JSON.parse(String(init?.body)) }); return response({ error: "QA endpoint: no drawer closed" }, 409); }));
  const ledger = (id: string, opening: number) => ({ cashShifts: [{ id, status: "open", staff_user_id: "qa-actor", opening_amount: opening, collected: 0 }] }) as unknown as AccountingLedger;
  const { rerender } = render(<CashCountPanel ledger={ledger("QA-OLD-SHIFT", 1000)} actorId="qa-actor" role="front_desk" onSaved={() => {}} />);
  fireEvent.change(screen.getByLabelText("Physical cash counted (PHP)"), { target: { value: "1000" } });
  fireEvent.change(screen.getByLabelText("Count note / variance explanation"), { target: { value: "Counted the previous drawer" } });
  // An ordinary refresh of the same drawer preserves the count.
  rerender(<CashCountPanel ledger={ledger("QA-OLD-SHIFT", 1000)} actorId="qa-actor" role="front_desk" onSaved={() => {}} />);
  expect((screen.getByLabelText("Physical cash counted (PHP)") as HTMLInputElement).value).toBe("1000");
  // The parent polls the shared ledger. A colleague closes the old drawer and
  // opens another before this cashier submits the existing draft.
  rerender(<CashCountPanel ledger={ledger("QA-NEW-SHIFT", 500)} actorId="qa-actor" role="front_desk" onSaved={() => {}} />);
  fireEvent.submit(screen.getByRole("button", { name: "Close shared drawer" }).closest("form")!);
  expect((screen.getByLabelText("Physical cash counted (PHP)") as HTMLInputElement).value).toBe("");
  expect((screen.getByLabelText("Count note / variance explanation") as HTMLTextAreaElement).value).toBe("");
  expect(calls).toHaveLength(0);
  expect(screen.getByRole("alert").textContent).toContain("fresh physical cash count");
  fireEvent.change(screen.getByLabelText("Physical cash counted (PHP)"), { target: { value: "500" } });
  fireEvent.submit(screen.getByRole("button", { name: "Close shared drawer" }).closest("form")!);
  await waitFor(() => expect(calls).toHaveLength(1));
  expect(calls[0].url).toContain("QA-NEW-SHIFT");
  expect(calls[0].body.actualCash).toBe(500);
  await screen.findByRole("alert");
 });
});
