import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gatewayEventRef, verifyWebhookSignature } from "@/lib/gateway";
import { confirmGatewayEvent } from "@/lib/gateway-store";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const SECRET = "whsec-test-123";

const paidEvent = (sessionId: string, eventId: string) => ({
  type: "checkout_session.payment.paid",
  data: { id: eventId, attributes: { data: { id: sessionId } } },
});

/** Minimal stub of the supabase client surface confirmGatewayEvent uses. */
function stubClient(payment: { id: string } | null, rpc?: { data?: unknown; error?: { message: string } }) {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: payment }) }) }),
    }),
    rpc: async () => rpc ?? { data: [{ reservation_id: "RSV-1", reservation_status: "confirmed" }], error: null },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe("webhook signature", () => {
  it("accepts a correct HMAC and rejects tampering", async () => {
    const { createHmac } = await import("node:crypto");
    const raw = '{"type":"checkout_session.payment.paid"}';
    const good = createHmac("sha256", SECRET).update(raw).digest("hex");
    expect(verifyWebhookSignature(raw, good, SECRET)).toBe(true);
    expect(verifyWebhookSignature(raw + "x", good, SECRET)).toBe(false);
    expect(verifyWebhookSignature(raw, "00", SECRET)).toBe(false);
    expect(verifyWebhookSignature("", good, SECRET)).toBe(false);
  });
});

describe("gateway event mapping", () => {
  it("extracts session + event ids from a paid event", () => {
    expect(gatewayEventRef(paidEvent("cs_1", "evt_1"))).toEqual({ sessionId: "cs_1", eventId: "evt_1" });
  });
  it("returns null for malformed payloads", () => {
    expect(gatewayEventRef(null)).toBeNull();
    expect(gatewayEventRef({ type: "x" })).toBeNull();
  });
});

describe("confirmGatewayEvent", () => {
  it("ignores non-payment events without touching the RPC", async () => {
    let rpcCalled = false;
    const client = stubClient(null);
    client.rpc = async () => {
      rpcCalled = true;
      return { data: null, error: null };
    };
    expect(await confirmGatewayEvent(client, { type: "checkout_session.created", data: { id: "e" } })).toBe("ignored");
    expect(rpcCalled).toBe(false);
  });

  it("raises PAYMENT_NOT_FOUND for an unknown session id", async () => {
    await expect(confirmGatewayEvent(stubClient(null), paidEvent("cs_x", "evt_x"))).rejects.toThrow(
      "PAYMENT_NOT_FOUND"
    );
  });

  it("returns the confirmed reservation on success", async () => {
    const outcome = await confirmGatewayEvent(stubClient({ id: "pay-1" }), paidEvent("cs_1", "evt_1"));
    expect(outcome).toEqual({ reservationId: "RSV-1", status: "confirmed" });
  });
});

describe("express check-in migration contract", () => {
  const sql = read("supabase/migrations/20261016010000_express_checkin_and_gateway.sql");

  it("adds gateway + digital-key columns with unique idempotency indexes", () => {
    for (const fragment of [
      "add column if not exists payment_gateway text",
      "add column if not exists gateway_reference_id text",
      "add column if not exists webhook_event_id text",
      "payments_gateway_reference_unique",
      "payments_webhook_event_unique",
      "add column if not exists digital_key_hash text",
    ]) {
      expect(sql, fragment).toContain(fragment);
    }
  });

  it("gates self-check-in on all five eligibility rules with speakable codes", () => {
    for (const code of [
      "SELF_CHECKIN_FORBIDDEN",
      "SELF_CHECKIN_INVALID_QR",
      "SELF_CHECKIN_NOT_CONFIRMED",
      "SELF_CHECKIN_ID_UNVERIFIED",
      "SELF_CHECKIN_BALANCE_DUE",
      "SELF_CHECKIN_OUTSIDE_WINDOW",
      "SELF_CHECKIN_TOO_EARLY",
      "SELF_CHECKIN_ROOM_NOT_READY",
    ]) {
      expect(sql, code).toContain(code);
    }
    expect(sql).toContain("actor is null or actor <> 'guest'");
    expect(sql).toContain("status = 'occupied'");
    expect(sql).toContain("'express_self_check_in'");
  });

  it("locks RPCs to the service role and fixes the concierge enum gap", () => {
    expect(sql).toContain("grant execute on function public.confirm_gateway_payment(uuid,text,text) to service_role");
    expect(sql).toContain("grant execute on function public.express_qr_self_check_in(text,uuid) to service_role");
    expect(sql).toContain("'brief','ask','explain','report_summary','guest_concierge'");
  });
});
