import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  gatewayEventAmountCentavos,
  gatewayEventRef,
  parsePaymongoSignatureHeader,
  toCentavos,
  verifyWebhookSignature,
} from "@/lib/gateway";
import { confirmGatewayEvent } from "@/lib/gateway-store";

// Normalized to LF: core.autocrlf=true checks tracked files out with CRLF while
// newly written files stay LF, so raw working-tree bytes are checkout-dependent.
// These contracts assert the *content* of a migration, not its line endings.
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const SECRET = "whsec-paymongo-test";
const ts = () => Math.floor(Date.now() / 1000);

/** Documented PayMongo header: HMAC over "<t>.<raw body>", signed per mode. */
const paymongoHeader = (raw: string, mode: "te" | "li" = "te", secret: string = SECRET) => {
  const t = ts();
  const sig = createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  return mode === "te" ? `t=${t},te=${sig},li=` : `t=${t},te=,li=${sig}`;
};

const paidEvent = (sessionId: string, eventId: string, amountCentavos?: number) => ({
  type: "checkout_session.payment.paid",
  data: {
    id: eventId,
    attributes: {
      data: {
        id: sessionId,
        ...(amountCentavos === undefined
          ? {}
          : { attributes: { line_items: [{ amount: amountCentavos, quantity: 1 }] } }),
      },
    },
  },
});

/** Minimal stub of the supabase client surface confirmGatewayEvent uses. */
function stubClient(
  payment: { id: string; amount: number } | null,
  rpc?: { data?: unknown; error?: { message: string } }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: payment }) }),
      }),
    }),
    rpc: async () => rpc ?? { data: [{ reservation_id: "RSV-1", reservation_status: "confirmed" }], error: null },
  };
  return client;
}

describe("centavo conversion", () => {
  it("converts pesos to whole centavos", () => {
    expect(toCentavos(1500)).toBe(150000);
    expect(toCentavos("1,500.00")).toBe(150000);
    expect(toCentavos(0.05)).toBe(5);
    expect(toCentavos(1234.56)).toBe(123456);
  });
  it("rejects negative or sub-centavo amounts", () => {
    expect(() => toCentavos(-1)).toThrow("INVALID_AMOUNT");
    expect(() => toCentavos(0.001)).toThrow("INVALID_AMOUNT");
    expect(() => toCentavos(Number.NaN)).toThrow("INVALID_AMOUNT");
  });
});

describe("Paymongo-Signature header parsing", () => {
  it("parses t/te/li parts", () => {
    const header = `t=1496734173,te=abc123,li=def456`;
    expect(parsePaymongoSignatureHeader(header)).toEqual({
      timestamp: "1496734173",
      test: "abc123",
      live: "def456",
    });
  });
  it("tolerates empty signature values from the docs examples", () => {
    expect(parsePaymongoSignatureHeader("t=1496734173,te=1447a89e,li=")).toEqual({
      timestamp: "1496734173",
      test: "1447a89e",
      live: "",
    });
    expect(parsePaymongoSignatureHeader("t=1492224173,te=,li=3f7b59")).toEqual({
      timestamp: "1492224173",
      test: "",
      live: "3f7b59",
    });
  });
  it("rejects non-header shapes, including a bare hex digest", () => {
    expect(parsePaymongoSignatureHeader("deadbeef")).toBeNull();
    expect(parsePaymongoSignatureHeader("")).toBeNull();
    expect(parsePaymongoSignatureHeader("t=123")).toBeNull();
    expect(parsePaymongoSignatureHeader("x=1,te=2")).toBeNull();
  });
});

describe("webhook signature verification", () => {
  it("accepts a valid test-mode signature over the raw body", () => {
    const raw = '{"type":"checkout_session.payment.paid"}';
    expect(verifyWebhookSignature(raw, paymongoHeader(raw, "te"), SECRET)).toBe(true);
  });
  it("accepts a valid live-mode signature when the secret is sk_live_", () => {
    const raw = '{"type":"payment.paid"}';
    const liveSecret = "sk_live_abc123";
    const header = paymongoHeader(raw, "li", liveSecret);
    expect(verifyWebhookSignature(raw, header, liveSecret)).toBe(true);
  });
  it("rejects tampered payloads and wrong secrets", () => {
    const raw = '{"type":"payment.paid"}';
    expect(verifyWebhookSignature(raw + "x", paymongoHeader(raw), SECRET)).toBe(false);
    expect(verifyWebhookSignature(raw, paymongoHeader(raw), "whsec-other")).toBe(false);
  });
  it("rejects expired timestamps (replay protection)", () => {
    const raw = '{"type":"payment.paid"}';
    const stale = `t=${ts() - 3600},te=${createHmac("sha256", SECRET).update(`${ts() - 3600}.${raw}`).digest("hex")},li=`;
    expect(verifyWebhookSignature(raw, stale, SECRET)).toBe(false);
  });
  it("still accepts the legacy bare-digest format for older deployments", () => {
    const raw = '{"type":"payment.paid"}';
    const legacy = createHmac("sha256", SECRET).update(raw).digest("hex");
    expect(verifyWebhookSignature(raw, legacy, SECRET)).toBe(true);
    expect(verifyWebhookSignature(raw + "x", legacy, SECRET)).toBe(false);
  });
  it("rejects empty inputs", () => {
    expect(verifyWebhookSignature("", paymongoHeader("{}"), SECRET)).toBe(false);
    expect(verifyWebhookSignature("{}", "", SECRET)).toBe(false);
    expect(verifyWebhookSignature("{}", paymongoHeader("{}"), "")).toBe(false);
  });
});

