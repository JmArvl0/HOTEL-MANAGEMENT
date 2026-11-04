import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/types";

const state = vi.hoisted(() => ({ role: "front_desk" as Role, disabled: false, rpc: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { id: "11111111-1111-4111-8111-111111111111", role: state.role, disabled: state.disabled } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: state.rpc } }));
import { POST } from "@/app/api/accounting/cash-shifts/route";
import { PATCH } from "@/app/api/accounting/cash-shifts/[id]/route";

const actor = "11111111-1111-4111-8111-111111111111";
const key = "22222222-2222-4222-8222-222222222222";
const params = { params: Promise.resolve({ id: "33333333-3333-4333-8333-333333333333" }) };
const request = (body: unknown) => new Request("http://localhost/api/accounting/cash-shifts", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => { state.role = "front_desk"; state.disabled = false; state.rpc.mockReset(); state.rpc.mockResolvedValue({ data: { status: "open" }, error: null }); });

describe("cash action HTTP destinations", () => {
  it("sends the opening float/location to the real opening RPC with the session actor", async () => {
    const res = await POST(request({ openingAmount: 1000, location: "Front Desk", staff_user_id: "forged" }));
    expect(res.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith("accounting_open_cash_shift", { p_staff_user_id: actor, p_location: "Front Desk", p_opening_amount: 1000 });
  });
  it("sends count/note/key to the selected shift, excluding client-supplied expected cash", async () => {
    state.rpc.mockResolvedValue({ data: { status: "closed", expectedCash: 3000, actualCash: 2750, variance: -250 }, error: null });
    const res = await PATCH(request({ action: "close", actualCash: 2750, notes: "Independent count", idempotencyKey: key, expectedCash: 0, variance: 0 }), params);
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith("accounting_close_cash_shift", { p_shift_id: "33333333-3333-4333-8333-333333333333", p_actual_cash: 2750, p_notes: "Independent count", p_idempotency_key: key, p_staff_user_id: actor });
    expect(await res.json()).toEqual({ data: { status: "closed", expectedCash: 3000, actualCash: 2750, variance: -250 } });
  });
  it("sends Accounting review to cash reconciliation rather than statement reconciliation", async () => {
    state.role = "accounting";
    const res = await PATCH(request({ action: "reconcile", notes: "Reviewed shortage" }), params);
    expect(res.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith("accounting_reconcile_cash_shift", { p_shift_id: "33333333-3333-4333-8333-333333333333", p_staff_user_id: actor, p_notes: "Reviewed shortage" });
  });
  it.each<Role>(["front_desk", "manager", "guest", "owner", "admin"])("rejects %s cash reconciliation before any database call", async role => {
    state.role = role;
    expect((await PATCH(request({ action: "reconcile", notes: "Review" }), params)).status).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("rejects missing physical count and retry key without writing", async () => {
    expect((await PATCH(request({ action: "close", notes: "No count", idempotencyKey: key }), params)).status).toBe(400);
    expect((await PATCH(request({ action: "close", actualCash: 0 }), params)).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("rejects disabled sessions for open and close", async () => {
    state.disabled = true;
    expect((await POST(request({ openingAmount: 1000 }))).status).toBe(401);
    expect((await PATCH(request({ action: "close", actualCash: 1000, idempotencyKey: key }), params)).status).toBe(401);
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
