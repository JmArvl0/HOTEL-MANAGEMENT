import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: {} as Record<string, Record<string, unknown>[]>, objects: new Map<string, Uint8Array>(), submissions: [] as Record<string, unknown>[] }));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { id: "guest-proof", role: "guest", disabled: false } }) }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase } = await import("./fake-supabase");
  return { supabase: {
    ...fakeSupabase(state.db),
    rpc: async (_name: string, args: Record<string, unknown>) => {
      state.submissions.push(args);
      state.db.payments.push({ id: "finalized-payment", proof_storage_path: args.p_proof_storage_path });
      state.db.booking_holds[0].status = "payment_submitted";
      return { data: [{ reservation_id: "offline-stay", confirmation_number: "offline", reservation_status: "pending", payment_status: "unpaid" }], error: null };
    },
    storage: { from: () => ({
      remove: async (paths: string[]) => { for (const p of paths) state.objects.delete(p); return { error: null }; },
      download: async (path: string) => ({ data: state.objects.has(path) ? new Blob([Uint8Array.from(state.objects.get(path)!)]) : null, error: null }),
      upload: async (path: string, bytes: Uint8Array) => { state.objects.set(path, bytes); return { error: null }; },
    }) },
  } };
});
const token = "11111111-1111-4111-8111-111111111111";
const path = `pending/${token}/22222222-2222-4222-8222-222222222222.png`;
beforeEach(() => {
  for (const key of Object.keys(state.db)) delete state.db[key];
  state.db.booking_holds = [{ token, user_id: "guest-proof", status: "payment_submitted" }];
  state.db.payments = [{ id: "proof-payment", proof_storage_path: path }];
  state.objects.clear(); state.objects.set(path, new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  state.submissions.length = 0;
});

it("submits a verified copy that staging deletion cannot reach", async () => {
  state.db.booking_holds[0].status = "active";
  state.db.payments = [];
  state.db.hotel_operational_policies = [{ key: "default", deposit_method: "manual", gcash_enabled: true, gcash_account_name: "Offline Hotel", gcash_mobile_number: "09171234567", gcash_qr_storage_path: "gcash/offline.png" }];
  const { POST } = await import("@/app/api/booking/holds/[token]/confirm/route");
  const response = await POST(new Request("http://localhost/confirm", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paymentMethod: "manual_gcash", paymentReference: "offline-reference", proofPath: path }),
  }), { params: Promise.resolve({ token }) });
  expect(response.status).toBe(200);
  const finalized = String(state.submissions[0].p_proof_storage_path);
  expect(finalized).toMatch(new RegExp(`^submitted/${token}/`));
  expect(state.objects.get(finalized)).toEqual(state.objects.get(path));
});

it("protects legacy submitted proof that still uses the pending namespace", async () => {
  const { DELETE } = await import("@/app/api/booking/holds/[token]/proof/route");
  const response = await DELETE(new Request("http://localhost/proof", {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }),
  }), { params: Promise.resolve({ token }) });
  expect(response.status).toBe(409);
  expect(state.objects.has(path)).toBe(true);
});
