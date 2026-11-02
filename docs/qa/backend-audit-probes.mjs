// Offline audit probes. Run: node docs/qa/backend-audit-probes.mjs
// Exit 1 means the expected backend behavior is violated. No network or DB writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { encode, decode } from "next-auth/jwt";

const compileUrl = (path, rewrite = (source) => source) => {
  const source = rewrite(readFileSync(path, "utf8"));
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
};
const gatewayUrl = compileUrl("lib/gateway.ts");
const { confirmGatewayEvent } = await import(compileUrl("lib/gateway-store.ts", (source) =>
  source.replace('"@/lib/gateway"', JSON.stringify(gatewayUrl))));
const { evaluateSessionExpiry, DEFAULT_SECURITY_POLICY } = await import(compileUrl(
  "lib/security-policy.ts", (source) => source.replace(
    'import { supabase } from "@/lib/supabase";', "const supabase = null;")));

let failures = 0;
async function probe(name, event) {
  let reachedDatabase = false;
  // A sentinel stops at the first DB operation. No database behavior is simulated.
  const client = { from() { reachedDatabase = true; throw new Error("AUDIT_DB_BOUNDARY"); } };
  try {
    try { await confirmGatewayEvent(client, event); }
    catch (error) { if (error.message !== "AUDIT_DB_BOUNDARY") throw error; }
    assert.equal(reachedDatabase, true, "paid event was silently ignored before lookup");
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}: ${error.message}`);
  }
}

const includeWebhooks = !process.argv.includes("--session-only");
if (includeWebhooks) {
await probe("PayMongo event envelope (data.attributes.type)", {
  data: {
    id: "evt_audit_offline",
    type: "event",
    attributes: {
      type: "checkout_session.payment.paid",
      livemode: false,
      data: { id: "cs_audit_offline", type: "checkout_session", attributes: {
        line_items: [{ amount: 150000, quantity: 1 }],
      } },
    },
  },
});

await probe("PayMongo hosted-checkout envelope (data.type)", {
  event_type: "send.webhook",
  data: {
    type: "checkout_session.payment.paid",
    resource: "checkout_session",
    livemode: false,
    data: { id: "cs_audit_offline", type: "checkout_session", attributes: {
      payments: [{ id: "pay_audit_offline", attributes: { amount: 150000, status: "paid" } }],
    } },
  },
});

}
// The app now pins loginIssuedAt because NextAuth replaces iat on renewal.
// lib/backend-remediation.test.ts also drives the actual app JWT callback.
try {
  const nowSec = Math.floor(Date.now() / 1000);
  const issuedAtSec = nowSec - 7 * 3600;
  const renewed = await decode({ token: await encode({
    token: { sub: "audit-offline", iat: issuedAtSec, loginIssuedAt: issuedAtSec }, secret: "audit-offline-secret",
  }), secret: "audit-offline-secret" });
  const futureMs = (nowSec + 2 * 3600) * 1000;
  const verdict = evaluateSessionExpiry({
    issuedAtSec: renewed.loginIssuedAt, lastSeenAt: new Date(futureMs - 1000).toISOString(),
    persistent: true, policy: DEFAULT_SECURITY_POLICY, nowMs: futureMs,
  });
  assert.equal(verdict, "absolute", "nine-hour-old login survives an eight-hour maximum after renewal");
  console.log("PASS absolute session limit survives NextAuth renewal");
} catch (error) {
  failures++;
  console.log(`FAIL absolute session limit survives NextAuth renewal: ${error.message}`);
}

console.log(`${failures}/${includeWebhooks ? 3 : 1} expected-behavior probes failed`);
process.exitCode = failures ? 1 : 0;