describe("gateway event mapping", () => {
  it("extracts session + event ids from a checkout_session paid event", () => {
    expect(gatewayEventRef(paidEvent("cs_1", "evt_1"))).toEqual({ sessionId: "cs_1", eventId: "evt_1" });
  });
  it("extracts the session id from a v1 payment.paid event", () => {
    const event = {
      type: "payment.paid",
      data: {
        id: "evt_2",
        attributes: { data: { id: "pay_1", attributes: { checkout_session_id: "cs_9" } } },
      },
    };
    expect(gatewayEventRef(event)).toEqual({ sessionId: "cs_9", eventId: "evt_2" });
  });
  it("extracts the session id from a v2 payment.paid event", () => {
    const event = {
      type: "payment.paid",
      data: {
        id: "evt_3",
        attributes: { data: { id: "pay_2", attributes: { checkout_session: { id: "cs_10" } } } },
      },
    };
    expect(gatewayEventRef(event)).toEqual({ sessionId: "cs_10", eventId: "evt_3" });
  });
  it("falls back to the reference number when no resource id exists", () => {
    const event = {
      type: "payment.paid",
      data: { id: "evt_4", attributes: { reference_number: "ref123" } },
    };
    expect(gatewayEventRef(event)).toEqual({ sessionId: "ref123", eventId: "evt_4" });
  });
  it("returns null for malformed payloads", () => {
    expect(gatewayEventRef(null)).toBeNull();
    expect(gatewayEventRef({ type: "x" })).toBeNull();
    expect(gatewayEventRef({ data: { id: "evt" } })).toBeNull();
  });
});

