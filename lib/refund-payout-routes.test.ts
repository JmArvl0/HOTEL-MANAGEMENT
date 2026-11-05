import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Role } from "@/lib/types";

const state = vi.hoisted(() => ({ role: "accounting" as Role, rpc: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { id: "accountant", role: state.role } }) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: state.rpc } }));
import { POST } from "@/app/api/accounting/refunds/[id]/process/route";

const drawer = "11111111-1111-4111-8111-111111111111";
const process = (body: unknown) => POST(new Request("http://localhost/api/accounting/refunds/refund/process", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "refund" }) });
beforeEach(() => { state.role = "accounting"; state.rpc.mockReset().mockResolvedValue({ data: [{ refund_status: "processed", refund_amount: 250 }], error: null }); });

describe("explicit refund payout", () => {
  it("requires an explicit payout method", async () => {
    expect((await process({ reference: "voucher" })).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("requires a drawer for cash and rejects a drawer for external payouts", async () => {
    expect((await process({ method: "cash", reference: "voucher" })).status).toBe(400);
    expect((await process({ method: "bank_transfer", cashShiftId: drawer, reference: "transfer" })).status).toBe(400);
    expect(state.rpc).not.toHaveBeenCalled();
  });
  it("uses the session actor and selected drawer, never a client supplied refund amount", async () => {
    const response = await process({ method: "cash", cashShiftId: drawer, reference: " voucher ", amount: 9999, actorId: "forged" });
    expect(response.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith("process_refund", { p_refund_id: "refund", p_staff_user_id: "accountant", p_reference: "voucher", p_method: "cash", p_cash_shift_id: drawer });
  });
  it("records an external method without any drawer", async () => {
    expect((await process({ method: "gcash", reference: "external-ref" })).status).toBe(200);
    expect(state.rpc.mock.calls[0][1]).toMatchObject({ p_method: "gcash", p_cash_shift_id: null });
  });
  it("gives an actionable insufficient cash error", async () => {
    state.rpc.mockResolvedValue({ error: { message: "INSUFFICIENT_DRAWER_CASH" } });
    const response = await process({ method: "cash", cashShiftId: drawer, reference: "voucher" });
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/insufficient|enough/i);
  });
  it.each<Role>(["front_desk", "manager", "owner", "admin", "guest"])("does not grant %s refund execution", async role => {
    state.role = role;
    expect((await process({ method: "cash", cashShiftId: drawer, reference: "voucher" })).status).toBe(403);
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
