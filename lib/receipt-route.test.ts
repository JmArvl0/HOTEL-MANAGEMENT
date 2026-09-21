// The two receipt endpoints, exercised rather than grepped.
//
// A payment id is the only thing a caller controls, so these tests hand the
// routes an id belonging to someone else, an unsettled one and a refund, and
// require the same 404 every time. The email route additionally has to prove
// that the inbox is the session's and not the request body's.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { type FakeDb } from "@/lib/fake-supabase";

const fake = vi.hoisted(() => ({ db: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("@/lib/supabase", async () => {
  const { fakeSupabase: make } = await import("@/lib/fake-supabase");
  return { supabase: make(fake.db as FakeDb) };
});
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));

const mail = vi.hoisted(() => ({ configured: true, sent: [] as { to: string; subject: string; html: string; attachments?: { filename: string; content: string }[] }[] }));
vi.mock("@/lib/email", () => ({
  emailConfigured: () => mail.configured,
  guestEmailHtml: (title: string, body: string) => `${title}\n${body}`,
  sendEmail: async (message: (typeof mail.sent)[number]) => {
    mail.sent.push(message);
    return { ok: true };
  },
}));

const { GET } = await import("@/app/api/account/receipts/[paymentId]/route");
const { POST } = await import("@/app/api/account/receipts/[paymentId]/email/route");
const { receiptPdf } = await import("@/lib/receipt-pdf");
const { getServerSession } = await import("next-auth");

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

const session = (over: Record<string, unknown> = {}) =>
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: A, email: "alfa@example.test", role: "guest", disabled: false, ...over } } as never);

function seed(): FakeDb {
  return {
    reservations: [
      { id: "res-alfa", user_id: A, confirmation_number: "HVN-alfa", guest_name: "Guest alfa", room_type: "Deluxe King", check_in: "2026-09-15", check_out: "2026-09-18", operational_policy_snapshot: null },
      { id: "res-bravo", user_id: B, confirmation_number: "HVN-BRAVO", guest_name: "Guest BRAVO", room_type: "Deluxe King", check_in: "2026-09-15", check_out: "2026-09-18", operational_policy_snapshot: null },
    ],
    payments: [
      { id: "pay-alfa", reservation_id: "res-alfa", amount: 1740, currency: "PHP", method: "manual_gcash", reference: "REF-alfa", purpose: "reservation_deposit", status: "paid", submitted_at: "2026-09-01T00:00:00Z", verified_at: "2026-09-01T01:00:00Z", created_at: "2026-09-01T00:00:00Z" },
      { id: "pay-bravo", reservation_id: "res-bravo", amount: 9000, currency: "PHP", method: "manual_gcash", reference: "REF-BRAVO", purpose: "reservation_deposit", status: "paid", submitted_at: "2026-09-01T00:00:00Z", verified_at: "2026-09-01T01:00:00Z", created_at: "2026-09-01T00:00:00Z" },
    ],
    financial_documents: [
      { id: "doc-alfa", document_number: "RCP-260918-A1B2C3", document_type: "receipt", reservation_id: "res-alfa", payment_id: "pay-alfa", created_at: "2026-09-05T00:00:00Z" },
    ],
  };
}

const params = (paymentId: string) => ({ params: Promise.resolve({ paymentId }) });
const get = (paymentId: string) => GET(new Request(`http://haven.local/api/account/receipts/${paymentId}`), params(paymentId));
const post = (paymentId: string, body: unknown = undefined) =>
  POST(
    new Request(`http://haven.local/api/account/receipts/${paymentId}/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    params(paymentId),
  );

beforeEach(() => {
  for (const key of Object.keys(fake.db)) delete fake.db[key];
  Object.assign(fake.db, seed());
  mail.configured = true;
  mail.sent.length = 0;
  vi.mocked(getServerSession).mockReset();
});

describe("the receipt download endpoint", () => {
  it("serves the signed-in customer their own receipt", async () => {
    session();
    const response = await get("pay-alfa");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { paymentReference: "pay-alfa", amount: 1740, documentNumber: "RCP-260918-A1B2C3" } });
  });

  it("answers 404 — not 403 — for another customer's id and says nothing about it", async () => {
    session();
    const response = await get("pay-bravo");
    expect(response.status).toBe(404);
    expect(JSON.stringify(await response.json())).not.toContain("BRAVO");
  });

  it("refuses money that is not settled yet, and a refund", async () => {
    session();
    for (const [status, purpose] of [["pending_verification", "reservation_deposit"], ["failed", "reservation_deposit"], ["paid", "refund"]] as const) {
      fake.db.payments[0].status = status;
      fake.db.payments[0].purpose = purpose;
      expect((await get("pay-alfa")).status).toBe(404);
    }
  });

  it("turns an anonymous visitor away before touching the database", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    expect((await get("pay-alfa")).status).toBe(401);
  });

  it("refuses a staff session on a customer endpoint", async () => {
    session({ role: "accounting" });
    expect((await get("pay-alfa")).status).toBe(403);
  });
});

describe("the receipt email endpoint", () => {
  it("sends to the account address with the receipt PDF attached", async () => {
    session();
    const response = await post("pay-alfa");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, to: "alfa@example.test" });

    expect(mail.sent).toHaveLength(1);
    const [message] = mail.sent;
    expect(message.to).toBe("alfa@example.test");
    expect(message.subject).toContain("HVN-alfa");
    // The email body is the same row list the preview and PDF walk.
    expect(message.html).toContain("RCP-260918-A1B2C3");
    expect(message.html).toContain("Amount paid");
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments?.[0].filename).toBe("HAVEN-Receipt-HVN-alfa.pdf");
    // The attachment is the PDF of the very document the preview serves — not a
    // second rendering that could disagree with it.
    const { data } = await (await get("pay-alfa")).json();
    expect(message.attachments?.[0].content).toBe(Buffer.from(receiptPdf(data)).toString("base64"));
  });

  it("ignores an address supplied in the request body", async () => {
    session();
    await post("pay-alfa", { to: "attacker@example.test", email: "attacker@example.test" });
    expect(mail.sent[0].to).toBe("alfa@example.test");
    expect(JSON.stringify(mail.sent[0])).not.toContain("attacker@example.test");
  });

  it("refuses another customer's receipt and sends nothing", async () => {
    session();
    expect((await post("pay-bravo")).status).toBe(404);
    expect(mail.sent).toHaveLength(0);
  });

  it("reports unavailability rather than faking a send when no provider is configured", async () => {
    session();
    mail.configured = false;
    const response = await post("pay-alfa");
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: "EMAIL_UNAVAILABLE" });
    expect(mail.sent).toHaveLength(0);
  });

  it("refuses an account with no address instead of guessing one", async () => {
    session({ email: null });
    expect((await post("pay-alfa")).status).toBe(409);
    expect(mail.sent).toHaveLength(0);
  });
});
