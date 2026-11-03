import { expect, it, vi } from "vitest";

const pending = vi.hoisted(() => ({ release: () => {}, started: false }));
vi.mock("next-auth", () => ({ getServerSession: async () => ({ user: { id: "guest", role: "guest", email: "offline@example.invalid" } }) }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: async () => ({ data: [{ eligible_refund: 0 }], error: null }) } }));
vi.mock("@/lib/notifications", () => ({ notifyWithOptionalEmail: () => {
  pending.started = true;
  return new Promise<void>((resolve) => { pending.release = resolve; });
} }));

it("does not acknowledge cancellation before the durable notification finishes", async () => {
  const { POST } = await import("@/app/api/account/reservations/[id]/cancel/route");
  let acknowledged = false;
  const response = POST(new Request("http://localhost/api/account/reservations/offline/cancel", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "Offline lifecycle test" }),
  }), { params: Promise.resolve({ id: "offline" }) }).then((r) => { acknowledged = true; return r; });
  try {
    await vi.waitFor(() => expect(pending.started).toBe(true));
    expect(acknowledged).toBe(false);
  } finally { pending.release(); }
  expect((await response)?.status).toBe(200);
});
