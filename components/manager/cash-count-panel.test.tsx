// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import CashCountPanel from "./cash-count-panel";
import type { AccountingLedger } from "@/lib/accounting";

const basis = "a".repeat(32), nextBasis = "b".repeat(32);
const closeKey = "11111111-1111-4111-8111-111111111111";
const shift = { id: "drawer", staff_user_id: "cashier", status: "open", opening_amount: 1000, collected: 2000 };
const ledger = { cashShifts: [shift], transactions: [] } as unknown as AccountingLedger;
const response = (data: unknown, status = 200) => new Response(JSON.stringify(status === 200 ? { data } : { error: data }), { status });
function setup() {
  let saved: Record<string, unknown> | null = null;
  const fetch = vi.fn(async (_url: string, init?: RequestInit): Promise<Response> => {
    if (init?.method === "PUT") {
      const value = JSON.parse(String(init.body));
      saved = { actualCash: value.actualCash, notes: value.notes, basis: value.basis, version: (saved?.version as number ?? 0) + 1, closeKey, updatedAt: "2026-11-05T04:00:00Z", invalidatedAt: null, stale: false };
      return response(saved);
    }
    if (init?.method === "PATCH") return response({ expectedCash: 3000, actualCash: 3000, variance: 0 });
    return response({ status: "open", basis, expectedCash: 3000, draft: saved });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const props = () => ({ ledger, actorId: "cashier", role: "front_desk" as const, onSaved: vi.fn(), onStale: vi.fn() });
async function enterCount() {
  await waitFor(() => expect((screen.getByLabelText("Physical cash counted (PHP)") as HTMLInputElement).disabled).toBe(false));
  fireEvent.change(screen.getByLabelText("Physical cash counted (PHP)"), { target: { value: "3000" } });
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("saved physical cash counts", () => {
  it("explicitly saves and restores a draft after remount, without closing the drawer", async () => {
    const fetch = setup(); const p = props(); const first = render(<CashCountPanel {...p} />);
    await enterCount(); fireEvent.change(screen.getByLabelText("Count note / variance explanation"), { target: { value: "Counted independently" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft & return" }));
    await screen.findByText(/Draft saved at/);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(0);
    first.unmount(); render(<CashCountPanel {...p} />);
    fireEvent.click(await screen.findByRole("button", { name: "Resume saved draft" }));
    expect((screen.getByLabelText("Physical cash counted (PHP)") as HTMLInputElement).value).toBe("3000");
    expect((screen.getByLabelText("Count note / variance explanation") as HTMLTextAreaElement).value).toBe("Counted independently");
  });
  it("keeps input and an honest unsaved state when save fails", async () => {
    setup(); vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => init?.method ? response("Save unavailable", 503) : response({ status: "open", basis, expectedCash: 3000, draft: null })));
    render(<CashCountPanel {...props()} />); await enterCount();
    fireEvent.click(screen.getByRole("button", { name: "Save draft & return" }));
    await screen.findByText("Save unavailable");
    expect((screen.getByLabelText("Physical cash counted (PHP)") as HTMLInputElement).value).toBe("3000");
    expect(screen.getByText(/Unsaved changes/)).toBeTruthy();
  });
  it("closes using the stored version/key and retries the identical request after a lost response", async () => {
    const fetch = setup(); let first = true;
    const original = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (url, init) => {
      if (init?.method === "PATCH" && first) { first = false; throw new Error("Connection lost"); }
      return original(url, init);
    });
    const p = props(); render(<CashCountPanel {...p} />); await enterCount();
    fireEvent.click(screen.getByRole("button", { name: "Close shared drawer" }));
    await screen.findByText(/Connection lost/);
    fireEvent.click(screen.getByRole("button", { name: "Retry closing drawer" }));
    await waitFor(() => expect(p.onSaved).toHaveBeenCalled());
    const writes = fetch.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(writes).toHaveLength(2);
    expect(JSON.parse(String(writes[0][1]?.body))).toEqual({ action: "close", draftVersion: 1, idempotencyKey: closeKey });
    expect(writes[0][1]?.body).toBe(writes[1][1]?.body);
    expect(fetch.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1);
  });
  it("requires a fresh count when a restored draft has stale activity", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ status: "open", basis: nextBasis, expectedCash: 3000, draft: { actualCash: 3000, notes: "Old count", basis, version: 2, closeKey, updatedAt: "2026-11-05T04:00:00Z", stale: true } })));
    render(<CashCountPanel {...props()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Resume saved draft" }));
    expect(screen.getByText(/Cash activity changed/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Close shared drawer" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Start a fresh count" }));
    expect((screen.getByLabelText("Physical cash counted (PHP)") as HTMLInputElement).value).toBe("");
  });
});