describe("event amount extraction", () => {
  it("reads a direct amount attribute", () => {
    const event = { data: { attributes: { data: { attributes: { amount: 150000 } } } } };
    expect(gatewayEventAmountCentavos(event)).toBe(150000);
  });
  it("sums line items with quantities", () => {
    const event = {
      data: { attributes: { data: { attributes: { line_items: [{ amount: 50000, quantity: 3 }] } } } },
    };
    expect(gatewayEventAmountCentavos(event)).toBe(150000);
  });
  it("returns null when the payload carries no verifiable amount", () => {
    expect(gatewayEventAmountCentavos(paidEvent("cs_1", "evt_1"))).toBeNull();
    expect(gatewayEventAmountCentavos({ type: "x" })).toBeNull();
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
  it("ignores payment.failed — only paid money confirms", async () => {
    const client = stubClient(null);
    let rpcCalled = false;
    client.rpc = async () => {
      rpcCalled = true;
      return { data: null, error: null };
    };
    const event = { ...paidEvent("cs_1", "evt_1"), type: "payment.failed" };
    expect(await confirmGatewayEvent(client, event)).toBe("ignored");
    expect(rpcCalled).toBe(false);
  });
  it("raises PAYMENT_NOT_FOUND for an unknown session id", async () => {
    await expect(confirmGatewayEvent(stubClient(null), paidEvent("cs_x", "evt_x"))).rejects.toThrow(
      "PAYMENT_NOT_FOUND"
    );
  });
  it("rejects a paid amount that mismatches the pending payment", async () => {
    await expect(
      confirmGatewayEvent(stubClient({ id: "pay-1", amount: 1500 }), paidEvent("cs_1", "evt_1", 99000))
    ).rejects.toThrow("PAYMENT_AMOUNT_MISMATCH");
  });
  it("confirms through the RPC when the amount matches", async () => {
    const outcome = await confirmGatewayEvent(
      stubClient({ id: "pay-1", amount: 1500 }),
      paidEvent("cs_1", "evt_1", 150000)
    );
    expect(outcome).toEqual({ reservationId: "RSV-1", status: "confirmed" });
  });
  it("confirms without an amount check when the payload carries none", async () => {
    const outcome = await confirmGatewayEvent(stubClient({ id: "pay-1", amount: 1500 }), paidEvent("cs_1", "evt_1"));
    expect(outcome).toEqual({ reservationId: "RSV-1", status: "confirmed" });
  });
  it("maps idempotency to the RPC: a replayed webhook event returns existing state", async () => {
    let rpcPayload: unknown = null;
    const client = stubClient({ id: "pay-1", amount: 1500 });
    client.rpc = async (_name: string, args: unknown) => {
      rpcPayload = args;
      return {
        data: [{ reservation_id: "RSV-1", reservation_status: "confirmed" }],
        error: null,
      };
    };
    const event = paidEvent("cs_1", "evt_replay", 150000);
    const first = await confirmGatewayEvent(client, event);
    const second = await confirmGatewayEvent(client, event);
    expect(first).toEqual({ reservationId: "RSV-1", status: "confirmed" });
    expect(second).toEqual(first);
    expect(rpcPayload).toEqual({ p_payment_id: "pay-1", p_gateway_ref: "cs_1", p_webhook_id: "evt_replay" });
  });
});

describe("paymongo migration contract", () => {
  const sql = read("supabase/migrations/20261021010000_paymongo_gcash_automation.sql");
  it("re-asserts the gateway columns and unique idempotency indexes", () => {
    for (const fragment of [
      "add column if not exists payment_gateway text",
      "add column if not exists gateway_reference_id text",
      "add column if not exists webhook_event_id text",
      "payments_gateway_reference_unique",
      "payments_webhook_event_unique",
    ]) {
      expect(sql, fragment).toContain(fragment);
    }
  });
  it("treats same-reference settlement as an idempotent replay, not a conflict", () => {
    expect(sql).toContain("if p.status = 'paid' then");
    expect(sql).toContain("p.gateway_reference_id = p_gateway_ref then");
    expect(sql).toContain("GATEWAY_REFERENCE_CONFLICT");
  });
  it("keeps the RPC locked to the service role", () => {
    expect(sql).toContain("grant execute on function public.confirm_gateway_payment(uuid,text,text) to service_role");
  });
});

// The live database was missing submit_gateway_deposit while its migration
// (20261016010000) was already recorded as applied, so `supabase db push` could
// never recreate it and the deposit flow failed with the generic 500. This
// contract pins the restore migration to the canonical definition.
describe("gateway deposit RPC restore migration contract", () => {
  const restore = read("supabase/migrations/20261024040000_restore_submit_gateway_deposit.sql");
  const source = read("supabase/migrations/20261016010000_express_checkin_and_gateway.sql");

  /** The canonical function text: signature through its terminating end$$; */
  const canonical = (() => {
    const start = source.indexOf("create or replace function public.submit_gateway_deposit(");
    const end = source.indexOf("end$$;", start);
    return source.slice(start, end + "end$$;".length);
  })();

  it("carries the canonical function body verbatim, with the same signature", () => {
    expect(canonical.length).toBeGreaterThan(0);
    expect(restore).toContain(canonical);
    expect(restore).toContain("p_token uuid, p_user_id uuid, p_gateway_ref text");
    expect(restore).toContain("returns table(reservation_id text, confirmation_number text, reservation_status text");
    expect(restore).toContain("language plpgsql security definer set search_path=public");
  });

  it("keeps every guard code the route and webhook map on", () => {
    for (const code of [
      "HOLD_NOT_FOUND",
      "HOLD_EXPIRED",
      "INVALID_GATEWAY_PAYLOAD",
      "INVALID_DEPOSIT_AMOUNT",
      "RATE_CHANGED",
      "ROOM_TYPE_UNAVAILABLE",
    ]) {
      expect(restore, code).toContain(code);
    }
    // A hold that already has a reservation returns its state (idempotent retry).
    expect(restore).toContain("if h.reservation_id is not null then");
    // The gateway payment row is what the webhook looks up by reference.
    expect(restore).toContain("'gateway_paymongo',trim(p_gateway_ref),");
  });

  it("re-asserts the gateway columns and indexes idempotently", () => {
    for (const fragment of [
      "add column if not exists payment_gateway text",
      "add column if not exists gateway_reference_id text",
      "add column if not exists webhook_event_id text",
      "payments_gateway_reference_unique",
      "payments_webhook_event_unique",
    ]) {
      expect(restore, fragment).toContain(fragment);
    }
  });

  it("keeps the RPC service-role only", () => {
    expect(restore).toContain(
      "revoke all on function public.submit_gateway_deposit(uuid,uuid,text) from public, anon, authenticated"
    );
    expect(restore).toContain("grant execute on function public.submit_gateway_deposit(uuid,uuid,text) to service_role");
  });

  // The regression this whole file exists for: a guard code the route does not map
  // falls through to the generic 500, so the guest sees "Unable to start online
  // payment." and nothing says why. Every code the RPC can raise must be named
  // explicitly in the route.
  it("maps every guard code the RPC can raise", () => {
    const route = read("app/api/booking/payments/gateway/route.ts");
    const codes = [...restore.matchAll(/raise exception '([A-Z_]+)'/g)].map((m) => m[1]);
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) expect(route, code).toContain(`code === "${code}"`);
    // And the failure has to be recorded before it is mapped away.
    expect(route).toContain("[gateway] submit_gateway_deposit failed");
  });
});
