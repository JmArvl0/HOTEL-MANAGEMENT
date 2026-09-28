// QA reset resolver — WRITES. Closes every active booking-related row into
// its terminal state (nothing deleted) + audit_logs rows per batch. Run:
//   node scripts/qa-reset-resolve.mjs
// Requires the archive manifest to exist (refuses to run without it).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
    let value = trimmed.slice(trimmed.indexOf("=") + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1);
    if (value && process.env[key] == null) process.env[key] = value;
  }
}
loadEnvFile(".env.local");

const dirs = existsSync("legacy-archive") ? readdirSync("legacy-archive") : [];
const manifestFile = dirs.map((d) => `legacy-archive/${d}/manifest.json`).find((f) => existsSync(f));
if (!manifestFile) {
  console.error("REFUSING TO RUN: no legacy-archive manifest found. Archive first.");
  process.exit(1);
}
console.log(`Archive manifest: ${manifestFile}`);

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!url || !key) {
  console.error("Missing Supabase credentials.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const now = new Date().toISOString();
const REASON = "QA reset: resolve all booking data for Room Board development";

async function audit(table, count, detail) {
  try {
    await db.from("audit_logs").insert({
      user_id: null,
      action: "qa_reset_resolve",
      entity_type: "qa_reset",
      entity_id: table,
      after_data: { table, resolved: count, reason: REASON, at: now, ...detail },
    });
  } catch (err) {
    console.log(`  (audit row for ${table} skipped: ${err.message ?? err})`);
  }
}

async function step(label, fn) {
  const count = await fn();
  console.log(`- ${label}: ${count}`);
  return count;
}
const updated = async (q, column = "id") => {
  const { data, error } = await q.select(column);
  if (error) throw new Error(error.message);
  return (data ?? []).length;
};

// 1. Holds -> expired (mirrors expire_booking_holds).
await step("booking_holds -> expired", async () => {
  const n = await updated(db.from("booking_holds").update({ status: "expired" }).in("status", ["active", "payment_submitted"]), "token");
  await audit("booking_holds", n, { to: "expired" });
  return n;
});

// 2. Guest requests: pending approvals -> approved, open work -> completed.
await step("guest_requests approvals -> approved", async () => {
  const n = await updated(
    db.from("guest_requests").update({ approval_status: "approved", approved_at: now, approval_note: REASON }).eq("approval_status", "pending")
  );
  await audit("guest_requests", n, { field: "approval_status", to: "approved" });
  return n;
});
await step("guest_requests -> completed", async () => {
  const n = await updated(db.from("guest_requests").update({ status: "completed" }).not("status", "in", "(completed,closed,cancelled)"));
  await audit("guest_requests", n, { field: "status", to: "completed" });
  return n;
});

// 3. Housekeeping tasks -> completed.
await step("housekeeping_tasks -> completed", async () => {
  const n = await updated(
    db.from("housekeeping_tasks").update({ status: "completed", completed_at: now, notes: REASON }).not("status", "in", "(completed,cancelled)")
  );
  await audit("housekeeping_tasks", n, { to: "completed" });
  return n;
});

// 4. Maintenance orders -> completed (closed workflow end-state).
await step("maintenance_orders -> completed", async () => {
  const n = await updated(
    db.from("maintenance_orders").update({ status: "completed", completed_at: now, resolution: REASON }).not("status", "in", "(completed,cancelled)")
  );
  await audit("maintenance_orders", n, { to: "completed" });
  return n;
});

// 5. Stays -> checked_out (done bookings), releasing assignments.
await step("reservations -> checked_out", async () => {
  const n = await updated(
    db.from("reservations").update({ status: "checked_out", checked_out_at: now }).in("status", ["pending", "confirmed", "checked_in"])
  );
  await audit("reservations", n, { to: "checked_out" });
  return n;
});
await step("reservation_room_assignments -> completed", async () => {
  const n = await updated(db.from("reservation_room_assignments").update({ status: "completed", released_at: now, reason: REASON }).eq("status", "active"));
  await audit("reservation_room_assignments", n, { to: "completed" });
  return n;
});

// 6. Rooms (all, incl. maintenance) -> available + clean.
await step("rooms -> available/clean", async () => {
  const { data, error } = await db.from("rooms").update({ status: "available", housekeeping: "clean" }).neq("id", "00000000-0000-0000-0000-000000000000").select("id");
  if (error) throw new Error(error.message);
  const n = (data ?? []).length;
  await audit("rooms", n, { to: "available/clean" });
  return n;
});

console.log("Resolve pass complete. Re-run qa-reset-inventory to verify the zero-state.");
