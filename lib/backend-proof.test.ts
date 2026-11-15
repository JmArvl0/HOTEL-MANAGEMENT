import { expect, it, vi } from "vitest";
import { GET as readProof } from "@/app/api/booking/payments/[id]/proof/route";
import { DELETE as deleteStagedProof, POST as uploadProof } from "@/app/api/booking/holds/[token]/proof/route";
import { POST as submitDeposit } from "@/app/api/booking/holds/[token]/confirm/route";
import { POST as submitStayPayment } from "@/app/api/account/reservations/[id]/payments/route";
import { POST as startPayMongo } from "@/app/api/booking/payments/gateway/route";
import { POST as receivePayMongo } from "@/app/api/webhooks/payments/route";
import { PATCH as updateDestination } from "@/app/api/owner/payment-destination/route";
import { POST as uploadQr, DELETE as deleteQr } from "@/app/api/owner/payment-qr/route";
import { POST as verifyDeposit } from "@/app/api/front-desk/deposits/[id]/verify/route";
import { POST as reviewStayPayment } from "@/app/api/accounting/payments/[id]/verify/route";
import { POST as rejectDeposit } from "@/app/api/accounting/payments/[id]/reject/route";

const proof = vi.hoisted(() => ({
  id: "11111111-1111-4111-8111-111111111111",
  path: "pending/old-hold/legacy.png",
  createSignedUrl: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: async () => ({ user: { id: "proof-owner", role: "guest" } }),
}));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase } = await import("./fake-supabase");
  return { supabase: {
    ...fakeSupabase({
      payments: [{ id: proof.id, proof_storage_path: proof.path, reservations: { user_id: "proof-owner" } }],
      audit_logs: [],
    }),
    storage: { from: () => ({ createSignedUrl: proof.createSignedUrl }) },
  } };
});

it.each([
  ["manual booking deposit", submitDeposit],
  ["manual stay balance", submitStayPayment],
  ["staged proof upload", uploadProof],
  ["staged proof deletion", deleteStagedProof],
  ["PayMongo checkout", startPayMongo],
  ["PayMongo webhook", receivePayMongo],
  ["manual payment destination update", updateDestination],
  ["payment QR upload", uploadQr],
  ["payment QR deletion", deleteQr],
  ["staff deposit verification", verifyDeposit],
  ["Accounting stay payment review", reviewStayPayment],
  ["Accounting deposit rejection", rejectDeposit],
] as const)("returns gone for %s", async (_name, handler) => {
  const response = handler();
  expect(response.status).toBe(410);
  expect(await response.json()).toHaveProperty("error", expect.any(String));
});

it("keeps historical payment proof readable, even in the old staged namespace", async () => {
  proof.createSignedUrl.mockResolvedValue({ data: { signedUrl: "https://example.test/legacy.png" }, error: null });
  const response = await readProof(new Request("https://example.test/proof"), {
    params: Promise.resolve({ id: proof.id }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(proof.createSignedUrl).toHaveBeenCalledWith(proof.path, 60);
});
